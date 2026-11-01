// SPDX-License-Identifier: GPL-2.0-only
/**
 * slot-manager.js
 * Manages the 3 deck slots, the dedicated notebook slot, and cloud synchronization
 */

import { auth, db, doc, getDoc, setDoc, updateDoc, onSnapshot } from './firebase-client.js';
import { getCloudSlots, saveCloudSlots } from './backend-api.js';
import { isUserPro } from './explore-modal.js';

let syncTimeout = null;

/**
 * Debounced sync to avoid excessive requests during rapid card review
 */
export function debouncedSyncSlotsToCloud(delay = 2500) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncSlotsToCloud();
  }, delay);
}

const SLOTS_STORAGE_KEY = 'flashcards_deck_slots';
const ACTIVE_MODE_KEY = 'flashcardsActiveMode';
const SAVE_KEY = 'flashcardsSave';
const NOTEBOOK_KEY = 'flashcardsNotebook';

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
    localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(slots));
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
 * Rule 1.1: Save 3 latest decks / mixes.
 * - If sharing the file: fixed on the slot without being overwritten.
 * - The currently opened slot is always overwritable.
 */
export function openDeckInSlots(deckData, deckName = 'Baralho', mode = 'normal', preferredSlotIndex = null) {
  const slots = getLocalSlots();
  const cardCount = (deckData.allQuestions || []).length;
  const isExam = mode === 'exam' || Boolean(deckData.decks && Array.isArray(deckData.decks));
  const newDeckId = deckData.deckId || (isExam ? `exam_${Date.now()}` : `deck_${Date.now()}`);
  deckData.deckId = newDeckId;
  deckData.deckName = deckName;

  let targetIndex = -1;

  if (preferredSlotIndex !== null && preferredSlotIndex >= 0 && preferredSlotIndex < slots.length) {
    targetIndex = preferredSlotIndex;
  } else {
    // 1. Check if this deck or mix is already in one of the slots
    const existingIndex = slots.findIndex(s => s.deckData && (
      s.deckId === newDeckId ||
      (isExam ? ((s.isExam || s.mode === 'exam') && (s.deckId === newDeckId || s.title === deckName)) : (!s.isExam && s.mode !== 'exam' && s.title === deckName))
    ));

    if (existingIndex !== -1) {
      // Deck/mix already in a slot, make it active
      targetIndex = existingIndex;
    } else {
      // Find slot to overwrite:
      // First priority: Any empty slot
      const emptyIndex = slots.findIndex(s => !s.deckData);
      if (emptyIndex !== -1) {
        targetIndex = emptyIndex;
      } else {
        // Second priority: The currently active slot IF not fixed
        const currentActiveIndex = slots.findIndex(s => s.isCurrent && !s.isFixed);
        if (currentActiveIndex !== -1) {
          targetIndex = currentActiveIndex;
        } else {
          // Third priority: Oldest slot that is not fixed
          const unfixedSlots = slots
            .map((s, idx) => ({ ...s, originalIdx: idx }))
            .filter(s => !s.isFixed);

          if (unfixedSlots.length > 0) {
            unfixedSlots.sort((a, b) => a.updatedAt - b.updatedAt);
            targetIndex = unfixedSlots[0].originalIdx;
          } else {
            // If all 3 slots are fixed, overwrite slot 0
            targetIndex = 0;
          }
        }
      }
    }
  }

  // Update target slot
  slots.forEach((s, idx) => {
    s.isCurrent = (idx === targetIndex);
  });

  slots[targetIndex] = {
    slotIndex: targetIndex,
    deckId: newDeckId,
    title: deckName,
    cardCount,
    isFixed: slots[targetIndex].isFixed || false,
    isCurrent: true,
    isExam,
    mode: isExam ? 'exam' : 'normal',
    deckData,
    updatedAt: Date.now()
  };

  saveLocalSlots(slots);

  // Save to active game session
  if (isExam) {
    localStorage.setItem('flashcardsExam', JSON.stringify(deckData));
    localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
  } else {
    localStorage.setItem(SAVE_KEY, JSON.stringify(deckData));
    localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
  }

  // Trigger cloud sync
  syncSlotsToCloud();

  return targetIndex;
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

    // If deck was shared, mark share as deleted in Firestore
    if (shareSlug) {
      try {
        updateDoc(doc(db, 'shares', shareSlug), { deleted: true, deletedAt: Date.now() }).catch(() => {});
      } catch (e) {}
    }

    const now = Date.now();
    slots[slotIndex] = {
      slotIndex,
      deckId: null,
      shareSlug: null,
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
      localStorage.removeItem(ACTIVE_MODE_KEY);
    } else if (isExam) {
      try {
        const savedExam = JSON.parse(localStorage.getItem('flashcardsExam') || '{}');
        if (savedExam?.deckId === targetDeckId) {
          localStorage.removeItem('flashcardsExam');
        }
      } catch (e) {}
    }

    saveLocalSlots(slots);
    syncSlotsToCloud();
  }
}

/**
 * Clear notebook slot
 */
