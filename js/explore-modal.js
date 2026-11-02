// SPDX-License-Identifier: GPL-2.0-only
/**
 * explore-modal.js
 * Universal "Explorar arquivos" Modal (Material Design 3 Expressive)
 * Used across index.html and pages/game.html
 */

import { auth, signInWithGoogle, signOutUser, onAuthChange, getCurrentUserToken } from './firebase-client.js';
import {
  getLocalSlots,
  getNotebookSlotData,
  openDeckInSlots,
  deleteSlot,
  fixSlot,
  clearNotebookSlot,
  importNotebookBackupData,
  loadSlotsFromCloud
} from './slot-manager.js';
import { shareDeckToCloud } from './share-manager.js';
import { getUserStatus, createProSubscription, createCheckoutSession, buyExtraGeneration, deleteAccountAndCancelSubscription, verifyPaymentStatus, BACKEND_URL } from './backend-api.js';
import { triggerProUnlockCelebration } from './engine/pro-unlock-celebration.js';
import { ROUTES, shuffleArray, escapeHtml, sanitizeImageUrl } from './utils.js';
import { t, applyTranslations } from './i18n.js';

let modalInitialized = false;
let currentUser = null;
let userProStatus = null;

export const LIFETIME_PRO_EMAILS = [
  'arthur.paludo.c@gmail.com',
  'clarazanchett@gmail.com',
  'manuelapinhadias@gmail.com'
];

export function isLifetime(user) {
  if (!user || !user.email) return false;
  return LIFETIME_PRO_EMAILS.includes(user.email.toLowerCase().trim());
}

export function isUserPro(user = (currentUser || auth.currentUser), status = userProStatus) {
  if (!user) return false;
  if (isLifetime(user)) return true;
  // Crucial: ensure status actually belongs to this specific user UID!
  if (status && status.uid && status.uid !== user.uid) {
    return false;
  }
  return Boolean(status?.isPro || status?.subscription?.status === 'active');
}

/**
 * Returns current loaded user status
 */
export function getUserProStatus() {
  return userProStatus;
}

/**
 * Refreshes Pro status from backend for a specific user
 */
export async function refreshUserProStatus(user = (currentUser || auth.currentUser), forceTokenRefresh = false) {
  if (!user) {
    userProStatus = null;
    return null;
  }
  if (isLifetime(user)) {
    userProStatus = { uid: user.uid, isPro: true, isLifetimePro: true };
    return userProStatus;
  }
  if (forceTokenRefresh && typeof user.getIdToken === 'function') {
    await user.getIdToken(true).catch(() => {});
  }
  userProStatus = await getUserStatus().catch(() => null);
  if (userProStatus?.freeAiDeckUsed) {
    localStorage.setItem('spaiq_free_ai_deck_used', 'true');
  }
  return userProStatus;
}

/**
 * Initializes the Explore Files modal
 */
export function initExploreModal() {
  if (modalInitialized) return;
  modalInitialized = true;

  injectModalHtml();
  attachModalEventListeners();

  // Listen to cross-device sync updates
  window.addEventListener('flashcards:sync-updated', () => {
    renderDeckSlots();
    renderNotebookSlot();
  });

  // Listen to language changes
  window.addEventListener('flashcards:language-change', () => {
    const wrapper = document.getElementById('explore-modal-wrapper');
    if (wrapper) applyTranslations(wrapper);
    renderDeckSlots();
    renderNotebookSlot();
  });

  // Listen to Auth State
  let handlingSessionId = false;
  onAuthChange(async (user) => {
    const prevUid = currentUser?.uid;
    currentUser = user;

    const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
    const sessionId = urlParams ? urlParams.get('session_id') : null;

    if (user) {
      if (prevUid !== user.uid) {
        userProStatus = isLifetime(user) ? { uid: user.uid, isPro: true, isLifetimePro: true } : null;
      }

      if (sessionId && !handlingSessionId) {
        handlingSessionId = true;
        try {
          const verifyResult = await verifyPaymentStatus(sessionId);
          await refreshUserProStatus(user, true);
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('session_id');
          window.history.replaceState({}, document.title, cleanUrl.toString());

          if (verifyResult?.type === 'extra_deck') {
            alert(t('purchase_extra_deck_success'));
          } else {
            triggerProUnlockCelebration();
          }
        } catch (err) {
          console.warn('[Stripe Return] Erro ao verificar pagamento após retorno:', err);
        }
      }

      try {
        await refreshUserProStatus(user);
        if (isUserPro(user)) {
          await loadSlotsFromCloud();
        }
      } catch (e) {
        console.warn('Erro ao atualizar dados Pro do usuário:', e);
      }
    } else {
      userProStatus = null;
      if (sessionId) {
        alert(t('payment_identified_login_pro'));
        if (typeof window.flashcardsOpenAccountModal === 'function') {
          window.flashcardsOpenAccountModal();
        }
      }
    }
    renderModalContent();
  });
}

/**
 * Open the Explore Files modal
 */
export function openExploreModal() {
  initExploreModal();
  renderModalContent();
  const modal = document.getElementById('explore-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  if (isUserPro()) {
    loadSlotsFromCloud().then(hasChanges => {
      if (hasChanges) {
        renderModalContent();
      }
    }).catch(() => {});
  }
}

/**
 * Close the Explore Files modal
 */
