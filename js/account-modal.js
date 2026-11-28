// SPDX-License-Identifier: GPL-2.0-only
/**
 * account-modal.js
 * Modal de Gerenciamento de Conta, Assinatura e Pagamentos (Material Design 3 Expressive)
 */

import { auth, signInWithGoogle, signOutUser, onAuthChange } from './firebase-client.js';
import { isLifetime, isUserPro, openProModal, refreshUserProStatus, getUserProStatus, getCambluTierLabel } from './explore-modal.js';
import { getSubscriptionDetails, cancelSubscriptionOnly, reactivateSubscription, deleteAccountAndCancelSubscription } from './backend-api.js';
import { escapeHtml, sanitizeImageUrl, openModalWithMotion, closeModalWithMotion, buildGoogleProChipHtml, buildGoogleProfileAvatarHtml, getAssetUrl } from './utils.js';
import { t, applyTranslations, getCurrentLanguage } from './i18n.js';
import { appAlert, appConfirm, appPrompt } from './dialogs.js';

let accountModalInitialized = false;
let subDetailsCache = null;
let isLoadingSubDetails = false;

/**
 * Injeta o HTML base do modal de conta se ainda não existir no DOM
 */
function injectAccountModalHtml() {
  if (document.getElementById('account-subscription-modal')) return;

  const modalEl = document.createElement('div');
  modalEl.id = 'account-subscription-modal';
  modalEl.className = 'hidden fixed inset-0 modal-overlay z-[120] items-center justify-center p-3 sm:p-4 bg-black/60';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'account-modal-title');

  modalEl.innerHTML = `
    <div class="m3-dialog-card google-profile-sheet w-full max-w-[420px] overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Top Bar (Google Account Switcher Style) -->
      <div class="px-5 pt-3.5 pb-1.5 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-rounded text-lg text-[#444746]">manage_accounts</span>
          <h3 id="account-modal-title" class="font-medium text-[13px] text-[#444746] truncate" data-i18n="account_subscription_title">Minha Conta & Assinatura</h3>
        </div>
        <button id="close-account-modal-btn" type="button" class="w-9 h-9 rounded-full hover:bg-black/5 active:bg-black/10 text-[#444746] flex items-center justify-center transition cursor-pointer flex-shrink-0" aria-label="Fechar" data-i18n-aria-label="close">
          <span class="material-symbols-rounded text-xl">close</span>
        </button>
      </div>

      <!-- Content Body -->
      <div id="account-modal-body" class="px-4 pb-4 pt-1 overflow-y-auto custom-scrollbar space-y-2.5">
        <!-- Renderizado dinamicamente via renderAccountModalContent() -->
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  applyTranslations(modalEl);

  // Close handlers (backdrop, button & Escape key — L216)
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeAccountModal();
  });
  document.getElementById('close-account-modal-btn')?.addEventListener('click', closeAccountModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.classList.contains('hidden')) {
      closeAccountModal();
    }
  });
}

/**
 * Renderiza o conteúdo do modal de acordo com o status do usuário
 */
async function renderAccountModalContent() {
  const container = document.getElementById('account-modal-body');
  if (!container) return;

  const user = auth.currentUser;

  // ESTADO 1: Usuário NÃO autenticado
  if (!user) {
    const googleLogoSrc = getAssetUrl('assets/img/google_g_logo.svg');

    container.innerHTML = `
      <div class="google-profile-card p-6 text-center space-y-4">
        <div class="w-16 h-16 rounded-full bg-[#f0f4f9] text-[#3b82f7] flex items-center justify-center mx-auto border border-[#dce3ee]">
          <span class="material-symbols-rounded text-4xl">account_circle</span>
        </div>
        <div>
          <h4 class="font-medium text-base text-[#1f1f1f]" data-i18n="connect_google_title">${t('connect_google_title')}</h4>
          <p class="text-xs text-[#444746] mt-1.5 max-w-xs mx-auto leading-relaxed" data-i18n="connect_google_desc">
            ${t('connect_google_desc')}
          </p>
        </div>

        <button id="account-login-google-btn" type="button"
          class="m3-btn-expressive m3-btn-filled w-full py-3 px-4 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-sm cursor-pointer transition">
          <img src="${googleLogoSrc}" alt="Google" class="w-4 h-4 flex-shrink-0 brightness-0 invert" style="filter: brightness(0) invert(1);">
          <span>${t('sign_in_with_google')}</span>
        </button>
      </div>
    `;

    document.getElementById('account-login-google-btn')?.addEventListener('click', async () => {
      try {
        const loggedUser = await signInWithGoogle();
        if (loggedUser) {
          subDetailsCache = null;
          await refreshUserProStatus(loggedUser);
          renderAccountModalContent();
        }
      } catch (err) {
        console.error('Falha no login:', err);
      }
    });
    return;
  }

  // ESTADO 2: Usuário autenticado
  const photo = sanitizeImageUrl(user.photoURL || '');
  const name = escapeHtml(user.displayName || user.email.split('@')[0]);
  const email = escapeHtml(user.email || '');
  const userStatus = getUserProStatus(user);
  const lifetime = isLifetime(user);
  const pro = isUserPro(user, userStatus);
  const isCambluPro = Boolean(pro && !lifetime && userStatus?.subscription?.provider === 'camblu_clube');
  const cambluTierSlug = String(userStatus?.cambluClube?.tier || userStatus?.subscription?.tier || 'raro').toLowerCase();
  const cambluTierCode = Number(userStatus?.cambluClube?.tierCode ?? userStatus?.subscription?.tierCode ?? 0);
  const cambluTierLabel = escapeHtml(getCambluTierLabel(cambluTierSlug));

  let planBadge = '';
  if (lifetime) {
    planBadge = buildGoogleProChipHtml({ label: t('pro_lifetime_badge') });
  } else if (isCambluPro) {
    planBadge = buildGoogleProChipHtml({ label: t('camblu_clube_badge', { tier: cambluTierLabel.toUpperCase() }) });
  } else if (pro) {
    planBadge = buildGoogleProChipHtml({ label: 'Pro' });
  } else {
    planBadge = `<span class="inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#f0f4f9] text-[#444746] border border-[#dce3ee]">
      ${t('free_plan_badge')}
    </span>`;
  }

  // Bloco do Perfil (Google Account Hero Card)
  const avatarHtml = buildGoogleProfileAvatarHtml({
    photoUrl: photo,
    displayName: name,
    isPro: pro,
    sizeClass: 'w-16 h-16',
    fallbackIconClass: 'text-[56px]'
  });

  let html = `
    <!-- Perfil do Usuário -->
    <div class="google-profile-card p-4 flex items-center gap-4">
      ${avatarHtml}
      <div class="flex-1 min-w-0">
        <p class="font-medium text-[17px] text-[#1f1f1f] truncate leading-snug">${name}</p>
        <p class="text-[13px] text-[#444746] truncate mt-0.5">${email}</p>
        <div class="mt-2 flex items-center gap-1.5 flex-wrap">
          ${planBadge}
        </div>
      </div>
    </div>
  `;

  // Bloco da Assinatura
  if (lifetime) {
    // 2.1 ${t('pro_lifetime_badge')}
    html += `
      <div class="google-profile-group">
        <div class="google-profile-row p-4 space-y-1.5">
          <div class="flex items-center gap-2.5 text-[#1f1f1f] font-medium text-sm">
            <span class="material-symbols-rounded text-xl text-[#0b57d0]">verified</span>
            <span>${t('lifetime_access_guaranteed')}</span>
          </div>
          <p class="text-xs text-[#444746] leading-relaxed pl-7">
            ${t('lifetime_access_desc')}
          </p>
        </div>
      </div>
    `;
  } else if (isCambluPro) {
    // 2.2 CLUBE CAMBLU PRO (Raro=2, Épico=3, Lendário=4)
    const monthlyLimit = Math.max(1, Number(userStatus?.monthlyIncluded || userStatus?.subscription?.monthlyIncluded || 2));
    const monthlyUsed = Math.max(0, Number(userStatus?.monthlyGenerationsUsed || 0));
    const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);
    const extraGens = Math.max(0, Number(userStatus?.extraGenerations || 0));
    const quotaPct = Math.min(100, Math.round((monthlyUsed / monthlyLimit) * 100));
    const rawValidUntil = userStatus?.cambluClube?.validUntil || userStatus?.subscription?.validUntil || null;
    const locale = getCurrentLanguage() === 'en-US' ? 'en-US' : 'pt-BR';
    const validUntilFormatted = rawValidUntil ? new Date(rawValidUntil).toLocaleDateString(locale) : null;

    const iconColorClass = cambluTierCode >= 4
      ? 'text-amber-600'
      : (cambluTierCode === 3 ? 'text-purple-600' : 'text-[#0b57d0]');
    const pillClass = cambluTierCode >= 4
      ? 'text-amber-800 bg-amber-50 border-amber-200'
      : (cambluTierCode === 3 ? 'text-purple-800 bg-purple-50 border-purple-200' : 'text-[#0b57d0] bg-[#e8f0fe] border-[#c2e7ff]');
    const barColorClass = cambluTierCode >= 4
      ? 'bg-amber-500'
      : (cambluTierCode === 3 ? 'bg-purple-600' : 'bg-[#3b82f7]');

    html += `
      <div class="google-profile-group">
        <!-- Resumo do Plano & Cota -->
        <div class="google-profile-row p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 text-[#1f1f1f] font-medium text-sm min-w-0">
              <span class="material-symbols-rounded text-xl ${iconColorClass}">workspace_premium</span>
              <span class="truncate">${escapeHtml(t('camblu_clube_plan_title', { tier: cambluTierLabel }))}</span>
            </div>
            <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border flex-shrink-0 ${pillClass}">
              Spaiq + Gorit PRO
            </span>
          </div>

          <p class="text-xs text-[#444746] leading-relaxed">
            ${escapeHtml(t('camblu_clube_pro_desc', { tier: cambluTierLabel }))}
          </p>

          <!-- Monthly AI Quota Progress -->
          <div class="p-3 bg-[#f8fafd] rounded-2xl border border-[#e1e5ea] space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-medium text-[#1f1f1f]">
              <span>${escapeHtml(t('camblu_clube_quota_summary', { used: monthlyUsed, limit: monthlyLimit, remaining: monthlyRemaining }))}</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-[#e1e5ea] overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300 ${barColorClass}" style="width: ${quotaPct}%"></div>
            </div>
            ${extraGens > 0 ? `
              <p class="text-[11px] text-amber-800 font-medium flex items-center gap-1 pt-0.5">
                <span class="material-symbols-rounded text-sm text-amber-700">stars</span>
                <span>${t('extra_gens_available', { count: extraGens })}</span>
              </p>
            ` : ''}
          </div>
        </div>

        <!-- Benefícios e Validade -->
        <div class="google-profile-row px-4 py-3 space-y-2 text-xs text-[#444746]">
          ${validUntilFormatted ? `
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-rounded text-base ${iconColorClass}">event_available</span>
              <span>${escapeHtml(t('camblu_clube_valid_until', { date: validUntilFormatted }))}</span>
            </div>
          ` : ''}
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-rounded text-base ${iconColorClass}">bolt</span>
            <span>${t('pro_unlimited_tutor_generations')}</span>
          </div>
          <div class="flex items-center gap-2.5">
            <span class="material-symbols-rounded text-base ${iconColorClass}">checklist_rtl</span>
            <span><a href="https://gorit.camblu.org" target="_blank" rel="noopener noreferrer" class="underline font-medium text-[#0b57d0] hover:text-[#3b82f7] inline-flex items-center gap-1">${t('pro_active_gorit_perk')} <span class="material-symbols-rounded text-xs">open_in_new</span></a></span>
          </div>
        </div>

        <!-- Ações -->
        <button type="button" id="account-buy-extra-deck-btn"
          class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-medium text-[#1f1f1f] cursor-pointer">
          <span class="flex items-center gap-3 min-w-0">
            <span class="material-symbols-rounded text-xl text-amber-600 flex-shrink-0">add_circle</span>
            <span class="truncate">${t('buy_extra_deck_btn')}</span>
          </span>
          <span class="material-symbols-rounded text-lg text-[#444746] flex-shrink-0">chevron_right</span>
        </button>

        <a href="https://camblu.web.app/clube" target="_blank" rel="noopener noreferrer"
          class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-medium text-[#1f1f1f] cursor-pointer">
          <span class="flex items-center gap-3 min-w-0">
            <span class="material-symbols-rounded text-xl text-[#0b57d0] flex-shrink-0">card_membership</span>
            <span class="truncate">${t('camblu_clube_manage_btn')}</span>
          </span>
          <span class="material-symbols-rounded text-lg text-[#444746] flex-shrink-0">open_in_new</span>
        </a>
      </div>
    `;
  } else if (pro) {
    // 2.2 PRO MENSAL (Ativo via Stripe)
    const isCanceling = Boolean(
      subDetailsCache?.cancelAtPeriodEnd || 
      subDetailsCache?.cancel_at_period_end
    );

    const locale = getCurrentLanguage() === 'en-US' ? 'en-US' : 'pt-BR';
    const rawActiveDate = subDetailsCache?.activeUntil || subDetailsCache?.nextDueDate;
    const activeUntilDateFormatted = rawActiveDate 
      ? new Date(rawActiveDate + (rawActiveDate.includes('T') ? '' : 'T12:00:00Z')).toLocaleDateString(locale) 
      : t('monthly_label');

    const monthlyLimit = Math.max(1, Number(userStatus?.monthlyIncluded || userStatus?.subscription?.monthlyIncluded || 4));
    const monthlyUsed = Math.max(0, Number(userStatus?.monthlyGenerationsUsed || 0));
    const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);
    const extraGens = Math.max(0, Number(userStatus?.extraGenerations || 0));
    const quotaPct = Math.min(100, Math.round((monthlyUsed / monthlyLimit) * 100));

    const invoiceUrl = escapeHtml(sanitizeImageUrl(subDetailsCache?.invoiceUrl || ''));

    html += `
      <div class="google-profile-group">
        <!-- Plano & Cota Mensal -->
        <div class="google-profile-row p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 text-[#1f1f1f] font-medium text-sm min-w-0">
              <span class="material-symbols-rounded text-xl text-[#0b57d0]">workspace_premium</span>
              <span class="truncate">${t('flashcards_pro_monthly')}</span>
            </div>
            <span class="text-xs font-semibold text-[#0b57d0] bg-[#e8f0fe] px-2.5 py-0.5 rounded-full border border-[#c2e7ff] flex-shrink-0">
              ${t('price_per_month')}
            </span>
          </div>

          <!-- Monthly AI Quota Progress for Stripe Monthly Pro (L218) -->
          <div class="p-3 bg-[#f8fafd] rounded-2xl border border-[#e1e5ea] space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-medium text-[#1f1f1f]">
              <span>${escapeHtml(t('camblu_clube_quota_summary', { used: monthlyUsed, limit: monthlyLimit, remaining: monthlyRemaining }))}</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-[#e1e5ea] overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300 bg-[#3b82f7]" style="width: ${quotaPct}%"></div>
            </div>
            ${extraGens > 0 ? `
              <p class="text-[11px] text-amber-800 font-medium flex items-center gap-1 pt-0.5">
                <span class="material-symbols-rounded text-sm text-amber-700">stars</span>
                <span>${t('extra_gens_available', { count: extraGens })}</span>
              </p>
            ` : ''}
          </div>
        </div>

        <!-- Status da Renovação & Benefícios -->
        <div class="google-profile-row px-4 py-3 space-y-2 text-xs text-[#444746]">
          ${isCanceling ? `
            <div class="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-amber-700 flex-shrink-0">info</span>
              <span>${t('active_until_label')} <strong>${activeUntilDateFormatted}</strong></span>
            </div>
          ` : `
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-rounded text-base text-[#0b57d0]">calendar_month</span>
              <span>${t('next_renewal_label')}: <strong class="text-[#1f1f1f]">${activeUntilDateFormatted}</strong></span>
            </div>
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-rounded text-base text-[#0b57d0]">bolt</span>
              <span>${t('pro_unlimited_tutor_generations')}</span>
            </div>
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-rounded text-base text-[#0b57d0]">checklist_rtl</span>
              <span><a href="https://gorit.camblu.org" target="_blank" rel="noopener noreferrer" class="underline font-medium text-[#0b57d0] hover:text-[#3b82f7] inline-flex items-center gap-1">${t('pro_active_gorit_perk')} <span class="material-symbols-rounded text-xs">open_in_new</span></a></span>
            </div>
            ${userStatus?.cambluClube?.eligible ? `
              <div class="flex items-center gap-2.5 text-[#0b57d0] font-medium">
                <span class="material-symbols-rounded text-base text-[#3b82f7]">card_membership</span>
                <span>${escapeHtml(t('camblu_clube_boost_note', { tier: cambluTierLabel, limit: Number(userStatus?.monthlyIncluded || 4) }))}</span>
              </div>
            ` : ''}
          `}
        </div>

        <!-- Fatura / Gerenciar Stripe -->
        ${invoiceUrl ? `
          <a href="${invoiceUrl}" target="_blank" rel="noopener noreferrer"
            class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-medium text-[#1f1f1f] cursor-pointer">
            <span class="flex items-center gap-3 min-w-0">
              <span class="material-symbols-rounded text-xl text-[#444746] flex-shrink-0">credit_card</span>
              <span class="truncate">${t('view_invoice_or_manage_stripe')}</span>
            </span>
            <span class="material-symbols-rounded text-lg text-[#444746] flex-shrink-0">open_in_new</span>
          </a>
        ` : `
          <div id="account-loading-details" class="google-profile-row px-4 py-2.5 text-[11px] text-[#444746] font-medium text-center">
            ${isLoadingSubDetails ? t('loading_payment_options') : (isCanceling ? t('cancellation_scheduled') : t('renewals_active'))}
          </div>
        `}

        <!-- Botão Comprar Baralho Extra -->
        <button type="button" id="account-buy-extra-deck-btn"
          class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-medium text-[#1f1f1f] cursor-pointer">
          <span class="flex items-center gap-3 min-w-0">
            <span class="material-symbols-rounded text-xl text-amber-600 flex-shrink-0">add_circle</span>
            <span class="truncate">${t('buy_extra_deck_btn')}</span>
          </span>
          <span class="material-symbols-rounded text-lg text-[#444746] flex-shrink-0">chevron_right</span>
        </button>

        ${isCanceling ? `
          <button type="button" id="account-resubscribe-btn"
            class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-semibold text-[#0b57d0] cursor-pointer">
            <span class="flex items-center gap-3 min-w-0">
              <span class="material-symbols-rounded text-xl text-[#0b57d0] flex-shrink-0">restart_alt</span>
              <span class="truncate">${t('resubscribe_btn')}</span>
            </span>
            <span class="material-symbols-rounded text-lg text-[#0b57d0] flex-shrink-0">chevron_right</span>
          </button>
        ` : `
          <button type="button" id="account-cancel-sub-btn"
            class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-medium text-red-600 hover:text-red-700 cursor-pointer">
            <span class="flex items-center gap-3 min-w-0">
              <span class="material-symbols-rounded text-xl flex-shrink-0">block</span>
              <span class="truncate">${t('cancel_sub_btn')}</span>
            </span>
          </button>
        `}
      </div>
    `;
  } else {
    // 2.3 USUÁRIO ${t('free_plan_badge')}
    const extraGens = Number(userStatus?.extraGenerations || 0);
    const isCambluComum = Boolean(userStatus?.cambluClube?.active && Number(userStatus?.cambluClube?.tierCode) === 1);

    html += `
      <div class="google-profile-group">
        <!-- Plano Atual & Benefícios -->
        <div class="google-profile-row p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider text-[#444746]">${t('current_plan_free')}</span>
            <span class="text-xs font-semibold text-[#0b57d0]">R$ 0,00</span>
          </div>

          ${extraGens > 0 ? `
            <div class="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-950 font-medium">
              <span class="material-symbols-rounded text-base text-amber-700">stars</span>
              <span>${t('extra_gens_available', { count: extraGens })}</span>
            </div>
          ` : ''}

          <div class="p-3 bg-[#f8fafd] border border-[#e1e5ea] rounded-2xl space-y-2">
            <p class="text-xs font-semibold text-[#1f1f1f] flex items-center gap-1.5">
              <span class="material-symbols-rounded text-base text-[#0b57d0]">workspace_premium</span>
              ${t('pro_plan_perks_title')}
            </p>
            <ul class="text-[11px] text-[#444746] space-y-1 pl-0.5">
              <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_generate')}</li>
              <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_tutor')}</li>
              <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_synonyms')}</li>
              <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_cloud')}</li>
              <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_gorit')}</li>
            </ul>
          </div>
        </div>

        <!-- Camblu Clube Hint -->
        <div class="google-profile-row px-4 py-3 flex items-start gap-2.5 text-[11px] text-[#444746]">
          <span class="material-symbols-rounded text-base text-[#3b82f7] flex-shrink-0 mt-0.5">card_membership</span>
          <div class="space-y-0.5">
            <p class="font-medium text-[#1f1f1f] leading-snug">${isCambluComum ? t('camblu_clube_comum_detected') : t('camblu_clube_pro_perk_hint')}</p>
            <p class="text-[10px] text-[#444746]">${t('camblu_clube_tiers_quota_info')}</p>
          </div>
        </div>

        <!-- Upgrade Pro -->
        <button type="button" id="account-upgrade-pro-btn"
          class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-semibold text-[#0b57d0] cursor-pointer">
          <span class="flex items-center gap-3 min-w-0">
            <span class="material-symbols-rounded text-xl text-[#0b57d0] flex-shrink-0">auto_awesome</span>
            <span class="truncate">${t('subscribe_flashcards_pro_btn')}</span>
          </span>
          <span class="material-symbols-rounded text-lg text-[#0b57d0] flex-shrink-0">chevron_right</span>
        </button>

        <!-- Comprar Geração Avulsa via Stripe -->
        <button type="button" id="account-buy-single-deck-btn"
          class="google-profile-row w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-[13px] font-medium text-[#1f1f1f] cursor-pointer">
          <span class="flex items-center gap-3 min-w-0">
            <span class="material-symbols-rounded text-xl text-amber-600 flex-shrink-0">add_circle</span>
            <span class="truncate">${t('buy_single_deck_btn')}</span>
          </span>
          <span class="material-symbols-rounded text-lg text-[#444746] flex-shrink-0">chevron_right</span>
        </button>
      </div>
    `;
  }

  // Rodapé com ações de conta (Sair e Excluir) — Google Split Pill Group
  html += `
    <div class="google-profile-split-group">
      <button type="button" id="account-logout-btn"
        class="google-profile-row px-3.5 py-3 text-xs font-medium text-[#1f1f1f] hover:text-red-600 cursor-pointer flex items-center justify-center gap-2">
        <span class="material-symbols-rounded text-lg text-[#444746]">logout</span>
        <span class="truncate">${t('logout_account')}</span>
      </button>

      <button type="button" id="account-delete-account-btn"
        class="google-profile-row px-3.5 py-3 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer flex items-center justify-center gap-2"
        title="${t('delete_account_tooltip')}">
        <span class="material-symbols-rounded text-lg">delete_forever</span>
        <span class="truncate">${t('delete_account_link')}</span>
      </button>
    </div>
  `;

  container.innerHTML = html;

  // Listeners
  document.getElementById('account-upgrade-pro-btn')?.addEventListener('click', () => {
    closeAccountModal();
    openProModal();
  });

  document.getElementById('account-buy-single-deck-btn')?.addEventListener('click', () => {
    closeAccountModal();
    if (typeof window.flashcardsOpenExtraDeckModal === 'function') {
      window.flashcardsOpenExtraDeckModal();
    }
  });

  document.getElementById('account-logout-btn')?.addEventListener('click', async () => {
    try {
      await signOutUser();
      subDetailsCache = null;
      closeAccountModal();
      window.location.reload();
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  });

  // Comprar Baralho Extra
  document.getElementById('account-buy-extra-deck-btn')?.addEventListener('click', () => {
    closeAccountModal();
    if (typeof window.flashcardsOpenExtraDeckModal === 'function') {
      window.flashcardsOpenExtraDeckModal();
    }
  });

  // Cancelar Assinatura (mantém acesso até o fim do período já pago)
  document.getElementById('account-cancel-sub-btn')?.addEventListener('click', async () => {
    const confirmed = await appConfirm(t('confirm_cancel_sub_modal'), { variant: 'danger' });
    if (!confirmed) return;

    try {
      const btn = document.getElementById('account-cancel-sub-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-rounded text-base animate-spin">refresh</span> ${t('canceling_ellipsis')}`;
      }

      const res = await cancelSubscriptionOnly();
      subDetailsCache = {
        ...(subDetailsCache || {}),
        cancelAtPeriodEnd: true,
        activeUntil: res?.activeUntil || subDetailsCache?.nextDueDate
      };
      await appAlert(t('sub_canceled_success_modal'), { variant: 'success' });
      renderAccountModalContent();
    } catch (err) {
      await appAlert(t('error_canceling_sub', { error: err.message || "Tente novamente mais tarde" }), { variant: 'warning' });
      renderAccountModalContent();
    }
  });

  // Voltar a Assinar (Reativar assinatura antes de expirar)
  document.getElementById('account-resubscribe-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('account-resubscribe-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-rounded text-base animate-spin">refresh</span> ${t('reactivating_ellipsis')}`;
    }

    try {
      await reactivateSubscription();
      subDetailsCache = null;
      await refreshUserProStatus();
      await appAlert(t('sub_reactivated_success_modal'), { variant: 'success' });
      renderAccountModalContent();
    } catch (err) {
      console.warn("Reativação direta falhou, abrindo modal Pro:", err);
      closeAccountModal();
      openProModal();
    }
  });

  // Exclusão definitiva de conta
  document.getElementById('account-delete-account-btn')?.addEventListener('click', async () => {
    const confirmed = await appConfirm(t('confirm_delete_account_modal'), { variant: 'danger' });
    if (!confirmed) return;

    const check = await appPrompt(t('prompt_delete_confirm'), '', { variant: 'danger', icon: 'delete_forever', placeholder: 'EXCLUIR' });
    if (!check || (check.trim().toUpperCase() !== 'EXCLUIR' && check.trim().toUpperCase() !== 'DELETE')) {
      await appAlert(t('action_canceled_account_active'), { variant: 'info' });
      return;
    }

    try {
      await deleteAccountAndCancelSubscription();
      localStorage.removeItem('flashcards_deck_slots');
      localStorage.removeItem('flashcardsSave');
      localStorage.removeItem('flashcardsActiveMode');
      await signOutUser();
      closeAccountModal();
      await appAlert(t('account_deleted_success'), { variant: 'success' });
      window.location.reload();
    } catch (err) {
      await appAlert(t('error_deleting_account', { error: err.message || "Erro inesperado" }), { variant: 'warning' });
    }
  });

  // Busca detalhes da assinatura em segundo plano se ainda não cacheados (apenas Stripe)
  if (pro && !lifetime && !isCambluPro && !subDetailsCache && !isLoadingSubDetails) {
    isLoadingSubDetails = true;
    getSubscriptionDetails().then(details => {
      subDetailsCache = details;
      isLoadingSubDetails = false;
      renderAccountModalContent();
    }).catch(e => {
      console.warn("Falha ao carregar detalhes de assinatura do Stripe:", e);
      isLoadingSubDetails = false;
    });
  }
}