export function clearNotebookSlot() {
  const now = Date.now();
  localStorage.removeItem(NOTEBOOK_KEY);
  localStorage.setItem('flashcards_notebook_deleted_at', String(now));
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
    throw new Error('O arquivo não possui o formato esperado de backup de caderno.');
  }

  if (cards.length === 0) {
    throw new Error('O arquivo está vazio ou não contém cartões válidos.');
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

  localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(notebookState));
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
    localStorage.setItem('flashcards_pomodoro_settings', JSON.stringify(cloudSettings.pomodoroSettings));
    changed = true;
  }
  if (cloudSettings.notificationsSettings && typeof cloudSettings.notificationsSettings === 'object') {
    localStorage.setItem('flashcards_notifications_settings', JSON.stringify(cloudSettings.notificationsSettings));
    changed = true;
  }
  if (cloudSettings.pinnedStatsDeck && Array.isArray(cloudSettings.pinnedStatsDeck)) {
    localStorage.setItem('flashcards_header_pinned_stats_deck', JSON.stringify(cloudSettings.pinnedStatsDeck));
    localStorage.setItem('flashcards_header_pinned_stats', JSON.stringify(cloudSettings.pinnedStatsDeck));
    changed = true;
  }
  if (cloudSettings.pinnedStatsNotebook && Array.isArray(cloudSettings.pinnedStatsNotebook)) {
    localStorage.setItem('flashcards_header_pinned_stats_notebook', JSON.stringify(cloudSettings.pinnedStatsNotebook));
    changed = true;
  }
  if (cloudSettings.aiCategories && typeof cloudSettings.aiCategories === 'object') {
    let localCategories = {};
    try {
      const raw = localStorage.getItem('flashcards_ai_categories');
      if (raw) localCategories = JSON.parse(raw);
    } catch (e) {}
    const mergedCategories = { ...localCategories, ...cloudSettings.aiCategories };
    localStorage.setItem('flashcards_ai_categories', JSON.stringify(mergedCategories));
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
 * Synchronize slots, settings, daily streak, and user progress to Firestore via Backend Admin API
 */
export async function syncSlotsToCloud() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  const user = auth.currentUser;
  if (!user) return;

  // Crucial: Cloud sync is exclusively for Pro users. Non-pro users use only local storage.
  if (!isUserPro()) {
    return;
  }

  try {
    const slots = getLocalSlots();

    // Keep active slot updated with the latest normal game session or exam session if active
    const activeMode = localStorage.getItem(ACTIVE_MODE_KEY) || 'normal';
    const activeSave = localStorage.getItem(SAVE_KEY);
    const activeExam = localStorage.getItem('flashcardsExam');

    if (activeMode === 'normal' && activeSave) {
      try {
        const parsedSave = JSON.parse(activeSave);
        let currentSlotIndex = slots.findIndex(s => s.isCurrent && !s.isExam);
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isCurrent);
        if (currentSlotIndex !== -1 && slots[currentSlotIndex]) {
          slots[currentSlotIndex].deckData = parsedSave;
          slots[currentSlotIndex].cardCount = (parsedSave.allQuestions || []).length;
          slots[currentSlotIndex].title = parsedSave.deckTitle || slots[currentSlotIndex].title;
          slots[currentSlotIndex].isExam = false;
          slots[currentSlotIndex].mode = 'normal';
          slots[currentSlotIndex].updatedAt = Date.now();
          saveLocalSlots(slots);
        }
      } catch (e) {}
    } else if (activeMode === 'exam' && activeExam) {
      try {
        const parsedExam = JSON.parse(activeExam);
        let currentSlotIndex = slots.findIndex(s => s.isCurrent && (s.isExam || s.mode === 'exam'));
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isExam || s.mode === 'exam');
        if (currentSlotIndex === -1) currentSlotIndex = slots.findIndex(s => s.isCurrent);
        if (currentSlotIndex !== -1 && slots[currentSlotIndex]) {
          slots[currentSlotIndex].deckData = parsedExam;
          slots[currentSlotIndex].cardCount = (parsedExam.allQuestions || []).length;
          slots[currentSlotIndex].title = parsedExam.deckTitle || slots[currentSlotIndex].title || 'Semana de Provas';
          slots[currentSlotIndex].isExam = true;
          slots[currentSlotIndex].mode = 'exam';
          slots[currentSlotIndex].updatedAt = Date.now();
          saveLocalSlots(slots);
        } else {
          // No slot allocated for this exam mix yet: allocate one
          openDeckInSlots(parsedExam, parsedExam.deckTitle || 'Semana de Provas', 'exam');
          return;
        }
      } catch (e) {}
    }

    // Attach deletion timestamps if slot is empty
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].deckData) {
        const delAt = Number(localStorage.getItem(`flashcards_slot_${i}_deleted_at`)) || slots[i].deletedAt || slots[i].updatedAt || 0;
        slots[i].deletedAt = delAt;
      }
    }

    const localNotebook = getNotebookSlotData();
    const notebookDeletedAt = Number(localStorage.getItem('flashcards_notebook_deleted_at')) || 0;
    const notebookPayload = localNotebook?.deckData ? {
      title: 'Caderno',
      cardCount: localNotebook.cardCount || 0,
      deckData: localNotebook.deckData,
      updatedAt: localNotebook.deckData.updatedAt || Date.now()
    } : {
      title: 'Caderno',
      cardCount: 0,
      deckData: null,
      deletedAt: notebookDeletedAt
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

    await saveCloudSlots({
      slots,
      notebookData: notebookPayload,
      stats,
      settings,
      dailyStreak,
      activeMode
    });
  } catch (err) {
    console.warn('Erro ao sincronizar com nuvem via backend:', err);
  }
}

