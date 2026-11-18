import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  CAMBLU_CACHE_TTL_MS,
  DEFAULT_CAMBLU_CLUBE_API_URL,
  fetchCambluClubeStatus,
  getCambluMonthlyQuota,
  parseCambluClubePayload,
  resolveUserEntitlement
} from '../src/camblu-clube.js';

const NOW_MS = Date.parse('2026-11-18T12:00:00.000Z');
const FUTURE_ISO = '2027-05-16T12:00:00.000Z';
const PAST_ISO = '2026-11-17T12:00:00.000Z';

test('getCambluMonthlyQuota maps tier codes 2, 3, 4 to 2, 4, 8 and rejects <2', () => {
  assert.equal(getCambluMonthlyQuota(0), 0);
  assert.equal(getCambluMonthlyQuota(1), 0);
  assert.equal(getCambluMonthlyQuota(2), 2);
  assert.equal(getCambluMonthlyQuota(3), 4);
  assert.equal(getCambluMonthlyQuota(4), 8);
});

test('parseCambluClubePayload enforces active, validUntil, and tierCode >= 2', () => {
  const noneRes = parseCambluClubePayload({ active: false, tier: 'none', tierCode: 0, validUntil: null }, NOW_MS);
  assert.equal(noneRes.isEligiblePro, false);
  assert.equal(noneRes.monthlyIncluded, 0);

  const comumRes = parseCambluClubePayload({ active: true, tier: 'comum', tierCode: 1, validUntil: FUTURE_ISO }, NOW_MS);
  assert.equal(comumRes.active, true);
  assert.equal(comumRes.tierCode, 1);
  assert.equal(comumRes.isEligiblePro, false);
  assert.equal(comumRes.monthlyIncluded, 0);

  const raroRes = parseCambluClubePayload({ active: true, tier: 'raro', tierCode: 2, validUntil: FUTURE_ISO }, NOW_MS);
  assert.equal(raroRes.isEligiblePro, true);
  assert.equal(raroRes.monthlyIncluded, 2);
  assert.equal(raroRes.tierName, 'Raro');

  const epicoRes = parseCambluClubePayload({ active: true, tier: 'epico', tierCode: 3, validUntil: null }, NOW_MS);
  assert.equal(epicoRes.isEligiblePro, true);
  assert.equal(epicoRes.monthlyIncluded, 4);
  assert.equal(epicoRes.tierName, 'Épico');

  const lendarioRes = parseCambluClubePayload({ active: true, tier: 'lendario', tierCode: 4, validUntil: FUTURE_ISO }, NOW_MS);
  assert.equal(lendarioRes.isEligiblePro, true);
  assert.equal(lendarioRes.monthlyIncluded, 8);
  assert.equal(lendarioRes.tierName, 'Lendário');

  const expiredRes = parseCambluClubePayload({ active: true, tier: 'lendario', tierCode: 4, validUntil: PAST_ISO }, NOW_MS);
  assert.equal(expiredRes.active, false);
  assert.equal(expiredRes.tierCode, 0);
  assert.equal(expiredRes.isEligiblePro, false);
  assert.equal(expiredRes.monthlyIncluded, 0);
});