export function closeExploreModal() {
  const modal = document.getElementById('explore-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

/**
 * Open Pro Subscription Dialog
 */
export function openProModal() {
  initExploreModal();
  renderProModalContent();
  const proModal = document.getElementById('pro-subscription-modal');
  if (proModal) {
    proModal.classList.remove('hidden');
    proModal.classList.add('flex');
  }
}

let paymentPollingInterval = null;

export function stopProPaymentPolling() {
  if (paymentPollingInterval) {
    clearInterval(paymentPollingInterval);
    paymentPollingInterval = null;
  }
}

export function closeProModal() {
  stopProPaymentPolling();
  const proModal = document.getElementById('pro-subscription-modal');
  if (proModal) {
    proModal.classList.add('hidden');
    proModal.classList.remove('flex');
  }
}

export function openExtraDeckModal() {
  initExploreModal();
  renderExtraDeckModalContent();
  const modal = document.getElementById('extra-deck-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closeExtraDeckModal() {
  const modal = document.getElementById('extra-deck-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Global expose for triggers across any page
if (typeof window !== 'undefined') {
  window.flashcardsOpenProModal = openProModal;
  window.flashcardsCloseProModal = closeProModal;
  window.flashcardsOpenExtraDeckModal = openExtraDeckModal;
  window.flashcardsCloseExtraDeckModal = closeExtraDeckModal;
}

/**
 * Injects modal HTML into DOM
 */
function injectModalHtml() {
  if (document.getElementById('explore-modal')) return;

  const container = document.createElement('div');
  container.id = 'explore-modal-wrapper';
  container.innerHTML = `
    <!-- EXPLORAR ARQUIVOS MODAL -->
    <div id="explore-modal" class="hidden fixed inset-0 modal-overlay z-[100] items-center justify-center p-3 sm:p-4 bg-black/50">
      <div class="m3-dialog-card w-full max-w-2xl bg-[var(--md-sys-color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden flex flex-col max-h-[92vh] animate-fadeIn">
        
        <!-- HEADER (Matches Mockup) -->
        <div class="p-4 sm:p-5 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] flex items-center justify-between">
          <div id="modal-auth-section" class="flex items-center gap-3 min-w-0">
            <!-- Injected dynamically: Google login or User profile -->
          </div>
          <button id="close-explore-modal-btn" class="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] transition-colors flex-shrink-0" title="Fechar">
            <span class="material-symbols-rounded text-xl">close</span>
          </button>
        </div>

        <!-- MODAL BODY -->
        <div class="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
          
          <!-- ROW 1: 3 LATEST DECKS -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]" data-i18n="recent_decks_slots">Baralhos Recentes (3 Slots)</span>
              <span class="text-[11px] text-[var(--md-sys-color-on-surface-variant)]" data-i18n="slot_overwritable_info">Slot aberto é sobrescritível</span>
            </div>
            <div id="deck-slots-grid" class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- ROW 2: NOTEBOOK (CADERNO) -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]" data-i18n="notebook_slot_label">Caderno</span>
              <span class="text-[11px] text-[var(--md-sys-color-on-surface-variant)]" data-i18n="permanent_slot_info">Slot permanente</span>
            </div>
            <div id="notebook-slot-container">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- EXTRA ACTIONS: UPLOAD & EXAM WEEK -->
          <div class="pt-2 border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap gap-2.5">
            <button id="modal-upload-btn" class="m3-btn-expressive m3-btn-tonal text-xs py-2.5 px-4 font-bold flex items-center gap-2">
              <span class="material-symbols-rounded text-lg">upload_file</span>
              <span data-i18n="load_json_file">Carregar Arquivo (.json)</span>
            </button>
            <input type="file" id="modal-hidden-file-input" accept=".json" class="hidden" />
            <input type="file" id="modal-hidden-notebook-file-input" accept=".json" class="hidden" />

            <button id="modal-exam-btn" class="m3-btn-expressive m3-btn-outlined text-xs py-2.5 px-4 font-bold flex items-center gap-2 text-purple-700 border-purple-300 hover:bg-purple-50">
              <span class="material-symbols-rounded text-lg text-purple-600">bolt</span>
              <span data-i18n="exam_week_mix">Semana de Provas (Misturar)</span>
            </button>
          </div>

        </div>

      </div>
    </div>

    <!-- PRO SUBSCRIPTION MODAL (R$ 4,99/MÊS) -->
    <div id="pro-subscription-modal" class="hidden fixed inset-0 modal-overlay z-[110] items-center justify-center p-3 sm:p-4 bg-black/60">
      <div class="m3-dialog-card w-full max-w-md bg-[var(--md-sys-color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--md-sys-color-outline-variant)] p-6 text-center animate-fadeIn max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div class="w-12 h-12 rounded-2xl bg-blue-100 text-[var(--md-sys-color-primary)] flex items-center justify-center mx-auto mb-3">
          <span class="material-symbols-rounded text-2xl">workspace_premium</span>
        </div>
        <h2 class="text-xl font-bold text-[var(--md-sys-color-on-surface)] mb-1" data-i18n="flashcards_pro_title">Flashcards Pro</h2>
        <p class="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4" data-i18n="flashcards_pro_subtitle">Sincronização em nuvem e recursos de Inteligência Artificial sem chave de API.</p>

        <div class="bg-[var(--md-sys-color-surface-container-low)] p-4 rounded-2xl text-left space-y-2 mb-4 text-xs">
          <div class="flex items-center gap-2 text-[var(--md-sys-color-on-surface)]">
            <span class="material-symbols-rounded text-base text-green-600">check_circle</span>
            <span data-i18n="pro_feat_ai_gen"><strong>Gerar flashcards com IA</strong> usando seus materiais</span>
          </div>
          <div class="flex items-center gap-2 text-[var(--md-sys-color-on-surface)]">
            <span class="material-symbols-rounded text-base text-green-600">check_circle</span>
            <span data-i18n="pro_feat_semantic"><strong>Tutor de IA</strong> que explica seu card</span>
          </div>
          <div class="flex items-center gap-2 text-[var(--md-sys-color-on-surface)]">
            <span class="material-symbols-rounded text-base text-green-600">check_circle</span>
            <span data-i18n="pro_feat_cloud_sync"><strong>Sincronização</strong> entre dispositivos</span>
          </div>
          <div class="flex items-center gap-2 text-[var(--md-sys-color-on-surface)]">
            <span class="material-symbols-rounded text-base text-green-600">check_circle</span>
            <span data-i18n="pro_feat_unlimited">Estude em qualquer lugar sem limites</span>
          </div>
        </div>

        <div class="mb-5">
          <span class="text-3xl font-extrabold text-[var(--md-sys-color-primary)]">R$ 4,99</span>
          <span class="text-xs text-[var(--md-sys-color-on-surface-variant)]">/ mês</span>
        </div>

        <!-- Checkout View -->
        <div id="pro-checkout-container" class="space-y-3">
          <div id="checkout-form"></div>
        </div>

        <div class="mt-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)] text-center text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-1">
          <div><span data-i18n="prefer_single_deck">${t('prefer_single_deck')}</span></div>
          <button type="button" id="switch-to-extra-from-pro-btn" class="font-bold text-amber-700 hover:underline cursor-pointer">
            ${t('buy_single_deck_btn')}
          </button>
        </div>

        <button id="close-pro-modal-btn" class="mt-4 text-xs text-gray-400 hover:text-gray-600 underline block mx-auto">
          Voltar
        </button>
      </div>
    </div>

    <!-- EXTRA DECK PURCHASE MODAL (R$ 1,49) -->
    <div id="extra-deck-modal" class="hidden fixed inset-0 modal-overlay z-[120] items-center justify-center p-3 sm:p-4 bg-black/60">
      <div class="m3-dialog-card w-full max-w-md bg-[var(--md-sys-color-surface-container-lowest)] rounded-[28px] shadow-2xl border border-[var(--md-sys-color-outline-variant)] p-6 text-center animate-fadeIn max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
          <span class="material-symbols-rounded text-2xl">add_circle</span>
        </div>
        <h2 id="extra-deck-modal-title" class="text-xl font-bold text-[var(--md-sys-color-on-surface)] mb-1" data-i18n="extra_deck_title">${t('extra_deck_title')}</h2>
        <p id="extra-deck-modal-subtitle" class="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4" data-i18n="extra_deck_subtitle">${t('extra_deck_subtitle')}</p>

        <div class="mb-4">
          <span id="extra-deck-modal-price" class="text-3xl font-extrabold text-[var(--md-sys-color-primary)]">R$ 1,49</span>
          <span class="text-xs text-[var(--md-sys-color-on-surface-variant)]" data-i18n="per_deck">${t('per_deck')}</span>
        </div>

        <div id="extra-deck-checkout-container" class="space-y-3">
          <div id="extra-deck-form-loading" class="flex flex-col items-center justify-center p-6 text-gray-500 text-xs gap-2">
            <span class="material-symbols-rounded text-2xl animate-spin text-blue-600">sync</span>
            <span>${t('loading_stripe_form')}</span>
          </div>
          <div id="extra-deck-checkout-form"></div>
        </div>

        <div id="extra-deck-switch-pro-container" class="mt-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)] text-center text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-1">
          <div><span data-i18n="prefer_pro_plan">${t('prefer_pro_plan')}</span></div>
          <button type="button" id="switch-to-pro-from-extra-btn" class="font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer">
            Flashcards Pro (R$ 4,99 / mês)
          </button>
        </div>

        <button id="close-extra-deck-modal-btn" class="mt-4 text-xs text-gray-400 hover:text-gray-600 underline block mx-auto cursor-pointer">
          Cancelar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
  applyTranslations(container);
}

/**
 * Attaches event listeners for modals
 */
function attachModalEventListeners() {
  document.getElementById('close-explore-modal-btn')?.addEventListener('click', closeExploreModal);
  document.getElementById('close-pro-modal-btn')?.addEventListener('click', closeProModal);
  document.getElementById('close-extra-deck-modal-btn')?.addEventListener('click', closeExtraDeckModal);

  document.getElementById('switch-to-extra-from-pro-btn')?.addEventListener('click', () => {
    closeProModal();
    openExtraDeckModal();
  });

  document.getElementById('switch-to-pro-from-extra-btn')?.addEventListener('click', () => {
    closeExtraDeckModal();
    openProModal();
  });

  // File Upload inside modal
  let pendingTargetSlotIndex = null;
  window.flashcardsUploadToSlot = function(slotIdx) {
    pendingTargetSlotIndex = slotIdx;
    document.getElementById('modal-hidden-file-input')?.click();
  };

  const uploadBtn = document.getElementById('modal-upload-btn');
  const hiddenInput = document.getElementById('modal-hidden-file-input');
  uploadBtn?.addEventListener('click', () => {
    pendingTargetSlotIndex = null;
    hiddenInput?.click();
  });

  hiddenInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed && parsed.__flashcards_watermark__ === "notebook_backup_v1") {
        const importAsNotebook = confirm(t('confirm_restore_notebook_backup'));
        if (importAsNotebook) {
          const importedCount = importNotebookBackupData(parsed);
          renderNotebookSlot();
          hiddenInput.value = '';
          alert(t('notebook_backup_restored_success', { count: importedCount }));
          return;
        }
      }

      if (parsed && parsed.__flashcards_watermark__ === "exam_week_backup_v1") {
        const playable = (parsed.cards || []).filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
        const examState = {
          deckTitle: parsed.deckTitle || "Semana de Provas",
          score: 0,
          decks: parsed.decks || [],
          allQuestions: parsed.cards || [],
          questionsPool: shuffleArray(playable)
        };
        openDeckInSlots(examState, examState.deckTitle, 'exam', pendingTargetSlotIndex);
        pendingTargetSlotIndex = null;
        renderModalContent();
        hiddenInput.value = '';
        window.location.href = ROUTES.GAME;
        return;
      }

      const deckName = file.name.replace(/\.[^/.]+$/, '');
      let cards = [];
      let deckTitle = deckName;

      if (Array.isArray(parsed)) {
        cards = parsed;
      } else if (parsed && Array.isArray(parsed.allQuestions)) {
        cards = parsed.allQuestions;
        deckTitle = parsed.deckTitle || deckName;
      } else if (parsed && Array.isArray(parsed.cards)) {
        cards = parsed.cards;
        deckTitle = parsed.deckTitle || deckName;
      } else {
        alert(t('invalid_json_deck'));
        return;
      }

      if (cards.length === 0) {
        alert(t('json_empty_cards'));
        return;
      }

      const playable = cards.filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
      const gameState = {
        questionsPool: [...playable],
        allQuestions: [...cards],
        score: 0,
        deckTitle: deckTitle
      };

      openDeckInSlots(gameState, deckTitle, 'normal', pendingTargetSlotIndex);
      pendingTargetSlotIndex = null;
      renderModalContent();
      // Reset input to allow selecting same file again
      hiddenInput.value = '';
      // Redirect to game
      window.location.href = ROUTES.GAME;
    } catch (err) {
      alert(t('error_reading_json_file', { error: err.message || t('invalid_format') }));
    }
  });

  // Notebook Backup File Upload inside modal
  const hiddenNotebookInput = document.getElementById('modal-hidden-notebook-file-input');
  hiddenNotebookInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedCount = importNotebookBackupData(parsed);

      // Update landing page badge if present
      const notebookCountEl = document.getElementById('notebook-count');
      const notebookCountLabel = document.getElementById('notebook-count-label');
      if (notebookCountEl) {
        notebookCountEl.textContent = importedCount;
        if (notebookCountLabel) {
          notebookCountLabel.textContent = importedCount === 1 ? 'card' : 'cards';
        }
      }

      renderNotebookSlot();
      alert(t('notebook_backup_imported_success', { count: importedCount }));
    } catch (err) {
      alert(t('error_importing_notebook_backup', { error: err.message || 'Arquivo corrompido' }));
    } finally {
      if (hiddenNotebookInput) hiddenNotebookInput.value = '';
    }
  });

  // Exam Week button
  document.getElementById('modal-exam-btn')?.addEventListener('click', () => {
    closeExploreModal();
    const examModal = document.getElementById('exam-modal');
    if (examModal) {
      examModal.classList.remove('hidden');
      examModal.classList.add('flex');
    } else {
      window.location.href = `${ROUTES.HOME}?openExam=1`;
    }
  });

  // Pro Subscription Pix button
  bindProCheckoutBtn();
}

function formatCpf(v) {
  const digits = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
  if (digits.length > 6) return digits.replace(/^(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3');
  if (digits.length > 3) return digits.replace(/^(\d{3})(\d{1,3})$/, '$1.$2');
  return digits;
}

async function checkPaymentStatusNow(showFeedback = false) {
  const checkBtn = document.getElementById('pro-check-payment-btn');
  if (checkBtn && showFeedback) {
    checkBtn.disabled = true;
    checkBtn.innerHTML = `<span class="material-symbols-rounded text-base animate-spin mr-1">sync</span><span>${t('verifying')}</span>`;
  }

  try {
    const result = await verifyPaymentStatus();
    if (result.isPro) {
      stopProPaymentPolling();
      await refreshUserProStatus();
      renderProModalContent();
      renderModalContent();
      triggerProUnlockCelebration();
      return true;
    } else if (showFeedback) {
      alert(t('payment_pending_bank'));
    }
  } catch (e) {
    console.warn('Erro ao checar pagamento:', e);
  } finally {
    if (checkBtn && showFeedback) {
      checkBtn.disabled = false;
      checkBtn.innerHTML = `<span class="material-symbols-rounded text-base mr-1">check_circle</span><span>${t('i_paid_already')}</span>`;
    }
  }
  return false;
}

function startProPaymentPolling() {
  stopProPaymentPolling();
  let attempts = 0;
  const maxAttempts = 100; // ~5.5 minutes of polling every 3.5s

  paymentPollingInterval = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      stopProPaymentPolling();
      return;
    }
    const confirmed = await checkPaymentStatusNow(false);
    if (confirmed) {
      stopProPaymentPolling();
    }
  }, 3500);
}

function bindProCheckoutBtn() {
  const btn = document.getElementById('pro-generate-pix-btn');
  const cpfInput = document.getElementById('pro-cpf-input');

  if (cpfInput && !cpfInput.dataset.maskBound) {
    cpfInput.dataset.maskBound = 'true';
    cpfInput.addEventListener('input', (e) => {
      e.target.value = formatCpf(e.target.value);
    });
  }

  // Toggle selection styling between Pix and Card
  const methodInputs = document.querySelectorAll('input[name="pro-payment-method"]');
  const optPix = document.getElementById('opt-method-pix');
  const optCard = document.getElementById('opt-method-card');

  methodInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.value === 'PIX') {
        optPix?.classList.add('border-blue-600', 'bg-blue-50/50');
        optPix?.classList.remove('border-gray-200', 'bg-white');
        optCard?.classList.add('border-gray-200', 'bg-white');
        optCard?.classList.remove('border-blue-600', 'bg-blue-50/50');
      } else {
        optCard?.classList.add('border-blue-600', 'bg-blue-50/50');
        optCard?.classList.remove('border-gray-200', 'bg-white');
        optPix?.classList.add('border-gray-200', 'bg-white');
        optPix?.classList.remove('border-blue-600', 'bg-blue-50/50');
      }
    });
  });

  btn?.addEventListener('click', async () => {
    const cleanCpf = cpfInput?.value?.replace(/\D/g, '') || '';
    if (cleanCpf.length !== 11) {
      alert(t('invalid_cpf_alert'));
      cpfInput?.focus();
      return;
    }

    const selectedMethod = document.querySelector('input[name="pro-payment-method"]:checked')?.value || 'PIX';

    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded text-base animate-spin mr-1.5">sync</span><span>${t('generating_invoice')}</span>`;

    try {
      const result = await createProSubscription({
        cpfCnpj: cleanCpf,
        billingType: selectedMethod
      });

      // Switch to Awaiting Payment view
      document.getElementById('pro-checkout-container')?.classList.add('hidden');
      const pixResult = document.getElementById('pro-pix-result');
      pixResult?.classList.remove('hidden');

      const qrContainer = document.getElementById('pro-qr-container');
      const qrImg = document.getElementById('pro-pix-qr-img');
      const copyBtn = document.getElementById('pro-copy-pix-btn');
      const invoiceBtn = document.getElementById('pro-invoice-btn');

      if (selectedMethod === 'PIX' && result.pix?.encodedImage) {
        if (qrContainer) qrContainer.classList.remove('hidden');
        if (qrImg) qrImg.src = `data:image/png;base64,${result.pix.encodedImage}`;
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(result.pix.payload);
            copyBtn.innerHTML = `<span class="material-symbols-rounded text-base">check</span><span>${t('copied')}</span>`;
            setTimeout(() => {
              copyBtn.innerHTML = `<span class="material-symbols-rounded text-base">content_copy</span><span>${t('copy_pix_code')}</span>`;
            }, 2000);
          };
        }
        if (invoiceBtn) invoiceBtn.classList.add('hidden');
      } else {
        if (qrContainer) qrContainer.classList.add('hidden');
        if (invoiceBtn && result.invoiceUrl) {
          invoiceBtn.href = result.invoiceUrl;
          invoiceBtn.classList.remove('hidden');
          invoiceBtn.innerHTML = `<span class="material-symbols-rounded text-base">credit_card</span><span>${t('pay_invoice_stripe')}</span>`;
        }
      }

      if (selectedMethod === 'CREDIT_CARD' && result.invoiceUrl) {
        window.open(result.invoiceUrl, '_blank');
      }

      // Bind check payment button
      const checkBtn = document.getElementById('pro-check-payment-btn');
      if (checkBtn) {
        checkBtn.onclick = () => checkPaymentStatusNow(true);
      }

      // Start automatic polling
      startProPaymentPolling();

    } catch (e) {
      alert(e.message || t('error_creating_subscription'));
      btn.disabled = false;
      btn.textContent = 'Assinar agora';
    }
  });
}

/**
 * Mount Stripe Embedded Checkout Form
 */
let activeCheckoutForm = null;

async function mountStripeEmbeddedForm() {
  const container = document.getElementById('checkout-form');
  const loadingEl = document.getElementById('checkout-form-loading');
  if (!container) return;

  const publishableKey = window.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder';

  if (!window.Stripe) {
    if (loadingEl) {
      loadingEl.innerHTML = `
        <span class="material-symbols-rounded text-2xl text-red-500">error</span>
        <span class="text-xs text-red-600 font-medium">${t('stripe_load_error')}</span>
      `;
    }
    return;
  }

  try {
    const stripe = window.Stripe(publishableKey);

    const appearance = {
      "theme": "flat",
      "labels": "auto",
      "inputs": "spaced",
      "variables": {
        "borderRadius": "4px",
        "colorBackground": "#ffffff",
        "colorDanger": "#df1b41",
        "colorPrimary": "#3b82f7",
        "colorSuccess": "#00c853",
        "colorText": "#30313d",
        "fontFamily": "'Roboto Flex', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        "fontSizeBase": "16px",
        "spacingUnit": "4px"
      }
    };

    const token = await getCurrentUserToken().catch(() => null);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const apiEndpoint = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL)
      ? `${BACKEND_URL}/api/create-checkout-session`
      : '/api/create-checkout-session';

    const clientSecret = fetch(apiEndpoint, { method: 'POST', headers })
      .then((response) => response.json())
      .then((json) => {
        if (json.error) {
          throw new Error(json.message || json.error);
        }
        return json.client_secret;
      });

    const checkout = await stripe.initCheckoutFormSdk({ clientSecret, appearance });

    if (loadingEl) loadingEl.classList.add('hidden');

    const form = checkout.createForm({ layout: 'expanded' });
    activeCheckoutForm = form;
    form.mount('#checkout-form');

    const loadActionsResult = await checkout.loadActions();
    if (loadActionsResult.type === 'success') {
      form.on('confirm', async (event) => {
        try {
          const actionResult = await loadActionsResult.actions.confirm({
            formConfirmEvent: event
          });
          console.log('[Stripe] Confirmação de pagamento:', actionResult);
          if (actionResult && actionResult.error) {
            console.error('Payment confirmation error:', actionResult.error);
            return;
          }
          setTimeout(async () => {
            const status = await refreshUserProStatus();
            renderProModalContent();
            renderModalContent();
            if (status?.isPro) {
              triggerProUnlockCelebration();
            }
          }, 2000);
        } catch (error) {
          console.error('Payment confirmation error:', error);
        }
      });
    }
  } catch (err) {
    console.error('[Stripe Form Error]:', err);
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
      const safeErrorMsg = escapeHtml(err && err.message ? err.message : t('stripe_keys_missing_desc'));
      loadingEl.innerHTML = `
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl text-left space-y-1">
          <div class="flex items-center gap-1.5 text-xs font-bold text-blue-900">
            <span class="material-symbols-rounded text-base text-blue-600">info</span>
            <span>${t('stripe_config_title')}</span>
          </div>
          <p class="text-[11px] text-blue-800 leading-tight">
            ${safeErrorMsg}
          </p>
          <p class="text-[10px] text-blue-700">
            ${t('stripe_keys_instructions')}
          </p>
        </div>
      `;
    }
  }
}

