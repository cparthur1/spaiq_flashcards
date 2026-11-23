// SPDX-License-Identifier: GPL-2.0-only
/**
 * slot-manager.js
 * Manages the 3 deck slots, the dedicated notebook slot, and cloud synchronization
 */

import { auth, db, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, onSnapshot, onAuthChange, registerSignOutCleanup } from './firebase-client.js';
import { getCloudSlots, saveCloudSlots } from './backend-api.js';
import { isUserPro } from './explore-modal.js';
import { syncSharedDeckToFirestore } from './share-manager.js';
import { t } from './i18n.js';
import { escapeHtml, generateSecureId, NOTEBOOK_STORAGE_KEY, encodeStoragePayload } from './utils.js';

const DEVICE_INSTANCE_ID = generateSecureId('dev');
let syncTimeout = null;
let syncIdleId = null;
let isSyncInFlight = false;
let hasPendingSync = false;

/**
 * Debounced sync to coalesce rapid card answers and run after animations & falling balls settle
 */
export function debouncedSyncSlotsToCloud(delay = 3500) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (syncIdleId && typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(syncIdleId);
    syncIdleId = null;
  }
  const effectiveDelay = Math.max(delay || 0, 2800);
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    if (typeof requestIdleCallback === 'function') {
      syncIdleId = requestIdleCallback(() => {
        syncIdleId = null;
        syncSlotsToCloud();
      }, { timeout: 2000 });
    } else {
      syncSlotsToCloud();
    }
  }, effectiveDelay);
}

const SLOTS_STORAGE_KEY = 'flashcards_deck_slots';
const ACTIVE_MODE_KEY = 'flashcardsActiveMode';
const SAVE_KEY = 'flashcardsSave';
const NOTEBOOK_KEY = NOTEBOOK_STORAGE_KEY;

let cachedLocalSlots = null;
let lastSyncedSlotSignature = '';
let lastNotebookRaw = null;
let cachedNotebookSlotData = null;
const lastCloudSyncedSlotState = {};
let lastCloudSyncedNotebookState = '';
let lastCloudSyncedStatsRaw = '';
let cachedCompactedStatsForCloud = null;
const directWriteForbiddenDocs = new Set();
let backendSyncCooldownUntil = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key === SLOTS_STORAGE_KEY) {
      cachedLocalSlots = null;
      lastSyncedSlotSignature = '';
    }
    if (!e.key || e.key === NOTEBOOK_KEY) {
      lastNotebookRaw = null;
      cachedNotebookSlotData = null;
    }
  });
}

/**
 * Default empty 3 slots
 */
function createDefaultSlots() {
  return [
    { slotIndex: 0, deckId: null, title: 'Slot 1 (Vazio)', cardCount: 0, isFixed: false, isCurrent: false, isExam: false, mode: 'normal', deckData: null, updatedAt: 0 },
    { slotIndex: 1, deckId: null, title: 'Slot 2 (Vazio)', cardCount: 0, isFixed: false, isCurrent: false, isExam: false, mode: 'normal', deckData: null, updatedAt: 0 },
    { slotIndex: 2, deckId: null, title: 'Slot 3 (Vazio)', cardCount: 0, isFixed: false, isCurrent: false, isExam: false, mode: 'normal', deckData: null, updatedAt: 0 }
  ];
}

/**
 * Load local slots from localStorage
 */
export function getLocalSlots() {
  if (cachedLocalSlots) {
    return cachedLocalSlots;
  }
  try {
    const raw = localStorage.getItem(SLOTS_STORAGE_KEY);
    if (!raw) {
      const defaultSlots = createDefaultSlots();
      saveLocalSlots(defaultSlots);
      return defaultSlots;
    }
    cachedLocalSlots = JSON.parse(raw);
    return cachedLocalSlots;
  } catch (e) {
    console.error('Erro ao ler slots locais:', e);
    return createDefaultSlots();
  }
}

/**
 * Save slots to localStorage
 */
export function saveLocalSlots(slots) {
  try {
    const serialized = encodeStoragePayload(slots);
    localStorage.setItem(SLOTS_STORAGE_KEY, serialized);
    cachedLocalSlots = slots;
    return true;
  } catch (e) {
    console.error('Erro ao salvar slots locais:', e);
    return false;
  }
}

/**
 * Load notebook data
 */
export function getNotebookSlotData() {
  try {
    const raw = localStorage.getItem(NOTEBOOK_KEY);
    if (!raw) {
      lastNotebookRaw = null;
      cachedNotebookSlotData = { title: 'Caderno', cardCount: 0, deckData: null };
      return cachedNotebookSlotData;
    }
    if (raw === lastNotebookRaw && cachedNotebookSlotData) {
      return cachedNotebookSlotData;
    }
    const data = JSON.parse(raw);
    lastNotebookRaw = raw;
    cachedNotebookSlotData = {
      title: 'Caderno',
      cardCount: (data.allQuestions || []).length,
      deckData: data
    };
    return cachedNotebookSlotData;
  } catch (e) {
    return { title: 'Caderno', cardCount: 0, deckData: null };
  }
}

/**
 * Put a deck or exam mix into the 3-slot system
 * Rolling FIFO Queue Rules:
 * - When all 3 decks are occupied and a new deck is opened:
 *   - The 3rd oldest deck (Slot 3, index 2) is deleted.
 *   - The 2nd (Slot 2, index 1) is moved to Slot 3 (index 2).
 *   - The previously-current deck (Slot 1, index 0) is moved to Slot 2 (index 1).
 *   - The now opened deck occupies the first slot (Slot 1, index 0).
 * - The current deck should always sync to the cloud, except when all 3 slots are shared
 *   (sharing locks overwriting/auto-deleting).
 */
export async function openDeckInSlots(deckData, deckName = 'Baralho', mode = 'normal', preferredSlotIndex = null, options = {}) {
  const slots = getLocalSlots();
  const now = Date.now();
  const cardCount = (deckData.allQuestions || []).length;
  const isExam = mode === 'exam' || Boolean(deckData.decks && Array.isArray(deckData.decks));
  const newDeckId = deckData.deckId || (isExam ? `exam_${now}` : `deck_${now}`);
  deckData.deckId = newDeckId;
  deckData.deckName = deckName;
  deckData.updatedAt = Math.max(Number(deckData.updatedAt) || 0, now);

  // 1. If preferredSlotIndex is explicitly specified
  if (preferredSlotIndex !== null && preferredSlotIndex >= 0 && preferredSlotIndex < slots.length) {
    slots.forEach((s, idx) => {
      s.isCurrent = (idx === preferredSlotIndex);
    });

    slots[preferredSlotIndex] = {
      slotIndex: preferredSlotIndex,
      deckId: newDeckId,
      shareSlug: slots[preferredSlotIndex]?.shareSlug || deckData.shareSlug || null,
      isShareOwner: slots[preferredSlotIndex]?.isShareOwner || false,
      isSharedImport: slots[preferredSlotIndex]?.isSharedImport || false,
      title: deckName,
      cardCount,
      isFixed: slots[preferredSlotIndex]?.isFixed || false,
      isCurrent: true,
      isExam,
      mode: isExam ? 'exam' : 'normal',
      deckData,
      updatedAt: now
    };

    localStorage.removeItem(`flashcards_slot_${preferredSlotIndex}_deleted_at`);
    saveLocalSlots(slots);

    if (isExam) {
      localStorage.setItem('flashcardsExam', encodeStoragePayload(deckData));
      localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
    } else {
      localStorage.setItem(SAVE_KEY, encodeStoragePayload(deckData));
      localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
    }

    syncSlotsToCloud();
    return preferredSlotIndex;
  }

  // 2. Check if this deck or mix is already in one of the slots
  const existingIndex = slots.findIndex(s => s && s.deckData && (
    s.deckId === newDeckId ||
    (s.shareSlug && deckData.shareSlug && s.shareSlug === deckData.shareSlug) ||
    (isExam ? ((s.isExam || s.mode === 'exam') && s.title === deckName) : (!s.isExam && s.mode !== 'exam' && s.title === deckName))
  ));

  if (existingIndex !== -1) {
    // Deck/mix already in a slot, make it active
    slots.forEach((s, idx) => {
      s.isCurrent = (idx === existingIndex);
    });

    slots[existingIndex] = {
      ...slots[existingIndex],
      deckId: newDeckId,
      title: deckName,
      cardCount,
      deckData,
      isCurrent: true,
      updatedAt: now
    };

    saveLocalSlots(slots);

    if (isExam) {
      localStorage.setItem('flashcardsExam', encodeStoragePayload(deckData));
      localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
    } else {
      localStorage.setItem(SAVE_KEY, encodeStoragePayload(deckData));
      localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
    }

    syncSlotsToCloud();
    return existingIndex;
  }

  // 3. Deck is NOT in any slot (it is a NEW deck being opened)
  const allThreeShared = slots.length === 3 && slots.every(s => s && s.deckData && s.cardCount > 0 && (s.shareSlug || s.isFixed));

  if (allThreeShared) {
    // When all 3 slots are shared, auto-open promptSlotSelectionForReplacement
    // warning the user that the current session won't be synced if they don't delete a shared slot.
    if (!options.suppressPrompt && typeof document !== 'undefined') {
      const chosen = await promptSlotSelectionForReplacement({
        newDeckTitle: deckName,
        newCardCount: cardCount,
        action: 'all_shared_warning'
      });

      if (chosen !== null && typeof chosen === 'number' && chosen >= 0 && chosen < 3) {
        deleteSlot(chosen);
        return openDeckInSlots(deckData, deckName, mode, chosen, { suppressPrompt: true });
      }

      if (chosen === null) {
        // User cancelled, abort opening
        return null;
      }

      // If chosen === 'unsynced', proceed below to store in local session without cloud sync
    }

    // User opted to play without sync, or suppressPrompt is true:
    // As warned: the current session won't be synced if they don't delete a shared slot.
    // The opened deck runs in the current local session without overwriting shared slots and without pushing to cloud slots.
    if (isExam) {
      localStorage.setItem('flashcardsExam', encodeStoragePayload(deckData));
      localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
    } else {
      localStorage.setItem(SAVE_KEY, encodeStoragePayload(deckData));
      localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
    }
    return -1;
  }

  // 4. Rolling shift:
  // "When all 3 decks are occupied and a new deck is opened, the 3rd oldest deck is deleted,
  // the 2nd is moved to the 3rd slot, the previously-current deck is moved to 2nd slot and
  // the now opened deck occupies the first slot."

  // Existing occupied decks from newest to oldest:
  const existingDecks = [slots[0], slots[1], slots[2]].filter(s => s && s.deckData && s.cardCount > 0);

  // If 3 decks were occupied, the 3rd oldest is dropped and deleted
  if (existingDecks.length >= 3) {
    const oldest = existingDecks[2];
    if (oldest && oldest.shareSlug && (oldest.isShareOwner === true || oldest.isSharedImport !== true)) {
      try {
        updateDoc(doc(db, 'shares', oldest.shareSlug), { deleted: true, deletedAt: Date.now() }).catch(() => {});
      } catch (e) {}
    }
  }

  // The 2nd deck moves to Slot 3 (index 2)
  if (existingDecks.length >= 2) {
    slots[2] = {
      ...existingDecks[1],
      slotIndex: 2,
      isCurrent: false,
      updatedAt: now
    };
    localStorage.removeItem('flashcards_slot_2_deleted_at');
  } else {
    slots[2] = {
      slotIndex: 2,
      deckId: null,
      shareSlug: null,
      isShareOwner: false,
      isSharedImport: false,
      title: 'Slot 3 (Vazio)',
      cardCount: 0,
      isFixed: false,
      isCurrent: false,
      isExam: false,
      mode: 'normal',
      deckData: null,
      updatedAt: now,
      deletedAt: now
    };
    localStorage.setItem('flashcards_slot_2_deleted_at', String(now));
  }

  // The previously-current deck (1st) moves to Slot 2 (index 1)
  if (existingDecks.length >= 1) {
    slots[1] = {
      ...existingDecks[0],
      slotIndex: 1,
      isCurrent: false,
      updatedAt: now
    };
    localStorage.removeItem('flashcards_slot_1_deleted_at');
  } else {
    slots[1] = {
      slotIndex: 1,
      deckId: null,
      shareSlug: null,
      isShareOwner: false,
      isSharedImport: false,
      title: 'Slot 2 (Vazio)',
      cardCount: 0,
      isFixed: false,
      isCurrent: false,
      isExam: false,
      mode: 'normal',
      deckData: null,
      updatedAt: now,
      deletedAt: now
    };
    localStorage.setItem('flashcards_slot_1_deleted_at', String(now));
  }

  // The newly opened deck occupies Slot 1 (index 0)
  slots[0] = {
    slotIndex: 0,
    deckId: newDeckId,
    shareSlug: deckData.shareSlug || null,
    isShareOwner: false,
    isSharedImport: false,
    title: deckName,
    cardCount,
    isFixed: Boolean(deckData.shareSlug),
    isCurrent: true,
    isExam,
    mode: isExam ? 'exam' : 'normal',
    deckData,
    updatedAt: now
  };
  localStorage.removeItem('flashcards_slot_0_deleted_at');

  saveLocalSlots(slots);

  // Save to active game session
  if (isExam) {
    localStorage.setItem('flashcardsExam', encodeStoragePayload(deckData));
    localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
  } else {
    localStorage.setItem(SAVE_KEY, encodeStoragePayload(deckData));
    localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
  }

  // The current deck should always sync to the cloud, except when all 3 slots are shared
  syncSlotsToCloud();

  return 0;
}

