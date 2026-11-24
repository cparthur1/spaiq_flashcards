import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import worker from '../src/index.js';
import { verifyFirebaseIdToken } from '../src/google-auth.js';
import { resolveUserEntitlement } from '../src/camblu-clube.js';

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
