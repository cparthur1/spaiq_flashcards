import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import worker from '../src/index.js';
import { verifyFirebaseIdToken } from '../src/google-auth.js';
import { resolveUserEntitlement } from '../src/camblu-clube.js';
import { isVertexExpressProvider, resolveModelConfig, resolveModelCandidates, callGemini } from '../src/gemini.js';

const PROJECT_ID = 'flashcards-ead57';
const WHITELISTED_EMAIL = 'vip-owner@gmail.com';
const FREE_EMAIL = 'regular-user@gmail.com';

function base64UrlEncode(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createTestKeyMaterial(kid = 'test-kid-1') {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const b64 = Buffer.from(pkcs8).toString('base64');
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;

  async function signJwt(payload, headerOverrides = {}) {
    const header = { alg: 'RS256', typ: 'JWT', kid, ...headerOverrides };
    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${base64UrlEncode(sig)}`;
  }

  return {
    kid,
    publicJwk,
    privateKeyPem,
    signJwt,
    serviceAccount: {
      project_id: PROJECT_ID,
      client_email: 'firebase-adminsdk@flashcards-ead57.iam.gserviceaccount.com',
      private_key: privateKeyPem
    }
  };
}

function makeBaseClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    sub: 'uid-google-123',
    email: FREE_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    iat: now - 30,
    exp: now + 3600,
    ...overrides
  };
}

test('verifyFirebaseIdToken enforces Google sign-in provider, email_verified, and valid exp', async () => {
  const keys = await createTestKeyMaterial('kid-auth-test');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({ keys: [keys.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const validGoogleToken = await keys.signJwt(makeBaseClaims());
    const verified = await verifyFirebaseIdToken(validGoogleToken, PROJECT_ID);
    assert.equal(verified.uid, 'uid-google-123');
    assert.equal(verified.email, FREE_EMAIL);
    assert.equal(verified.emailVerified, true);
    assert.equal(verified.signInProvider, 'google.com');

    const passwordToken = await keys.signJwt(makeBaseClaims({
      firebase: { sign_in_provider: 'password' }
    }));
    await assert.rejects(() => verifyFirebaseIdToken(passwordToken, PROJECT_ID), /Apenas login com Google/);

    const anonymousToken = await keys.signJwt(makeBaseClaims({
      firebase: { sign_in_provider: 'anonymous' }
    }));
    await assert.rejects(() => verifyFirebaseIdToken(anonymousToken, PROJECT_ID), /Apenas login com Google/);

    const unverifiedToken = await keys.signJwt(makeBaseClaims({
      email_verified: false
    }));
    await assert.rejects(() => verifyFirebaseIdToken(unverifiedToken, PROJECT_ID), /não verificado/);

    const noExpClaims = makeBaseClaims();
    delete noExpClaims.exp;
    const noExpToken = await keys.signJwt(noExpClaims);
    await assert.rejects(() => verifyFirebaseIdToken(noExpToken, PROJECT_ID), /expirado/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveUserEntitlement self-heals spoofed userDoc.email, blocks non-Google providers, and awaits claim sync on refreshLive', async () => {
  const patches = [];
  let claimFinishedBeforeReturn = false;

  const res = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: PROJECT_ID },
    user: {
      uid: 'uid-spoof',
      email: FREE_EMAIL,
      emailVerified: true,
      signInProvider: 'google.com',
      pro: false
    },
    userDoc: {
      email: WHITELISTED_EMAIL
    },
    ctx: { waitUntil: () => {} },
    refreshLive: true,
    syncClaim: true,
    lifetimeEmails: [WHITELISTED_EMAIL],
    updateUserDocFn: async (_sa, uid, patch) => { patches.push({ uid, patch }); },
    fetchImpl: async () => new Response(JSON.stringify({ active: false, tier: 'none', tierCode: 0, validUntil: null }), { status: 200 })
  });

  assert.equal(res.isPro, false);
  assert.equal(res.isLifetime, false);
  assert.equal(patches.some(p => p.patch.email === FREE_EMAIL), true);

  // Non-Google signInProvider is rejected even with a whitelisted email
  const nonGoogleRes = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: PROJECT_ID },
    user: {
      uid: 'uid-pw',
      email: WHITELISTED_EMAIL,
      emailVerified: true,
      signInProvider: 'password',
      pro: false
    },
    userDoc: {},
    lifetimeEmails: [WHITELISTED_EMAIL],
    fetchImpl: async () => new Response(JSON.stringify({ active: false, tier: 'none', tierCode: 0, validUntil: null }), { status: 200 })
  });
  assert.equal(nonGoogleRes.isPro, false);
  assert.equal(nonGoogleRes.isLifetime, false);

  // When refreshLive + syncClaim are true, setProClaimFn is awaited before returning (for Pro Firestore rules)
  const lifetimeRes = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: PROJECT_ID },
    user: {
      uid: 'uid-vip',
      email: WHITELISTED_EMAIL,
      emailVerified: true,
      signInProvider: 'google.com',
      pro: false
    },
    userDoc: {},
    ctx: { waitUntil: () => {} },
    refreshLive: true,
    syncClaim: true,
    lifetimeEmails: [WHITELISTED_EMAIL],
    setProClaimFn: async () => {
      await new Promise(r => setTimeout(r, 10));
      claimFinishedBeforeReturn = true;
    },
    updateUserDocFn: async () => {}
  });
  assert.equal(lifetimeRes.isPro, true);
  assert.equal(lifetimeRes.isLifetime, true);
  assert.equal(claimFinishedBeforeReturn, true);
});

test('worker /api/ai/generate blocks logged-in non-Pro users on isNewDeck=false and allows Pro users', async () => {
  const keys = await createTestKeyMaterial('kid-generate-test');
  const originalFetch = globalThis.fetch;
  let geminiCalls = 0;

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({ keys: [keys.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
      });
    }
    if (urlStr === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-tok', expires_in: 3600 }), { status: 200 });
    }
    if (urlStr.includes('/documents/app_config/pro_whitelist')) {
      return new Response(JSON.stringify({
        fields: { emails: { arrayValue: { values: [{ stringValue: WHITELISTED_EMAIL }] } } }
      }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-free-gen')) {
      return new Response(JSON.stringify({ fields: { email: { stringValue: FREE_EMAIL } } }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-vip-gen')) {
      return new Response(JSON.stringify({ fields: { email: { stringValue: WHITELISTED_EMAIL } } }), { status: 200 });
    }
    if (urlStr.includes('/api/clube/status')) {
      return new Response(JSON.stringify({ active: false, tier: 'none', tierCode: 0, validUntil: null }), { status: 200 });
    }
    if (urlStr.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (urlStr.includes('identitytoolkit.googleapis.com')) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlStr} (${init.method || 'GET'})`);
  };

  try {
    const env = {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_OBJ: keys.serviceAccount,
      GEMINI_API_KEY: 'fake-gemini-key'
    };

    const freeToken = await keys.signJwt(makeBaseClaims({ sub: 'uid-free-gen', email: FREE_EMAIL }));
    const blockedRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${freeToken}`
      },
      body: JSON.stringify({
        isNewDeck: false,
        contents: [{ role: 'user', parts: [{ text: 'Edit deck for free' }] }]
      })
    }), env, { waitUntil: () => {} });

    assert.equal(blockedRes.status, 403);
    const blockedJson = await blockedRes.json();
    assert.equal(blockedJson.error, 'subscription_required');
    assert.equal(geminiCalls, 0);

    const vipToken = await keys.signJwt(makeBaseClaims({ sub: 'uid-vip-gen', email: WHITELISTED_EMAIL, pro: true }));
    const allowedRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vipToken}`
      },
      body: JSON.stringify({
        isNewDeck: false,
        contents: [{ role: 'user', parts: [{ text: 'Edit deck as Pro' }] }]
      })
    }), env, { waitUntil: () => {} });

    assert.equal(allowedRes.status, 200);
    assert.equal(geminiCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker /api/v1/stats ignores spoofed userDoc.email and enforces Firebase Auth verified Google email', async () => {
  const keys = await createTestKeyMaterial('kid-stats-test');
  const originalFetch = globalThis.fetch;
  const fakeApiKey = 'fc_live_0123456789abcdef0123456789abcdef';

  let lookupEmail = FREE_EMAIL;
  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-tok', expires_in: 3600 }), { status: 200 });
    }
    if (urlStr.includes('/documents/app_config/pro_whitelist')) {
      return new Response(JSON.stringify({
        fields: { emails: { arrayValue: { values: [{ stringValue: WHITELISTED_EMAIL }] } } }
      }), { status: 200 });
    }
    if (urlStr.includes(`/documents/api_keys/${fakeApiKey}`)) {
      return new Response(JSON.stringify({
        fields: {
          uid: { stringValue: 'uid-stats-spoof' },
          email: { stringValue: FREE_EMAIL }
        }
      }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-stats-spoof') && (init.method || 'GET') === 'GET') {
      // Spoofed email stored in Firestore userDoc
      return new Response(JSON.stringify({
        fields: {
          email: { stringValue: WHITELISTED_EMAIL },
          apiKey: { stringValue: fakeApiKey }
        }
      }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-stats-spoof') && init.method === 'PATCH') {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlStr.includes('/documents/user_stats/uid-stats-spoof')) {
      return new Response('not found', { status: 404 });
    }
    if (urlStr.includes('accounts:lookup')) {
      return new Response(JSON.stringify({
        users: [{
          localId: 'uid-stats-spoof',
          email: lookupEmail,
          emailVerified: true,
          providerUserInfo: [{ providerId: 'google.com' }]
        }]
      }), { status: 200 });
    }
    if (urlStr.includes('/api/clube/status')) {
      return new Response(JSON.stringify({ active: false, tier: 'none', tierCode: 0, validUntil: null }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlStr} (${init.method || 'GET'})`);
  };

  try {
    const env = {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_OBJ: keys.serviceAccount
    };

    // Real Firebase Auth email is FREE_EMAIL -> must be rejected even though userDoc.email is WHITELISTED_EMAIL
    const deniedRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/v1/stats', {
      method: 'GET',
      headers: { 'X-API-Key': fakeApiKey }
    }), env, { waitUntil: () => {} });
    assert.equal(deniedRes.status, 403);

    // Real Firebase Auth email is WHITELISTED_EMAIL -> allowed
    lookupEmail = WHITELISTED_EMAIL;
    const allowedRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/v1/stats', {
      method: 'GET',
      headers: { 'X-API-Key': fakeApiKey }
    }), env, { waitUntil: () => {} });
    assert.equal(allowedRes.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Stripe customer.subscription.deleted ignores spoofed userDoc.email and revokes Pro via Firebase Auth email', async () => {
  const keys = await createTestKeyMaterial('kid-webhook-test');
  const originalFetch = globalThis.fetch;
  const webhookSecret = 'whsec_test_secret_1234567890';
  const claimUpdates = [];
  const userPatches = [];

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-tok', expires_in: 3600 }), { status: 200 });
    }
    if (urlStr.includes('/documents/app_config/pro_whitelist')) {
      return new Response(JSON.stringify({
        fields: { emails: { arrayValue: { values: [{ stringValue: WHITELISTED_EMAIL }] } } }
      }), { status: 200 });
    }
    if (urlStr.includes('accounts:lookup')) {
      return new Response(JSON.stringify({
        users: [{
          localId: 'uid-cancel-spoof',
          email: FREE_EMAIL,
          emailVerified: true,
          providerUserInfo: [{ providerId: 'google.com' }]
        }]
      }), { status: 200 });
    }
    if (urlStr.includes('accounts:update')) {
      claimUpdates.push(JSON.parse(init.body));
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-cancel-spoof') && (init.method || 'GET') === 'GET') {
      // Even if userDoc had spoofed whitelisted email
      return new Response(JSON.stringify({
        fields: {
          email: { stringValue: WHITELISTED_EMAIL },
          subscription: { mapValue: { fields: { status: { stringValue: 'active' }, provider: { stringValue: 'stripe' } } } }
        }
      }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-cancel-spoof') && init.method === 'PATCH') {
      userPatches.push(JSON.parse(init.body));
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlStr.includes('/documents/decks/') || urlStr.includes('/documents/user_stats/')) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlStr.includes('/api/clube/status')) {
      return new Response(JSON.stringify({ active: false, tier: 'none', tierCode: 0, validUntil: null }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlStr} (${init.method || 'GET'})`);
  };

  try {
    const payload = JSON.stringify({
      id: 'evt_test_cancel',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_123',
          metadata: { uid: 'uid-cancel-spoof' }
        }
      }
    });

    const stripe = new Stripe('sk_test_fake', { apiVersion: '2026-03-25.dahlia' });
    const sig = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: webhookSecret
    });

    const res = await worker.fetch(new Request('https://flashcards.camblu.org/api/webhook/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sig
      },
      body: payload
    }), {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_OBJ: keys.serviceAccount,
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: webhookSecret
    }, { waitUntil: () => {} });

    assert.equal(res.status, 200);
    assert.equal(claimUpdates.length, 1);
    assert.equal(claimUpdates[0].localId, 'uid-cancel-spoof');
    assert.deepEqual(JSON.parse(claimUpdates[0].customAttributes), { pro: false });
    assert.ok(userPatches.some(p => p.fields?.['subscription.status']?.stringValue === 'canceled'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker /api/payment/verify persists whitelist subscription metadata alongside pro claim and rejects non-Google tokens', async () => {
  const keys = await createTestKeyMaterial('kid-verify-test');
  const originalFetch = globalThis.fetch;
  const claimUpdates = [];
  const userPatches = [];

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({ keys: [keys.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
      });
    }
    if (urlStr === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-tok', expires_in: 3600 }), { status: 200 });
    }
    if (urlStr.includes('/documents/app_config/pro_whitelist')) {
      return new Response(JSON.stringify({
        fields: { emails: { arrayValue: { values: [{ stringValue: WHITELISTED_EMAIL }] } } }
      }), { status: 200 });
    }
    if (urlStr.includes('accounts:update')) {
      claimUpdates.push(JSON.parse(init.body));
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-verify-vip') && init.method === 'PATCH') {
      userPatches.push(JSON.parse(init.body));
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlStr} (${init.method || 'GET'})`);
  };

  try {
    const env = {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_OBJ: keys.serviceAccount
    };

    // Unverified password token trying to claim whitelisted email -> ignored by optional auth (returns pending, no claim set)
    const fakePasswordToken = await keys.signJwt(makeBaseClaims({
      sub: 'uid-attacker',
      email: WHITELISTED_EMAIL,
      email_verified: false,
      firebase: { sign_in_provider: 'password' }
    }));
    const attackRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/payment/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${fakePasswordToken}`
      },
      body: JSON.stringify({})
    }), env, { waitUntil: () => {} });
    const attackJson = await attackRes.json();
    assert.equal(attackJson.isPro, false);
    assert.equal(claimUpdates.length, 0);

    // Legitimate Google-verified whitelisted user -> gets pro claim AND provider='whitelist' written to Firestore
    const validVipToken = await keys.signJwt(makeBaseClaims({
      sub: 'uid-verify-vip',
      email: WHITELISTED_EMAIL
    }));
    const okRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/payment/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validVipToken}`
      },
      body: JSON.stringify({})
    }), env, { waitUntil: () => {} });
    const okJson = await okRes.json();
    assert.equal(okJson.isPro, true);
    assert.equal(okJson.proSource, 'whitelist');
    assert.equal(claimUpdates.length, 1);
    assert.equal(userPatches.length, 1);
    assert.equal(userPatches[0].fields.subscription.mapValue.fields.provider.stringValue, 'whitelist');
    assert.equal(userPatches[0].fields.email.stringValue, WHITELISTED_EMAIL);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ai-models.json config resolves Gemini 3.5/3.8/decision-1, strictly blocks Gemini 2, and falls back cleanly on Vertex AI', async () => {
  assert.equal(isVertexExpressProvider('AQ.dummy-key'), true);
  assert.equal(isVertexExpressProvider('AIza-dummy-key'), false);
  assert.equal(isVertexExpressProvider('any-key', 'vertex'), true);
  assert.equal(isVertexExpressProvider('AQ.dummy-key', 'aistudio'), false);

  assert.deepEqual(resolveModelCandidates('flash'), [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite'
  ]);
  assert.deepEqual(resolveModelCandidates('gemini-flash-latest'), [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite'
  ]);
  assert.deepEqual(resolveModelCandidates('flash-lite'), [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ]);
  assert.deepEqual(resolveModelCandidates('gemini-flash-lite-latest'), [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ]);
  assert.equal(resolveModelConfig('gemini-decision-1', 'flashLite', { allowDecision: true }).model, 'gemini-decision-1');

  // Strictly reject any Gemini 2.x models — never allow them to pass through
  for (const forbidden of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']) {
    const resolvedFlash = resolveModelConfig(forbidden, 'flash');
    assert.equal(resolvedFlash.model, 'gemini-3.8-flash');
    assert.equal(resolvedFlash.candidates.some(m => m.startsWith('gemini-2')), false);

    const resolvedLite = resolveModelConfig(forbidden, 'flashLite');
    assert.equal(resolvedLite.model, 'gemini-3.5-flash-lite');
    assert.equal(resolvedLite.candidates.some(m => m.startsWith('gemini-2')), false);
  }

  const seenCalls = [];
  const mockFetch = async (url, init) => {
    seenCalls.push({
      url: String(url),
      apiKeyHeader: init.headers['x-goog-api-key'],
      body: JSON.parse(init.body)
    });
    if (seenCalls.length === 1) {
      // Simulate 400 when thinkingConfig is rejected on Vertex AI
      return new Response('thinkingConfig unsupported', { status: 400 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ok-vertex' }] } }]
    }), { status: 200 });
  };

  const res = await callGemini({
    model: 'flash',
    contents: [{ parts: [{ text: 'hello' }] }],
    generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } },
    apiKey: 'AQ.fake-vertex-key',
    provider: 'vertex',
    fetchImpl: mockFetch
  });

  assert.equal(res.status, 200);
  assert.equal(seenCalls.length, 2);
  assert.equal(seenCalls[0].url, 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent');
  assert.equal(seenCalls[0].url.includes('AQ.fake-vertex-key'), false);
  assert.equal(seenCalls[0].apiKeyHeader, 'AQ.fake-vertex-key');
  assert.equal(seenCalls[0].body.contents[0].role, 'user');
  assert.equal(seenCalls[1].body.generationConfig?.thinkingConfig, undefined);
});

test('worker routes Clube CAMBLU users to CAMBLU_GEMINI_API_KEY on Vertex AI and keeps Stripe/Whitelist on AI Studio', async () => {
  const keys = await createTestKeyMaterial('kid-camblu-routing');
  const originalFetch = globalThis.fetch;
  const aiCalls = [];
  const cambluEmail = 'clube-raro@furb.br';
  const fakeCambluKey = 'AQ.test-camblu-vertex-key';
  const fakeDefaultKey = 'AIza-test-default-key';

  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({ keys: [keys.publicJwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
      });
    }
    if (urlStr === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'admin-tok', expires_in: 3600 }), { status: 200 });
    }
    if (urlStr.includes('/documents/app_config/pro_whitelist')) {
      return new Response(JSON.stringify({
        fields: { emails: { arrayValue: { values: [{ stringValue: WHITELISTED_EMAIL }] } } }
      }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-camblu-1') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({
        fields: { email: { stringValue: cambluEmail } }
      }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/uid-vip-1') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({
        fields: { email: { stringValue: WHITELISTED_EMAIL } }
      }), { status: 200 });
    }
    if (urlStr.includes('/documents/users/') && init.method === 'PATCH') {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlStr.includes('/api/clube/status')) {
      return new Response(JSON.stringify({
        active: true,
        tier: 'raro',
        tierCode: 2,
        validUntil: '2027-05-01T00:00:00.000Z'
      }), { status: 200 });
    }
    if (urlStr.includes('identitytoolkit.googleapis.com')) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (urlStr.includes('aiplatform.googleapis.com') || urlStr.includes('generativelanguage.googleapis.com')) {
      aiCalls.push({
        url: urlStr,
        apiKey: init.headers['x-goog-api-key']
      });
      if (urlStr.includes('/decisions')) {
        return new Response(JSON.stringify({ results: { accept: { probability: 0.9 } } }), { status: 200 });
      }
      if (urlStr.includes('streamGenerateContent')) {
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(enc.encode('data: {"candidates":[{"content":{"parts":[{"text":"[{\\"type\\":\\"open\\",\\"description\\":\\"Q\\",\\"answer\\":\\"A\\"}]"}]}}]}\n\n'));
            controller.enqueue(enc.encode('data: [DONE]\n\n'));
            controller.close();
          }
        });
        return new Response(stream, { status: 200 });
      }
      if (urlStr.includes('gemini-3.5-flash-lite') && aiCalls.length === 2) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"sufficient":true,"missing_topics":[]}' }] } }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }]
      }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlStr} (${init.method || 'GET'})`);
  };

  try {
    const env = {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_OBJ: keys.serviceAccount,
      GEMINI_API_KEY: fakeDefaultKey,
      CAMBLU_GEMINI_API_KEY: fakeCambluKey
    };

    const cambluToken = await keys.signJwt(makeBaseClaims({
      sub: 'uid-camblu-1',
      email: cambluEmail,
      pro: true
    }));

    // 1. CAMBLU user /api/ai/generate with coverage audit -> Phase 1 & Phase 2 both hit Vertex AI with CAMBLU key
    const genRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cambluToken}` },
      body: JSON.stringify({
        model: 'gemini-flash-latest',
        isNewDeck: true,
        stream: true,
        enableCoverageAudit: true,
        contents: [{ role: 'user', parts: [{ text: 'Prompt' }, { text: 'Material' }] }]
      })
    }), env, { waitUntil: () => {} });
    assert.equal(genRes.status, 200);
    await genRes.text();

    // 2. CAMBLU user /api/ai/tutor -> Vertex AI with CAMBLU key
    const tutorRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cambluToken}` },
      body: JSON.stringify({
        model: 'gemini-flash-lite-latest',
        contents: [{ role: 'user', parts: [{ text: 'Explique' }] }]
      })
    }), env, { waitUntil: () => {} });
    assert.equal(tutorRes.status, 200);

    // 3. CAMBLU user /api/ai/stats -> Vertex AI with CAMBLU key
    const statsRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cambluToken}` },
      body: JSON.stringify({
        model: 'gemini-flash-lite-latest',
        contents: [{ role: 'user', parts: [{ text: 'Categorize' }] }]
      })
    }), env, { waitUntil: () => {} });
    assert.equal(statsRes.status, 200);

    // 4. CAMBLU user /api/ai/decision -> stays on AI Studio with default key
    const decRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cambluToken}` },
      body: JSON.stringify({
        input: 'Pergunta e resposta',
        questions: { accept: { type: 'noul', description: 'Correto?' } }
      })
    }), env, { waitUntil: () => {} });
    assert.equal(decRes.status, 200);

    // 5. Whitelist user /api/ai/tutor -> stays on AI Studio with default key (never uses CAMBLU key)
    const vipToken = await keys.signJwt(makeBaseClaims({
      sub: 'uid-vip-1',
      email: WHITELISTED_EMAIL,
      pro: true
    }));
    const vipRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vipToken}` },
      body: JSON.stringify({
        model: 'gemini-flash-lite-latest',
        contents: [{ role: 'user', parts: [{ text: 'Explique VIP' }] }]
      })
    }), env, { waitUntil: () => {} });
    assert.equal(vipRes.status, 200);

    assert.equal(aiCalls.length, 6);
    // Calls 0..3: CAMBLU generate phase1, audit phase2, tutor, stats -> all Vertex AI + CAMBLU key + Gemini 3.x only
    assert.equal(aiCalls[0].url, 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
    assert.equal(aiCalls[1].url, 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(aiCalls[2].url, 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(aiCalls[3].url, 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.5-flash-lite:generateContent');
    for (let i = 0; i < 4; i++) {
      assert.equal(aiCalls[i].apiKey, fakeCambluKey);
      assert.equal(aiCalls[i].url.includes(fakeCambluKey), false);
    }
    // Call 4: CAMBLU decision -> AI Studio + default key
    assert.ok(aiCalls[4].url.startsWith('https://generativelanguage.googleapis.com/v1beta/decisions'));
    assert.equal(aiCalls[4].apiKey, fakeDefaultKey);
    // Call 5: Whitelist tutor -> AI Studio + default key + gemini-3.5-flash-lite
    assert.equal(aiCalls[5].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(aiCalls[5].apiKey, fakeDefaultKey);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
