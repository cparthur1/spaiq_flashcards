// SPDX-License-Identifier: GPL-2.0-only
/**
 * camblu-clube.js - Clube CAMBLU membership verification & entitlement resolver
 * Integrates GET /api/clube/status (tierCode >= 2 unlocks Gorit & Spaiq PRO)
 */

export const DEFAULT_CAMBLU_CLUBE_API_URL = 'https://southamerica-east1-camblu.cloudfunctions.net/api/api/clube/status';
export const CAMBLU_MIN_PRO_TIER_CODE = 2;
export const CAMBLU_CACHE_TTL_MS = 5 * 60 * 1000;

export const CAMBLU_TIER_CODE_MAP = {
  none: 0,
  comum: 1,
  raro: 2,
  epico: 3,
  lendario: 4
};

export const CAMBLU_CODE_TIER_MAP = {
  0: 'none',
  1: 'comum',
  2: 'raro',
  3: 'epico',
  4: 'lendario'
};

export const CAMBLU_TIER_NAMES = {
  0: 'Sem plano',
  1: 'Comum',
  2: 'Raro',
  3: 'Épico',
  4: 'Lendário'
};

export const CAMBLU_MONTHLY_QUOTA_BY_TIER_CODE = {
  2: 2, // Raro
  3: 4, // Épico
  4: 8  // Lendário
};

/**
 * Returns monthly included AI deck generations for an eligible Clube CAMBLU tierCode.
 */
export function getCambluMonthlyQuota(tierCode) {
  const code = Number(tierCode) || 0;
  if (code < CAMBLU_MIN_PRO_TIER_CODE) return 0;
  if (code in CAMBLU_MONTHLY_QUOTA_BY_TIER_CODE) {
    return CAMBLU_MONTHLY_QUOTA_BY_TIER_CODE[code];
  }
  return 8;
}

/**
 * Parses and validates payload returned by CAMBLU Clube status API.
 */
export function parseCambluClubePayload(data, nowMs = Date.now()) {
  const rawTier = typeof data?.tier === 'string' ? data.tier.trim().toLowerCase() : 'none';
  const parsedCode = Number(data?.tierCode);
  const resolvedCode = Number.isInteger(parsedCode) && parsedCode >= 0
    ? parsedCode
    : (CAMBLU_TIER_CODE_MAP[rawTier] ?? 0);

  const validUntil = typeof data?.validUntil === 'string' && data.validUntil.trim()
    ? data.validUntil.trim()
    : null;

  let notExpired = true;
  if (validUntil) {
    const validUntilMs = Date.parse(validUntil);
    notExpired = Number.isFinite(validUntilMs) && validUntilMs > nowMs;
  }

  const active = Boolean(data?.active) && notExpired && resolvedCode > 0;
  const tierCode = active ? resolvedCode : 0;
  const tier = active ? (rawTier && rawTier !== 'none' ? rawTier : (CAMBLU_CODE_TIER_MAP[tierCode] || 'none')) : 'none';
  const isEligiblePro = active && tierCode >= CAMBLU_MIN_PRO_TIER_CODE;
  const monthlyIncluded = getCambluMonthlyQuota(isEligiblePro ? tierCode : 0);

  return {
    ok: true,
    active,
    tier,
    tierCode,
    tierName: CAMBLU_TIER_NAMES[tierCode] || tier,
    validUntil,
    eligible: isEligiblePro,
    isEligiblePro,
    monthlyIncluded
  };
}

/**
 * Queries the Clube CAMBLU API by student's Google account email.
 */
export async function fetchCambluClubeStatus(email, env = {}, fetchImpl = fetch) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { ok: false, skipped: true };
  }

  const baseUrl = (env?.CAMBLU_CLUBE_API_URL || DEFAULT_CAMBLU_CLUBE_API_URL).trim();
  const apiUrl = new URL(baseUrl);
  apiUrl.searchParams.set('email', normalizedEmail);

  const fetchOpts = {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    fetchOpts.signal = AbortSignal.timeout(5000);
  }

  try {
    const res = await fetchImpl(apiUrl.toString(), fetchOpts);
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const json = await res.json();
    return parseCambluClubePayload(json);
  } catch (err) {
    return { ok: false, error: err?.message || 'fetch_failed' };
  }
}

