// SPDX-License-Identifier: GPL-2.0-only
/**
 * Flashcards WebApp - Cloudflare Worker Backend
 * Provides:
 * 1. Secure Gemini AI Proxy (without exposing server API keys to client)
 * 2. Stripe Payment Processing (R$ 4,99/mês Pro, R$ 1,49 geração extra/avulsa)
 * 3. Webhook Handlers with Firebase Admin OAuth2 token minting
 * 4. User Quota & Pro Claim Management
 */

import { verifyFirebaseIdToken, setFirebaseUserProClaim, deleteFirebaseUser, getFirebaseUserByEmail } from './google-auth.js';
import { callGemini } from './gemini.js';
import { getUserDocument, updateUserDocument, deleteUserDocument, getDocument, setDocument, deleteDeckDocument, clearUserCloudData, deleteDocument, findUserByApiKey } from './firestore.js';
import {
  getStripeClient,
  createSubscription,
  createExtraGenerationPayment,
  checkCustomerProStatusInStripe,
  getSubscriptionDetails,
  cancelSubscription,
  reactivateSubscription
} from './stripe.js';

const ALLOWED_ORIGINS = [
  'https://flashcards.camblu.org',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

export const LIFETIME_PRO_EMAILS = [
  'arthur.paludo.c@gmail.com',
  'clarazanchett@gmail.com',
  'manuelapinhadias@gmail.com'
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function getServiceAccount(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT_OBJ) return env.FIREBASE_SERVICE_ACCOUNT_OBJ;
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('Configuração FIREBASE_SERVICE_ACCOUNT não definida');
  }
  return typeof env.FIREBASE_SERVICE_ACCOUNT === 'string'
    ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
    : env.FIREBASE_SERVICE_ACCOUNT;
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request);

    const url = new URL(request.url);
    const path = url.pathname;

    const isPublicStatsPath = path === '/api/v1/stats' || path === '/api/stats';
    const publicCorsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400'
    };

    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      if (isPublicStatsPath) {
        return new Response(null, { status: 204, headers: publicCorsHeaders });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // 1. Health Check
      if (path === '/' || path === '/health') {
        return jsonResponse({
          status: 'ok',
          service: 'flashcards-backend',
          version: '1.0.0',
          time: new Date().toISOString()
        }, 200, corsHeaders);
      }



      // 2. Stripe Webhook (No client auth, called directly by Stripe servers)
      if ((path === '/api/webhook/stripe' || path === '/api/webhook') && request.method === 'POST') {
        return await handleStripeWebhook(request, env);
      }

      // Helper to authenticate user for protected routes
      async function authenticateUser() {
        const authHeader = request.headers.get('Authorization') || '';
        if (!authHeader.startsWith('Bearer ')) {
          throw new Response(JSON.stringify({ error: 'unauthorized', message: 'Token de autenticação ausente' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const token = authHeader.substring(7);
        const projectId = env.FIREBASE_PROJECT_ID || 'flashcards-ead57';
        try {
          return await verifyFirebaseIdToken(token, projectId);
        } catch (authErr) {
          throw new Response(JSON.stringify({ error: 'unauthorized', message: authErr.message || 'Token inválido ou expirado' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }

      // 2.2 Create Stripe Embedded Checkout Form Session
      if (path === '/api/create-checkout-session' && request.method === 'POST') {
        let user = null;
        try {
          user = await authenticateUser();
        } catch (e) {
          // Authentication is optional for initial checkout session creation, but links user if logged in
        }

        const returnUrl = `${request.headers.get('Origin') || 'https://flashcards.camblu.org'}/?session_id={CHECKOUT_SESSION_ID}`;
        try {
          const session = await createSubscription({ env, user, returnUrl });
          return jsonResponse({ client_secret: session.client_secret }, 200, corsHeaders);
        } catch (err) {
          console.error('[Stripe] Erro ao criar checkout session:', err.message);
          return jsonResponse({
            error: 'stripe_error',
            message: err.message
          }, 500, corsHeaders);
        }
      }

      // 2.3 Create Stripe Embedded Checkout Session for Deck Generation (R$ 0,99 for Pro, R$ 1,49 for Non-Pro)
      if ((path === '/api/create-extra-deck-session' || path === '/api/payment/extra-deck-session') && request.method === 'POST') {
        let user = null;
        let isPro = false;
        try {
          user = await authenticateUser();
          const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
          let userDoc = null;
          try {
            const serviceAccount = getServiceAccount(env);
            userDoc = await getUserDocument(serviceAccount, user.uid);
          } catch (e) {}
          isPro = Boolean(isLifetime || user.pro || userDoc?.subscription?.status === 'active');
        } catch (e) {
          // Authentication is optional for initial checkout session creation, but links user if logged in
        }

        const body = await request.json().catch(() => ({}));
        const returnUrl = body.returnUrl || `${request.headers.get('Origin') || 'https://flashcards.camblu.org'}/?session_id={CHECKOUT_SESSION_ID}`;
        try {
          const session = await createExtraGenerationPayment({ env, user, isPro, returnUrl });
          return jsonResponse({ url: session.url, client_secret: session.client_secret, sessionId: session.sessionId }, 200, corsHeaders);
        } catch (err) {
          console.error('[Stripe] Erro ao criar extra deck checkout session:', err.message);
          return jsonResponse({
            error: 'stripe_error',
            message: err.message
          }, 500, corsHeaders);
        }
      }

      // 3. User Pro Status & Quota
      if (path === '/api/user/status' && request.method === 'GET') {
        const user = await authenticateUser();
        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        let userDoc = null;
        let serviceAccount = null;

        try {
          serviceAccount = getServiceAccount(env);
          userDoc = await getUserDocument(serviceAccount, user.uid);
        } catch (docErr) {
          console.warn('[Status] Falha ao ler documento do Firestore:', docErr.message);
        }

        let isPro = Boolean(isLifetime || user.pro || userDoc?.subscription?.status === 'active');

        // If not recognized as Pro or if Firestore doc is pending/out of sync, verify directly with Stripe first
        if ((!isPro || userDoc?.subscription?.status !== 'active') && env.STRIPE_SECRET_KEY && user.email) {
          try {
            const stripeStatus = await checkCustomerProStatusInStripe({ env, email: user.email });
            if (stripeStatus.isPro) {
              isPro = true;
              userDoc = userDoc || {};
              userDoc.subscription = {
                status: 'active',
                plan: 'pro_monthly',
                provider: 'stripe',
                subscriptionId: stripeStatus.subscriptionId,
                customerId: stripeStatus.customerId,
                updatedAt: new Date().toISOString()
              };
              if (serviceAccount) {
                ctx.waitUntil(Promise.all([
                  setFirebaseUserProClaim(serviceAccount, user.uid, true).catch(() => {}),
                  updateUserDocument(serviceAccount, user.uid, {
                    subscription: userDoc.subscription
                  }).catch(() => {})
                ]));
              }
            }
          } catch (stripeErr) {
            console.warn('[Status] Falha ao checar Stripe por e-mail:', stripeErr.message);
          }
        }

        const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-10"
        const lastReset = userDoc?.quotaLastResetMonth || '';
        let monthlyUsed = userDoc?.monthlyGenerationsUsed || 0;
        if (lastReset !== currentMonth) {
          monthlyUsed = 0;
        }
        const extraGenerations = userDoc?.extraGenerations || 0;
        const remainingIncluded = isLifetime ? 9999 : Math.max(0, 4 - monthlyUsed);
        const freeTrialRemaining = userDoc?.freeAiDeckUsed ? 0 : 1;
        const totalRemaining = isPro
          ? (isLifetime ? 9999 : remainingIncluded + extraGenerations)
          : (extraGenerations + freeTrialRemaining);

        if (isLifetime && serviceAccount) {
          ctx.waitUntil(Promise.all([
            setFirebaseUserProClaim(serviceAccount, user.uid, true).catch(() => {}),
            updateUserDocument(serviceAccount, user.uid, {
              subscription: {
                status: 'active',
                plan: 'pro_lifetime',
                provider: 'whitelist',
                updatedAt: new Date().toISOString()
              }
            }).catch(() => {})
          ]));
        } else if (!isPro && serviceAccount && ((userDoc?.deckSlots && userDoc.deckSlots.length > 0) || userDoc?.notebookSlot)) {
          // User is not Pro: ensure all saved cloud decks & slots are wiped from backend
          ctx.waitUntil(clearUserCloudData(serviceAccount, user.uid));
        }

        return jsonResponse({
          uid: user.uid,
          email: user.email,
          isPro,
          isLifetimePro: isLifetime,
          freeAiDeckUsed: Boolean(userDoc?.freeAiDeckUsed),
          monthlyGenerationsUsed: isPro ? monthlyUsed : 0,
          monthlyIncluded: isLifetime ? 9999 : (isPro ? 4 : 0),
          extraGenerations,
          remainingGenerations: totalRemaining,
          subscription: isLifetime ? { status: 'active', plan: 'pro_lifetime' } : (userDoc?.subscription || null)
        }, 200, corsHeaders);
      }

      // 3.1 Cloud Sync: Get User Slots, Decks and Notebook (Exclusive to Pro)
      if (path === '/api/user/slots' && request.method === 'GET') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        // Check Pro status
        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          // If non-pro user has any data remaining in Firestore, wipe it!
          if (serviceAccount && ((userDoc?.deckSlots && userDoc.deckSlots.length > 0) || userDoc?.notebookSlot)) {
            await clearUserCloudData(serviceAccount, user.uid);
          }
          return jsonResponse({
            isPro: false,
            syncDisabled: true,
            deckSlots: [],
            notebookSlot: null,
            stats: null,
            settings: null,
            dailyStreak: null,
            activeMode: null,
            message: 'A sincronização em nuvem está desativada para usuários não-Pro.'
          }, 200, corsHeaders);
        }

        if (!userDoc) {
          return jsonResponse({ isPro: true, deckSlots: null, notebookSlot: null, stats: null, settings: null, dailyStreak: null, activeMode: null }, 200, corsHeaders);
        }

        const deckSlots = userDoc.deckSlots || [];
        // Populate full deckData for each slot if present
        for (const slot of deckSlots) {
          if (slot.deckId) {
            const deckDoc = await getDocument(serviceAccount, 'decks', slot.deckId).catch(() => null);
            if (deckDoc) {
              slot.deckData = deckDoc.deckData;
            }
          }
        }

        // Get notebook deckData
        let notebookData = null;
        const notebookDoc = await getDocument(serviceAccount, 'decks', `notebook_${user.uid}`).catch(() => null);
        if (notebookDoc) {
          notebookData = notebookDoc.deckData;
        }

        return jsonResponse({
          isPro: true,
          deckSlots,
          notebookSlot: {
            title: userDoc.notebookSlot?.title || 'Caderno',
            cardCount: userDoc.notebookSlot?.cardCount || 0,
            deckData: notebookData,
            updatedAt: userDoc.notebookSlot?.updatedAt || 0,
            deletedAt: userDoc.notebookSlot?.deletedAt || null
          },
          stats: userDoc.stats || null,
          settings: userDoc.settings || null,
          dailyStreak: userDoc.dailyStreak || null,
          activeMode: userDoc.activeMode || null,
          lastSyncedAt: userDoc.lastSyncedAt || 0
        }, 200, corsHeaders);
      }

      // 3.2 Cloud Sync: Save User Slots, Decks and Notebook (Exclusive to Pro)
      if (path === '/api/user/slots' && request.method === 'POST') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        // Check Pro status
        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          if (serviceAccount) {
            await clearUserCloudData(serviceAccount, user.uid);
          }
          return jsonResponse({
            error: 'A sincronização em nuvem é exclusiva para assinantes Pro.',
            syncDisabled: true
          }, 403, corsHeaders);
        }

        const body = await request.json().catch(() => ({}));
        const {
          slots = [],
          notebookData = null,
          stats = {},
          settings = {},
          dailyStreak = null,
          activeMode = null,
          clientSyncId = null
        } = body;

        const now = Date.now();
        const deckOps = [];

        // 1. Clean up any previously saved deck documents that were removed or cleared
        const prevSlots = userDoc?.deckSlots || [];
        const activeDeckIds = new Set(slots.filter(s => s.deckId && s.deckData).map(s => s.deckId));
        for (const prev of prevSlots) {
          if (prev.deckId && !activeDeckIds.has(prev.deckId)) {
            deckOps.push(deleteDeckDocument(serviceAccount, prev.deckId).catch(() => {}));
          }
        }

        // 2. Save full deck documents FIRST so they are ready before user doc snapshot triggers
        for (const slot of slots) {
          if (slot.deckId && slot.deckData) {
            const isExam = Boolean(slot.isExam || slot.mode === 'exam' || (slot.deckData && slot.deckData.decks));
            deckOps.push(
              setDocument(serviceAccount, 'decks', slot.deckId, {
                ownerUid: user.uid,
                title: slot.title,
                cardCount: slot.cardCount,
                isFixed: Boolean(slot.isFixed),
                isExam,
                mode: isExam ? 'exam' : 'normal',
                deckData: slot.deckData,
                updatedAt: slot.updatedAt || now
              }).catch(err => console.warn(`Erro ao salvar deck ${slot.deckId}:`, err))
            );
          }
        }

        // 3. Save or delete notebook deck document
        let notebookSaveFailed = false;
        if (notebookData?.deckData) {
          deckOps.push(
            setDocument(serviceAccount, 'decks', `notebook_${user.uid}`, {
              ownerUid: user.uid,
              title: 'Caderno',
              cardCount: notebookData.cardCount || 0,
              deckData: notebookData.deckData,
              updatedAt: notebookData.updatedAt || now
            }).catch(err => {
              console.warn('Erro ao salvar notebook:', err);
              notebookSaveFailed = true;
            })
          );
        } else {
          deckOps.push(deleteDeckDocument(serviceAccount, `notebook_${user.uid}`).catch(() => {}));
        }

        await Promise.all(deckOps);

        const notebookUpdatedAt = notebookSaveFailed
          ? (userDoc?.notebookSlot?.updatedAt || 0)
          : (notebookData?.updatedAt || now);

        // 4. Prepare lightweight metadata for user doc, preserving deletion timestamps & share info
        const deckSlotsMeta = slots.map(s => {
          const isExam = Boolean(s.isExam || s.mode === 'exam' || (s.deckData && s.deckData.decks));
          return {
            slotIndex: s.slotIndex,
            deckId: s.deckData ? (s.deckId || null) : null,
            shareSlug: s.shareSlug || null,
            isShareOwner: Boolean(s.isShareOwner),
            isSharedImport: Boolean(s.isSharedImport),
            title: s.title,
            cardCount: s.deckData ? (s.cardCount || 0) : 0,
            isFixed: Boolean(s.isFixed),
            isCurrent: Boolean(s.isCurrent),
            isExam,
            mode: isExam ? 'exam' : 'normal',
            updatedAt: s.updatedAt || now,
            deletedAt: s.deckData ? null : (s.deletedAt || now)
          };
        });

        // 5. Update user document LAST so onSnapshot listeners see committed deck documents
        await updateUserDocument(serviceAccount, user.uid, {
          deckSlots: deckSlotsMeta,
          notebookSlot: {
            cardCount: notebookData?.deckData ? (notebookData.cardCount || 0) : 0,
            title: notebookData?.title || 'Caderno',
            updatedAt: notebookUpdatedAt,
            deletedAt: notebookData?.deckData ? null : (notebookData?.deletedAt || now)
          },
          stats: stats || {},
          settings: settings || {},
          dailyStreak: dailyStreak || null,
          activeMode: activeMode || null,
          lastSyncedAt: now,
          lastClientSyncId: clientSyncId || null
        }).catch(err => console.warn('Erro ao atualizar user doc:', err));

        return jsonResponse({ success: true, syncedAt: now }, 200, corsHeaders);
      }

      // 3.3 User Stats API Key Management (Exclusive to Pro)
      if (path === '/api/user/api-key' && request.method === 'GET') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          return jsonResponse({
            error: 'pro_required',
            message: 'A API de estatísticas é exclusiva para assinantes Pro.'
          }, 403, corsHeaders);
        }

        return jsonResponse({
          apiKey: userDoc?.apiKey || null,
          createdAt: userDoc?.apiKeyCreatedAt || null,
          isPro: true
        }, 200, corsHeaders);
      }

      if (path === '/api/user/api-key' && request.method === 'POST') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          return jsonResponse({
            error: 'pro_required',
            message: 'A API de estatísticas é exclusiva para assinantes Pro.'
          }, 403, corsHeaders);
        }

        // Generate 32-hex cryptographically random string with prefix fc_live_
        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const keySuffix = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const newApiKey = `fc_live_${keySuffix}`;
        const now = new Date().toISOString();

        // If user already had an existing API key, remove previous key document
        if (userDoc?.apiKey && userDoc.apiKey !== newApiKey) {
          await deleteDocument(serviceAccount, 'api_keys', userDoc.apiKey).catch(() => {});
        }

        // Save key reference document in 'api_keys' collection
        await setDocument(serviceAccount, 'api_keys', newApiKey, {
          uid: user.uid,
          email: user.email || '',
          createdAt: now,
          lastUsedAt: null
        });

        // Update user document
        await updateUserDocument(serviceAccount, user.uid, {
          apiKey: newApiKey,
          apiKeyCreatedAt: now
        });

        return jsonResponse({
          apiKey: newApiKey,
          createdAt: now,
          isPro: true
        }, 200, corsHeaders);
      }

      if (path === '/api/user/api-key' && request.method === 'DELETE') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          return jsonResponse({
            error: 'pro_required',
            message: 'A API de estatísticas é exclusiva para assinantes Pro.'
          }, 403, corsHeaders);
        }

        if (userDoc?.apiKey) {
          await deleteDocument(serviceAccount, 'api_keys', userDoc.apiKey).catch(() => {});
          await updateUserDocument(serviceAccount, user.uid, {
            apiKey: null,
            apiKeyCreatedAt: null
          });
        }

        return jsonResponse({ success: true, message: 'Chave de API revogada com sucesso.' }, 200, corsHeaders);
      }

      // 3.4 External Public Stats API Endpoint (Exclusive to Pro with API Key)
      if ((path === '/api/v1/stats' || path === '/api/stats') && request.method === 'GET') {
        // Extract API key from headers or query parameters
        let apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key') || '';
        if (!apiKey) {
          const authHeader = request.headers.get('Authorization') || '';
          if (authHeader.startsWith('Bearer ')) {
            apiKey = authHeader.substring(7);
          }
        }
        if (!apiKey) {
          apiKey = url.searchParams.get('api_key') || url.searchParams.get('key') || '';
        }

        apiKey = (apiKey || '').trim().replace(/^["']|["']$/g, '');

        if (!apiKey) {
          return jsonResponse({
            error: 'unauthorized',
            message: 'Chave de API ausente. Forneça o cabeçalho Authorization: Bearer <chave>, X-API-Key: <chave> ou o parâmetro ?api_key=<chave>.'
          }, 401, publicCorsHeaders);
        }

        const serviceAccount = getServiceAccount(env);
        let keyDoc = await getDocument(serviceAccount, 'api_keys', apiKey).catch(() => null);
        let userDoc = null;
        let userId = null;

        if (keyDoc && keyDoc.uid) {
          userId = keyDoc.uid;
          userDoc = await getUserDocument(serviceAccount, userId).catch(() => null);
        }

        // Resilient fallback: if api_keys reference doc was missing or not yet indexed, look up user by apiKey directly
        if (!userDoc) {
          const userFromQuery = await findUserByApiKey(serviceAccount, apiKey).catch(() => null);
          if (userFromQuery && userFromQuery.uid) {
            userId = userFromQuery.uid;
            userDoc = userFromQuery;
            // Self-healing: create the api_keys reference document asynchronously for fast subsequent reads
            ctx.waitUntil(
              setDocument(serviceAccount, 'api_keys', apiKey, {
                uid: userId,
                email: userDoc.email || '',
                createdAt: userDoc.apiKeyCreatedAt || new Date().toISOString(),
                lastUsedAt: new Date().toISOString()
              }).catch(() => {})
            );
          }
        }

        if (!userDoc || !userId) {
          return jsonResponse({
            error: 'invalid_api_key',
            message: 'Chave de API inválida ou revogada.'
          }, 401, publicCorsHeaders);
        }

        // Verify that the user is currently PRO
        const isLifetime = LIFETIME_PRO_EMAILS.includes((userDoc.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc.subscription?.status === 'active' || userDoc.pro === true;

        if (!isPro) {
          return jsonResponse({
            error: 'pro_required',
            message: 'A API de estatísticas é exclusiva para assinantes Pro.'
          }, 403, publicCorsHeaders);
        }

        // Asynchronously update lastUsedAt on key document
        ctx.waitUntil(
          updateUserDocument(serviceAccount, keyDoc.uid, {
            'apiKeyLastUsedAt': new Date().toISOString()
          }).catch(() => {})
        );

        // Determine target date (YYYY-MM-DD), default to today in UTC
        let targetDate = url.searchParams.get('date');
        if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
          targetDate = new Date().toISOString().slice(0, 10);
        }

        const streakDays = Number(userDoc.dailyStreak?.streak) || 0;
        const streakHistoryCount = Number(userDoc.dailyStreak?.history?.[targetDate]) || 0;

        let sessionCardsSum = 0;
        let sessionCorrectSum = 0;
        let sessionDurationSum = 0;

        const sessions = [];
        if (Array.isArray(userDoc.stats?.history)) {
          sessions.push(...userDoc.stats.history);
        }
        if (userDoc.stats?.currentSession && typeof userDoc.stats.currentSession === 'object') {
          sessions.push(userDoc.stats.currentSession);
        }

        for (const sess of sessions) {
          if (!sess) continue;
          const sessTime = sess.startTime || sess.lastActiveTime || sess.endTime;
          if (!sessTime) continue;
          const sessDateStr = new Date(sessTime).toISOString().slice(0, 10);
          if (sessDateStr === targetDate) {
            sessionCardsSum += (Number(sess.cardsAnswered) || 0);
            sessionCorrectSum += (Number(sess.correctCount) || 0);
            sessionDurationSum += (Number(sess.durationSeconds || sess.activeDurationSeconds) || 0);
          }
        }

        const cardsReviewed = Math.max(sessionCardsSum, streakHistoryCount);

        let retentionRate = 0.0;
        if (sessionCardsSum > 0) {
          retentionRate = Math.round((sessionCorrectSum / sessionCardsSum) * 100) / 100;
        } else if (cardsReviewed > 0 && userDoc.stats?.allTime?.totalCardsAnswered > 0) {
          const allTimeCorrect = Number(userDoc.stats.allTime.totalCorrect) || 0;
          const allTimeTotal = Number(userDoc.stats.allTime.totalCardsAnswered) || 0;
          retentionRate = allTimeTotal > 0 ? Math.round((allTimeCorrect / allTimeTotal) * 100) / 100 : 0.0;
        }

        const timeSpentSeconds = sessionDurationSum;

        // Calculate past 14 days metrics (chronological from targetDate - 13 days to targetDate)
        const past14DaysCards = [];
        const past14DaysTime = [];
        const [tY, tM, tD] = targetDate.split('-').map(Number);

        for (let i = 13; i >= 0; i--) {
          const dt = new Date(Date.UTC(tY, tM - 1, tD));
          dt.setUTCDate(dt.getUTCDate() - i);
          const dayStr = dt.toISOString().slice(0, 10);

          let daySessionCards = 0;
          let daySessionTime = 0;

          for (const s of sessions) {
            if (!s) continue;
            const sTime = s.startTime || s.lastActiveTime || s.endTime;
            if (!sTime) continue;
            const sDate = new Date(sTime).toISOString().slice(0, 10);
            if (sDate === dayStr) {
              daySessionCards += (Number(s.cardsAnswered) || 0);
              daySessionTime += (Number(s.durationSeconds || s.activeDurationSeconds) || 0);
            }
          }

          const streakDayCount = Number(userDoc.dailyStreak?.history?.[dayStr]) || 0;
          const dayCards = Math.max(daySessionCards, streakDayCount);

          past14DaysCards.push(dayCards);
          past14DaysTime.push(daySessionTime);
        }

        // If sample query parameter is explicitly requested, inject sample fallback values
        const isSampleRequested = url.searchParams.get('sample') === 'true';

        let past14CardsStr = past14DaysCards.join(';');
        let past14TimeStr = past14DaysTime.join(';');
        if (isSampleRequested && past14DaysCards.every(c => c === 0)) {
          past14CardsStr = '12;109;82;0;98;45;120;30;0;50;110;85;140;142';
          past14TimeStr = '180;1250;950;0;1100;540;1400;360;0;600;1300;980;1600;1840';
        }

        const statsPayload = {
          date: targetDate,
          cards_reviewed: isSampleRequested ? (cardsReviewed || 142) : cardsReviewed,
          retention_rate: isSampleRequested ? (retentionRate || 0.88) : retentionRate,
          time_spent_seconds: isSampleRequested ? (timeSpentSeconds || 1840) : timeSpentSeconds,
          streak_days: isSampleRequested ? (streakDays || 18) : streakDays,
          past_14_days_time: past14TimeStr,
          past_14_days_cards: past14CardsStr
        };

        return jsonResponse(statsPayload, 200, publicCorsHeaders);
      }

      // 3.5 User Daily Goal Webhook Management (Exclusive to Pro)
      if (path === '/api/user/webhook' && request.method === 'GET') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          return jsonResponse({ error: 'pro_required', message: 'Webhooks são exclusivos para assinantes Pro.' }, 403, corsHeaders);
        }

        return jsonResponse({
          webhookUrl: userDoc?.dailyGoalWebhookUrl || null,
          lastTriggeredAt: userDoc?.dailyGoalWebhookLastTriggeredAt || null,
          isPro: true
        }, 200, corsHeaders);
      }

      if (path === '/api/user/webhook' && request.method === 'POST') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          return jsonResponse({ error: 'pro_required', message: 'Webhooks são exclusivos para assinantes Pro.' }, 403, corsHeaders);
        }

        const body = await request.json().catch(() => ({}));
        let webhookUrl = (body.webhookUrl || '').trim();
        if (webhookUrl && !webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
          return jsonResponse({ error: 'invalid_url', message: 'A URL do webhook deve começar com http:// ou https://' }, 400, corsHeaders);
        }

        await updateUserDocument(serviceAccount, user.uid, {
          dailyGoalWebhookUrl: webhookUrl || null
        });

        return jsonResponse({ success: true, webhookUrl: webhookUrl || null }, 200, corsHeaders);
      }

      if (path === '/api/user/webhook/test' && request.method === 'POST') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          return jsonResponse({ error: 'pro_required', message: 'Webhooks são exclusivos para assinantes Pro.' }, 403, corsHeaders);
        }

        const body = await request.json().catch(() => ({}));
        const targetUrl = (body.webhookUrl || userDoc?.dailyGoalWebhookUrl || '').trim();

        if (!targetUrl) {
          return jsonResponse({ error: 'missing_url', message: 'Nenhuma URL de webhook configurada para teste.' }, 400, corsHeaders);
        }

        const testPayload = {
          event: 'daily_goal_reached',
          is_test: true,
          date: new Date().toISOString().slice(0, 10),
          cards_reviewed: 25,
          daily_goal: 25,
          streak_days: Number(userDoc?.dailyStreak?.streak) || 1,
          timestamp: new Date().toISOString()
        };

        try {
          const hookRes = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'SpaiqFlashcards-Webhook/1.0',
              'X-Spaiq-Event': 'daily_goal_reached'
            },
            body: JSON.stringify(testPayload)
          });

          return jsonResponse({
            success: true,
            status: hookRes.status,
            statusText: hookRes.statusText,
            delivered: hookRes.ok
          }, 200, corsHeaders);
        } catch (err) {
          return jsonResponse({
            error: 'dispatch_failed',
            message: `Falha ao conectar na URL: ${err.message}`
          }, 502, corsHeaders);
        }
      }

      if (path === '/api/user/webhook/trigger' && request.method === 'POST') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        const isPro = isLifetime || userDoc?.subscription?.status === 'active' || user.pro === true;

        if (!isPro) {
          return jsonResponse({ error: 'pro_required' }, 403, corsHeaders);
        }

        const webhookUrl = userDoc?.dailyGoalWebhookUrl;
        if (!webhookUrl) {
          return jsonResponse({ success: true, dispatched: false, reason: 'no_webhook_configured' }, 200, corsHeaders);
        }

        const body = await request.json().catch(() => ({}));
        const todayStr = body.date || new Date().toISOString().slice(0, 10);
        const cardsReviewed = Number(body.cardsReviewed) || 0;
        const dailyGoal = Number(body.dailyGoal) || 0;
        const streakDays = Number(userDoc?.dailyStreak?.streak) || 0;

        const payload = {
          event: 'daily_goal_reached',
          date: todayStr,
          cards_reviewed: cardsReviewed,
          daily_goal: dailyGoal,
          streak_days: streakDays,
          timestamp: new Date().toISOString()
        };

        ctx.waitUntil(
          fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'SpaiqFlashcards-Webhook/1.0',
              'X-Spaiq-Event': 'daily_goal_reached'
            },
            body: JSON.stringify(payload)
          }).then(res => {
            updateUserDocument(serviceAccount, user.uid, {
              dailyGoalWebhookLastTriggeredAt: new Date().toISOString(),
              dailyGoalWebhookLastTriggeredDate: todayStr
            }).catch(() => {});
          }).catch(err => console.warn('[Webhook] Falha ao disparar webhook para:', webhookUrl, err.message))
        );

        return jsonResponse({ success: true, dispatched: true }, 200, corsHeaders);
      }

      // 4. Verify Payment Status & Activate Pro immediately
      if (path === '/api/payment/verify' && request.method === 'POST') {
        let user = null;
        try {
          user = await authenticateUser();
        } catch (e) {
          // Unauthenticated user payment verification (e.g. single generation bought without login)
        }

        const body = await request.json().catch(() => ({}));
        const sessionId = body.session_id || url.searchParams.get('session_id');

        if (user) {
          const serviceAccount = getServiceAccount(env);
          const userDoc = await getUserDocument(serviceAccount, user.uid).catch(() => null);

          const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
          if (isLifetime) {
            await setFirebaseUserProClaim(serviceAccount, user.uid, true).catch(() => {});
            return jsonResponse({ isPro: true, status: 'active', plan: 'pro_lifetime' }, 200, corsHeaders);
          }
        }

        // Check Stripe subscription / session if applicable
        if (env.STRIPE_SECRET_KEY) {
          try {
            const stripe = getStripeClient(env);

            // 1. If session_id (cs_...) is provided
            if (sessionId && typeof sessionId === 'string' && sessionId.startsWith('cs_')) {
              const session = await stripe.checkout.sessions.retrieve(sessionId);
              if (session && (session.status === 'complete' || session.payment_status === 'paid')) {
                if (session.mode === 'payment' || session.metadata?.type === 'extra_deck') {
                  if (user) {
                    const serviceAccount = getServiceAccount(env);
                    const userDoc = await getUserDocument(serviceAccount, user.uid).catch(() => null);
                    const paidSessions = Array.isArray(userDoc?.paidSessionIds) ? [...userDoc.paidSessionIds] : [];
                    let currentExtras = userDoc?.extraGenerations || 0;
                    if (!paidSessions.includes(sessionId)) {
                      currentExtras += 1;
                      paidSessions.push(sessionId);
                      await updateUserDocument(serviceAccount, user.uid, {
                        extraGenerations: currentExtras,
                        paidSessionIds: paidSessions,
                        updatedAt: new Date().toISOString()
                      });
                    }
                    return jsonResponse({ isPro: Boolean(user.pro || userDoc?.subscription?.status === 'active'), extraGenerations: currentExtras, type: 'extra_deck' }, 200, corsHeaders);
                  } else {
                    return jsonResponse({ isPro: false, extraGenerations: 1, type: 'extra_deck', sessionId: session.id, paid: true }, 200, corsHeaders);
                  }
                } else if (user) {
                  const serviceAccount = getServiceAccount(env);
                  await Promise.all([
                    setFirebaseUserProClaim(serviceAccount, user.uid, true).catch(() => {}),
                    updateUserDocument(serviceAccount, user.uid, {
                      subscription: {
                        status: 'active',
                        plan: 'pro_monthly',
                        provider: 'stripe',
                        subscriptionId: session.subscription || '',
                        customerId: session.customer || '',
                        updatedAt: new Date().toISOString()
                      }
                    }).catch(() => {})
                  ]);
                  return jsonResponse({ isPro: true, status: 'active', plan: 'pro_monthly' }, 200, corsHeaders);
                }
              }
            }

            // 2. Direct customer check by email in Stripe
            if (user.email) {
              const stripeStatus = await checkCustomerProStatusInStripe({ env, email: user.email });
              if (stripeStatus.isPro) {
                await Promise.all([
                  setFirebaseUserProClaim(serviceAccount, user.uid, true).catch(() => {}),
                  updateUserDocument(serviceAccount, user.uid, {
                    subscription: {
                      status: 'active',
                      plan: 'pro_monthly',
                      provider: 'stripe',
                      subscriptionId: stripeStatus.subscriptionId,
                      customerId: stripeStatus.customerId,
                      updatedAt: new Date().toISOString()
                    }
                  }).catch(() => {})
                ]);
                return jsonResponse({ isPro: true, status: 'active', plan: 'pro_monthly' }, 200, corsHeaders);
              }
            }
          } catch (stripeErr) {
            console.warn('[Verify] Erro ao checar Stripe:', stripeErr.message);
          }
        }

        return jsonResponse({
          isPro: false,
          status: 'pending',
          message: 'Pagamento ainda não confirmado pelo banco. Se realizou o pagamento há poucos segundos, aguarde um instante e verifique novamente.'
        }, 200, corsHeaders);
      }

      // 5. Cancel Subscription and Delete User Account & All Data
      if (path === '/api/user/delete-account' && request.method === 'POST') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);

        // 1. Cancel Subscription if exists (Stripe)
        const subId = userDoc?.subscription?.subscriptionId;
        if (subId && env.STRIPE_SECRET_KEY) {
          try {
            await cancelSubscription({ env, subscriptionId: subId, immediate: true });
          } catch (stripeErr) {
            console.warn('Falha ao cancelar assinatura Stripe:', stripeErr.message);
          }
        }

        // 2. Delete Firestore data (user doc + user decks + shares)
        await deleteUserDocument(serviceAccount, user.uid).catch(err => console.warn('Falha ao excluir Firestore:', err));

        // 3. Delete Firebase Auth user
        await deleteFirebaseUser(serviceAccount, user.uid);

        return jsonResponse({
          success: true,
          message: 'Assinatura cancelada e conta excluída permanentemente com sucesso.'
        }, 200, corsHeaders);
      }

      // 5.1 Get Subscription Details from Stripe (for manage modal)
      if (path === '/api/subscription/details' && request.method === 'GET') {
        const user = await authenticateUser();
        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        if (isLifetime) {
          return jsonResponse({
            isPro: true,
            isLifetime: true,
            status: 'active',
            plan: 'pro_lifetime'
          }, 200, corsHeaders);
        }

        let userDoc = null;
        let serviceAccount = null;
        try {
          serviceAccount = getServiceAccount(env);
          userDoc = await getUserDocument(serviceAccount, user.uid);
        } catch (e) {
          console.warn('[Subscription] Erro ao buscar Firestore:', e.message);
        }

        const subId = userDoc?.subscription?.subscriptionId;
        const provider = userDoc?.subscription?.provider;

        if (subId && (provider === 'stripe' || subId.startsWith('sub_')) && env.STRIPE_SECRET_KEY) {
          try {
            const details = await getSubscriptionDetails({ env, subscriptionId: subId, userDoc });
            if (details) {
              return jsonResponse(details, 200, corsHeaders);
            }
          } catch (stripeErr) {
            console.warn('[Subscription] Erro ao buscar assinatura Stripe:', stripeErr.message);
          }
        }

        return jsonResponse({
          isPro: Boolean(userDoc?.subscription?.status === 'active' || user.pro),
          isLifetime: false,
          status: userDoc?.subscription?.status || 'inactive'
        }, 200, corsHeaders);
      }

      // 5.2 Cancel Subscription Only (cancels renewal at period end so user keeps remaining paid days)
      if (path === '/api/subscription/cancel' && request.method === 'POST') {
        const user = await authenticateUser();
        let serviceAccount = null;
        let userDoc = null;
        try {
          serviceAccount = getServiceAccount(env);
          userDoc = await getUserDocument(serviceAccount, user.uid);
        } catch (e) {
          console.warn('[Subscription] Erro ao acessar Firestore no cancelamento:', e.message);
        }

        const subId = userDoc?.subscription?.subscriptionId;
        const provider = userDoc?.subscription?.provider;
        let activeUntil = null;

        if (subId) {
          if (provider === 'stripe' || subId.startsWith('sub_')) {
            if (env.STRIPE_SECRET_KEY) {
              try {
                const sub = await cancelSubscription({ env, subscriptionId: subId, immediate: false });
                activeUntil = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10) : null;
              } catch (stripeErr) {
                console.warn('Falha ao cancelar assinatura Stripe:', stripeErr.message);
              }
            }
          }
        }

        if (!activeUntil && userDoc?.subscription?.currentPeriodEnd) {
          activeUntil = userDoc.subscription.currentPeriodEnd;
        }

        if (serviceAccount) {
          await updateUserDocument(serviceAccount, user.uid, {
            'subscription.cancelAtPeriodEnd': true,
            'subscription.cancelAt': activeUntil,
            'subscription.currentPeriodEnd': activeUntil,
            'subscription.canceledAt': new Date().toISOString()
          }).catch(err => console.warn('Falha ao atualizar Firestore:', err));
        }

        return jsonResponse({
          success: true,
          cancelAtPeriodEnd: true,
          activeUntil,
          nextDueDate: activeUntil,
          message: 'Assinatura cancelada com sucesso. O plano permanecerá ativo até o fim do período já pago.'
        }, 200, corsHeaders);
      }

      // 5.3 Reactivate Subscription (removes cancel_at_period_end)
      if (path === '/api/subscription/reactivate' && request.method === 'POST') {
        const user = await authenticateUser();
        const serviceAccount = getServiceAccount(env);
        const userDoc = await getUserDocument(serviceAccount, user.uid);
        const subId = userDoc?.subscription?.subscriptionId;

        if (subId && env.STRIPE_SECRET_KEY) {
          try {
            const sub = await reactivateSubscription({ env, subscriptionId: subId });
            const nextDueDate = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10) : null;
            await updateUserDocument(serviceAccount, user.uid, {
              'subscription.cancelAtPeriodEnd': false,
              'subscription.cancelAt': null,
              'subscription.status': 'active'
            });
            await setFirebaseUserProClaim(serviceAccount, user.uid, true);
            return jsonResponse({
              success: true,
              cancelAtPeriodEnd: false,
              nextDueDate,
              message: 'Assinatura reativada com sucesso! As renovações automáticas continuam ativas.'
            }, 200, corsHeaders);
          } catch (stripeErr) {
            console.warn('[Subscription] Erro ao reativar assinatura no Stripe:', stripeErr.message);
            return jsonResponse({ error: stripeErr.message }, 400, corsHeaders);
          }
        }

        return jsonResponse({ error: 'Nenhuma assinatura ativa encontrada para reativar.' }, 400, corsHeaders);
      }

      // 6. Gemini AI - Deck Generation (Requires Pro & Quota Check; Free 1-Deck Trial for Non-Pro without login)
      if (path === '/api/ai/generate' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization') || '';
        const reqBody = await request.json();
        const isNewDeck = reqBody.isNewDeck !== false;

        let user = null;
        if (authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const projectId = env.FIREBASE_PROJECT_ID || 'flashcards-ead57';
          try {
            user = await verifyFirebaseIdToken(token, projectId);
          } catch (authErr) {
            return jsonResponse({ error: 'unauthorized', message: authErr.message || 'Token inválido' }, 401, corsHeaders);
          }
        }

        if (user) {
          const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
          let userDoc = null;
          let serviceAccount = null;
          try {
            serviceAccount = getServiceAccount(env);
            userDoc = await getUserDocument(serviceAccount, user.uid);
          } catch (e) {
            console.warn('[Generate] Falha ao ler Firestore:', e.message);
          }

          const isPro = Boolean(isLifetime || user.pro || userDoc?.subscription?.status === 'active');
          const hasUsedFreeTrial = Boolean(userDoc?.freeAiDeckUsed);
          let extraGens = userDoc?.extraGenerations || 0;

          // Quota check logic
          if (isNewDeck && !isLifetime) {
            if (isPro) {
              // PRO USER: 4 free deck generations per month + any purchased extra generations
              const currentMonth = new Date().toISOString().slice(0, 7);
              const lastReset = userDoc?.quotaLastResetMonth || '';
              let monthlyUsed = userDoc?.monthlyGenerationsUsed || 0;

              if (lastReset !== currentMonth) {
                monthlyUsed = 0;
              }

              if (monthlyUsed < 4) {
                monthlyUsed += 1;
              } else if (extraGens > 0) {
                extraGens -= 1;
              } else {
                return jsonResponse({
                  error: 'quota_exceeded',
                  message: 'Você atingiu o limite de 4 baralhos por IA este mês. Adquira gerações extras por R$ 0,99 cada.',
                  limit: 4,
                  used: monthlyUsed,
                  extra: extraGens
                }, 402, corsHeaders);
              }

              if (serviceAccount) {
                await updateUserDocument(serviceAccount, user.uid, {
                  monthlyGenerationsUsed: monthlyUsed,
                  quotaLastResetMonth: currentMonth,
                  extraGenerations: extraGens
                }).catch(() => {});
              }
            } else {
              // NON-PRO LOGGED-IN USER: 1 free trial deck generation, or use purchased extra generations (R$ 1,49 on Stripe)
              if (!hasUsedFreeTrial) {
                if (serviceAccount) {
                  await updateUserDocument(serviceAccount, user.uid, {
                    freeAiDeckUsed: true,
                    freeAiDeckUsedAt: new Date().toISOString()
                  }).catch((err) => console.warn('[Generate] Erro ao registrar freeAiDeckUsed:', err.message));
                }
              } else if (extraGens > 0) {
                extraGens -= 1;
                if (serviceAccount) {
                  await updateUserDocument(serviceAccount, user.uid, {
                    extraGenerations: extraGens
                  }).catch(() => {});
                }
              } else {
                return jsonResponse({
                  error: 'quota_exceeded',
                  message: 'Você já utilizou sua geração gratuita de 1 baralho com IA. Adquira uma geração avulsa por R$ 1,49 no Stripe ou assine o Spaiq Pro (R$ 4,99/mês com 4 gerações mensais)!',
                  limit: 0,
                  used: 1,
                  extra: 0,
                  canBuyExtra: true
                }, 402, corsHeaders);
              }
            }
          }
        } else {
          // NON-LOGGED-IN USER:
          // 1 free trial deck generation is allowed without login.
          // Editor AI agent turns (isNewDeck === false) require a Pro account.
          if (!isNewDeck) {
            return jsonResponse({
              error: 'unauthorized',
              message: 'O assistente de edição por IA é exclusivo para assinantes Flashcards Pro. Faça login com sua conta Pro para usar.'
            }, 401, corsHeaders);
          }
        }

        // Proxy Gemini call
        const geminiRes = await callGemini({
          model: reqBody.model || 'gemini-flash-latest',
          contents: reqBody.contents,
          systemInstruction: reqBody.systemInstruction,
          generationConfig: reqBody.generationConfig,
          tools: reqBody.tools,
          toolConfig: reqBody.toolConfig,
          stream: Boolean(reqBody.stream),
          apiKey: env.GEMINI_API_KEY
        });

        // Forward headers with CORS
        const responseHeaders = new Headers(geminiRes.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
        return new Response(geminiRes.body, {
          status: geminiRes.status,
          headers: responseHeaders
        });
      }

      // 7. Gemini AI - Tutor Feedback during study (Unlimited for Pro)
      if (path === '/api/ai/tutor' && request.method === 'POST') {
        const user = await authenticateUser();
        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        let isPro = isLifetime || Boolean(user.pro);

        if (!isPro) {
          try {
            const serviceAccount = getServiceAccount(env);
            const userDoc = await getUserDocument(serviceAccount, user.uid);
            if (userDoc?.subscription?.status === 'active') {
              isPro = true;
            }
          } catch (e) {
            console.warn('[Tutor] Falha ao checar assinatura no Firestore:', e.message);
          }
        }

        if (!isPro) {
          return jsonResponse({
            error: 'subscription_required',
            message: 'O Tutor de IA é exclusivo para assinantes Pro.'
          }, 403, corsHeaders);
        }

        const reqBody = await request.json();
        const geminiRes = await callGemini({
          model: reqBody.model || 'gemini-flash-lite-latest',
          contents: reqBody.contents,
          systemInstruction: reqBody.systemInstruction,
          generationConfig: reqBody.generationConfig,
          tools: reqBody.tools,
          toolConfig: reqBody.toolConfig,
          stream: false,
          apiKey: env.GEMINI_API_KEY
        });

        const responseHeaders = new Headers(geminiRes.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
        return new Response(geminiRes.body, {
          status: geminiRes.status,
          headers: responseHeaders
        });
      }

      // 8. Gemini AI - Stats Diagnostic Insights (Unlimited for Pro)
      if (path === '/api/ai/stats' && request.method === 'POST') {
        const user = await authenticateUser();
        const isLifetime = LIFETIME_PRO_EMAILS.includes((user.email || '').toLowerCase().trim());
        let isPro = isLifetime || Boolean(user.pro);

        if (!isPro) {
          try {
            const serviceAccount = getServiceAccount(env);
            const userDoc = await getUserDocument(serviceAccount, user.uid);
            if (userDoc?.subscription?.status === 'active') {
              isPro = true;
            }
          } catch (e) {
            console.warn('[Stats] Falha ao checar assinatura no Firestore:', e.message);
          }
        }

        if (!isPro) {
          return jsonResponse({
            error: 'subscription_required',
            message: 'O Diagnóstico Cognitivo por IA é exclusivo para assinantes Pro.'
          }, 403, corsHeaders);
        }

        const reqBody = await request.json();
        const geminiRes = await callGemini({
          model: reqBody.model || 'gemini-flash-lite-latest',
          contents: reqBody.contents,
          systemInstruction: reqBody.systemInstruction,
          generationConfig: reqBody.generationConfig,
          tools: reqBody.tools,
          toolConfig: reqBody.toolConfig,
          stream: false,
          apiKey: env.GEMINI_API_KEY
        });

        const responseHeaders = new Headers(geminiRes.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
        return new Response(geminiRes.body, {
          status: geminiRes.status,
          headers: responseHeaders
        });
      }

      return jsonResponse({ error: 'not_found', message: 'Rota não encontrada' }, 404, corsHeaders);

    } catch (err) {
      if (err instanceof Response) return err;
      console.error('Unhandled worker error:', err);
      return jsonResponse({
        error: 'internal_server_error',
        message: err.message || 'Erro inesperado no servidor'
      }, 500, corsHeaders);
    }
  }
};

