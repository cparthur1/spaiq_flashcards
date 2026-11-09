// SPDX-License-Identifier: GPL-2.0-only
/**
 * account-modal.js
 * Modal de Gerenciamento de Conta, Assinatura e Pagamentos (Material Design 3 Expressive)
 */

import { auth, signInWithGoogle, signOutUser, onAuthChange } from './firebase-client.js';
import { isLifetime, isUserPro, openProModal, refreshUserProStatus, getUserProStatus } from './explore-modal.js';
import { getSubscriptionDetails, cancelSubscriptionOnly, reactivateSubscription, deleteAccountAndCancelSubscription } from './backend-api.js';
import { escapeHtml, sanitizeImageUrl } from './utils.js';
import { t, applyTranslations } from './i18n.js';

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
    <div class="m3-dialog-card w-full max-w-md bg-[var(--md-sys-color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden flex flex-col max-h-[90vh] animate-fadeIn">
      <!-- Header -->
      <div class="px-5 sm:px-6 py-4 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] flex justify-between items-center flex-shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-100 text-[var(--md-sys-color-primary)] flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-rounded text-xl">manage_accounts</span>
          </div>
          <div>
            <h3 id="account-modal-title" class="font-bold text-base sm:text-lg text-[var(--md-sys-color-on-surface)] leading-tight" data-i18n="account_subscription_title">Minha Conta & Assinatura</h3>
            <p class="text-[11px] text-[var(--md-sys-color-on-surface-variant)]" data-i18n="account_subscription_subtitle">Gerencie seu perfil, plano e pagamentos</p>
          </div>
        </div>
        <button id="close-account-modal-btn" type="button" class="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition cursor-pointer" aria-label="Fechar" data-i18n-aria-label="close">
          <span class="material-symbols-rounded text-xl">close</span>
        </button>
      </div>

      <!-- Content Body -->
      <div id="account-modal-body" class="p-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-5">
        <!-- Renderizado dinamicamente via renderAccountModalContent() -->
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  applyTranslations(modalEl);

  // Close handlers
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeAccountModal();
  });
  document.getElementById('close-account-modal-btn')?.addEventListener('click', closeAccountModal);
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
    const isSubpage = typeof window !== 'undefined' && window.location.pathname.includes('/pages/');
    const googleLogoSrc = isSubpage ? '../assets/img/google_g_logo.svg' : 'assets/img/google_g_logo.svg';

    container.innerHTML = `
      <div class="text-center py-4 space-y-4">
        <div class="w-16 h-16 rounded-3xl bg-blue-50 text-[var(--md-sys-color-primary)] flex items-center justify-center mx-auto border border-blue-100 shadow-sm">
          <span class="material-symbols-rounded text-3xl">account_circle</span>
        </div>
        <div>
          <h4 class="font-bold text-base text-[var(--md-sys-color-on-surface)]" data-i18n="connect_google_title">${t('connect_google_title')}</h4>
          <p class="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 max-w-xs mx-auto" data-i18n="connect_google_desc">
            ${t('connect_google_desc')}
          </p>
        </div>

        <button id="account-login-google-btn" type="button"
          class="m3-btn-expressive m3-btn-filled w-full py-3 px-4 font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow cursor-pointer transition">
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
  const lifetime = isLifetime(user);
  const pro = isUserPro(user);

  let planBadge = '';
  if (lifetime) {
    planBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
      <span class="material-symbols-rounded text-xs">star</span> ${t('pro_lifetime_badge')}
    </span>`;
  } else if (pro) {
    planBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
      <span class="material-symbols-rounded text-xs">verified</span> ${t('pro_active_badge')}
    </span>`;
  } else {
    planBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
      ${t('free_plan_badge')}
    </span>`;
  }

  // Bloco do Perfil
  let html = `
    <!-- Perfil do Usuário -->
    <div class="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
      <div class="relative flex-shrink-0">
        ${photo ? `<img src="${photo}" referrerpolicy="no-referrer" class="w-12 h-12 rounded-full object-cover border-2 border-blue-400" alt="Avatar">`
                : `<span class="material-symbols-rounded text-5xl text-blue-600">account_circle</span>`}
        ${pro ? `<span class="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 text-[10px]" title="${t('pro_subscriber_title')}"><span class="material-symbols-rounded text-xs block">star</span></span>` : ''}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-bold text-sm text-[var(--md-sys-color-on-surface)] truncate">${name}</p>
          ${planBadge}
        </div>
        <p class="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">${email}</p>
      </div>
    </div>
  `;

  // Bloco da Assinatura
  if (lifetime) {
    // 2.1 ${t('pro_lifetime_badge')}
    html += `
      <div class="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
        <div class="flex items-center gap-2 text-amber-900 font-bold text-xs sm:text-sm">
          <span class="material-symbols-rounded text-lg text-amber-600">verified</span>
          <span>${t('lifetime_access_guaranteed')}</span>
        </div>
        <p class="text-xs text-amber-800/90 leading-relaxed">
          ${t('lifetime_access_desc')}
        </p>
      </div>
    `;
  } else if (pro) {
    // 2.2 PRO MENSAL (Ativo via Stripe)
    const isCanceling = Boolean(
      subDetailsCache?.cancelAtPeriodEnd || 
      subDetailsCache?.cancel_at_period_end
    );

    const rawActiveDate = subDetailsCache?.activeUntil || subDetailsCache?.nextDueDate;
    const activeUntilDateFormatted = rawActiveDate 
      ? new Date(rawActiveDate + (rawActiveDate.includes('T') ? '' : 'T12:00:00Z')).toLocaleDateString('pt-BR') 
      : 'Mensal';

    const invoiceUrl = escapeHtml(sanitizeImageUrl(subDetailsCache?.invoiceUrl || ''));

    html += `
      <div class="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-blue-950 font-bold text-xs sm:text-sm">
            <span class="material-symbols-rounded text-lg text-blue-600">workspace_premium</span>
            <span>${t('flashcards_pro_monthly')}</span>
          </div>
          <span class="text-xs font-black text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full border border-blue-300">
            ${t('price_per_month')}
          </span>
        </div>

        ${isCanceling ? `
          <!-- Disclaimer de Cancelamento: Assinatura ativa até o dia X -->
          <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex items-center gap-2">
            <span class="material-symbols-rounded text-base text-amber-700 flex-shrink-0">info</span>
            <span>${t('active_until_label')} <strong>${activeUntilDateFormatted}</strong></span>
          </div>
        ` : `
          <div class="space-y-1.5 text-xs text-blue-900/90 pt-1">
            <div class="flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-blue-600">calendar_month</span>
              <span>${t('next_renewal_label')}: <strong>${activeUntilDateFormatted}</strong></span>
            </div>
            <div class="flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-blue-600">bolt</span>
              <span>${t('pro_unlimited_tutor_generations')}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-blue-600">checklist_rtl</span>
              <span><a href="https://gorit.camblu.org" target="_blank" rel="noopener noreferrer" class="underline font-semibold hover:text-blue-700 inline-flex items-center gap-1">${t('pro_active_gorit_perk')} <span class="material-symbols-rounded text-xs">open_in_new</span></a></span>
            </div>
          </div>
        `}

        <!-- Ações do Stripe: Fatura / Gerenciar -->
        <div class="pt-2 border-t border-blue-200/80 space-y-2">
          ${invoiceUrl ? `
            <a href="${invoiceUrl}" target="_blank" rel="noopener noreferrer"
              class="m3-btn-expressive m3-btn-tonal w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 transition cursor-pointer shadow-xs">
              <span class="material-symbols-rounded text-base">credit_card</span>
              <span>${t('view_invoice_or_manage_stripe')}</span>
              <span class="material-symbols-rounded text-sm">open_in_new</span>
            </a>
          ` : `
            <div id="account-loading-details" class="text-[11px] text-blue-700 font-medium text-center">
              ${isLoadingSubDetails ? t('loading_payment_options') : (isCanceling ? t('cancellation_scheduled') : t('renewals_active'))}
            </div>
          `}

          <!-- Botão Comprar Baralho Extra -->
          <button type="button" id="account-buy-extra-deck-btn"
            class="m3-btn-expressive m3-btn-tonal w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer shadow-xs">
            <span class="material-symbols-rounded text-base text-amber-700">add_circle</span>
            <span>${t('buy_extra_deck_btn')}</span>
          </button>

          ${isCanceling ? `
            <!-- Botão Voltar a Assinar (substitui Cancelar Assinatura) -->
            <button type="button" id="account-resubscribe-btn"
              class="m3-btn-expressive m3-btn-filled w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer shadow-xs">
              <span class="material-symbols-rounded text-base">restart_alt</span>
              <span>${t('resubscribe_btn')}</span>
            </button>
          ` : `
            <!-- Botão Cancelar Assinatura -->
            <button type="button" id="account-cancel-sub-btn"
              class="w-full py-2 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer">
              <span class="material-symbols-rounded text-base">block</span>
              <span>${t('cancel_sub_btn')}</span>
            </button>
          `}
        </div>
      </div>
    `;
  } else {
    // 2.3 USUÁRIO ${t('free_plan_badge')}
    const userStatus = getUserProStatus();
    const extraGens = Number(userStatus?.extraGenerations || 0);

    html += `
      <div class="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">${t('current_plan_free')}</span>
          <span class="text-xs font-bold text-[var(--md-sys-color-primary)]">R$ 0,00</span>
        </div>

        ${extraGens > 0 ? `
          <div class="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-950 font-medium">
            <div class="flex items-center gap-2">
              <span class="material-symbols-rounded text-base text-amber-700">stars</span>
              <span>${t('extra_gens_available', { count: extraGens })}</span>
            </div>
          </div>
        ` : ''}

        <div class="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-2">
          <p class="text-xs font-bold text-blue-900 flex items-center gap-1.5">
            <span class="material-symbols-rounded text-base text-blue-600">workspace_premium</span>
            ${t('pro_plan_perks_title')}
          </p>
          <ul class="text-[11px] text-blue-950/90 space-y-1 pl-1">
            <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_generate')}</li>
            <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_tutor')}</li>
            <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_synonyms')}</li>
            <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_cloud')}</li>
            <li class="flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-green-600">check_circle</span> ${t('pro_perk_gorit')}</li>
          </ul>
        </div>

        <div class="space-y-2">
          <button type="button" id="account-upgrade-pro-btn"
            class="m3-btn-expressive m3-btn-filled w-full py-2.5 px-4 font-bold text-xs flex items-center justify-center gap-2 shadow cursor-pointer">
            <span class="material-symbols-rounded text-base">star</span>
            <span>${t('subscribe_flashcards_pro_btn')}</span>
          </button>

          <!-- Botão Comprar Geração Avulsa via Stripe -->
          <button type="button" id="account-buy-single-deck-btn"
            class="m3-btn-expressive m3-btn-tonal w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer shadow-xs">
            <span class="material-symbols-rounded text-base text-amber-700">add_circle</span>
            <span>${t('buy_single_deck_btn')}</span>
          </button>
        </div>
      </div>
    `;
  }

  // Rodapé com ações de conta (Sair e Excluir)
  html += `
    <div class="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-3">
      <button type="button" id="account-logout-btn"
        class="px-3 py-1.5 rounded-xl hover:bg-gray-100 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] hover:text-red-600 transition cursor-pointer flex items-center gap-1.5">
        <span class="material-symbols-rounded text-base">logout</span>
        <span>${t('logout_account')}</span>
      </button>

      <button type="button" id="account-delete-account-btn"
        class="text-[11px] text-gray-400 hover:text-red-600 transition underline cursor-pointer"
        title="${t('delete_account_tooltip')}">
        ${t('delete_account_link')}
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
    const confirmed = confirm(t('confirm_cancel_sub_modal'));
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
      const formattedDate = (res?.activeUntil || subDetailsCache?.nextDueDate)
        ? new Date((res?.activeUntil || subDetailsCache?.nextDueDate) + 'T12:00:00Z').toLocaleDateString('pt-BR')
        : '';
      alert(t('sub_canceled_success_modal'));
      renderAccountModalContent();
    } catch (err) {
      alert(t('error_canceling_sub', { error: err.message || "Tente novamente mais tarde" }));
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
      alert(t('sub_reactivated_success_modal'));
      renderAccountModalContent();
    } catch (err) {
      console.warn("Reativação direta falhou, abrindo modal Pro:", err);
      closeAccountModal();
      openProModal();
    }
  });

  // Exclusão definitiva de conta
  document.getElementById('account-delete-account-btn')?.addEventListener('click', async () => {
    const confirmed = confirm(t('confirm_delete_account_modal'));
    if (!confirmed) return;

    const check = prompt(t('prompt_delete_confirm'));
    if (!check || (check.trim().toUpperCase() !== 'EXCLUIR' && check.trim().toUpperCase() !== 'DELETE')) {
      alert(t('action_canceled_account_active'));
      return;
    }

    try {
      await deleteAccountAndCancelSubscription();
      localStorage.removeItem('flashcards_deck_slots');
      localStorage.removeItem('flashcardsSave');
      localStorage.removeItem('flashcardsActiveMode');
      await signOutUser();
      closeAccountModal();
      alert(t('account_deleted_success'));
      window.location.reload();
    } catch (err) {
      alert(t('error_deleting_account', { error: err.message || "Erro inesperado" }));
    }
  });

  // Busca detalhes da assinatura em segundo plano se ainda não cacheados
  if (pro && !lifetime && !subDetailsCache && !isLoadingSubDetails) {
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
}

/**
 * Abre o modal de conta & assinatura
 */
export function openAccountModal() {
  initAccountModal();
  renderAccountModalContent();
  const modal = document.getElementById('account-subscription-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
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
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Expõe globalmente caso necessário
if (typeof window !== 'undefined') {
  window.flashcardsOpenAccountModal = openAccountModal;
}
