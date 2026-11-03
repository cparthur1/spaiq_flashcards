// SPDX-License-Identifier: GPL-2.0-only
/**
 * slot-manager.js
 * Manages the 3 deck slots, the dedicated notebook slot, and cloud synchronization
 */

import { auth, db, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, onAuthChange } from './firebase-client.js';
import { getCloudSlots, saveCloudSlots } from './backend-api.js';
import { isUserPro } from './explore-modal.js';
import { syncSharedDeckToFirestore } from './share-manager.js';
import { t } from './i18n.js';
import { escapeHtml, generateSecureId, NOTEBOOK_STORAGE_KEY, encodeStoragePayload } from './utils.js';

const DEVICE_INSTANCE_ID = generateSecureId('dev');
let syncTimeout = null;
let isSyncInFlight = false;
let hasPendingSync = false;

/**
 * Debounced sync to coalesce rapid updates while feeling instantaneous
 */
export function debouncedSyncSlotsToCloud(delay = 300) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncSlotsToCloud();
  }, delay);
}

const SLOTS_STORAGE_KEY = 'flashcards_deck_slots';
const ACTIVE_MODE_KEY = 'flashcardsActiveMode';
const SAVE_KEY = 'flashcardsSave';
const NOTEBOOK_KEY = NOTEBOOK_STORAGE_KEY;

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
  try {
    const raw = localStorage.getItem(SLOTS_STORAGE_KEY);
    if (!raw) {
      const defaultSlots = createDefaultSlots();
      saveLocalSlots(defaultSlots);
      return defaultSlots;
    }
    return JSON.parse(raw);
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
    localStorage.setItem(SLOTS_STORAGE_KEY, encodeStoragePayload(slots));
  } catch (e) {
    console.error('Erro ao salvar slots locais:', e);
  }
}

/**
 * Load notebook data
 */