/**
 * Inicializa o modal de conta
 */
export function initAccountModal() {
  if (accountModalInitialized) return;
  accountModalInitialized = true;
  injectAccountModalHtml();

  onAuthChange(() => {
    subDetailsCache = null;
    const modal = document.getElementById('account-subscription-modal');
    if (modal && !modal.classList.contains('hidden')) {
      renderAccountModalContent();
    }
  });

  window.addEventListener('flashcards:language-change', () => {
    const modal = document.getElementById('account-subscription-modal');
    if (modal) {
      applyTranslations(modal);
      if (!modal.classList.contains('hidden')) {
        renderAccountModalContent();
      }
    }
  });
}

/**
 * Abre o modal de conta & assinatura
 */
export function openAccountModal() {
  initAccountModal();
  renderAccountModalContent();
  const modal = document.getElementById('account-subscription-modal');
  if (modal) {
    openModalWithMotion(modal, { displayClass: 'flex' });
  }
  if (auth.currentUser) {
    refreshUserProStatus(auth.currentUser).then(() => {
      renderAccountModalContent();
    });
  }
}

/**
 * Fecha o modal de conta & assinatura
 */
export function closeAccountModal() {
  const modal = document.getElementById('account-subscription-modal');
  if (modal) {
    closeModalWithMotion(modal, { removeDisplayClass: 'flex' });
  }
}

// Expõe globalmente caso necessário
if (typeof window !== 'undefined') {
  window.flashcardsOpenAccountModal = openAccountModal;
}