/**
 * Fix / Pin slot when sharing
 */
export function fixSlot(slotIndex, fixed = true) {
  const slots = getLocalSlots();
  if (slots[slotIndex]) {
    slots[slotIndex].isFixed = fixed;
    saveLocalSlots(slots);
    syncSlotsToCloud();
  }
}

/**
 * Delete a deck from a slot
 */
export function deleteSlot(slotIndex) {
  const slots = getLocalSlots();
  if (slots[slotIndex]) {
    const wasCurrent = slots[slotIndex].isCurrent;
    const isExam = Boolean(slots[slotIndex].isExam || slots[slotIndex].mode === 'exam' || (slots[slotIndex].deckData && slots[slotIndex].deckData.decks));
    const targetDeckId = slots[slotIndex].deckId;
    const shareSlug = slots[slotIndex].shareSlug;
    const isShareOwner = slots[slotIndex].isShareOwner === true || slots[slotIndex].isSharedImport !== true;

    // If deck was shared by owner (not a recipient import), mark share as deleted in Firestore
    if (shareSlug && isShareOwner && !slots[slotIndex].isSharedImport) {
      try {
        updateDoc(doc(db, 'shares', shareSlug), { deleted: true, deletedAt: Date.now() }).catch(() => {});
      } catch (e) {}
    }

    // Delete deck document from Firestore immediately if Pro user
    if (targetDeckId && auth.currentUser && isUserPro(auth.currentUser)) {
      try {
        deleteDoc(doc(db, 'decks', targetDeckId)).catch(() => {});
      } catch (e) {}
    }

    const now = Date.now();
    slots[slotIndex] = {
      slotIndex,
      deckId: null,
      shareSlug: null,
      isShareOwner: false,
      isSharedImport: false,
      title: `Slot ${slotIndex + 1} (Vazio)`,
      cardCount: 0,
      isFixed: false,
      isCurrent: false,
      isExam: false,
      mode: 'normal',
      deckData: null,
      updatedAt: now,
      deletedAt: now
    };

    localStorage.setItem(`flashcards_slot_${slotIndex}_deleted_at`, String(now));

    if (wasCurrent) {
      if (isExam) {
        localStorage.removeItem('flashcardsExam');
      } else {
        localStorage.removeItem(SAVE_KEY);
      }

      // Promote next available occupied slot if one exists
      const nextActiveIdx = slots.findIndex((s, idx) => idx !== slotIndex && s && s.deckData && s.cardCount > 0);
      if (nextActiveIdx !== -1) {
        slots[nextActiveIdx].isCurrent = true;
        slots[nextActiveIdx].updatedAt = now;
        const nextSlot = slots[nextActiveIdx];
        const nextIsExam = Boolean(nextSlot.isExam || nextSlot.mode === 'exam' || (nextSlot.deckData && nextSlot.deckData.decks));
        if (nextIsExam) {
          localStorage.setItem('flashcardsExam', encodeStoragePayload(nextSlot.deckData));
          localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
        } else {
          localStorage.setItem(SAVE_KEY, encodeStoragePayload(nextSlot.deckData));
          localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
        }
      } else {
        localStorage.removeItem(ACTIVE_MODE_KEY);
      }
    } else if (isExam) {
      try {
        const savedExam = JSON.parse(localStorage.getItem('flashcardsExam') || '{}');
        if (savedExam?.deckId === targetDeckId) {
          localStorage.removeItem('flashcardsExam');
        }
      } catch (e) {}
    }

    saveLocalSlots(slots);
    try {
      window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
        detail: {
          hasSlotChanges: true,
          hasDeckChanges: wasCurrent,
          deletedSlotIndex: slotIndex,
          source: 'local-slot-delete'
        }
      }));
    } catch (e) {}
    syncSlotsToCloud();
  }
}

/**
 * Prompts user to select which of their 3 occupied deck slots to delete and replace.
 * Returns a Promise that resolves to:
 * - 0, 1, or 2 (the chosen slot index to delete/replace)
 * - null (if user cancelled or dismissed the dialog)
 *
 * @param {Object} options
 * @param {string} options.newDeckTitle - Name of the new deck to be saved/shared
 * @param {number} options.newCardCount - Number of cards in the new deck
 * @param {'share'|'import'|'play'} options.action - Context of the replacement
 * @returns {Promise<number|null>}
 */