/**
 * Render Pro Modal View according to user status
 */
export function renderProModalContent() {
  const container = document.getElementById('pro-checkout-container');
  if (!container) return;

  const pixResult = document.getElementById('pro-pix-result');
  if (pixResult) pixResult.classList.add('hidden');
  container.classList.remove('hidden');

  const pro = isUserPro(currentUser, userProStatus);
  const lifetime = isLifetime(currentUser);

  if (pro) {
    stopProPaymentPolling();
    container.innerHTML = `
      <div class="p-3.5 bg-green-50 border border-green-200 rounded-2xl text-xs text-green-800 font-bold flex items-center justify-center gap-2">
        <span class="material-symbols-rounded text-lg text-green-600">verified</span>
        <span>${t('already_pro_plan', { status: lifetime ? t('pro_lifetime_badge') : t('pro_active_badge') })}</span>
      </div>
      <button id="pro-dismiss-btn" class="m3-btn-expressive m3-btn-filled w-full py-2.5 mt-3 font-bold text-xs bg-green-600 hover:bg-green-700 text-white shadow">
        Continuar Estudando
      </button>
    `;
    document.getElementById('pro-dismiss-btn')?.addEventListener('click', closeProModal);
    return;
  }

  if (!currentUser) {
    container.innerHTML = `
      <div class="space-y-3">
        <button id="pro-google-login-btn" class="m3-btn-expressive m3-btn-filled w-full py-3.5 px-4 font-bold text-sm flex items-center justify-center gap-2.5 shadow bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition">
          <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#ffffff"><path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          <span>Fazer Login com Google</span>
        </button>
        <p class="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">Faça login com sua conta Google para assinar o plano Pro.</p>
      </div>
    `;

    document.getElementById('pro-google-login-btn')?.addEventListener('click', async () => {
      try {
        const user = await signInWithGoogle();
        if (user) {
          renderProModalContent();
          renderModalContent();
        }
      } catch (e) {
        alert(t('error_authenticating_google'));
      }
    });
    return;
  }

  // Logged in but not Pro -> Render Embedded Stripe Checkout Form
  container.innerHTML = `
    <div id="stripe-checkout-wrapper" class="space-y-3">
      <div id="checkout-form-loading" class="flex flex-col items-center justify-center p-6 text-gray-500 text-xs gap-2">
        <span class="material-symbols-rounded text-2xl animate-spin text-blue-600">sync</span>
        <span>${t('loading_stripe_form')}</span>
      </div>
      <div id="checkout-form"></div>
    </div>
  `;
  mountStripeEmbeddedForm();
}