/**
 * Reads cached Clube CAMBLU status stored on the Firestore user document.
 */
export function getCachedCambluClubeStatus(userDoc, nowMs = Date.now()) {
  const cachedRaw = userDoc?.cambluClube || (userDoc?.subscription?.provider === 'camblu_clube' ? userDoc.subscription : null);
  if (!cachedRaw || typeof cachedRaw !== 'object') {
    return { fresh: false, validNotExpired: false, status: null };
  }

  const checkedAtMs = cachedRaw.checkedAt ? Date.parse(cachedRaw.checkedAt) : NaN;
  const fresh = Number.isFinite(checkedAtMs) && (nowMs - checkedAtMs) < CAMBLU_CACHE_TTL_MS;

  const parsed = parseCambluClubePayload({
    active: cachedRaw.active ?? cachedRaw.status === 'active',
    tier: cachedRaw.tier,
    tierCode: cachedRaw.tierCode,
    validUntil: cachedRaw.validUntil
  }, nowMs);

  const validNotExpired = parsed.isEligiblePro;

  return {
    fresh,
    validNotExpired,
    status: parsed
  };
}

function scheduleBackgroundTask(ctx, promise) {
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(promise);
    return null;
  }
  return promise;
}

/**
 * Unified Pro entitlement resolver across Lifetime whitelist, Stripe, and Clube CAMBLU (tierCode >= 2).
 */