export function promptSlotSelectionForReplacement({
  newDeckTitle = 'Novo Baralho',
  newCardCount = 0,
  action = 'share'
} = {}) {
  const slots = getLocalSlots();
  const occupiedSlots = slots.filter(s => s && s.deckData && s.cardCount > 0);

  // If user does not have all 3 slots occupied, return first available empty slot
  if (occupiedSlots.length < 3) {
    const emptyIdx = slots.findIndex(s => !s || !s.deckData || s.cardCount === 0);
    return Promise.resolve(emptyIdx !== -1 ? emptyIdx : 0);
  }

  return new Promise((resolve) => {
    // Remove any existing replacement modal if present
    const existingModal = document.getElementById('slot-replacement-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const safeNewTitle = escapeHtml(newDeckTitle || t('deck_default_title'));
    let titleText = escapeHtml(t('slot_limit_modal_title'));
    let descText = escapeHtml(t('slot_limit_share_desc', { title: safeNewTitle }));

    if (action === 'import') {
      titleText = escapeHtml(t('slot_limit_import_title'));
      descText = escapeHtml(t('slot_limit_import_desc', { title: safeNewTitle }));
    } else if (action === 'all_shared_warning' || action === 'play') {
      titleText = escapeHtml(t('slot_limit_all_shared_title'));
      descText = escapeHtml(t('slot_limit_all_shared_desc', { title: safeNewTitle }));
    }

    const modal = document.createElement('div');
    modal.id = 'slot-replacement-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 transition-opacity duration-200';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'slot-replacement-modal-title');

    const slotsHtml = slots.map((slot, i) => {
      const cardCount = slot.cardCount || 0;
      const countLabel = `${cardCount} ${cardCount === 1 ? t('card_unit_singular') : t('cards_unit')}`;
      const title = escapeHtml(slot.title || `Slot ${i + 1}`);
      const isExam = Boolean(slot.isExam || slot.mode === 'exam');
      const isShared = Boolean(slot.shareSlug);

      return `
        <div class="p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] bg-[var(--md-sys-color-surface-container-low,#f8fafc)] flex items-center justify-between gap-3 hover:border-red-300 transition-colors">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-blue-50 text-[#3b82f7] flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200/60">
              ${i + 1}
            </div>
            <div class="min-w-0">
              <h4 class="text-sm font-semibold text-[var(--md-sys-color-on-surface,#0f172a)] truncate" title="${title}">
                ${title}
              </h4>
              <p class="text-xs text-[var(--md-sys-color-on-surface-variant,#64748b)] flex items-center gap-2 mt-0.5">
                <span>${countLabel}</span>
                ${isExam ? `<span class="text-purple-600 font-medium flex items-center gap-0.5"><span class="material-symbols-rounded text-xs">bolt</span> ${t('mix_label')}</span>` : ''}
                ${isShared ? `<span class="text-[#3b82f7] font-medium flex items-center gap-0.5"><span class="material-symbols-rounded text-xs">link</span> ${t('shared')}</span>` : ''}
              </p>
            </div>
          </div>
          <button type="button" data-slot-index="${i}" class="slot-replace-select-btn px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 font-medium text-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer border border-red-200">
            <span class="material-symbols-rounded text-base">delete</span>
            <span>${t('delete_and_replace')}</span>
          </button>
        </div>
      `;
    }).join('');

    const isAllSharedWarning = action === 'all_shared_warning' || action === 'play';

    modal.innerHTML = `
      <div class="m3-dialog-card bg-white rounded-3xl max-w-md w-full shadow-2xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] overflow-hidden flex flex-col p-6 animate-scale-up">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 text-[#3b82f7] flex items-center justify-center shrink-0 border border-blue-200/60">
            <span class="material-symbols-rounded text-2xl">${isAllSharedWarning ? 'cloud_off' : 'swap_horiz'}</span>
          </div>
          <div class="min-w-0">
            <h3 id="slot-replacement-modal-title" class="text-base font-bold text-[var(--md-sys-color-on-surface,#0f172a)] leading-tight">
              ${titleText}
            </h3>
            <span class="text-[11px] font-medium text-[#3b82f7]">3 ${t('slots_label')}</span>
          </div>
        </div>

        <p class="text-xs text-[var(--md-sys-color-on-surface-variant,#64748b)] leading-relaxed mb-4">
          ${descText}
        </p>

        <div class="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
          ${slotsHtml}
        </div>

        <div class="mt-5 pt-3 border-t border-[var(--md-sys-color-outline-variant,#e2e8f0)] flex items-center justify-between gap-2">
          <button type="button" id="slot-replace-cancel-btn" class="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--md-sys-color-on-surface-variant,#64748b)] hover:bg-[var(--md-sys-color-surface-container-high,#e2e8f0)] transition-colors cursor-pointer">
            ${t('cancel')}
          </button>
          ${isAllSharedWarning ? `
          <button type="button" id="slot-replace-unsynced-btn" class="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#3b82f7] hover:bg-blue-50 border border-blue-200 transition-colors cursor-pointer flex items-center gap-1.5">
            <span class="material-symbols-rounded text-base">cloud_off</span>
            <span>${t('play_without_sync')}</span>
          </button>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let isResolved = false;
    const cleanup = (chosenIndex) => {
      if (isResolved) return;
      isResolved = true;
      document.removeEventListener('keydown', handleKeyDown);
      modal.remove();
      resolve(chosenIndex);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        cleanup(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup(null);
      }
    });

    const cancelBtn = modal.querySelector('#slot-replace-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => cleanup(null));
    }

    const unsyncedBtn = modal.querySelector('#slot-replace-unsynced-btn');
    if (unsyncedBtn) {
      unsyncedBtn.addEventListener('click', () => cleanup('unsynced'));
    }

    const selectBtns = modal.querySelectorAll('.slot-replace-select-btn');
    selectBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const slotIdx = parseInt(btn.getAttribute('data-slot-index'), 10);
        cleanup(isNaN(slotIdx) ? null : slotIdx);
      });
    });
  });
}

/**
 * Clear notebook slot
 */
export function clearNotebookSlot() {
  const now = Date.now();
  const nbShareSlug = localStorage.getItem('flashcards_notebook_share_slug');
  if (nbShareSlug) {
    try {
      updateDoc(doc(db, 'shares', nbShareSlug), { deleted: true, deletedAt: now }).catch(() => {});
    } catch (e) {}
    localStorage.removeItem('flashcards_notebook_share_slug');
  }
  if (auth.currentUser && isUserPro(auth.currentUser)) {
    try {
      deleteDoc(doc(db, 'decks', `notebook_${auth.currentUser.uid}`)).catch(() => {});
    } catch (e) {}
  }
  localStorage.removeItem(NOTEBOOK_KEY);
  localStorage.setItem('flashcards_notebook_deleted_at', String(now));
  try {
    window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
      detail: {
        hasSlotChanges: true,
        hasDeckChanges: true,
        source: 'local-notebook-clear'
      }
    }));
  } catch (e) {}
  syncSlotsToCloud();
}

/**
 * Import a notebook backup into localStorage
 */
export function importNotebookBackupData(parsedData) {
  let cards = [];

  if (parsedData && parsedData.__flashcards_watermark__ === "notebook_backup_v1" && Array.isArray(parsedData.cards)) {
    cards = parsedData.cards;
  } else if (parsedData && Array.isArray(parsedData.allQuestions)) {
    cards = parsedData.allQuestions;
  } else if (parsedData && Array.isArray(parsedData.cards)) {
    cards = parsedData.cards;
  } else if (Array.isArray(parsedData)) {
    cards = parsedData;
  } else {
    throw new Error(t('invalid_notebook_backup_format'));
  }

  if (cards.length === 0) {
    throw new Error(t('json_empty_cards'));
  }

  const playable = cards.filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
  const notebookState = {
    deckTitle: "Caderno",
    score: parsedData.score || 0,
    notebookReviewsCount: parsedData.notebookReviewsCount || 0,
    currentStreak: parsedData.currentStreak || 0,
    currentStep: parsedData.currentStep || 0,
    consecutiveDueCardsCount: parsedData.consecutiveDueCardsCount || 0,
    consecutiveNewCardsCount: parsedData.consecutiveNewCardsCount || 0,
    allQuestions: cards,
    questionsPool: Array.isArray(parsedData.questionsPool) && parsedData.questionsPool.length > 0 ? parsedData.questionsPool : [...playable],
    updatedAt: Date.now()
  };

  localStorage.setItem(NOTEBOOK_KEY, encodeStoragePayload(notebookState));
  syncSlotsToCloud();
  return cards.length;
}

/**
 * Collect all user settings to sync
 */
export function getLocalSettings() {
  let pomodoroSettings = null;
  try {
    const raw = localStorage.getItem('flashcards_pomodoro_settings');
    if (raw) pomodoroSettings = JSON.parse(raw);
  } catch (e) {}

  let notificationsSettings = null;
  try {
    const raw = localStorage.getItem('flashcards_notifications_settings');
    if (raw) notificationsSettings = JSON.parse(raw);
  } catch (e) {}

  let pinnedStatsDeck = null;
  try {
    const raw = localStorage.getItem('flashcards_header_pinned_stats_deck');
    if (raw) pinnedStatsDeck = JSON.parse(raw);
  } catch (e) {}

  let pinnedStatsNotebook = null;
  try {
    const raw = localStorage.getItem('flashcards_header_pinned_stats_notebook');
    if (raw) pinnedStatsNotebook = JSON.parse(raw);
  } catch (e) {}

  let aiCategories = null;
  try {
    const raw = localStorage.getItem('flashcards_ai_categories');
    if (raw) aiCategories = JSON.parse(raw);
  } catch (e) {}

  return {
    language: localStorage.getItem('flashcards_language') || 'auto',
    aiEnabled: localStorage.getItem('flashcards_ai_enabled') !== 'false',
    hapticEnabled: localStorage.getItem('flashcardsHapticEnabled') !== 'false',
    soundEnabled: localStorage.getItem('flashcardsSoundEnabled') !== 'false',
    animationsEnabled: localStorage.getItem('flashcardsAnimationsEnabled') !== 'false',
    pomodoroEnabled: localStorage.getItem('flashcards_pomodoro_enabled') === 'true',
    pomodoroSettings,
    notificationsSettings,
    pinnedStatsDeck,
    pinnedStatsNotebook,
    aiCategories,
    notebookDailyGoal: Number(localStorage.getItem('flashcards_notebook_daily_goal')) || 0,
    notebookScheduler: localStorage.getItem('flashcards_notebook_scheduler') === 'sm2' ? 'sm2' : 'fsrs',
    freeAiDeckUsed: localStorage.getItem('spaiq_free_ai_deck_used') === 'true',
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    updatedAt: Number(localStorage.getItem('flashcards_settings_updated_at')) || Date.now()
  };
}

/**
 * Apply settings received from cloud
 */