/**
 * Mount Stripe Embedded Checkout Form for Extra Deck Generation (R$ 0,99)
 */
let activeExtraDeckForm = null;

async function mountExtraDeckEmbeddedForm() {
  const container = document.getElementById('extra-deck-checkout-form');
  const loadingEl = document.getElementById('extra-deck-form-loading');
  if (!container) return;

  const publishableKey = window.STRIPE_PUBLISHABLE_KEY || 'pk_live_51UWEHsRynl9tIFFYm32d9vyXApB9FLeUcI5oNBuaCwkkxA0yc0pAVjKioRBO0Zy8j7CVQU6LSp09mM5Lss3EaDNg00qvRJ4VIT';

  if (!window.Stripe) {
    if (loadingEl) {
      loadingEl.innerHTML = `
        <span class="material-symbols-rounded text-2xl text-red-500">error</span>
        <span class="text-xs text-red-600 font-medium">${t('stripe_load_error')}</span>
      `;
    }
    return;
  }

  try {
    const stripe = window.Stripe(publishableKey);

    const appearance = {
      "theme": "flat",
      "labels": "auto",
      "inputs": "spaced",
      "variables": {
        "borderRadius": "4px",
        "colorBackground": "#ffffff",
        "colorDanger": "#df1b41",
        "colorPrimary": "#3b82f7",
        "colorSuccess": "#00c853",
        "colorText": "#30313d",
        "fontFamily": "'Roboto Flex', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        "fontSizeBase": "16px",
        "spacingUnit": "4px"
      }
    };

    const token = await getCurrentUserToken().catch(() => null);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const apiEndpoint = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL)
      ? `${BACKEND_URL}/api/create-extra-deck-session`
      : '/api/create-extra-deck-session';

    const clientSecret = fetch(apiEndpoint, { method: 'POST', headers })
      .then((response) => response.json())
      .then((json) => {
        if (json.error) {
          throw new Error(json.message || json.error);
        }
        return json.client_secret;
      });

    const checkout = await stripe.initCheckoutFormSdk({ clientSecret, appearance });

    if (loadingEl) loadingEl.classList.add('hidden');

    const form = checkout.createForm({ layout: 'expanded' });
    activeExtraDeckForm = form;
    form.mount('#extra-deck-checkout-form');

    const loadActionsResult = await checkout.loadActions();
    if (loadActionsResult.type === 'success') {
      form.on('confirm', async (event) => {
        try {
          const actionResult = await loadActionsResult.actions.confirm({
            formConfirmEvent: event
          });
          console.log('[Stripe Extra Deck] Confirmação:', actionResult);
          if (actionResult && actionResult.error) {
            console.error('Payment confirmation error:', actionResult.error);
            return;
          }
          setTimeout(async () => {
            await refreshUserProStatus();
            alert(t('extra_deck_payment_success'));
            closeExtraDeckModal();
          }, 2000);
        } catch (error) {
          console.error('Payment confirmation error:', error);
        }
      });
    }
  } catch (err) {
    console.error('[Stripe Extra Deck Form Error]:', err);
    if (loadingEl) {
      loadingEl.classList.remove('hidden');
      loadingEl.innerHTML = `
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-1">
          <div class="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <span class="material-symbols-rounded text-base text-amber-600">info</span>
            <span>Erro ao carregar checkout</span>
          </div>
          <p class="text-[11px] text-amber-800 leading-tight">
            ${err.message || t('checkout_init_error')}
          </p>
        </div>
      `;
    }
  }
}