export async function resolveUserEntitlement({
  env = {},
  serviceAccount = null,
  user = null,
  userDoc = null,
  ctx = null,
  refreshLive = false,
  allowStripeLookup = false,
  syncClaim = false,
  lifetimeEmails = [],
  checkStripeFn = null,
  setProClaimFn = null,
  updateUserDocFn = null,
  fetchImpl = fetch,
  nowMs = Date.now()
}) {
  const uid = user?.uid || userDoc?.uid || null;
  const providerAllowed = !user?.signInProvider || user.signInProvider === 'google.com';
  const emailAllowed = user?.emailVerified !== false && providerAllowed;
  const rawEmail = user?.email || (!user?.uid ? userDoc?.email : '') || '';
  const email = emailAllowed ? rawEmail.toLowerCase().trim() : '';
  const nowIso = new Date(nowMs).toISOString();

  // 1. Lifetime whitelist priority
  const isLifetime = Boolean(email && lifetimeEmails.includes(email));
  if (isLifetime) {
    const lifetimeSub = {
      status: 'active',
      plan: 'pro_lifetime',
      provider: 'whitelist',
      updatedAt: nowIso
    };
    if ((refreshLive || syncClaim) && serviceAccount && uid) {
      if ((refreshLive || syncClaim) && setProClaimFn && !user?.pro) {
        if (refreshLive) {
          await setProClaimFn(serviceAccount, uid, true).catch(() => {});
        } else {
          await scheduleBackgroundTask(ctx, setProClaimFn(serviceAccount, uid, true).catch(() => {}));
        }
      }
      if (refreshLive && updateUserDocFn) {
        await scheduleBackgroundTask(
          ctx,
          updateUserDocFn(serviceAccount, uid, {
            ...(email ? { email } : {}),
            subscription: lifetimeSub
          }).catch(() => {})
        );
      }
    }
    return {
      isPro: true,
      isLifetime: true,
      proSource: 'whitelist',
      monthlyIncluded: 9999,
      cambluClube: null,
      subscription: { status: 'active', plan: 'pro_lifetime', provider: 'whitelist' },
      userDoc
    };
  }

  // 2. Stripe / Legacy subscription check
  const existingSub = userDoc?.subscription || null;
  const hasStripeDoc = Boolean(
    existingSub?.status === 'active' &&
    (existingSub?.provider === 'stripe' || (!existingSub?.provider && !existingSub?.tierCode))
  );
  const hasLegacyClaim = Boolean(
    user?.pro === true &&
    existingSub?.provider !== 'camblu_clube' &&
    existingSub?.provider !== 'whitelist' &&
    existingSub?.status !== 'canceled' &&
    existingSub?.status !== 'inactive'
  );

  let stripeActive = hasStripeDoc || hasLegacyClaim;
  let stripeSub = hasStripeDoc ? existingSub : null;

  if (!stripeActive && allowStripeLookup && checkStripeFn && env?.STRIPE_SECRET_KEY && email) {
    try {
      const stripeStatus = await checkStripeFn({ env, email });
      if (stripeStatus?.isPro) {
        stripeActive = true;
        stripeSub = {
          status: 'active',
          plan: 'pro_monthly',
          provider: 'stripe',
          subscriptionId: stripeStatus.subscriptionId,
          customerId: stripeStatus.customerId,
          updatedAt: nowIso
        };
      }
    } catch (err) {
      console.warn('[Entitlement] Falha ao verificar Stripe por e-mail:', err?.message || err);
    }
  }

  // 3. Clube CAMBLU check (live when refreshLive or cache stale; graceful fallback on transient error)
  let cambluClube = null;
  let cambluFetchedLive = false;
  const docEmail = (userDoc?.email || '').toLowerCase().trim();
  const cacheBelongsToUser = !docEmail || docEmail === email;
  const cachedCamblu = cacheBelongsToUser
    ? getCachedCambluClubeStatus(userDoc, nowMs)
    : { fresh: false, validNotExpired: false, status: null };

  if (email) {
    if (!refreshLive && cachedCamblu.fresh) {
      cambluClube = cachedCamblu.status;
    } else {
      const fetched = await fetchCambluClubeStatus(email, env, fetchImpl);
      if (fetched.ok) {
        cambluClube = fetched;
        cambluFetchedLive = true;
      } else if (cachedCamblu.validNotExpired) {
        cambluClube = cachedCamblu.status;
      }
    }
  }

  // 4. Combine Stripe + Clube CAMBLU into effective Pro entitlement
  const cambluEligible = Boolean(cambluClube?.isEligiblePro);
  const verifiedStripeActive = Boolean(hasStripeDoc || stripeSub);
  const isPro = Boolean(stripeActive || cambluEligible);

  let proSource = null;
  let monthlyIncluded = 0;
  let effectiveSubscription = existingSub;

  if (verifiedStripeActive) {
    proSource = 'stripe';
    monthlyIncluded = cambluEligible ? Math.max(4, cambluClube.monthlyIncluded) : 4;
    effectiveSubscription = stripeSub || existingSub || {
      status: 'active',
      plan: 'pro_monthly',
      provider: 'stripe'
    };
  } else if (cambluEligible) {
    proSource = 'camblu_clube';
    monthlyIncluded = cambluClube.monthlyIncluded;
    effectiveSubscription = {
      status: 'active',
      plan: `camblu_clube_${cambluClube.tier}`,
      provider: 'camblu_clube',
      tier: cambluClube.tier,
      tierCode: cambluClube.tierCode,
      tierName: cambluClube.tierName,
      validUntil: cambluClube.validUntil,
      monthlyIncluded: cambluClube.monthlyIncluded,
      checkedAt: nowIso,
      updatedAt: nowIso
    };
  } else if (hasLegacyClaim) {
    proSource = 'stripe';
    monthlyIncluded = 4;
    effectiveSubscription = existingSub || {
      status: 'active',
      plan: 'pro_monthly',
      provider: 'stripe'
    };
  } else if (existingSub?.provider === 'camblu_clube') {
    effectiveSubscription = {
      ...existingSub,
      status: 'inactive',
      tier: cambluClube?.tier || 'none',
      tierCode: cambluClube?.tierCode || 0,
      tierName: cambluClube?.tierName || CAMBLU_TIER_NAMES[0],
      validUntil: cambluClube?.validUntil ?? existingSub.validUntil ?? null,
      monthlyIncluded: 0,
      checkedAt: nowIso,
      updatedAt: nowIso
    };
  }

  // 5. Persist updates to Firestore & Firebase custom claim when needed
  const nextUserDoc = userDoc ? { ...userDoc } : {};
  const docPatch = {};

  const normalizedDocEmail = (userDoc?.email || '').toLowerCase().trim();
  if (email && normalizedDocEmail !== email) {
    docPatch.email = email;
    nextUserDoc.email = email;
  }

  if (stripeActive && stripeSub && (!hasStripeDoc || stripeSub.subscriptionId !== existingSub?.subscriptionId)) {
    docPatch.subscription = stripeSub;
    nextUserDoc.subscription = stripeSub;
  }

  if (cambluFetchedLive) {
    const prevCamblu = userDoc?.cambluClube;
    const cambluSummary = {
      active: cambluClube.active,
      tier: cambluClube.tier,
      tierCode: cambluClube.tierCode,
      tierName: cambluClube.tierName,
      validUntil: cambluClube.validUntil,
      eligible: cambluClube.isEligiblePro,
      monthlyIncluded: cambluClube.monthlyIncluded,
      checkedAt: nowIso
    };

    const cambluChanged = !prevCamblu
      || prevCamblu.active !== cambluSummary.active
      || prevCamblu.tierCode !== cambluSummary.tierCode
      || prevCamblu.validUntil !== cambluSummary.validUntil
      || !cachedCamblu.fresh;

    if (cambluChanged) {
      docPatch.cambluClube = cambluSummary;
      nextUserDoc.cambluClube = cambluSummary;
    }

    if (!verifiedStripeActive) {
      if (cambluEligible) {
        const subChanged = existingSub?.provider !== 'camblu_clube'
          || existingSub?.status !== 'active'
          || existingSub?.tierCode !== effectiveSubscription.tierCode
          || existingSub?.validUntil !== effectiveSubscription.validUntil
          || !cachedCamblu.fresh;
        if (subChanged) {
          docPatch.subscription = effectiveSubscription;
          nextUserDoc.subscription = effectiveSubscription;
        }
      } else if (existingSub?.provider === 'camblu_clube' && existingSub?.status === 'active') {
        docPatch.subscription = effectiveSubscription;
        nextUserDoc.subscription = effectiveSubscription;
      }
    }
  }

  if (serviceAccount && uid) {
    const syncTasks = [];
    if (updateUserDocFn && Object.keys(docPatch).length > 0) {
      syncTasks.push(updateUserDocFn(serviceAccount, uid, docPatch).catch(() => {}));
    }
    if (syncClaim && setProClaimFn && Boolean(user?.pro) !== isPro) {
      if (refreshLive) {
        await setProClaimFn(serviceAccount, uid, isPro).catch(() => {});
      } else {
        syncTasks.push(setProClaimFn(serviceAccount, uid, isPro).catch(() => {}));
      }
    }
    if (syncTasks.length > 0) {
      await scheduleBackgroundTask(ctx, Promise.all(syncTasks));
    }
  }

  return {
    isPro,
    isLifetime: false,
    proSource,
    monthlyIncluded,
    cambluClube: cambluClube
      ? {
          active: cambluClube.active,
          tier: cambluClube.tier,
          tierCode: cambluClube.tierCode,
          tierName: cambluClube.tierName,
          validUntil: cambluClube.validUntil,
          eligible: cambluClube.isEligiblePro,
          monthlyIncluded: cambluClube.monthlyIncluded
        }
      : null,
    subscription: effectiveSubscription,
    userDoc: Object.keys(nextUserDoc).length > 0 ? nextUserDoc : userDoc
  };
}