/**
 * Handle Stripe Webhook events
 */
async function handleStripeWebhook(request, env) {
  const sig = request.headers.get('stripe-signature');
  const bodyText = await request.text();
  let event;

  const stripe = getStripeClient(env);

  if (!sig || !env.STRIPE_WEBHOOK_SECRET) {
    console.warn('[Stripe Webhook] Assinatura stripe-signature ou STRIPE_WEBHOOK_SECRET ausente');
    return new Response('Webhook signature required', { status: 400 });
  }

  try {
    event = await stripe.webhooks.constructEventAsync(bodyText, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('[Stripe Webhook] Erro ao validar assinatura:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const serviceAccount = getServiceAccount(env);
  const dataObject = event.data?.object || {};

  console.log(`[Stripe Webhook] Evento: ${event.type}, ID: ${dataObject.id}`);

  // 1. Checkout Session Completed -> Activate Pro
  if (event.type === 'checkout.session.completed') {
    let uid = dataObject.client_reference_id || dataObject.metadata?.uid || null;

    if (!uid && (dataObject.customer_details?.email || dataObject.customer_email)) {
      const email = (dataObject.customer_details?.email || dataObject.customer_email || '').toLowerCase().trim();
      if (email) {
        const userRecord = await getFirebaseUserByEmail(serviceAccount, email).catch(() => null);
        if (userRecord?.uid) {
          uid = userRecord.uid;
        }
      }
    }

    if (uid) {
      if (dataObject.mode === 'payment' || dataObject.metadata?.type === 'extra_deck') {
        // ONE-TIME EXTRA DECK GENERATION PURCHASE
        const userDoc = await getUserDocument(serviceAccount, uid);
        const paidSessions = Array.isArray(userDoc?.paidSessionIds) ? [...userDoc.paidSessionIds] : [];
        if (!paidSessions.includes(dataObject.id)) {
          const currentExtras = userDoc?.extraGenerations || 0;
          paidSessions.push(dataObject.id);
          await updateUserDocument(serviceAccount, uid, {
            extraGenerations: currentExtras + 1,
            paidSessionIds: paidSessions,
            updatedAt: new Date().toISOString()
          });
          console.log(`[Stripe Webhook] Geração extra adicionada com sucesso para UID: ${uid} (novo total: ${currentExtras + 1})`);
        } else {
          console.log(`[Stripe Webhook] Sessão ${dataObject.id} já processada anteriormente para UID: ${uid}`);
        }
      } else {
        // RECURRING MONTHLY PRO SUBSCRIPTION
        await setFirebaseUserProClaim(serviceAccount, uid, true);
        await updateUserDocument(serviceAccount, uid, {
          subscription: {
            status: 'active',
            plan: 'pro_monthly',
            provider: 'stripe',
            subscriptionId: dataObject.subscription || '',
            customerId: dataObject.customer || '',
            updatedAt: new Date().toISOString()
          }
        });
        console.log(`[Stripe Webhook] Pro ativado com sucesso para UID: ${uid}`);
      }
    }
  }

  // 2. Subscription Deleted / Canceled -> Deactivate Pro
  if (event.type === 'customer.subscription.deleted') {
    let uid = dataObject.metadata?.uid || null;
    if (!uid && dataObject.customer && env.STRIPE_SECRET_KEY) {
      try {
        const customer = await stripe.customers.retrieve(dataObject.customer);
        if (customer && customer.email) {
          const email = (customer.email || '').toLowerCase().trim();
          if (email) {
            const userRecord = await getFirebaseUserByEmail(serviceAccount, email).catch(() => null);
            if (userRecord?.uid) {
              uid = userRecord.uid;
            }
          }
        }
      } catch (e) {
        console.warn('[Stripe Webhook] Falha ao recuperar cliente cancelado:', e.message);
      }
    }

    if (uid) {
      await setFirebaseUserProClaim(serviceAccount, uid, false);
      await updateUserDocument(serviceAccount, uid, {
        'subscription.status': 'canceled',
        'subscription.cancelAtPeriodEnd': false,
        'subscription.canceledAt': new Date().toISOString()
      });
      // Non-Pro user: wipe all saved cloud decks & notebook from backend database
      await clearUserCloudData(serviceAccount, uid);
      console.log(`[Stripe Webhook] Pro desativado e dados de nuvem apagados para UID: ${uid}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
