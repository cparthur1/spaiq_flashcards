// SPDX-License-Identifier: GPL-2.0-only
/**
 * share-manager.js
 * Handles file sharing links and direct deep-linking into shared decks
 */

import { db, doc, getDoc, setDoc, updateDoc, onSnapshot } from './firebase-client.js';
import { openDeckInSlots, fixSlot, deleteSlot, getLocalSlots, saveLocalSlots, promptSlotSelectionForReplacement } from './slot-manager.js';
import { ROUTES, generateSecureId, escapeHtml } from './utils.js';

const DELETED_NOTICE_KEY = 'flashcards_deleted_deck_notice';
let sharedSyncTimeouts = {};

/**
 * Automatically sync an edited/updated deck to its shared Firestore document.
 * Debounced to batch rapid card edits or deletions.
 */
export async function syncSharedDeckToFirestore(shareSlug, deckData, title = null, debounceMs = 600) {
  if (!shareSlug || !deckData) return;

  const performSync = async () => {
    try {
      const shareDocRef = doc(db, 'shares', shareSlug);
      const cardCount = Array.isArray(deckData.allQuestions)
        ? deckData.allQuestions.length
        : (Array.isArray(deckData.cards) ? deckData.cards.length : (Array.isArray(deckData.questionsPool) ? deckData.questionsPool.length : 0));

      const payload = {
        title: title || deckData.deckTitle || 'Baralho Compartilhado',
        cardCount,
        deckData,
        updatedAt: Date.now()
      };

      await setDoc(shareDocRef, payload, { merge: true });
    } catch (err) {
      console.warn(`[ShareManager] Erro ao sincronizar baralho compartilhado (${shareSlug}):`, err);
    }
  };

  if (debounceMs > 0) {
    if (sharedSyncTimeouts[shareSlug]) {
      clearTimeout(sharedSyncTimeouts[shareSlug]);
    }
    sharedSyncTimeouts[shareSlug] = setTimeout(performSync, debounceMs);
  } else {
    await performSync();
  }
}

/**
 * Share a deck to Firestore and return shareable link.
 * Available to all users (Pro and non-Pro).
 * Rule 1.1: If sharing the file, fix it on the slot without being overwritten.
 * If user is already using their 3 slots, prompts them which deck they want to delete/replace.
 */