test('fetchCambluClubeStatus queries configured endpoint by normalized email and handles errors', async () => {
  let calledUrl = '';
  const mockFetch = async (url) => {
    calledUrl = url;
    return new Response(JSON.stringify({ active: true, tier: 'raro', tierCode: 2, validUntil: FUTURE_ISO }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const okRes = await fetchCambluClubeStatus('  Aluno@FURB.br ', {}, mockFetch);
  assert.equal(calledUrl, `${DEFAULT_CAMBLU_CLUBE_API_URL}?email=aluno%40furb.br`);
  assert.equal(okRes.ok, true);
  assert.equal(okRes.isEligiblePro, true);
  assert.equal(okRes.monthlyIncluded, 2);

  const errRes = await fetchCambluClubeStatus('aluno@furb.br', {}, async () => new Response('fail', { status: 502 }));
  assert.equal(errRes.ok, false);
  assert.equal(errRes.status, 502);

  const skipped = await fetchCambluClubeStatus('', {}, mockFetch);
  assert.equal(skipped.ok, false);
  assert.equal(skipped.skipped, true);
});

test('resolveUserEntitlement unlocks PRO for Clube CAMBLU tiers 2/3/4 and persists claim + userDoc', async () => {
  const patches = [];
  const claimCalls = [];
  const serviceAccount = { project_id: 'test' };

  const res = await resolveUserEntitlement({
    env: {},
    serviceAccount,
    user: { uid: 'uid-raro', email: 'raro@furb.br', pro: false },
    userDoc: null,
    refreshLive: true,
    syncClaim: true,
    nowMs: NOW_MS,
    setProClaimFn: async (_sa, uid, isPro) => claimCalls.push({ uid, isPro }),
    updateUserDocFn: async (_sa, uid, patch) => patches.push({ uid, patch }),
    fetchImpl: async () => new Response(JSON.stringify({ active: true, tier: 'raro', tierCode: 2, validUntil: FUTURE_ISO }), { status: 200 })
  });

  assert.equal(res.isPro, true);
  assert.equal(res.proSource, 'camblu_clube');
  assert.equal(res.monthlyIncluded, 2);
  assert.equal(res.subscription.provider, 'camblu_clube');
  assert.equal(res.subscription.tierCode, 2);
  assert.deepEqual(claimCalls, [{ uid: 'uid-raro', isPro: true }]);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].patch.subscription.plan, 'camblu_clube_raro');
});

test('resolveUserEntitlement does NOT grant PRO to tierCode 1 (Comum)', async () => {
  const res = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: 'test' },
    user: { uid: 'uid-comum', email: 'comum@furb.br', pro: false },
    userDoc: {},
    refreshLive: true,
    syncClaim: true,
    nowMs: NOW_MS,
    setProClaimFn: async () => { throw new Error('Should not set claim'); },
    updateUserDocFn: async () => {},
    fetchImpl: async () => new Response(JSON.stringify({ active: true, tier: 'comum', tierCode: 1, validUntil: FUTURE_ISO }), { status: 200 })
  });

  assert.equal(res.isPro, false);
  assert.equal(res.proSource, null);
  assert.equal(res.monthlyIncluded, 0);
  assert.equal(res.cambluClube.active, true);
  assert.equal(res.cambluClube.tierCode, 1);
  assert.equal(res.cambluClube.eligible, false);
});

test('resolveUserEntitlement revokes PRO when Clube CAMBLU expires even if JWT user.pro is stale true', async () => {
  const patches = [];
  const claimCalls = [];

  const res = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: 'test' },
    user: { uid: 'uid-exp', email: 'exp@furb.br', pro: true },
    userDoc: {
      email: 'exp@furb.br',
      subscription: {
        status: 'active',
        provider: 'camblu_clube',
        tier: 'epico',
        tierCode: 3,
        validUntil: FUTURE_ISO,
        checkedAt: new Date(NOW_MS - CAMBLU_CACHE_TTL_MS - 1000).toISOString()
      }
    },
    refreshLive: true,
    syncClaim: true,
    nowMs: NOW_MS,
    setProClaimFn: async (_sa, uid, isPro) => claimCalls.push({ uid, isPro }),
    updateUserDocFn: async (_sa, uid, patch) => patches.push({ uid, patch }),
    fetchImpl: async () => new Response(JSON.stringify({ active: false, tier: 'none', tierCode: 0, validUntil: null }), { status: 200 })
  });

  assert.equal(res.isPro, false);
  assert.equal(res.monthlyIncluded, 0);
  assert.equal(res.subscription.status, 'inactive');
  assert.deepEqual(claimCalls, [{ uid: 'uid-exp', isPro: false }]);
  assert.equal(patches[0].patch.subscription.status, 'inactive');
});