export function renderExtraDeckModalContent() {
  const container = document.getElementById('extra-deck-checkout-container');
  if (!container) return;

  const pro = isUserPro(currentUser, userProStatus);
  const priceEl = document.getElementById('extra-deck-modal-price');
  const titleEl = document.getElementById('extra-deck-modal-title');
  const subtitleEl = document.getElementById('extra-deck-modal-subtitle');
  const switchContainer = document.getElementById('extra-deck-switch-pro-container');

  if (priceEl) {
    priceEl.textContent = pro ? 'R$ 0,99' : 'R$ 1,49';
  }
  if (titleEl) {
    titleEl.textContent = pro ? t('extra_deck_title_pro') : t('extra_deck_title');
  }
  if (subtitleEl) {
    subtitleEl.textContent = pro ? t('extra_deck_subtitle_pro') : t('extra_deck_subtitle');
  }
  if (switchContainer) {
    switchContainer.style.display = pro ? 'none' : 'block';
  }

  if (!currentUser) {
    container.innerHTML = `
      <div class="space-y-3">
        <button id="extra-google-login-btn" class="m3-btn-expressive m3-btn-filled w-full py-3.5 px-4 font-bold text-sm flex items-center justify-center gap-2.5 shadow bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition">
          <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#ffffff"><path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          <span>Fazer Login com Google</span>
        </button>
        <p class="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">Faça login com sua conta Google para comprar a geração extra.</p>
      </div>
    `;
    document.getElementById('extra-google-login-btn')?.addEventListener('click', async () => {
      try {
        const user = await signInWithGoogle();
        if (user) {
          renderExtraDeckModalContent();
        }
      } catch (e) {
        alert(t('error_authenticating_google'));
      }
    });
    return;
  }

  container.innerHTML = `
    <div id="extra-deck-form-loading" class="flex flex-col items-center justify-center p-6 text-gray-500 text-xs gap-2">
      <span class="material-symbols-rounded text-2xl animate-spin text-blue-600">sync</span>
      <span>${t('loading_stripe_form')}</span>
    </div>
    <div id="extra-deck-checkout-form"></div>
  `;
  mountExtraDeckEmbeddedForm();
}