export async function shareDeckToCloud(deckData, deckName = 'Baralho Compartilhado', slotIndex = null) {
  if (!deckData || !deckData.allQuestions || deckData.allQuestions.length === 0) {
    throw new Error('Baralho vazio não pode ser compartilhado');
  }

  // Dedicated notebook sharing (does not use the 3 deck slots)
  if (deckName === 'Caderno') {
    let shareSlug = localStorage.getItem('flashcards_notebook_share_slug');
    if (!shareSlug) {
      shareSlug = generateSecureId('deck');
    }

    const shareDocRef = doc(db, 'shares', shareSlug);
    await setDoc(shareDocRef, {
      shareSlug,
      title: 'Caderno',
      cardCount: deckData.allQuestions.length,
      deckData,
      deleted: false,
      updatedAt: Date.now(),
      createdAt: Date.now()
    }, { merge: true });

    localStorage.setItem('flashcards_notebook_share_slug', shareSlug);

    const origin = window.location.origin;
    const shareUrl = `${origin}/?share=${shareSlug}`;

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch (e) {
        console.warn('Erro ao copiar para clipboard:', e);
      }
    }

    return { shareSlug, shareUrl, slotIndex: null };
  }

  // Regular Deck (or Exam mix)
  let currentSlots = getLocalSlots();
  let targetSlotIndex = (slotIndex !== null && slotIndex >= 0 && slotIndex < currentSlots.length && currentSlots[slotIndex]?.deckData) ? slotIndex : null;

  // Check if this deck is already present in one of the slots
  if (targetSlotIndex === null) {
    const matchIdx = currentSlots.findIndex(s => s && s.deckData && (
      (deckData.deckId && s.deckId === deckData.deckId) ||
      (s.shareSlug && deckData.shareSlug && s.shareSlug === deckData.shareSlug) ||
      (s.title === deckName && s.cardCount === deckData.allQuestions.length)
    ));
    if (matchIdx !== -1) {
      targetSlotIndex = matchIdx;
    }
  }

  // If the deck is NOT in any slot yet, we must assign it to a slot
  if (targetSlotIndex === null) {
    const occupiedCount = currentSlots.filter(s => s && s.deckData && s.cardCount > 0).length;

    if (occupiedCount >= 3) {
      // User is already using all 3 slots! Prompt user which slot they want to delete/replace.
      const chosenSlot = await promptSlotSelectionForReplacement({
        newDeckTitle: deckName,
        newCardCount: deckData.allQuestions.length,
        action: 'share'
      });

      if (chosenSlot === null) {
        const abortErr = new Error('Compartilhamento cancelado pelo usuário');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      deleteSlot(chosenSlot);
      targetSlotIndex = chosenSlot;
    } else {
      // There is an available empty slot
      const emptyIdx = currentSlots.findIndex(s => !s || !s.deckData || s.cardCount === 0);
      targetSlotIndex = emptyIdx !== -1 ? emptyIdx : 0;
    }
  }

  // Reload current slots in case deleteSlot modified them
  currentSlots = getLocalSlots();

  let shareSlug = currentSlots[targetSlotIndex]?.shareSlug || deckData.shareSlug || null;
  if (!shareSlug) {
    shareSlug = generateSecureId('deck');
  }

  const isExam = Boolean(deckData.decks && Array.isArray(deckData.decks));
  const newDeckId = deckData.deckId || (isExam ? `exam_${Date.now()}` : `deck_${Date.now()}`);
  deckData.deckId = newDeckId;

  // Update target slot with new or updated deck and fix it
  currentSlots[targetSlotIndex] = {
    slotIndex: targetSlotIndex,
    deckId: newDeckId,
    shareSlug,
    isShareOwner: true,
    isSharedImport: false,
    title: deckName,
    cardCount: deckData.allQuestions.length,
    isFixed: true,
    isCurrent: true,
    isExam,
    mode: isExam ? 'exam' : 'normal',
    deckData,
    updatedAt: Date.now()
  };

  currentSlots.forEach((s, idx) => {
    s.isCurrent = (idx === targetSlotIndex);
  });

  localStorage.removeItem(`flashcards_slot_${targetSlotIndex}_deleted_at`);
  saveLocalSlots(currentSlots);

  // Write/update the Firestore share document
  const shareDocRef = doc(db, 'shares', shareSlug);
  await setDoc(shareDocRef, {
    shareSlug,
    title: deckName,
    cardCount: deckData.allQuestions.length,
    deckData,
    deleted: false,
    updatedAt: Date.now(),
    createdAt: Date.now()
  }, { merge: true });

  // Sync to cloud if user is Pro
  try {
    const { syncSlotsToCloud } = await import('./slot-manager.js');
    syncSlotsToCloud();
  } catch (e) {}

  const origin = window.location.origin;
  const shareUrl = `${origin}/?share=${shareSlug}`;

  // Attempt clipboard copy
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (e) {
      console.warn('Erro ao copiar para clipboard:', e);
    }
  }

  return { shareSlug, shareUrl, slotIndex: targetSlotIndex };
}

/**
 * Mark a shared deck as deleted in Firestore
 */
export async function deleteSharedDeck(shareSlug) {
  if (!shareSlug) return;
  try {
    const shareDocRef = doc(db, 'shares', shareSlug);
    await updateDoc(shareDocRef, {
      deleted: true,
      deletedAt: Date.now()
    });
  } catch (err) {
    console.warn('Erro ao marcar baralho compartilhado como apagado:', err);
  }
}

/**
 * Check if current URL contains ?share= and load the deck directly.
 * If deck is deleted, redirect to home and display notification.
 */