export function applyCloudSettings(cloudSettings) {
  if (!cloudSettings || typeof cloudSettings !== 'object') return false;

  let changed = false;

  if (cloudSettings.language && typeof cloudSettings.language === 'string') {
    if (localStorage.getItem('flashcards_language') !== cloudSettings.language) {
      localStorage.setItem('flashcards_language', cloudSettings.language);
      changed = true;
    }
  }
  if (cloudSettings.aiEnabled !== undefined) {
    const val = cloudSettings.aiEnabled ? 'true' : 'false';
    if (localStorage.getItem('flashcards_ai_enabled') !== val) {
      localStorage.setItem('flashcards_ai_enabled', val);
      changed = true;
    }
  }
  if (cloudSettings.hapticEnabled !== undefined) {
    const val = cloudSettings.hapticEnabled ? 'true' : 'false';
    if (localStorage.getItem('flashcardsHapticEnabled') !== val) {
      localStorage.setItem('flashcardsHapticEnabled', val);
      changed = true;
    }
  }
  if (cloudSettings.soundEnabled !== undefined) {
    const val = cloudSettings.soundEnabled ? 'true' : 'false';
    if (localStorage.getItem('flashcardsSoundEnabled') !== val) {
      localStorage.setItem('flashcardsSoundEnabled', val);
      changed = true;
    }
  }
  if (cloudSettings.animationsEnabled !== undefined) {
    const val = cloudSettings.animationsEnabled ? 'true' : 'false';
    if (localStorage.getItem('flashcardsAnimationsEnabled') !== val) {
      localStorage.setItem('flashcardsAnimationsEnabled', val);
      changed = true;
    }
  }
  if (cloudSettings.pomodoroEnabled !== undefined) {
    const val = cloudSettings.pomodoroEnabled ? 'true' : 'false';
    if (localStorage.getItem('flashcards_pomodoro_enabled') !== val) {
      localStorage.setItem('flashcards_pomodoro_enabled', val);
      changed = true;
    }
  }
  if (cloudSettings.pomodoroSettings && typeof cloudSettings.pomodoroSettings === 'object') {
    localStorage.setItem('flashcards_pomodoro_settings', encodeStoragePayload(cloudSettings.pomodoroSettings));
    changed = true;
  }
  if (cloudSettings.notificationsSettings && typeof cloudSettings.notificationsSettings === 'object') {
    localStorage.setItem('flashcards_notifications_settings', encodeStoragePayload(cloudSettings.notificationsSettings));
    changed = true;
  }
  if (cloudSettings.pinnedStatsDeck && Array.isArray(cloudSettings.pinnedStatsDeck)) {
    localStorage.setItem('flashcards_header_pinned_stats_deck', encodeStoragePayload(cloudSettings.pinnedStatsDeck));
    localStorage.setItem('flashcards_header_pinned_stats', encodeStoragePayload(cloudSettings.pinnedStatsDeck));
    changed = true;
  }
  if (cloudSettings.pinnedStatsNotebook && Array.isArray(cloudSettings.pinnedStatsNotebook)) {
    localStorage.setItem('flashcards_header_pinned_stats_notebook', encodeStoragePayload(cloudSettings.pinnedStatsNotebook));
    changed = true;
  }
  if (cloudSettings.aiCategories && typeof cloudSettings.aiCategories === 'object') {
    let localCategories = {};
    try {
      const raw = localStorage.getItem('flashcards_ai_categories');
      if (raw) localCategories = JSON.parse(raw);
    } catch (e) {}
    const mergedCategories = { ...localCategories, ...cloudSettings.aiCategories };
    localStorage.setItem('flashcards_ai_categories', encodeStoragePayload(mergedCategories));
    changed = true;
  }
  if (cloudSettings.notebookDailyGoal !== undefined) {
    const val = String(cloudSettings.notebookDailyGoal);
    if (localStorage.getItem('flashcards_notebook_daily_goal') !== val) {
      localStorage.setItem('flashcards_notebook_daily_goal', val);
      changed = true;
    }
  }
  if (cloudSettings.notebookScheduler === 'fsrs' || cloudSettings.notebookScheduler === 'sm2') {
    if (localStorage.getItem('flashcards_notebook_scheduler') !== cloudSettings.notebookScheduler) {
      localStorage.setItem('flashcards_notebook_scheduler', cloudSettings.notebookScheduler);
      changed = true;
    }
  }
  if (cloudSettings.freeAiDeckUsed) {
    localStorage.setItem('spaiq_free_ai_deck_used', 'true');
    changed = true;
  }
  if (cloudSettings.updatedAt) {
    localStorage.setItem('flashcards_settings_updated_at', String(cloudSettings.updatedAt));
  }

  return changed;
}

/**
 * Merge local daily streak and cloud daily streak intelligently
 */
export function mergeDailyStreaks(local, cloud) {
  if (!cloud) return local;
  if (!local) return cloud;

  const mergedHistory = { ...(local.history || {}) };
  for (const [dateStr, count] of Object.entries(cloud.history || {})) {
    mergedHistory[dateStr] = Math.max(mergedHistory[dateStr] || 0, Number(count) || 0);
  }

  const mergedFrozenDates = Array.from(new Set([...(local.frozenDates || []), ...(cloud.frozenDates || [])]));
  const mergedGoalMetDates = Array.from(new Set([...(local.goalMetDates || []), ...(cloud.goalMetDates || [])]));
  
  const localUpdated = Number(local.updatedAt) || 0;
  const cloudUpdated = Number(cloud.updatedAt) || 0;
  const useCloudAsBase = cloudUpdated > localUpdated;

  const streak = Math.max(Number(local.streak) || 0, Number(cloud.streak) || 0);
  const bestStreak = Math.max(Number(local.bestStreak) || 0, Number(cloud.bestStreak) || 0, streak);
  const lastStudiedDate = (String(local.lastStudiedDate || '') > String(cloud.lastStudiedDate || '')) 
    ? local.lastStudiedDate 
    : (cloud.lastStudiedDate || local.lastStudiedDate || '');

  return {
    streak,
    bestStreak,
    lastStudiedDate,
    freezesAvailable: useCloudAsBase ? cloud.freezesAvailable : local.freezesAvailable,
    frozenDates: mergedFrozenDates,
    goalMetDates: mergedGoalMetDates,
    history: mergedHistory,
    lastFreezeAwardedStreak: Math.max(Number(local.lastFreezeAwardedStreak) || 0, Number(cloud.lastFreezeAwardedStreak) || 0),
    lastGoalFreezeAwardedCount: Math.max(Number(local.lastGoalFreezeAwardedCount) || 0, Number(cloud.lastGoalFreezeAwardedCount) || 0),
    updatedAt: Math.max(localUpdated, cloudUpdated, Date.now())
  };
}

/**
 * Merge local and cloud study statistics
 */