/**
 * Render modal content according to current state
 */
export function renderModalContent() {
  renderAuthHeader();
  renderDeckSlots();
  renderNotebookSlot();
}

/**
 * Render Header section (Logged out vs Logged in)
 */
function renderAuthHeader() {
  const container = document.getElementById('modal-auth-section');
  if (!container) return;

  if (currentUser) {
    const photo = sanitizeImageUrl(currentUser.photoURL || '');
    const name = escapeHtml(currentUser.displayName || currentUser.email.split('@')[0]);
    const lifetime = isLifetime(currentUser);
    const isPro = Boolean(lifetime || userProStatus?.isPro || currentUser.pro);

    container.innerHTML = `
      <div class="relative">
        ${photo ? `<img src="${photo}" referrerpolicy="no-referrer" class="w-10 h-10 rounded-full border border-blue-200 object-cover" alt="Avatar">`
                : `<span class="material-symbols-rounded text-4xl text-blue-600">account_circle</span>`}
        ${isPro ? `<span class="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 text-[10px]" title="${t('pro_subscriber_title')}"><span class="material-symbols-rounded text-xs block">star</span></span>` : ''}
      </div>
      <div class="text-left min-w-0">
        <div class="flex items-center gap-1.5">
          <p class="font-bold text-sm text-[var(--md-sys-color-on-surface)] truncate max-w-[140px] sm:max-w-[200px]">${name}</p>
          ${isPro ? `<span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-full border border-amber-300">${lifetime ? t('pro_lifetime_badge') : 'PRO'}</span>` : ''}
        </div>
        <div class="flex items-center gap-3">
          <button id="modal-logout-btn" class="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold cursor-pointer">
            <span class="material-symbols-rounded text-sm">logout</span> ${t('logout')}
          </button>
          ${isPro 
            ? `<button id="modal-manage-account-btn" class="text-xs text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer">${t('manage_subscription')}</button>` 
            : `<button id="modal-upgrade-pro-btn" class="text-xs text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer">${t('subscribe_pro')}</button>`}
        </div>
      </div>
    `;

    document.getElementById('modal-logout-btn')?.addEventListener('click', async () => {
      await signOutUser();
    });
    document.getElementById('modal-upgrade-pro-btn')?.addEventListener('click', openProModal);
    document.getElementById('modal-manage-account-btn')?.addEventListener('click', () => {
      if (typeof window !== 'undefined' && window.flashcardsOpenAccountModal) {
        window.flashcardsOpenAccountModal();
      } else {
        import('./account-modal.js').then(m => m.openAccountModal());
      }
    });

  } else {
    container.innerHTML = `
      <div>
        <button id="modal-login-btn" class="flex items-center gap-2.5 px-4 py-2 bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-300 rounded-full shadow-sm text-xs sm:text-sm font-semibold text-gray-700 transition">
          <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          <span>${t('sign_in_google')}</span>
        </button>
        <p class="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1 text-left font-medium" data-i18n="save_decks_cloud_hint">${t('save_decks_cloud_hint')}</p>
      </div>
    `;

    document.getElementById('modal-login-btn')?.addEventListener('click', async () => {
      try {
        const user = await signInWithGoogle();
        if (user) {
          renderModalContent();
        }
      } catch (err) {
        alert(t('error_authenticating_google'));
      }
    });
  }
}

/**
 * Render Row 1: 3 Deck Slots
 */
function renderDeckSlots() {
  const container = document.getElementById('deck-slots-grid');
  if (!container) return;

  const slots = getLocalSlots();
  container.innerHTML = slots.map((slot, idx) => {
    const hasData = Boolean(slot.deckData && slot.cardCount > 0);
    const isCurrent = Boolean(slot.isCurrent);
    const isFixed = Boolean(slot.isFixed);
    const isExam = Boolean(slot.isExam || slot.mode === 'exam' || (slot.deckData && slot.deckData.decks));

    if (!hasData) {
      return `
        <div class="slot-card-empty border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[140px] cursor-pointer transition-colors bg-[var(--md-sys-color-surface-container-low)]" onclick="window.flashcardsUploadToSlot(${idx})">
          <span class="material-symbols-rounded text-3xl text-gray-400 mb-1">add_circle</span>
          <span class="text-xs font-bold text-gray-600">${t('slot_empty', { num: idx + 1 })}</span>
          <span class="text-[10px] text-gray-400 mt-0.5">${t('click_to_load')}</span>
        </div>
      `;
    }

    const deckCount = (slot.deckData && Array.isArray(slot.deckData.decks)) ? slot.deckData.decks.length : 0;
    const deckNames = (slot.deckData && Array.isArray(slot.deckData.decks)) ? slot.deckData.decks.map(d => escapeHtml(d.name)).join(', ') : '';
    const safeTitle = escapeHtml(slot.title || 'Baralho');

    return `
      <div class="slot-card relative bg-white border ${isCurrent ? (isExam ? 'border-purple-500 shadow-md ring-2 ring-purple-100' : 'border-blue-500 shadow-md ring-2 ring-blue-100') : (isExam ? 'border-purple-200 hover:border-purple-300' : 'border-gray-200')} rounded-2xl p-3 flex flex-col justify-between min-h-[140px] transition-all hover:shadow-lg">
        
        <!-- Top Status Indicators -->
        <div class="flex items-center justify-between gap-1 mb-2">
          ${isCurrent 
            ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isExam ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${t('open_now')}</span>` 
            : `<span class="text-[10px] ${isExam ? 'text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-full' : 'text-gray-400 font-semibold'}">Slot ${idx + 1}${isExam ? ` • ${t('mix_label')}` : ''}</span>`
          }
          <div class="flex items-center gap-1">
            ${isExam ? `<span class="material-symbols-rounded text-sm text-purple-600" title="${t('exam_week_mix')}">bolt</span>` : ''}
            ${isFixed ? `<span class="material-symbols-rounded text-sm ${isExam ? 'text-purple-600' : 'text-blue-600'}" title="${t('fixed_protected_hint')}">lock</span>` : `<span class="text-[10px] text-gray-400" title="${t('overwritable_hint')}">${t('overwritable')}</span>`}
          </div>
        </div>

        <!-- Deck Content / Title -->
        <div class="cursor-pointer flex-1 my-1" onclick="window.flashcardsOpenSlot(${idx})">
          <h4 class="text-sm font-bold text-gray-900 line-clamp-2 leading-tight" title="${deckNames ? `Mistura: ${deckNames}` : safeTitle}">${safeTitle}</h4>
          <p class="text-xs ${isExam ? 'text-purple-700 font-medium' : 'text-gray-500'} mt-1">${slot.cardCount} cards${isExam && deckCount > 0 ? ` • ${deckCount} ${t('nav_decks').toLowerCase()}` : ''}</p>
        </div>

        <!-- Action Bar: Edit, Delete & Share -->
        <div class="pt-2 mt-1 border-t border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-1">
            <button class="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition cursor-pointer" title="${t('edit_deck_title')}" onclick="window.flashcardsEditSlot(${idx})">
              <span class="material-symbols-rounded text-lg">edit</span>
            </button>
            <button class="p-1.5 rounded-lg text-red-500 hover:bg-red-50 active:bg-red-100 transition cursor-pointer" title="${t('delete_from_slot_title')}" onclick="window.flashcardsDeleteSlot(${idx})">
              <span class="material-symbols-rounded text-lg">delete</span>
            </button>
          </div>
          <button class="p-1.5 rounded-lg ${isExam ? 'text-purple-600 hover:bg-purple-50 active:bg-purple-100' : 'text-blue-600 hover:bg-blue-50 active:bg-blue-100'} transition cursor-pointer" title="${t('share_and_pin_title')}" onclick="window.flashcardsShareSlot(${idx})">
            <span class="material-symbols-rounded text-lg">share</span>
          </button>
        </div>

      </div>
    `;
  }).join('');
}

