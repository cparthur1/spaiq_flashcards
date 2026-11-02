// SPDX-License-Identifier: GPL-2.0-only
/**
 * stripe.js - Stripe Payment Gateway Integration for Cloudflare Worker
 * Provides:
 * 1. Pro Subscriptions (R$ 4,99/mês)
 * 2. One-time Deck Generations (R$ 0,99 for Pro, R$ 1,49 for Non-Pro)
 * 3. Subscription status verification, retrieval, cancellation & reactivation
 */

import Stripe from 'stripe';
import { getServiceAccount, updateUserDocument } from './firestore.js';

export function getStripeClient(env) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY não configurada no servidor.');
  }
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' });
}

/**
 * Create Stripe Embedded Checkout Session for Pro Subscription (R$ 4,99/mês)
 */
export async function createSubscription({ env, user, returnUrl }) {
  const stripe = getStripeClient(env);
  const mode = "subscription";

  const sessionParams = {
    ui_mode: "form",
    mode,
    billing_address_collection: "auto",
    phone_number_collection: { enabled: false },
    automatic_tax: { enabled: false },
    submit_type: "auto",
    saved_payment_method_options: { payment_method_save: "enabled" },
    integration_identifier: "custom_embedded_web_0001",
    return_url: returnUrl,
    line_items: [
      {
        price: env.STRIPE_PRICE_ID || "price_1UWEb0Rynl9tIFFYF2cvZ3RB",
        quantity: 1
      }
    ],
    payment_method_collection: "always"
  };

  if (user) {
    sessionParams.customer_email = user.email;
    sessionParams.client_reference_id = user.uid;
    sessionParams.metadata = { uid: user.uid };
    sessionParams.subscription_data = {
      metadata: { uid: user.uid }
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (user) {
    try {
      const serviceAccount = getServiceAccount(env);
      await updateUserDocument(serviceAccount, user.uid, {
        subscription: {
          id: session.id,
          provider: 'stripe',
          status: 'pending',
          updatedAt: new Date().toISOString()
        }
      });
    } catch (dbErr) {
      console.warn('[Stripe] Falha ao persistir sessão pendente no Firestore:', dbErr.message);
    }
  }

  return { client_secret: session.client_secret, sessionId: session.id };
}

/**
 * Create Stripe Embedded Checkout Session for Extra Deck Generation
 */
export async function createExtraGenerationPayment({ env, user, isPro, returnUrl }) {
  const stripe = getStripeClient(env);
  const mode = "payment";

  function resolveStripeLineItem(targetId, isProUser) {
    const unitAmount = isProUser ? 99 : 149;
    const cleanId = (targetId && typeof targetId === 'string') ? targetId.trim() : '';

    if (cleanId.startsWith('price_') || cleanId.startsWith('plan_')) {
      return { price: cleanId, quantity: 1 };
    }

    if (cleanId.startsWith('prod_')) {
      return {
        price_data: {
          currency: 'brl',
          unit_amount: unitAmount,
          product: cleanId
        },
        quantity: 1
      };
    }

    return {
      price_data: {
        currency: 'brl',
        unit_amount: unitAmount,
        product_data: {
          name: isProUser ? 'Geração Extra de Baralho Pro (IA)' : 'Geração de Baralho com IA (Avulsa)',
          description: isProUser
            ? '1 geração adicional de baralho com IA para assinante Pro'
            : '1 geração avulsa de baralho com IA de alta precisão (Gemini Flash Thinking)'
        }
      },
      quantity: 1
    };
  }

  const proId = env.STRIPE_EXTRA_PRICE_ID_PRO || env.STRIPE_EXTRA_PRICE_ID || "prod_VXJEx9xIR4hKWR";
  const nonProId = env.STRIPE_EXTRA_PRICE_ID_NON_PRO || env.STRIPE_PRICE_NON_PRO || "prod_VYSOFAreE9zDHt";
  const lineItem = resolveStripeLineItem(isPro ? proId : nonProId, isPro);

  const sessionParams = {
    mode,
    ui_mode: "form",
    line_items: [lineItem],
    billing_address_collection: "auto",
    submit_type: "auto",
    integration_identifier: "custom_embedded_web_0002",
    return_url: returnUrl,
  };

  if (user) {
    sessionParams.customer_email = user.email;
    sessionParams.client_reference_id = user.uid;
    sessionParams.metadata = { uid: user.uid, type: "extra_deck" };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { client_secret: session.client_secret, sessionId: session.id };
}

/**
 * Check if customer has an active subscription in Stripe by email
 */
export async function checkCustomerProStatusInStripe({ env, email }) {
  if (!email || !env.STRIPE_SECRET_KEY) return { isPro: false };
  try {
    const stripe = getStripeClient(env);
    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
    if (customers.data.length > 0) {
      const customerId = customers.data[0].id;
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 1
      });
      if (subs.data.length > 0) {
        const sub = subs.data[0];
        return {
          isPro: true,
          customerId,
          subscriptionId: sub.id,
          status: sub.status
        };
      }
    }
  } catch (err) {
    console.warn('[Stripe] Falha ao verificar status por email:', err.message);
  }
  return { isPro: false };
}

/**
 * Retrieve details of a Stripe Subscription
 */
export async function getSubscriptionDetails({ env, subscriptionId, userDoc }) {
  if (!subscriptionId || !env.STRIPE_SECRET_KEY) return null;
  const stripe = getStripeClient(env);
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const isCanceling = Boolean(sub.cancel_at_period_end || userDoc?.subscription?.cancelAtPeriodEnd);
  const activeUntil = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10) : null;
  return {
    isPro: sub.status === 'active' || sub.status === 'trialing',
    isLifetime: false,
    status: sub.status.toUpperCase(),
    cancelAtPeriodEnd: isCanceling,
    activeUntil: activeUntil || userDoc?.subscription?.cancelAt || null,
    nextDueDate: activeUntil,
    provider: 'stripe',
    storedStatus: userDoc?.subscription?.status || 'inactive'
  };
}

/**
 * Cancel a Stripe Subscription (at period end by default, or immediate)
 */
export async function cancelSubscription({ env, subscriptionId, immediate = false }) {
  if (!subscriptionId || !env.STRIPE_SECRET_KEY) return null;
  const stripe = getStripeClient(env);
  if (immediate) {
    return await stripe.subscriptions.cancel(subscriptionId);
  }
  return await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/**
 * Reactivate a Stripe Subscription that was scheduled to cancel
 */
export async function reactivateSubscription({ env, subscriptionId }) {
  if (!subscriptionId || !env.STRIPE_SECRET_KEY) return null;
  const stripe = getStripeClient(env);
  return await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
}