export async function checkAndLoadSharedDeck() {
  const urlParams = new URLSearchParams(window.location.search);
  const shareSlug = urlParams.get('share');
  if (!shareSlug) {
    // Check if there is a pending deletion notice from a previous redirect
    checkPendingDeletionNotice();
    return false;
  }

  try {
    const shareDocRef = doc(db, 'shares', shareSlug);
    const snap = await getDoc(shareDocRef);

    if (snap.exists()) {
      const shareData = snap.data();

      // Check if creator deleted this shared deck
      if (shareData.deleted === true) {
        handleDeletedDeckRedirect();
        return true;
      }

      const deckData = shareData.deckData;
      const title = shareData.title || 'Baralho Compartilhado';
      const isExam = Boolean(shareData.isExam || (deckData && deckData.decks && Array.isArray(deckData.decks)));

      // If user already had this shared deck loaded in an existing slot, update it in place
      const existingSlots = getLocalSlots();
      const existingIdx = existingSlots.findIndex(s => s.shareSlug === shareSlug);
      let targetSlot = existingIdx !== -1 ? existingIdx : null;

      if (targetSlot === null) {
        const allThreeShared = existingSlots.length === 3 && existingSlots.every(s => s && s.deckData && s.cardCount > 0 && (s.shareSlug || s.isFixed));
        if (allThreeShared) {
          const chosen = await promptSlotSelectionForReplacement({
            newDeckTitle: title,
            newCardCount: (deckData.allQuestions || []).length,
            action: 'import'
          });
          if (chosen === null) {
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            return false;
          }
          deleteSlot(chosen);
          targetSlot = chosen;
        }
      }

      // Load into slots and fix it
      const slotIdx = await openDeckInSlots(deckData, title, isExam ? 'exam' : 'normal', targetSlot);
      fixSlot(slotIdx, true);
      const slots = getLocalSlots();
      if (slots[slotIdx]) {
        slots[slotIdx].shareSlug = shareSlug;
        slots[slotIdx].isSharedImport = true;
        slots[slotIdx].isShareOwner = false;
        slots[slotIdx].updatedAt = shareData.updatedAt || Date.now();
        saveLocalSlots(slots);
        subscribeToSharedDeck(shareSlug);
      }

      // Clean the query string from URL without reloading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      // Redirect directly into game
      if (!window.location.pathname.includes('game.html')) {
        window.location.href = ROUTES.GAME;
      }
      return true;
    } else {
      handleDeletedDeckRedirect();
      return true;
    }
  } catch (err) {
    console.error('Erro ao carregar baralho compartilhado:', err);
    handleDeletedDeckRedirect();
    return true;
  }
}

/**
 * Check in background if imported shared slots have an updated version in Firestore.
 * If owner made edits or deletions, keep local slot synchronized!
 */