test('resolveUserEntitlement preserves valid cached CAMBLU PRO on transient API failure', async () => {
  const res = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: 'test' },
    user: { uid: 'uid-outage', email: 'outage@furb.br', pro: true },
    userDoc: {
      email: 'outage@furb.br',
      cambluClube: {
        active: true,
        tier: 'lendario',
        tierCode: 4,
        validUntil: FUTURE_ISO,
        checkedAt: new Date(NOW_MS - CAMBLU_CACHE_TTL_MS - 1000).toISOString()
      },
      subscription: {
        status: 'active',
        provider: 'camblu_clube',
        tier: 'lendario',
        tierCode: 4,
        validUntil: FUTURE_ISO
      }
    },
    refreshLive: true,
    nowMs: NOW_MS,
    fetchImpl: async () => { throw new Error('Network timeout'); }
  });

  assert.equal(res.isPro, true);
  assert.equal(res.proSource, 'camblu_clube');
  assert.equal(res.monthlyIncluded, 8);
});

test('resolveUserEntitlement respects Stripe provider and boosts quota if also Clube Lendario', async () => {
  const res = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: 'test' },
    user: { uid: 'uid-both', email: 'both@furb.br', pro: true },
    userDoc: {
      email: 'both@furb.br',
      subscription: {
        status: 'active',
        plan: 'pro_monthly',
        provider: 'stripe',
        subscriptionId: 'sub_123'
      }
    },
    refreshLive: true,
    nowMs: NOW_MS,
    fetchImpl: async () => new Response(JSON.stringify({ active: true, tier: 'lendario', tierCode: 4, validUntil: FUTURE_ISO }), { status: 200 })
  });

  assert.equal(res.isPro, true);
  assert.equal(res.proSource, 'stripe');
  assert.equal(res.subscription.provider, 'stripe');
  assert.equal(res.monthlyIncluded, 8);
});

test('resolveUserEntitlement uses fresh cache when refreshLive is false', async () => {
  let fetchCalled = false;
  const res = await resolveUserEntitlement({
    env: {},
    serviceAccount: { project_id: 'test' },
    user: { uid: 'uid-cache', email: 'cache@furb.br', pro: true },
    userDoc: {
      email: 'cache@furb.br',
      cambluClube: {
        active: true,
        tier: 'epico',
        tierCode: 3,
        validUntil: FUTURE_ISO,
        checkedAt: new Date(NOW_MS - 30_000).toISOString()
      },
      subscription: {
        status: 'active',
        provider: 'camblu_clube',
        tier: 'epico',
        tierCode: 3,
        validUntil: FUTURE_ISO,
        monthlyIncluded: 4,
        checkedAt: new Date(NOW_MS - 30_000).toISOString()
      }
    },
    refreshLive: false,
    nowMs: NOW_MS,
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response('{}', { status: 200 });
    }
  });

  assert.equal(fetchCalled, false);
  assert.equal(res.isPro, true);
  assert.equal(res.monthlyIncluded, 4);
});

test('worker allows CORS for gorit.camblu.org and flashcards.camblu.org', async () => {
  const goritReq = new Request('https://flashcards-backend.camblu.workers.dev/api/user/status', {
    method: 'OPTIONS',
    headers: { Origin: 'https://gorit.camblu.org' }
  });
  const goritRes = await worker.fetch(goritReq, {}, {});
  assert.equal(goritRes.status, 204);
  assert.equal(goritRes.headers.get('Access-Control-Allow-Origin'), 'https://gorit.camblu.org');

  const spaiqReq = new Request('https://flashcards-backend.camblu.workers.dev/api/user/status', {
    method: 'OPTIONS',
    headers: { Origin: 'https://flashcards.camblu.org' }
  });
  const spaiqRes = await worker.fetch(spaiqReq, {}, {});
  assert.equal(spaiqRes.status, 204);
  assert.equal(spaiqRes.headers.get('Access-Control-Allow-Origin'), 'https://flashcards.camblu.org');
});