export function getNotebookSlotData() {
  try {
    const raw = localStorage.getItem(NOTEBOOK_KEY);
    if (!raw) return { title: 'Caderno', cardCount: 0, deckData: null };
    const data = JSON.parse(raw);
    return {
      title: 'Caderno',
      cardCount: (data.allQuestions || []).length,
      deckData: data
    };
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
  const cardCount = (deckData.allQuestions || []).length;
  const isExam = mode === 'exam' || Boolean(deckData.decks && Array.isArray(deckData.decks));
  const newDeckId = deckData.deckId || (isExam ? `exam_${Date.now()}` : `deck_${Date.now()}`);
  deckData.deckId = newDeckId;
  deckData.deckName = deckName;

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
      updatedAt: Date.now()
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
      updatedAt: Date.now()
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
      isCurrent: false
    };
    localStorage.removeItem('flashcards_slot_2_deleted_at');
  } else {
    const now = Date.now();
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
      isCurrent: false
    };
    localStorage.removeItem('flashcards_slot_1_deleted_at');
  } else {
    const now = Date.now();
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
    updatedAt: Date.now()
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
    freeAiDeckUsed: localStorage.getItem('spaiq_free_ai_deck_used') === 'true',
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
  
  const localUpdated = Number(local.updatedAt) || 0;
  const cloudUpdated = Number(cloud.updatedAt) || 0;
  const useCloudAsBase = cloudUpdated >= localUpdated;

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
    history: mergedHistory,
    lastFreezeAwardedStreak: Math.max(Number(local.lastFreezeAwardedStreak) || 0, Number(cloud.lastFreezeAwardedStreak) || 0),
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

  const mergedHistory = Array.from(sessionMap.values()).sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  let totalCardsAnswered = 0;
  let totalCorrect = 0;
  let totalTimeSeconds = 0;
  let bestStreakAllTime = 0;

  for (const s of mergedHistory) {
    totalCardsAnswered += Number(s.cardsAnswered) || 0;
    totalCorrect += Number(s.correctAnswers) || 0;
    totalTimeSeconds += Number(s.durationSeconds) || 0;
    if ((Number(s.bestStreak) || 0) > bestStreakAllTime) {
      bestStreakAllTime = Number(s.bestStreak) || 0;
    }
  }

  bestStreakAllTime = Math.max(bestStreakAllTime, Number(local.allTime?.bestStreakAllTime) || 0, Number(cloud.allTime?.bestStreakAllTime) || 0);

  const localUpdated = Number(local.updatedAt) || Number(local.currentSession?.lastActiveTime) || 0;
  const cloudUpdated = Number(cloud.updatedAt) || Number(cloud.currentSession?.lastActiveTime) || 0;
  
  let currentSession = local.currentSession;
  if (cloud.currentSession && (!currentSession || (cloudUpdated > localUpdated && !cloud.currentSession.completed))) {
    currentSession = cloud.currentSession;
  }

  return {
    currentSession,
    history: mergedHistory.slice(-200), // Cap at 200 sessions to keep payload nimble
    allTime: {
      totalSessions: mergedHistory.length,
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
export function syncActiveSlotState() {
  const slots = getLocalSlots();
  const allThreeShared = slots.length === 3 && slots.every(s => s && s.deckData && s.cardCount > 0 && (s.shareSlug || s.isFixed));
  const activeMode = localStorage.getItem(ACTIVE_MODE_KEY) || 'normal';
  const activeSave = localStorage.getItem(SAVE_KEY);
  const activeExam = localStorage.getItem('flashcardsExam');
  let updatedSlotIndex = -1;

  if (activeMode === 'normal' && activeSave) {
    try {
      const parsedSave = JSON.parse(activeSave);
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
        updatedSlotIndex = currentSlotIndex;
      }
    } catch (e) {}
  } else if (activeMode === 'exam' && activeExam) {
    try {
      const parsedExam = JSON.parse(activeExam);
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
        updatedSlotIndex = currentSlotIndex;
      } else if (!allThreeShared) {
        openDeckInSlots(parsedExam, parsedExam.deckTitle || 'Semana de Provas', 'exam', null, { suppressPrompt: true });
      }
    } catch (e) {}
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
    const notebookPayload = localNotebook?.deckData ? {
      title: 'Caderno',
      cardCount: localNotebook.cardCount || 0,
      deckData: localNotebook.deckData,
      updatedAt: localNotebook.deckData.updatedAt || now
    } : {
      title: 'Caderno',
      cardCount: 0,
      deckData: null,
      deletedAt: notebookDeletedAt || now
    };

    // Stats (supports both flashcards_stats and legacy flashcardsStats)
    let stats = {};
    try {
      const statsRaw = localStorage.getItem('flashcards_stats') || localStorage.getItem('flashcardsStats');
      if (statsRaw) stats = JSON.parse(statsRaw);
    } catch (e) {}

    // Daily streak
    let dailyStreak = null;
    try {
      const streakRaw = localStorage.getItem('flashcards_daily_streak');
      if (streakRaw) dailyStreak = JSON.parse(streakRaw);
    } catch (e) {}

    // Settings
    const settings = getLocalSettings();

    // 1. Direct real-time Firestore WebSocket write (completes in ~60ms and notifies other devices immediately)
    let directWriteSucceeded = false;
    try {
      const deckWritePromises = [];
      for (const slot of slots) {
        if (slot.deckId && slot.deckData) {
          const isExam = Boolean(slot.isExam || slot.mode === 'exam' || (slot.deckData && slot.deckData.decks));
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
            })
          );
        }
      }

      if (notebookPayload.deckData) {
        deckWritePromises.push(
          setDoc(doc(db, 'decks', `notebook_${user.uid}`), {
            ownerUid: user.uid,
            title: 'Caderno',
            cardCount: notebookPayload.cardCount || 0,
            deckData: notebookPayload.deckData,
            updatedAt: notebookPayload.updatedAt || now
          })
        );
      } else {
        deckWritePromises.push(
          deleteDoc(doc(db, 'decks', `notebook_${user.uid}`)).catch(() => {})
        );
      }

      await Promise.all(deckWritePromises);

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
          deckData: s.deckData || null,
          updatedAt: s.updatedAt || now,
          deletedAt: s.deckData ? null : (s.deletedAt || now)
        };
      });

      await setDoc(doc(db, 'users', user.uid), {
        deckSlots: deckSlotsMeta,
        notebookSlot: {
          cardCount: notebookPayload.deckData ? (notebookPayload.cardCount || 0) : 0,
          title: notebookPayload.title || 'Caderno',
          deckData: notebookPayload.deckData || null,
          updatedAt: notebookPayload.updatedAt || now,
          deletedAt: notebookPayload.deckData ? null : (notebookPayload.deletedAt || now)
        },
        stats: stats || {},
        settings: settings || {},
        dailyStreak: dailyStreak || null,
        activeMode: activeMode || null,
        lastSyncedAt: now,
        lastClientSyncId: DEVICE_INSTANCE_ID
      }, { merge: true });

      directWriteSucceeded = true;
    } catch (directErr) {
      console.warn('[CloudSync] Direct Firestore write fallback to backend:', directErr);
    }

    // 2. If direct write failed, fall back to backend API (or let backend clean up orphaned deck docs in background)
    if (!directWriteSucceeded) {
      await saveCloudSlots({
        slots,
        notebookData: notebookPayload,
        stats,
        settings,
        dailyStreak,
        activeMode,
        clientSyncId: DEVICE_INSTANCE_ID
      });
    }
  } catch (err) {
    console.warn('Erro ao sincronizar com nuvem:', err);
  } finally {
    isSyncInFlight = false;
    if (hasPendingSync) {
      hasPendingSync = false;
      syncSlotsToCloud();
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

    const hasSlotChanges = applyCloudSlotsData(cloudData);

    // Broadcast sync update event across page
    try {
      window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
        detail: {
          hasSlotChanges,
          hasDeckChanges: hasSlotChanges,
          hasChanges: hasSlotChanges,
          lastSyncedAt: cloudData.lastSyncedAt || Date.now(),
          source: 'cloud-load'
        }
      }));
    } catch (e) {}

    return hasSlotChanges;
  } catch (e) {
    console.warn('Erro ao carregar slots da nuvem:', e);
    return false;
  }
}