export async function checkAndUpdateSharedSlots() {
  try {
    const slots = getLocalSlots();
    let hasChanges = false;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot?.shareSlug && slot?.isSharedImport) {
        try {
          const shareDocRef = doc(db, 'shares', slot.shareSlug);
          const snap = await getDoc(shareDocRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.deleted === true) {
              // Owner deleted shared deck; clear local slot
              slots[i] = {
                title: null,
                cardCount: 0,
                deckData: null,
                isCurrent: false,
                isFixed: false,
                isExam: false,
                mode: 'normal',
                shareSlug: null,
                isShareOwner: false,
                isSharedImport: false,
                deletedAt: Date.now(),
                updatedAt: Date.now()
              };
              hasChanges = true;
            } else if (data.updatedAt && data.updatedAt > (slot.updatedAt || 0) && data.deckData) {
              // Fresh cards or edits available!
              slot.deckData = data.deckData;
              slot.title = data.title || slot.title;
              slot.cardCount = data.cardCount || (data.deckData.allQuestions || []).length;
              slot.updatedAt = data.updatedAt;
              hasChanges = true;

              // If this slot is currently being studied, update active save too
              if (slot.isCurrent) {
                const activeMode = localStorage.getItem('flashcardsActiveMode') || 'normal';
                if (activeMode === 'normal' && !slot.isExam) {
                  localStorage.setItem('flashcardsSave', JSON.stringify(data.deckData));
                } else if (activeMode === 'exam' && slot.isExam) {
                  localStorage.setItem('flashcardsExam', JSON.stringify(data.deckData));
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[ShareManager] Falha ao verificar atualização para slot ${i}:`, e);
        }
      }
    }

    if (hasChanges) {
      saveLocalSlots(slots);
      try {
        window.dispatchEvent(new CustomEvent('flashcards:sync-updated', { detail: { hasSlotChanges: true } }));
      } catch (e) {}
    }
  } catch (err) {
    console.warn('[ShareManager] Erro em checkAndUpdateSharedSlots:', err);
  }
}

const activeShareListeners = new Map();

/**
 * Real-time listener (onSnapshot) for a shared deck document in Firestore.
 * When owner updates/edits/deletes cards, any active viewer receives the changes live!
 */
export function subscribeToSharedDeck(shareSlug, onUpdateCallback = null) {
  if (!shareSlug || activeShareListeners.has(shareSlug)) return;

  try {
    const shareDocRef = doc(db, 'shares', shareSlug);
    const unsubscribe = onSnapshot(shareDocRef, (snap) => {
      // Ignore local optimistic writes
      if (snap.metadata?.hasPendingWrites) return;

      if (!snap.exists()) {
        handleDeletedDeckRedirect();
        return;
      }

      const shareData = snap.data();
      if (shareData.deleted === true) {
        handleDeletedDeckRedirect();
        return;
      }

      if (shareData.deckData) {
        const slots = getLocalSlots();
        let slotUpdated = false;
        let isCurrentSession = false;

        for (let i = 0; i < slots.length; i++) {
          if (slots[i]?.shareSlug === shareSlug && slots[i]?.isSharedImport) {
            // Only update if remote is newer
            if ((shareData.updatedAt || 0) >= (slots[i].updatedAt || 0)) {
              slots[i].deckData = shareData.deckData;
              slots[i].title = shareData.title || slots[i].title;
              slots[i].cardCount = shareData.cardCount || (shareData.deckData.allQuestions || []).length;
              slots[i].updatedAt = shareData.updatedAt || Date.now();
              slotUpdated = true;

              if (slots[i].isCurrent) {
                isCurrentSession = true;
                const activeMode = localStorage.getItem('flashcardsActiveMode') || 'normal';
                if (activeMode === 'normal' && !slots[i].isExam) {
                  localStorage.setItem('flashcardsSave', JSON.stringify(shareData.deckData));
                } else if (activeMode === 'exam' && slots[i].isExam) {
                  localStorage.setItem('flashcardsExam', JSON.stringify(shareData.deckData));
                }
              }
            }
          }
        }

        if (slotUpdated) {
          saveLocalSlots(slots);
        }

        if (onUpdateCallback) {
          onUpdateCallback(shareData);
        }

        try {
          window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
            detail: {
              hasSlotChanges: slotUpdated,
              hasDeckChanges: isCurrentSession,
              shareSlug,
              deckData: shareData.deckData,
              title: shareData.title,
              source: 'realtime-shared-deck'
            }
          }));
        } catch (e) {}
      }
    }, (err) => {
      console.warn(`[ShareManager] Realtime listener error for share (${shareSlug}):`, err);
    });

    activeShareListeners.set(shareSlug, unsubscribe);
  } catch (err) {
    console.warn(`[ShareManager] Failed to subscribe to share (${shareSlug}):`, err);
  }
}

/**
 * Subscribe to real-time updates for all imported shared decks currently in slots.
 */
export function subscribeToAllSharedSlots() {
  const slots = getLocalSlots();
  for (const slot of slots) {
    if (slot?.shareSlug && slot?.isSharedImport) {
      subscribeToSharedDeck(slot.shareSlug);
    }
  }
}

function handleDeletedDeckRedirect() {
  sessionStorage.setItem(DELETED_NOTICE_KEY, 'Este baralho compartilhado foi apagado pelo proprietário.');
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);

  if (window.location.pathname.includes('game.html')) {
    window.location.href = ROUTES.HOME;
  } else {
    checkPendingDeletionNotice();
  }
}

function checkPendingDeletionNotice() {
  const notice = sessionStorage.getItem(DELETED_NOTICE_KEY);
  if (notice) {
    sessionStorage.removeItem(DELETED_NOTICE_KEY);
    showDeletedNoticePill(notice);
  }
}

function showDeletedNoticePill(message) {
  const pill = document.createElement('div');
  pill.className = 'fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-red-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-sm font-bold animate-fadeIn transition-all';
  pill.innerHTML = `
    <span class="material-symbols-rounded text-xl">delete_forever</span>
    <span>${escapeHtml(message || '')}</span>
  `;
  document.body.appendChild(pill);
  setTimeout(() => {
    pill.style.opacity = '0';
    pill.style.transform = 'translate(-50%, -20px)';
    setTimeout(() => pill.remove(), 400);
  }, 5000);
}