/**
 * Render Row 2: Caderno Slot
 */
function renderNotebookSlot() {
  const container = document.getElementById('notebook-slot-container');
  if (!container) return;

  const notebook = getNotebookSlotData();
  const hasCards = notebook.cardCount > 0;

  if (!hasCards) {
    container.innerHTML = `
      <div class="border border-gray-200 rounded-2xl p-4 flex items-center justify-between bg-[var(--md-sys-color-surface-container-low)]">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <span class="material-symbols-rounded text-2xl">bookmark</span>
          </div>
          <div class="text-left">
            <p class="text-sm font-bold text-gray-800">${t('notebook')}</p>
            <p class="text-xs text-gray-400">${t('notebook_empty_info')}</p>
          </div>
        </div>
        <button id="import-notebook-btn" class="p-2 sm:px-3 sm:py-1.5 rounded-xl text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer" title="${t('import_notebook_backup_title')}" onclick="window.flashcardsImportNotebookBackup()">
          <span class="material-symbols-rounded text-lg">file_upload</span>
          <span class="hidden sm:inline">${t('import_backup_btn')}</span>
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="bg-white border border-blue-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition">
      <div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="window.flashcardsOpenNotebook()">
        <div class="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
          <span class="material-symbols-rounded text-2xl">bookmark</span>
        </div>
        <div class="text-left min-w-0">
          <p class="text-sm font-bold text-gray-900 truncate">${t('notebook')}</p>
          <p class="text-xs text-gray-500">${t('cards_for_review', { count: notebook.cardCount })}</p>
        </div>
      </div>

      <!-- Action Bar: Import, Delete, Share -->
      <div class="flex items-center gap-1 flex-shrink-0">
        <button class="p-2 rounded-xl text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition cursor-pointer" title="${t('import_notebook_backup_title')}" onclick="window.flashcardsImportNotebookBackup()">
          <span class="material-symbols-rounded text-xl">file_upload</span>
        </button>
        <button class="p-2 rounded-xl text-red-500 hover:bg-red-50 active:bg-red-100 transition cursor-pointer" title="${t('clear_notebook_title')}" onclick="window.flashcardsClearNotebook()">
          <span class="material-symbols-rounded text-xl">delete</span>
        </button>
        <button class="p-2 rounded-xl text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition cursor-pointer" title="${t('share_notebook_title')}" onclick="window.flashcardsShareNotebook()">
          <span class="material-symbols-rounded text-xl">share</span>
        </button>
      </div>
    </div>
  `;
}

// Global window actions for inline onclick triggers
window.flashcardsOpenSlot = function(slotIdx) {
  const slots = getLocalSlots();
  const slot = slots[slotIdx];
  if (slot?.deckData) {
    slots.forEach((s, idx) => { s.isCurrent = (idx === slotIdx); });
    localStorage.setItem('flashcards_deck_slots', JSON.stringify(slots));
    const isExam = Boolean(slot.isExam || slot.mode === 'exam' || (slot.deckData && slot.deckData.decks));
    if (isExam) {
      localStorage.setItem('flashcardsExam', JSON.stringify(slot.deckData));
      localStorage.setItem('flashcardsActiveMode', 'exam');
    } else {
      localStorage.setItem('flashcardsSave', JSON.stringify(slot.deckData));
      localStorage.setItem('flashcardsActiveMode', 'normal');
    }
    closeExploreModal();
    window.location.href = ROUTES.GAME;
  }
};

window.flashcardsEditSlot = function(slotIdx) {
  const slots = getLocalSlots();
  const slot = slots[slotIdx];
  if (!slot?.deckData) return;

  const isExam = Boolean(slot.isExam || slot.mode === 'exam' || (slot.deckData && slot.deckData.decks));
  const rawCards = slot.deckData.allQuestions || slot.deckData.questionsPool || [];
  const cleanCards = rawCards.map(c => {
    if (!c || typeof c !== 'object') return c;
    const copy = { ...c };
    delete copy.isBeingCorrected;
    delete copy._lastUserAnswer;
    delete copy.apiKey;
    delete copy.api_key;
    delete copy.key;
    delete copy.token;
    delete copy.secret;
    delete copy.credential;
    return copy;
  });

  localStorage.setItem('editing_deck', JSON.stringify(cleanCards));
  localStorage.setItem('editing_deck_title', slot.title || (isExam ? 'Semana de Provas' : 'Baralho'));
  localStorage.setItem('editing_deck_mode', isExam ? 'exam' : 'normal');
  localStorage.setItem('editing_deck_slot_index', String(slotIdx));

  if (isExam) {
    localStorage.setItem('editing_deck_exam_data', JSON.stringify(slot.deckData));
  } else {
    localStorage.removeItem('editing_deck_exam_data');
  }

  if (slot.deckData?.isFreeAiTrial || cleanCards.some(c => c && c.isFreeAiTrial)) {
    localStorage.setItem('editing_deck_is_free_trial', 'true');
  } else {
    localStorage.removeItem('editing_deck_is_free_trial');
  }

  // Set as current active slot
  slots.forEach((s, idx) => { s.isCurrent = (idx === slotIdx); });
  saveLocalSlots(slots);

  closeExploreModal();
  window.location.href = ROUTES.GENERATE;
};

window.flashcardsDeleteSlot = function(slotIdx) {
  if (confirm(t('confirm_remove_deck_from_slot'))) {
    deleteSlot(slotIdx);
    renderDeckSlots();
  }
};

window.flashcardsShareSlot = async function(slotIdx) {
  const slots = getLocalSlots();
  const slot = slots[slotIdx];
  if (!slot?.deckData) return;

  try {
    const { shareUrl } = await shareDeckToCloud(slot.deckData, slot.title, slotIdx);
    fixSlot(slotIdx, true);
    renderDeckSlots();
    alert(t('deck_shared_and_pinned', { url: shareUrl }));
  } catch (err) {
    alert(t('error_sharing_deck'));
  }
};

window.flashcardsOpenNotebook = function() {
  localStorage.setItem('flashcardsActiveMode', 'notebook');
  closeExploreModal();
  window.location.href = ROUTES.GAME;
};

window.flashcardsClearNotebook = function() {
  if (confirm(t('confirm_clear_notebook_cards'))) {
    clearNotebookSlot();
    renderNotebookSlot();
  }
};

window.flashcardsImportNotebookBackup = function() {
  document.getElementById('modal-hidden-notebook-file-input')?.click();
};

window.flashcardsShareNotebook = async function() {
  const notebook = getNotebookSlotData();
  if (!notebook.deckData) return;
  try {
    const { shareUrl } = await shareDeckToCloud(notebook.deckData, 'Caderno', null);
    alert(t('notebook_shared_copied', { url: shareUrl }));
  } catch (e) {
    alert(t('error_sharing_notebook'));
  }
};
