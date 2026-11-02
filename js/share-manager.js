// SPDX-License-Identifier: GPL-2.0-only
/**
 * share-manager.js
 * Handles file sharing links and direct deep-linking into shared decks
 */

import { db, doc, getDoc, setDoc, updateDoc } from './firebase-client.js';
import { openDeckInSlots, fixSlot, getLocalSlots, saveLocalSlots } from './slot-manager.js';
import { ROUTES, generateSecureId, escapeHtml } from './utils.js';

const DELETED_NOTICE_KEY = 'flashcards_deleted_deck_notice';

/**
 * Share a deck to Firestore and return shareable link
 * Rule 1.1: If sharing the file, fix it on the slot without being overwritten.
 */
export async function shareDeckToCloud(deckData, deckName = 'Baralho Compartilhado', slotIndex = null) {
  if (!deckData || !deckData.allQuestions || deckData.allQuestions.length === 0) {
    throw new Error('Baralho vazio não pode ser compartilhado');
  }

  const shareSlug = generateSecureId('deck');
  const shareDocRef = doc(db, 'shares', shareSlug);

  await setDoc(shareDocRef, {
    shareSlug,
    title: deckName,
    cardCount: deckData.allQuestions.length,
    deckData,
    deleted: false,
    createdAt: Date.now()
  });

  // If a slotIndex was provided, fix the slot so it's not overwritten and record shareSlug
  if (slotIndex !== null) {
    fixSlot(slotIndex, true);
    const slots = getLocalSlots();
    if (slots[slotIndex]) {
      slots[slotIndex].shareSlug = shareSlug;
      saveLocalSlots(slots);
    }
  }

  const origin = window.location.origin;
  const shareUrl = `${origin}/?share=${shareSlug}`;

  // Attempt clipboard copy or native share
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (e) {
      console.warn('Erro ao copiar para clipboard:', e);
    }
  }

  return { shareSlug, shareUrl };
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

      // Load into slots and fix it
      const slotIdx = openDeckInSlots(deckData, title, isExam ? 'exam' : 'normal');
      fixSlot(slotIdx, true);
      const slots = getLocalSlots();
      if (slots[slotIdx]) {
        slots[slotIdx].shareSlug = shareSlug;
        saveLocalSlots(slots);
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