export function mergeStatsData(local, cloud) {
  if (!cloud) return local;
  if (!local) return cloud;

  const sessionMap = new Map();
  for (const sess of (local.history || [])) {
    if (sess && (sess.id || sess.startTime)) {
      sessionMap.set(sess.id || `sess_${sess.startTime}`, sess);
    }
  }
  for (const sess of (cloud.history || [])) {
    if (sess && (sess.id || sess.startTime)) {
      const key = sess.id || `sess_${sess.startTime}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, sess);
      } else {
        const existing = sessionMap.get(key);
        if ((sess.cardsAnswered || 0) > (existing.cardsAnswered || 0) || (sess.lastActiveTime || 0) > (existing.lastActiveTime || 0)) {
          sessionMap.set(key, sess);
        }
      }
    }
  }

  const mergedHistory = Array.from(sessionMap.values())
    .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
    .slice(0, 50)
    .map((s, idx) => {
      if (idx >= 5 && s && typeof s === 'object') {
        const slim = { ...s };
        delete slim.answersLog;
        delete slim.cardAnswers;
        delete slim.strugglingCards;
        return slim;
      }
      return s;
    });

  let totalCardsAnswered = 0;
  let totalCorrect = 0;
  let totalTimeSeconds = 0;
  let bestStreakAllTime = 0;

  for (const s of mergedHistory) {
    totalCardsAnswered += Number(s.cardsAnswered) || 0;
    totalCorrect += Number(s.correctCount ?? s.correctAnswers) || 0;
    totalTimeSeconds += Number(s.durationSeconds) || 0;
    if ((Number(s.bestStreak) || 0) > bestStreakAllTime) {
      bestStreakAllTime = Number(s.bestStreak) || 0;
    }
  }

  totalCardsAnswered = Math.max(totalCardsAnswered, Number(local.allTime?.totalCardsAnswered) || 0, Number(cloud.allTime?.totalCardsAnswered) || 0);
  totalCorrect = Math.max(totalCorrect, Number(local.allTime?.totalCorrect) || 0, Number(cloud.allTime?.totalCorrect) || 0);
  totalTimeSeconds = Math.max(totalTimeSeconds, Number(local.allTime?.totalTimeSeconds) || 0, Number(cloud.allTime?.totalTimeSeconds) || 0);
  bestStreakAllTime = Math.max(bestStreakAllTime, Number(local.allTime?.bestStreakAllTime) || 0, Number(cloud.allTime?.bestStreakAllTime) || 0);

  const localUpdated = Number(local.updatedAt) || Number(local.currentSession?.lastActiveTime) || 0;
  const cloudUpdated = Number(cloud.updatedAt) || Number(cloud.currentSession?.lastActiveTime) || 0;
  
  let currentSession = local.currentSession;
  if (cloud.currentSession && (!currentSession || (cloudUpdated > localUpdated && !cloud.currentSession.completed))) {
    currentSession = cloud.currentSession;
  }

  return {
    currentSession,
    history: mergedHistory,
    allTime: {
      totalSessions: Math.max(mergedHistory.length, Number(local.allTime?.totalSessions) || 0, Number(cloud.allTime?.totalSessions) || 0),
      totalCardsAnswered,
      totalCorrect,
      totalTimeSeconds,
      bestStreakAllTime
    },
    updatedAt: Math.max(localUpdated, cloudUpdated, Date.now())
  };
}

/**
 * Synchronize active game session into local slot and auto-sync to Firestore if deck is shared.
 * Runs for all users (Pro and non-Pro) so card edits/deletions immediately update the slot and share link.
 */
export function syncActiveSlotState(passedPayload = null) {
  const slots = getLocalSlots();
  const allThreeShared = slots.length === 3 && slots.every(s => s && s.deckData && s.cardCount > 0 && (s.shareSlug || s.isFixed));
  const activeMode = localStorage.getItem(ACTIVE_MODE_KEY) || 'normal';
  let updatedSlotIndex = -1;

  if (activeMode === 'normal') {
    const activeSave = passedPayload || localStorage.getItem(SAVE_KEY);
    if (activeSave) {
      try {
        const parsedSave = typeof activeSave === 'object' ? activeSave : JSON.parse(activeSave);
        const sig = `normal:${parsedSave?.deckTitle || ''}:${parsedSave?.updatedAt || 0}:${(parsedSave?.questionsPool || []).length}:${parsedSave?.score || 0}`;
        if (!passedPayload && sig === lastSyncedSlotSignature && parsedSave?.updatedAt) {
          return -1;
        }
        let currentSlotIndex = -1;
        if (parsedSave && parsedSave.deckId) {
          currentSlotIndex = slots.findIndex(s => s && s.deckId === parsedSave.deckId);
        }
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isCurrent && !s.isExam);
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isCurrent);

        // When all 3 slots are shared, sharing locks overwriting/auto-deleting
        if (allThreeShared && currentSlotIndex !== -1) {
          const matchesCurrent = slots[currentSlotIndex].deckId === parsedSave.deckId || slots[currentSlotIndex].title === parsedSave.deckTitle;
          if (!matchesCurrent) {
            return;
          }
        }

        if (currentSlotIndex !== -1 && slots[currentSlotIndex]) {
          const now = Date.now();
          const deckId = slots[currentSlotIndex].deckId || parsedSave.deckId || `deck_${now}`;
          parsedSave.deckId = deckId;
          parsedSave.updatedAt = parsedSave.updatedAt || now;
          slots[currentSlotIndex].deckId = deckId;
          slots[currentSlotIndex].deckData = parsedSave;
          slots[currentSlotIndex].cardCount = (parsedSave.allQuestions || []).length;
          slots[currentSlotIndex].title = parsedSave.deckTitle || slots[currentSlotIndex].title;
          slots[currentSlotIndex].isExam = false;
          slots[currentSlotIndex].mode = 'normal';
          slots[currentSlotIndex].updatedAt = now;
          saveLocalSlots(slots);
          lastSyncedSlotSignature = `normal:${parsedSave?.deckTitle || ''}:${parsedSave?.updatedAt || 0}:${(parsedSave?.questionsPool || []).length}:${parsedSave?.score || 0}`;
          updatedSlotIndex = currentSlotIndex;
        }
      } catch (e) {}
    }
  } else if (activeMode === 'exam') {
    const activeExam = passedPayload || localStorage.getItem('flashcardsExam');
    if (activeExam) {
      try {
        const parsedExam = typeof activeExam === 'object' ? activeExam : JSON.parse(activeExam);
        const sig = `exam:${parsedExam?.updatedAt || 0}:${(parsedExam?.questionsPool || []).length}:${parsedExam?.score || 0}`;
        if (!passedPayload && sig === lastSyncedSlotSignature && parsedExam?.updatedAt) {
          return -1;
        }
        let currentSlotIndex = -1;
        if (parsedExam && parsedExam.deckId) {
          currentSlotIndex = slots.findIndex(s => s && s.deckId === parsedExam.deckId);
        }
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isCurrent && (s.isExam || s.mode === 'exam'));
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isExam || s.mode === 'exam');
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isCurrent);

        // When all 3 slots are shared, sharing locks overwriting/auto-deleting
        if (allThreeShared && currentSlotIndex !== -1) {
          const matchesCurrent = slots[currentSlotIndex].deckId === parsedExam.deckId || slots[currentSlotIndex].title === (parsedExam.deckTitle || 'Semana de Provas');
          if (!matchesCurrent) {
            return;
          }
        }

        if (currentSlotIndex !== -1 && slots[currentSlotIndex]) {
          const now = Date.now();
          const deckId = slots[currentSlotIndex].deckId || parsedExam.deckId || `exam_${now}`;
          parsedExam.deckId = deckId;
          parsedExam.updatedAt = parsedExam.updatedAt || now;
          slots[currentSlotIndex].deckId = deckId;
          slots[currentSlotIndex].deckData = parsedExam;
          slots[currentSlotIndex].cardCount = (parsedExam.allQuestions || []).length;
          slots[currentSlotIndex].title = parsedExam.deckTitle || slots[currentSlotIndex].title || 'Semana de Provas';
          slots[currentSlotIndex].isExam = true;
          slots[currentSlotIndex].mode = 'exam';
          slots[currentSlotIndex].updatedAt = now;
          saveLocalSlots(slots);
          lastSyncedSlotSignature = `exam:${parsedExam?.updatedAt || 0}:${(parsedExam?.questionsPool || []).length}:${parsedExam?.score || 0}`;
          updatedSlotIndex = currentSlotIndex;
        } else if (!allThreeShared) {
          openDeckInSlots(parsedExam, parsedExam.deckTitle || 'Semana de Provas', 'exam', null, { suppressPrompt: true });
        }
      } catch (e) {}
    }
  }

  // If the updated slot is being shared, sync changes to Firestore share doc so anyone with the link gets the update!
  if (updatedSlotIndex !== -1 && slots[updatedSlotIndex]?.shareSlug) {
    syncSharedDeckToFirestore(
      slots[updatedSlotIndex].shareSlug,
      slots[updatedSlotIndex].deckData,
      slots[updatedSlotIndex].title
    );
  }

  // If notebook is active and shared, sync changes to notebook share
  if (activeMode === 'notebook') {
    const rawNb = localStorage.getItem(NOTEBOOK_KEY);
    if (rawNb) {
      try {
        const parsedNb = JSON.parse(rawNb);
        if (parsedNb && !parsedNb.updatedAt) {
          parsedNb.updatedAt = Date.now();
          localStorage.setItem(NOTEBOOK_KEY, encodeStoragePayload(parsedNb));
        }
      } catch (e) {}
    }
    const notebookShareSlug = localStorage.getItem('flashcards_notebook_share_slug');
    if (notebookShareSlug) {
      const localNotebook = getNotebookSlotData();
      if (localNotebook?.deckData) {
        syncSharedDeckToFirestore(notebookShareSlug, localNotebook.deckData, 'Caderno');
      }
    }
  }

  return updatedSlotIndex;
}

/**
 * Synchronize slots, settings, daily streak, and user progress to Firestore instantaneously
 */
export async function syncSlotsToCloud() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  // Always keep active slot and shared decks up to date locally & in shares (for all users)
  syncActiveSlotState();

  const user = auth.currentUser;
  if (!user) return;

  // Crucial: Cloud account backup sync is exclusively for Pro users. Non-pro users use local storage + direct link shares.
  if (!isUserPro(user)) {
    return;
  }

  if (isSyncInFlight) {
    hasPendingSync = true;
    return;
  }

  isSyncInFlight = true;
  try {
    const now = Date.now();
    const activeMode = localStorage.getItem(ACTIVE_MODE_KEY) || 'normal';
    const slots = getLocalSlots();
    let slotsModified = false;

    // Attach deletion timestamps if slot is empty, and ensure deckId if occupied
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].deckData) {
        const delAt = Number(localStorage.getItem(`flashcards_slot_${i}_deleted_at`)) || slots[i].deletedAt || slots[i].updatedAt || now;
        slots[i].deletedAt = delAt;
      } else if (!slots[i].deckId) {
        const isExam = Boolean(slots[i].isExam || slots[i].mode === 'exam' || (slots[i].deckData && slots[i].deckData.decks));
        slots[i].deckId = slots[i].deckData.deckId || `${isExam ? 'exam' : 'deck'}_${now}_${i}`;
        slots[i].deckData.deckId = slots[i].deckId;
        slotsModified = true;
      }
    }
    if (slotsModified) {
      saveLocalSlots(slots);
    }

    const localNotebook = getNotebookSlotData();
    const notebookDeletedAt = Number(localStorage.getItem('flashcards_notebook_deleted_at')) || 0;
    if (localNotebook?.deckData && !localNotebook.deckData.updatedAt) {
      localNotebook.deckData.updatedAt = now;
      localStorage.setItem(NOTEBOOK_KEY, encodeStoragePayload(localNotebook.deckData));
    }
    const notebookPayload = localNotebook?.deckData ? {
      title: 'Caderno',
      cardCount: localNotebook.cardCount || 0,
      deckData: {
        ...localNotebook.deckData,
        updatedAt: localNotebook.deckData.updatedAt || now
      },
      updatedAt: localNotebook.deckData.updatedAt || now
    } : {
      title: 'Caderno',
      cardCount: 0,
      deckData: null,
      deletedAt: notebookDeletedAt || now
    };

    // Stats (supports both flashcards_stats and legacy flashcardsStats)
    let stats = {};
    let statsRaw = '';
    try {
      statsRaw = localStorage.getItem('flashcards_stats') || localStorage.getItem('flashcardsStats') || '';
      if (statsRaw) {
        if (statsRaw === lastCloudSyncedStatsRaw && cachedCompactedStatsForCloud) {
          stats = cachedCompactedStatsForCloud;
        } else {
          stats = JSON.parse(statsRaw);
        }
      }
    } catch (e) {}

    // Daily streak
    let dailyStreak = null;
    try {
      const streakRaw = localStorage.getItem('flashcards_daily_streak');
      if (streakRaw) dailyStreak = JSON.parse(streakRaw);
    } catch (e) {}

    // Settings
    const settings = getLocalSettings();

    // Compact stats ONLY as an emergency safety net if stats alone ever approaches Firestore's 1 MiB cap
    const statsForCloud = (statsRaw && statsRaw === lastCloudSyncedStatsRaw && cachedCompactedStatsForCloud)
      ? cachedCompactedStatsForCloud
      : compactStatsForCloud(stats, statsRaw ? statsRaw.length : 0);

    // 1. Direct real-time Firestore WebSocket write (completes in ~60ms and notifies other devices immediately)
    let directWriteSucceeded = false;
    try {
      const deckWritePromises = [];
      let anyRequiredDirectWriteFailed = false;
      for (const slot of slots) {
        if (slot.deckId && slot.deckData) {
          const isExam = Boolean(slot.isExam || slot.mode === 'exam' || (slot.deckData && slot.deckData.decks));
          const slotSig = `${slot.deckId}:${slot.updatedAt || 0}:${slot.cardCount || 0}:${slot.title || ''}:${slot.isFixed ? 1 : 0}`;
          const docKey = `decks/${slot.deckId}`;
          if (lastCloudSyncedSlotState[slot.slotIndex] !== slotSig) {
            if (directWriteForbiddenDocs.has(docKey)) {
              anyRequiredDirectWriteFailed = true;
            } else {
              deckWritePromises.push(
                setDoc(doc(db, 'decks', slot.deckId), {
                  ownerUid: user.uid,
                  title: slot.title,
                  cardCount: slot.cardCount || 0,
                  isFixed: Boolean(slot.isFixed),
                  isExam,
                  mode: isExam ? 'exam' : 'normal',
                  deckData: slot.deckData,
                  updatedAt: slot.updatedAt || now
                }).then(() => {
                  lastCloudSyncedSlotState[slot.slotIndex] = slotSig;
                }).catch((err) => {
                  if (err?.code === 'permission-denied') directWriteForbiddenDocs.add(docKey);
                  anyRequiredDirectWriteFailed = true;
                })
              );
            }
          }
        }
      }

      const notebookSig = notebookPayload.deckData
        ? `nb:${notebookPayload.updatedAt || 0}:${notebookPayload.cardCount || 0}`
        : `nb_del:${notebookPayload.deletedAt || 0}`;
      const notebookDocKey = `decks/notebook_${user.uid}`;

      if (lastCloudSyncedNotebookState !== notebookSig) {
        if (notebookPayload.deckData) {
          if (directWriteForbiddenDocs.has(notebookDocKey)) {
            anyRequiredDirectWriteFailed = true;
          } else {
            deckWritePromises.push(
              setDoc(doc(db, 'decks', `notebook_${user.uid}`), {
                ownerUid: user.uid,
                title: 'Caderno',
                cardCount: notebookPayload.cardCount || 0,
                deckData: notebookPayload.deckData,
                updatedAt: notebookPayload.updatedAt || now
              }).then(() => {
                lastCloudSyncedNotebookState = notebookSig;
              }).catch((err) => {
                if (err?.code === 'permission-denied') directWriteForbiddenDocs.add(notebookDocKey);
                anyRequiredDirectWriteFailed = true;
              })
            );
          }
        } else {
          deckWritePromises.push(
            deleteDoc(doc(db, 'decks', `notebook_${user.uid}`))
              .then(() => { lastCloudSyncedNotebookState = notebookSig; })
              .catch(() => { lastCloudSyncedNotebookState = notebookSig; })
          );
        }
      }

      // Separate document user_stats/{uid} prevents stats history from bloating users/{uid} past 1 MiB.
      // Isolated so undeployed user_stats rules do not abort real-time deck/slot sync.
      const statsDocKey = `user_stats/${user.uid}`;
      if ((!statsRaw || statsRaw !== lastCloudSyncedStatsRaw) && !directWriteForbiddenDocs.has(statsDocKey)) {
        deckWritePromises.push(
          setDoc(doc(db, 'user_stats', user.uid), {
            ownerUid: user.uid,
            stats: statsForCloud,
            updatedAt: now,
            lastClientSyncId: DEVICE_INSTANCE_ID
          }).then(() => {
            if (statsRaw) {
              lastCloudSyncedStatsRaw = statsRaw;
              cachedCompactedStatsForCloud = statsForCloud;
            }
          }).catch((err) => {
            if (err?.code === 'permission-denied') {
              directWriteForbiddenDocs.add(statsDocKey);
            }
          })
        );
      }

      if (deckWritePromises.length > 0) {
        await Promise.all(deckWritePromises);
      }

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

      const userDocKey = `users/${user.uid}`;
      if (!directWriteForbiddenDocs.has(userDocKey)) {
        await setDoc(doc(db, 'users', user.uid), {
          deckSlots: deckSlotsMeta,
          notebookSlot: {
            cardCount: notebookPayload.deckData ? (notebookPayload.cardCount || 0) : 0,
            title: notebookPayload.title || 'Caderno',
            updatedAt: notebookPayload.updatedAt || now,
            deletedAt: notebookPayload.deckData ? null : (notebookPayload.deletedAt || now)
          },
          stats: deleteField(),
          slots: deleteField(),
          notebookData: deleteField(),
          settings: settings || {},
          dailyStreak: dailyStreak || null,
          activeMode: activeMode || null,
          lastSyncedAt: now,
          lastClientSyncId: DEVICE_INSTANCE_ID
        }, { merge: true }).catch((err) => {
          if (err?.code === 'permission-denied') directWriteForbiddenDocs.add(userDocKey);
          anyRequiredDirectWriteFailed = true;
        });
      } else {
        anyRequiredDirectWriteFailed = true;
      }

      directWriteSucceeded = !anyRequiredDirectWriteFailed;
    } catch (directErr) {
      console.warn('[CloudSync] Direct Firestore write fallback to backend:', directErr);
    }

    // 2. If direct write failed, fall back to backend API (uses Admin credentials and bypasses un-deployed rules)
    if (!directWriteSucceeded && Date.now() >= backendSyncCooldownUntil) {
      try {
        await saveCloudSlots({
          slots,
          notebookData: notebookPayload,
          stats: statsForCloud,
          settings,
          dailyStreak,
          activeMode,
          clientSyncId: DEVICE_INSTANCE_ID
        });
        if (statsRaw) {
          lastCloudSyncedStatsRaw = statsRaw;
          cachedCompactedStatsForCloud = statsForCloud;
        }
      } catch (backendErr) {
        // Back off for 60s when backend is unreachable or blocked by CORS (e.g. on localhost)
        backendSyncCooldownUntil = Date.now() + 60000;
        console.warn('[CloudSync] Backend sync unavailable, backing off for 60s:', backendErr?.message || backendErr);
      }
    }
  } catch (err) {
    console.warn('Erro ao sincronizar com nuvem:', err);
  } finally {
    isSyncInFlight = false;
    if (hasPendingSync) {
      hasPendingSync = false;
      debouncedSyncSlotsToCloud(2800);
    }
  }
}

/**
 * Load cloud slots when user logs in on a device
 */
export async function loadSlotsFromCloud() {
  const user = auth.currentUser;
  if (!user) return false;

  // Crucial: Only load from cloud if user is PRO! Non-pro users use local-only webapp features.
  if (!isUserPro(user)) {
    return false;
  }

  try {
    const cloudData = await getCloudSlots();
    if (!cloudData || cloudData.syncDisabled) return false;

    const syncDetails = { hasSlotChanges: false, hasDeckChanges: false, hasAnyChanges: false };
    const hasChanges = applyCloudSlotsData(cloudData, { outDetails: syncDetails });

    // Broadcast sync update event across page
    try {
      window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
        detail: {
          hasSlotChanges: syncDetails.hasSlotChanges,
          hasDeckChanges: syncDetails.hasDeckChanges,
          hasChanges,
          lastSyncedAt: cloudData.lastSyncedAt || Date.now(),
          source: 'cloud-load'
        }
      }));
    } catch (e) {}

    return hasChanges;
  } catch (e) {
    console.warn('Erro ao carregar slots da nuvem:', e);
    return false;
  }
}

/**
 * Apply remote cloud data into local storage slots, notebook, streak and settings.
 * Reusable across initial load and real-time onSnapshot events.
 */
export function applyCloudSlotsData(cloudData, { isRealtime = false, outDetails = null } = {}) {
  if (!cloudData || cloudData.syncDisabled) return false;

  let hasAnyChanges = false;
  let hasDeckOrSlotChanges = false;
  let hasNewerLocalState = false;
  const localSlots = getLocalSlots();

  let localMaxSlotMutationAt = 0;
  for (let i = 0; i < 3; i++) {
    const ls = localSlots[i];
    const delAt = Number(localStorage.getItem(`flashcards_slot_${i}_deleted_at`)) || 0;
    localMaxSlotMutationAt = Math.max(
      localMaxSlotMutationAt,
      Number(ls?.updatedAt) || 0,
      Number(ls?.deletedAt) || 0,
      delAt
    );
  }

  let localActiveSaveUpdatedAt = 0;
  try {
    const activeKey = localStorage.getItem(ACTIVE_MODE_KEY) === 'exam' ? 'flashcardsExam' : SAVE_KEY;
    const rawActive = localStorage.getItem(activeKey);
    if (rawActive) {
      localActiveSaveUpdatedAt = Number(JSON.parse(rawActive)?.updatedAt) || 0;
    }
  } catch (e) {}

  const cloudSyncAt = Number(cloudData.lastSyncedAt) || 0;

  if (cloudData.deckSlots && Array.isArray(cloudData.deckSlots) && cloudData.deckSlots.length > 0) {
    for (let i = 0; i < 3; i++) {
      const cloudSlot = cloudData.deckSlots.find(s => s.slotIndex === i);
      const localSlot = localSlots[i];
      const localUpdatedAt = Number(localSlot?.updatedAt) || 0;
      const localDeletedAt = Number(localStorage.getItem(`flashcards_slot_${i}_deleted_at`)) || Number(localSlot?.deletedAt) || 0;

      if (cloudSlot) {
        if (cloudSlot._skippedStaleFetch) {
          hasNewerLocalState = true;
          continue;
        }
        const cloudUpdatedAt = Number(cloudSlot.updatedAt || cloudData.lastSyncedAt) || 0;
        const cloudDeletedAt = Number(cloudSlot.deletedAt || (cloudSlot.deckData ? 0 : cloudUpdatedAt)) || 0;

        if (cloudSlot.deckData) {
          // Only apply cloud slot if local is empty (and not newer-deleted) or cloud is strictly newer.
          // Never let a stale realtime snapshot overwrite a newer local deck/slot.
          const shouldApplyCloudSlot = !localSlot?.deckData
            ? (cloudUpdatedAt > localDeletedAt)
            : (cloudUpdatedAt > localUpdatedAt);

          if (shouldApplyCloudSlot) {
            const isExam = Boolean(cloudSlot.isExam || cloudSlot.mode === 'exam' || (cloudSlot.deckData && cloudSlot.deckData.decks));
            const isNowCurrent = Boolean(cloudSlot.isCurrent);
            localSlots[i] = {
              slotIndex: i,
              deckId: cloudSlot.deckId,
              shareSlug: cloudSlot.shareSlug || localSlot?.shareSlug || cloudSlot.deckData?.shareSlug || null,
              isShareOwner: cloudSlot.isShareOwner !== undefined ? Boolean(cloudSlot.isShareOwner) : Boolean(localSlot?.isShareOwner),
              isSharedImport: cloudSlot.isSharedImport !== undefined ? Boolean(cloudSlot.isSharedImport) : Boolean(localSlot?.isSharedImport),
              title: cloudSlot.title,
              cardCount: cloudSlot.cardCount,
              isFixed: Boolean(cloudSlot.isFixed),
              isCurrent: isNowCurrent,
              isExam,
              mode: isExam ? 'exam' : 'normal',
              deckData: cloudSlot.deckData,
              updatedAt: cloudUpdatedAt
            };
            localStorage.removeItem(`flashcards_slot_${i}_deleted_at`);
            hasAnyChanges = true;
            hasDeckOrSlotChanges = true;

            if (isNowCurrent && cloudUpdatedAt >= localActiveSaveUpdatedAt) {
              if (isExam) {
                localStorage.setItem('flashcardsExam', encodeStoragePayload(cloudSlot.deckData));
                localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
              } else {
                localStorage.setItem(SAVE_KEY, encodeStoragePayload(cloudSlot.deckData));
                localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
              }
            }
          } else if (localSlot?.deckData && localUpdatedAt > cloudUpdatedAt) {
            hasNewerLocalState = true;
          }
        } else {
          // Cloud slot is EMPTY or DELETED: propagate deletion only if cloud snapshot is at least as new as local mutations
          const isExplicitlyDeletedInCloud = Boolean(cloudSlot?.deletedAt && cloudDeletedAt > localUpdatedAt);
          const isConfirmedEmptyInCloud = Boolean(!cloudSlot?.deckId && (cloudSlot?.cardCount || 0) === 0 && cloudDeletedAt > localUpdatedAt && cloudDeletedAt > 0);
          const isCloudAtOrAfterLocalMutations = cloudSyncAt === 0 || cloudSyncAt >= localMaxSlotMutationAt;

          if (localSlot?.deckData && isCloudAtOrAfterLocalMutations && (isExplicitlyDeletedInCloud || isConfirmedEmptyInCloud)) {
            const wasExam = Boolean(localSlot.isExam || localSlot.mode === 'exam');
            if (localSlot.isCurrent) {
              if (wasExam) {
                localStorage.removeItem('flashcardsExam');
              } else {
                localStorage.removeItem(SAVE_KEY);
              }
              localStorage.removeItem(ACTIVE_MODE_KEY);
            }
            localSlots[i] = {
              slotIndex: i,
              deckId: null,
              shareSlug: null,
              isShareOwner: false,
              isSharedImport: false,
              title: `Slot ${i + 1} (Vazio)`,
              cardCount: 0,
              isFixed: false,
              isCurrent: false,
              isExam: false,
              mode: 'normal',
              deckData: null,
              updatedAt: cloudDeletedAt,
              deletedAt: cloudDeletedAt
            };
            localStorage.setItem(`flashcards_slot_${i}_deleted_at`, String(cloudDeletedAt));
            hasAnyChanges = true;
            hasDeckOrSlotChanges = true;
          } else if (localSlot?.deckData) {
            hasNewerLocalState = true;
          }
        }
      }
    }

    // If active slot was deleted and another slot is now current or available, ensure active storage is populated
    const currentSlotAfter = localSlots.find(s => s && s.isCurrent && s.deckData);
    if (currentSlotAfter) {
      const isExam = Boolean(currentSlotAfter.isExam || currentSlotAfter.mode === 'exam' || (currentSlotAfter.deckData && currentSlotAfter.deckData.decks));
      if (isExam && !localStorage.getItem('flashcardsExam')) {
        localStorage.setItem('flashcardsExam', encodeStoragePayload(currentSlotAfter.deckData));
        localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
      } else if (!isExam && !localStorage.getItem(SAVE_KEY)) {
        localStorage.setItem(SAVE_KEY, encodeStoragePayload(currentSlotAfter.deckData));
        localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
      }
    }

    if (hasDeckOrSlotChanges) {
      saveLocalSlots(localSlots);
    }
  } else {
    // If cloud has no slots yet, but local device has decks or exam or notebook, push local to cloud!
    const hasLocalDecks = localSlots.some(s => s.deckData);
    const localNotebook = getNotebookSlotData();
    const hasLocalExam = Boolean(localStorage.getItem('flashcardsExam'));
    if (hasLocalDecks || localNotebook?.deckData || hasLocalExam) {
      hasNewerLocalState = true;
    }
  }

  // Load cloud notebook or propagate notebook deletion
  const localNotebook = getNotebookSlotData();
  const localNotebookUpdated = Number(localNotebook?.deckData?.updatedAt) || 0;
  const localNotebookDeletedAt = Number(localStorage.getItem('flashcards_notebook_deleted_at')) || 0;

  if (cloudData.notebookSlot?.deckData) {
    const cloudNotebookUpdated = Number(cloudData.notebookSlot.deckData.updatedAt || cloudData.notebookSlot.updatedAt || cloudData.lastSyncedAt) || 0;
    if ((!localNotebook?.deckData && cloudNotebookUpdated > localNotebookDeletedAt) || (localNotebook?.deckData && cloudNotebookUpdated > localNotebookUpdated)) {
      localStorage.setItem(NOTEBOOK_KEY, encodeStoragePayload(cloudData.notebookSlot.deckData));
      localStorage.removeItem('flashcards_notebook_deleted_at');
      hasAnyChanges = true;
      hasDeckOrSlotChanges = true;
    } else if (localNotebook?.deckData && localNotebookUpdated > cloudNotebookUpdated) {
      // Local has newer un-synced progress: push to cloud!
      hasNewerLocalState = true;
    }
  } else if (localNotebook?.deckData && (cloudData.notebookSlot?.deletedAt || (cloudData.notebookSlot && !cloudData.notebookSlot.deckId && (cloudData.notebookSlot.cardCount || 0) === 0))) {
    // Cloud notebook is deleted/empty: check deletion timestamp
    const cloudNotebookDeletedAt = Number(cloudData.notebookSlot?.deletedAt) || 0;
    if (cloudNotebookDeletedAt > 0 && cloudNotebookDeletedAt > localNotebookUpdated) {
      localStorage.removeItem(NOTEBOOK_KEY);
      localStorage.setItem('flashcards_notebook_deleted_at', String(cloudNotebookDeletedAt));
      hasAnyChanges = true;
      hasDeckOrSlotChanges = true;
    }
  }

  // Synchronize Daily Streak
  if (cloudData.dailyStreak && typeof cloudData.dailyStreak === 'object') {
    try {
      let localStreak = null;
      const streakRaw = localStorage.getItem('flashcards_daily_streak');
      if (streakRaw) localStreak = JSON.parse(streakRaw);

      const mergedStreak = mergeDailyStreaks(localStreak, cloudData.dailyStreak);
      localStorage.setItem('flashcards_daily_streak', encodeStoragePayload(mergedStreak));
      hasAnyChanges = true;
    } catch (e) {
      console.warn('Erro ao sincronizar streak diário:', e);
    }
  } else if (localStorage.getItem('flashcards_daily_streak')) {
    hasNewerLocalState = true;
  }

  // Synchronize Stats (merging history and allTime)
  if (cloudData.stats && typeof cloudData.stats === 'object' && Object.keys(cloudData.stats).length > 0) {
    try {
      let localStats = null;
      const statsRaw = localStorage.getItem('flashcards_stats') || localStorage.getItem('flashcardsStats');
      if (statsRaw) localStats = JSON.parse(statsRaw);

      const mergedStats = mergeStatsData(localStats, cloudData.stats);
      localStorage.setItem('flashcards_stats', encodeStoragePayload(mergedStats));
      localStorage.setItem('flashcardsStats', encodeStoragePayload(mergedStats));
      hasAnyChanges = true;
    } catch (e) {
      console.warn('Erro ao sincronizar estatísticas:', e);
    }
  } else if (localStorage.getItem('flashcards_stats') || localStorage.getItem('flashcardsStats')) {
    hasNewerLocalState = true;
  }

  // Synchronize Settings
  if (cloudData.settings && typeof cloudData.settings === 'object') {
    try {
      const settingsChanged = applyCloudSettings(cloudData.settings);
      if (settingsChanged) hasAnyChanges = true;
    } catch (e) {
      console.warn('Erro ao aplicar configurações da nuvem:', e);
    }
  }

  // Synchronize Active Mode (only apply from realtime cloud if cloud actually drove deck/slot changes and isn't stale)
  if (cloudData.activeMode && (cloudData.activeMode === 'normal' || cloudData.activeMode === 'exam' || cloudData.activeMode === 'notebook')) {
    const currentActive = localStorage.getItem(ACTIVE_MODE_KEY);
    if (!currentActive || (isRealtime && hasDeckOrSlotChanges && !hasNewerLocalState && cloudSyncAt >= localMaxSlotMutationAt)) {
      if (currentActive !== cloudData.activeMode) {
        localStorage.setItem(ACTIVE_MODE_KEY, cloudData.activeMode);
        hasAnyChanges = true;
        hasDeckOrSlotChanges = true;
      }
    }
  }

  if (hasNewerLocalState) {
    setTimeout(() => {
      syncSlotsToCloud();
    }, 150);
  }

  if (outDetails && typeof outDetails === 'object') {
    outDetails.hasSlotChanges = hasDeckOrSlotChanges;
    outDetails.hasDeckChanges = hasDeckOrSlotChanges;
    outDetails.hasAnyChanges = hasAnyChanges;
  }

  return hasAnyChanges;
}

/**
 * Ensures stats object fits cleanly within Firestore's 1 MiB document limit even on user_stats/{uid}
 */
export function compactStatsForCloud(rawStats, rawLengthHint = 0) {
  if (!rawStats || typeof rawStats !== 'object') return {};
  try {
    // Fast-path: if caller already knows serialized length is well under 750KB and history is bounded, skip JSON.stringify!
    if (rawLengthHint > 0 && rawLengthHint <= 750000 && (!Array.isArray(rawStats.history) || rawStats.history.length <= 50)) {
      return rawStats;
    }

    const initialSerialized = rawLengthHint > 0 ? null : JSON.stringify(rawStats);
    const initialLen = rawLengthHint > 0 ? rawLengthHint : initialSerialized.length;
    if (initialLen <= 750000 && (!Array.isArray(rawStats.history) || rawStats.history.length <= 50)) {
      return rawStats;
    }

    // Single-pass O(N) compaction (never call JSON.stringify inside a loop!)
    if (Array.isArray(rawStats.history)) {
      if (rawStats.history.length > 50) {
        rawStats.history = rawStats.history
          .slice()
          .sort((a, b) => (b?.startTime || 0) - (a?.startTime || 0))
          .slice(0, 50);
      }
      for (let i = 0; i < rawStats.history.length; i++) {
        const sess = rawStats.history[i];
        if (!sess || typeof sess !== 'object') continue;
        if (i >= 5) {
          delete sess.answersLog;
          delete sess.cardAnswers;
          delete sess.strugglingCards;
        }
      }
    }

    if (rawStats.currentSession && Array.isArray(rawStats.currentSession.answersLog) && rawStats.currentSession.answersLog.length > 150) {
      rawStats.currentSession.answersLog = rawStats.currentSession.answersLog.slice(-150);
    }

    const compactedJson = encodeStoragePayload(rawStats);
    // Persist the compacted stats back to localStorage so future calls are immediately fast!
    try {
      localStorage.setItem('flashcards_stats', compactedJson);
      localStorage.setItem('flashcardsStats', compactedJson);
      lastCloudSyncedStatsRaw = compactedJson;
      cachedCompactedStatsForCloud = rawStats;
    } catch (_) {}

    return rawStats;
  } catch (e) {
    return rawStats;
  }
}

/**
 * Hydrate raw users/{uid} Firestore snapshot with full deckData from decks/{deckId}, decks/notebook_{uid}, and user_stats/{uid}
 */
async function hydrateCloudUserDoc(userDocData, uid) {
  const hydrated = { ...userDocData };
  const localSlots = getLocalSlots();

  // Fetch separated user_stats/{uid} document (falls back cleanly to legacy userDocData.stats)
  try {
    const statsSnap = await getDoc(doc(db, 'user_stats', uid));
    if (statsSnap.exists() && statsSnap.data()?.stats) {
      hydrated.stats = statsSnap.data().stats;
    }
  } catch (err) {
    // Keep hydrated.stats fallback if permission/network error
  }

  if (Array.isArray(userDocData.deckSlots)) {
    hydrated.deckSlots = await Promise.all(
      userDocData.deckSlots.map(async (slot) => {
        const clonedSlot = { ...slot };
        if (clonedSlot.deckData) {
          return clonedSlot;
        }
        if (clonedSlot.deckId && !clonedSlot.deletedAt) {
          const localMatch = localSlots.find(ls => ls && ls.slotIndex === clonedSlot.slotIndex);
          const canReuseLocal = Boolean(
            localMatch?.deckData &&
            localMatch.deckId === clonedSlot.deckId &&
            localMatch.updatedAt === clonedSlot.updatedAt &&
            localMatch.cardCount === clonedSlot.cardCount
          );

          if (canReuseLocal) {
            clonedSlot.deckData = localMatch.deckData;
          } else if (localMatch?.deckData && (Number(localMatch.updatedAt) || 0) > (Number(clonedSlot.updatedAt) || 0)) {
            // Local slot is strictly newer than cloud metadata; skip unnecessary deck fetch
            clonedSlot.deckData = null;
            clonedSlot._skippedStaleFetch = true;
          } else {
            try {
              const deckSnap = await getDoc(doc(db, 'decks', clonedSlot.deckId));
              if (deckSnap.exists()) {
                clonedSlot.deckData = deckSnap.data().deckData || null;
              }
            } catch (err) {
              if (localMatch?.deckData && localMatch.deckId === clonedSlot.deckId) {
                clonedSlot.deckData = localMatch.deckData;
              }
            }
          }

          // Fallback safeguard: if cloud deck document was missing/empty, retain local deckData
          if (!clonedSlot.deckData && localMatch?.deckData && localMatch.deckId === clonedSlot.deckId) {
            clonedSlot.deckData = localMatch.deckData;
          }
        } else {
          clonedSlot.deckData = null;
        }
        return clonedSlot;
      })
    );
  }

  if (userDocData.notebookSlot) {
    const nbMeta = { ...userDocData.notebookSlot };
    if (nbMeta.deckData) {
      hydrated.notebookSlot = nbMeta;
    } else if (!nbMeta.deletedAt && (nbMeta.cardCount || 0) > 0) {
      const localNb = getNotebookSlotData();
      const localNbUpdated = Number(localNb?.deckData?.updatedAt) || 0;
      const canReuseNb = Boolean(
        localNb?.deckData &&
        localNbUpdated >= (nbMeta.updatedAt || 0) &&
        localNb.cardCount === nbMeta.cardCount
      );

      if (canReuseNb) {
        nbMeta.deckData = localNb.deckData;
      } else {
        try {
          const nbSnap = await getDoc(doc(db, 'decks', `notebook_${uid}`));
          if (nbSnap.exists()) {
            nbMeta.deckData = nbSnap.data().deckData || null;
          }
        } catch (err) {
          if (localNb?.deckData) {
            nbMeta.deckData = localNb.deckData;
          }
        }
      }

      // Fallback safeguard: retain local notebook deckData if cloud document was missing/empty
      if (!nbMeta.deckData && localNb?.deckData) {
        nbMeta.deckData = localNb.deckData;
      }
    } else {
      nbMeta.deckData = null;
    }
    hydrated.notebookSlot = nbMeta;
  }

  return hydrated;
}

let userDocUnsubscribe = null;
let subscribedUserUid = null;
let realtimeAuthListenerRegistered = false;

function attachRealtimeUserSnapshot(user) {
  if (!user || !isUserPro(user)) {
    if (userDocUnsubscribe) {
      userDocUnsubscribe();
      userDocUnsubscribe = null;
      subscribedUserUid = null;
    }
    return;
  }

  if (userDocUnsubscribe && subscribedUserUid === user.uid) {
    return;
  }

  if (userDocUnsubscribe) {
    userDocUnsubscribe();
    userDocUnsubscribe = null;
    subscribedUserUid = null;
  }

  try {
    subscribedUserUid = user.uid;
    const userDocRef = doc(db, 'users', user.uid);
    userDocUnsubscribe = onSnapshot(userDocRef, async (snap) => {
      // Ignore local optimistic writes
      if (snap.metadata?.hasPendingWrites) return;
      if (!snap.exists()) return;

      const data = snap.data();
      if (!data || data.syncDisabled) return;

      // Ignore echoes originating from this exact browser tab/session
      if (data.lastClientSyncId && data.lastClientSyncId === DEVICE_INSTANCE_ID) {
        return;
      }

      try {
        const hydratedData = await hydrateCloudUserDoc(data, user.uid);
        const syncDetails = { hasSlotChanges: false, hasDeckChanges: false, hasAnyChanges: false };
        const hasChanges = applyCloudSlotsData(hydratedData, { isRealtime: true, outDetails: syncDetails });
        if (hasChanges) {
          window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
            detail: {
              hasSlotChanges: syncDetails.hasSlotChanges,
              hasDeckChanges: syncDetails.hasDeckChanges,
              source: 'realtime-user-doc'
            }
          }));
        }
      } catch (hydrateErr) {
        console.warn('[RealtimeSync] Failed to hydrate user snapshot:', hydrateErr);
      }
    }, (err) => {
      console.warn('[RealtimeSync] Snapshot listener error on user doc:', err);
    });
  } catch (e) {
    console.warn('[RealtimeSync] Could not attach user snapshot listener:', e);
  }
}

/**
 * Real-time listener (onSnapshot) for the authenticated PRO user document in Firestore.
 * When the same user edits or plays decks on Device A, Device B receives updates live!
 */
export function initRealtimeCloudSync() {
  if (auth.currentUser && isUserPro(auth.currentUser)) {
    attachRealtimeUserSnapshot(auth.currentUser);
  }

  if (realtimeAuthListenerRegistered) return;
  realtimeAuthListenerRegistered = true;

  onAuthChange(async (user) => {
    if (!user) {
      attachRealtimeUserSnapshot(null);
      return;
    }
    if (isUserPro(user)) {
      attachRealtimeUserSnapshot(user);
    }
  });

  window.addEventListener('flashcards:pro-updated', () => {
    if (auth.currentUser && isUserPro(auth.currentUser)) {
      attachRealtimeUserSnapshot(auth.currentUser);
    } else {
      attachRealtimeUserSnapshot(null);
    }
  });
}

/**
 * Wipe all user-scoped local session data (slots, saves, notebook, stats, streaks, pro caches)
 * so signing out or switching accounts never leaks one user's data into another account.
 */
export function clearUserLocalSessionData() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (syncIdleId && typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(syncIdleId);
    syncIdleId = null;
  }
  hasPendingSync = false;

  cachedLocalSlots = null;
  lastSyncedSlotSignature = '';
  lastNotebookRaw = null;
  cachedNotebookSlotData = null;
  lastCloudSyncedNotebookState = '';
  lastCloudSyncedStatsRaw = '';
  cachedCompactedStatsForCloud = null;
  directWriteForbiddenDocs.clear();
  for (const k of Object.keys(lastCloudSyncedSlotState)) {
    delete lastCloudSyncedSlotState[k];
  }

  try {
    const keysToRemove = [
      SLOTS_STORAGE_KEY,
      ACTIVE_MODE_KEY,
      SAVE_KEY,
      'flashcardsExam',
      NOTEBOOK_KEY,
      'flashcards_stats',
      'flashcardsStats',
      'flashcards_daily_streak',
      'flashcards_notebook_share_slug',
      'flashcards_notebook_deleted_at',
      'flashcards_slot_0_deleted_at',
      'flashcards_slot_1_deleted_at',
      'flashcards_slot_2_deleted_at',
      'spaiq_extra_generations',
      'spaiq_free_ai_deck_used',
      'spaiq_active_uid',
      'editing_deck',
      'editing_deck_title',
      'editing_deck_mode',
      'editing_deck_slot_index',
      'editing_deck_exam_data',
      'editing_deck_is_free_trial'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Remove all per-uid pro caches
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('spaiq_pro_cache_')) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  try {
    window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
      detail: { hasSlotChanges: true, hasDeckChanges: true, source: 'session-cleared' }
    }));
  } catch (e) {}
}

registerSignOutCleanup(clearUserLocalSessionData);

// Auto-initialize real-time sync immediately on module load
initRealtimeCloudSync();