/**
 * Apply remote cloud data into local storage slots, notebook, streak and settings.
 * Reusable across initial load and real-time onSnapshot events.
 */
export function applyCloudSlotsData(cloudData, { isRealtime = false } = {}) {
  if (!cloudData || cloudData.syncDisabled) return false;

  let hasSlotChanges = false;
  const localSlots = getLocalSlots();

  if (cloudData.deckSlots && Array.isArray(cloudData.deckSlots) && cloudData.deckSlots.length > 0) {
    for (let i = 0; i < 3; i++) {
      const cloudSlot = cloudData.deckSlots.find(s => s.slotIndex === i);
      const localSlot = localSlots[i];
      const localUpdatedAt = localSlot?.updatedAt || 0;

      if (cloudSlot) {
        const cloudUpdatedAt = cloudSlot.updatedAt || cloudData.lastSyncedAt || 0;
        const cloudDeletedAt = cloudSlot.deletedAt || (cloudSlot.deckData ? 0 : cloudUpdatedAt);

        if (cloudSlot.deckData) {
          // Cloud has an active deck or exam mix: load if local is empty, cloud is newer/equal, or real-time update differs
          if (!localSlot?.deckData || cloudUpdatedAt >= localUpdatedAt || (isRealtime && cloudUpdatedAt !== localUpdatedAt)) {
            const isExam = Boolean(cloudSlot.isExam || cloudSlot.mode === 'exam' || (cloudSlot.deckData && cloudSlot.deckData.decks));
            const wasLocalCurrent = Boolean(localSlot?.isCurrent);
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
            hasSlotChanges = true;

            if (isNowCurrent || wasLocalCurrent) {
              if (isExam) {
                localStorage.setItem('flashcardsExam', encodeStoragePayload(cloudSlot.deckData));
                if (isNowCurrent) localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
              } else {
                localStorage.setItem(SAVE_KEY, encodeStoragePayload(cloudSlot.deckData));
                if (isNowCurrent) localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
              }
            }
          }
        } else {
          // Cloud slot is EMPTY or DELETED: propagate deletion only if explicitly deleted or confirmed empty in cloud
          const isExplicitlyDeletedInCloud = Boolean(cloudSlot?.deletedAt && cloudDeletedAt >= localUpdatedAt);
          const isConfirmedEmptyInCloud = Boolean(!cloudSlot?.deckId && (cloudSlot?.cardCount || 0) === 0 && cloudDeletedAt >= localUpdatedAt && cloudDeletedAt > 0);

          if (localSlot?.deckData && (isExplicitlyDeletedInCloud || isConfirmedEmptyInCloud)) {
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
            hasSlotChanges = true;
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

    if (hasSlotChanges) {
      saveLocalSlots(localSlots);
    }
  } else {
    // If cloud has no slots yet, but local device has decks or exam or notebook, push local to cloud!
    const hasLocalDecks = localSlots.some(s => s.deckData);
    const localNotebook = getNotebookSlotData();
    const hasLocalExam = Boolean(localStorage.getItem('flashcardsExam'));
    if (hasLocalDecks || localNotebook?.deckData || hasLocalExam) {
      syncSlotsToCloud();
    }
  }

  // Load cloud notebook or propagate notebook deletion
  const localNotebook = getNotebookSlotData();
  const localNotebookUpdated = localNotebook?.deckData?.updatedAt || 0;

  if (cloudData.notebookSlot?.deckData) {
    const cloudNotebookUpdated = cloudData.notebookSlot.deckData.updatedAt || cloudData.notebookSlot.updatedAt || cloudData.lastSyncedAt || 0;
    if (!localNotebook?.deckData || cloudNotebookUpdated >= localNotebookUpdated || (isRealtime && cloudNotebookUpdated !== localNotebookUpdated)) {
      localStorage.setItem(NOTEBOOK_KEY, encodeStoragePayload(cloudData.notebookSlot.deckData));
      localStorage.removeItem('flashcards_notebook_deleted_at');
      hasSlotChanges = true;
    }
  } else if (localNotebook?.deckData && (cloudData.notebookSlot?.deletedAt || (cloudData.notebookSlot && !cloudData.notebookSlot.deckId && (cloudData.notebookSlot.cardCount || 0) === 0))) {
    // Cloud notebook is deleted/empty: check deletion timestamp
    const cloudNotebookDeletedAt = cloudData.notebookSlot?.deletedAt || 0;
    if (cloudNotebookDeletedAt > 0 && cloudNotebookDeletedAt >= localNotebookUpdated) {
      localStorage.removeItem(NOTEBOOK_KEY);
      localStorage.setItem('flashcards_notebook_deleted_at', String(cloudNotebookDeletedAt));
      hasSlotChanges = true;
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
      hasSlotChanges = true;
    } catch (e) {
      console.warn('Erro ao sincronizar streak diário:', e);
    }
  } else if (localStorage.getItem('flashcards_daily_streak')) {
    syncSlotsToCloud();
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
      hasSlotChanges = true;
    } catch (e) {
      console.warn('Erro ao sincronizar estatísticas:', e);
    }
  } else if (localStorage.getItem('flashcards_stats') || localStorage.getItem('flashcardsStats')) {
    syncSlotsToCloud();
  }

  // Synchronize Settings
  if (cloudData.settings && typeof cloudData.settings === 'object') {
    try {
      const settingsChanged = applyCloudSettings(cloudData.settings);
      if (settingsChanged) hasSlotChanges = true;
    } catch (e) {
      console.warn('Erro ao aplicar configurações da nuvem:', e);
    }
  }

  // Synchronize Active Mode
  if (cloudData.activeMode && (cloudData.activeMode === 'normal' || cloudData.activeMode === 'exam' || cloudData.activeMode === 'notebook')) {
    const currentActive = localStorage.getItem(ACTIVE_MODE_KEY);
    if (!currentActive || isRealtime) {
      localStorage.setItem(ACTIVE_MODE_KEY, cloudData.activeMode);
      hasSlotChanges = true;
    }
  }

  return hasSlotChanges;
}

/**
 * Hydrate raw users/{uid} Firestore snapshot with full deckData from decks/{deckId} and decks/notebook_{uid}
 */
async function hydrateCloudUserDoc(userDocData, uid) {
  const hydrated = { ...userDocData };
  const localSlots = getLocalSlots();

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
      const localNbUpdated = localNb?.deckData?.updatedAt || 0;
      const canReuseNb = Boolean(
        localNb?.deckData &&
        localNbUpdated === nbMeta.updatedAt &&
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
        const hasChanges = applyCloudSlotsData(hydratedData, { isRealtime: true });
        if (hasChanges) {
          window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
            detail: {
              hasSlotChanges: true,
              hasDeckChanges: true,
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
    }
  });
}

// Auto-initialize real-time sync immediately on module load
initRealtimeCloudSync();