/**
 * Load cloud slots when user logs in on a device
 */
export async function loadSlotsFromCloud() {
  const user = auth.currentUser;
  if (!user) return false;

  // Crucial: Only load from cloud if user is PRO! Non-pro users use local-only webapp features.
  if (!isUserPro()) {
    return false;
  }

  try {
    const cloudData = await getCloudSlots();
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
            // Cloud has an active deck or exam mix: load if local is empty or cloud is newer/equal
            if (!localSlot?.deckData || cloudUpdatedAt >= localUpdatedAt) {
              const isExam = Boolean(cloudSlot.isExam || cloudSlot.mode === 'exam' || (cloudSlot.deckData && cloudSlot.deckData.decks));
              localSlots[i] = {
                slotIndex: i,
                deckId: cloudSlot.deckId,
                title: cloudSlot.title,
                cardCount: cloudSlot.cardCount,
                isFixed: Boolean(cloudSlot.isFixed),
                isCurrent: Boolean(cloudSlot.isCurrent),
                isExam,
                mode: isExam ? 'exam' : 'normal',
                deckData: cloudSlot.deckData,
                updatedAt: cloudUpdatedAt
              };
              localStorage.removeItem(`flashcards_slot_${i}_deleted_at`);
              hasSlotChanges = true;

              if (cloudSlot.isCurrent) {
                if (isExam) {
                  localStorage.setItem('flashcardsExam', JSON.stringify(cloudSlot.deckData));
                  localStorage.setItem(ACTIVE_MODE_KEY, 'exam');
                } else {
                  localStorage.setItem(SAVE_KEY, JSON.stringify(cloudSlot.deckData));
                  localStorage.setItem(ACTIVE_MODE_KEY, 'normal');
                }
              }
            }
          } else {
            // Cloud slot is EMPTY or DELETED: propagate deletion if local has a deck/mix!
            if (localSlot?.deckData && cloudDeletedAt >= localUpdatedAt) {
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

      if (hasSlotChanges) {
        saveLocalSlots(localSlots);
      }
    } else {
      // If cloud has no slots yet, but local device has decks or exam or notebook, push local to cloud!
      const hasLocalDecks = localSlots.some(s => s.deckData);
      const localNotebook = getNotebookSlotData();
      const hasLocalExam = Boolean(localStorage.getItem('flashcardsExam'));
      if (hasLocalDecks || localNotebook?.deckData || hasLocalExam) {
        await syncSlotsToCloud();
      }
    }

    // Load cloud notebook or propagate notebook deletion
    const localNotebook = getNotebookSlotData();
    const localNotebookUpdated = localNotebook?.deckData?.updatedAt || 0;

    if (cloudData.notebookSlot?.deckData) {
      const cloudNotebookUpdated = cloudData.notebookSlot.deckData.updatedAt || cloudData.notebookSlot.updatedAt || cloudData.lastSyncedAt || 0;
      if (!localNotebook?.deckData || cloudNotebookUpdated >= localNotebookUpdated) {
        localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(cloudData.notebookSlot.deckData));
        localStorage.removeItem('flashcards_notebook_deleted_at');
        hasSlotChanges = true;
      }
    } else if (localNotebook?.deckData) {
      // Cloud notebook is deleted/empty: check deletion timestamp
      const cloudNotebookDeletedAt = cloudData.notebookSlot?.deletedAt || cloudData.lastSyncedAt || 0;
      if (cloudNotebookDeletedAt >= localNotebookUpdated) {
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
        localStorage.setItem('flashcards_daily_streak', JSON.stringify(mergedStreak));
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
        localStorage.setItem('flashcards_stats', JSON.stringify(mergedStats));
        localStorage.setItem('flashcardsStats', JSON.stringify(mergedStats));
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
      if (!currentActive) {
        localStorage.setItem(ACTIVE_MODE_KEY, cloudData.activeMode);
        hasSlotChanges = true;
      }
    }

    // Broadcast sync update event across page
    try {
      window.dispatchEvent(new CustomEvent('flashcards:sync-updated', {
        detail: {
          hasChanges: hasSlotChanges,
          lastSyncedAt: cloudData.lastSyncedAt || Date.now()
        }
      }));
    } catch (e) {}

    return hasSlotChanges;
  } catch (e) {
    console.warn('Erro ao carregar slots da nuvem:', e);
    return false;
  }
}
