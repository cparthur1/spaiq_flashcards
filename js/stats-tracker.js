/**
 * stats-tracker.js
 * Tracks real-time session progress, card-level accuracy, response times,
 * Anki ratings distribution, streaks, and historical study sessions.
 */

import { getCardSignature, getStoredAiCategories } from './stats-ai.js';
import { stripHtml, encodeStoragePayload } from './utils.js';
import { debouncedSyncSlotsToCloud } from './slot-manager.js';

const STATS_KEY = 'flashcards_stats';

export function getStatsStorage() {
    try {
        const raw = localStorage.getItem(STATS_KEY);
        if (!raw) {
            return {
                currentSession: null,
                history: [],
                allTime: {
                    totalSessions: 0,
                    totalCardsAnswered: 0,
                    totalCorrect: 0,
                    totalTimeSeconds: 0,
                    bestStreakAllTime: 0
                }
            };
        }
        const parsed = JSON.parse(raw);
        if (!parsed.history) parsed.history = [];
        if (!parsed.allTime) {
            parsed.allTime = {
                totalSessions: parsed.history.length,
                totalCardsAnswered: 0,
                totalCorrect: 0,
                totalTimeSeconds: 0,
                bestStreakAllTime: 0
            };
        }
        return parsed;
    } catch (e) {
        console.error("Erro ao carregar flashcards_stats:", e);
        return {
            currentSession: null,
            history: [],
            allTime: { totalSessions: 0, totalCardsAnswered: 0, totalCorrect: 0, totalTimeSeconds: 0, bestStreakAllTime: 0 }
        };
    }
}

export function saveStatsStorage(data) {
    try {
        if (data && typeof data === 'object') {
            data.updatedAt = Date.now();
        }
        const json = encodeStoragePayload(data);
        localStorage.setItem(STATS_KEY, json);
        localStorage.setItem('flashcardsStats', json);
        debouncedSyncSlotsToCloud();
    } catch (e) {
        console.error("Erro ao salvar flashcards_stats:", e);
    }
}

/**
 * Initializes or restores the active session.
 * @param {string} deckTitle - Deck title
 * @param {string} mode - Game mode ('normal', 'notebook', 'exam')
 * @param {number} totalCards - Total playable cards in deck
 * @param {number} currentScore - Initial score if restoring
 * @param {boolean} forceNew - Force starting a new session (e.g. on restart)
 */
export function initStatsSession(deckTitle, mode = 'normal', totalCards = 0, currentScore = 0, forceNew = false) {
    const data = getStatsStorage();
    const now = Date.now();
    const title = deckTitle || 'Flashcards';

    if (data.currentSession) {
        const sess = data.currentSession;
        const isSameDeck = sess.deckTitle === title && sess.mode === mode;
        const timeSinceActive = now - (sess.lastActiveTime || sess.startTime);
        const isInactiveOverdue = timeSinceActive > 3600 * 1000; // 1 hour

        // If not forcing a new session, same deck, not overdue, and NOT already completed, continue it
        if (!forceNew && isSameDeck && !isInactiveOverdue && !sess.completed) {
            sess.totalCardsInDeck = totalCards || sess.totalCardsInDeck || 0;
            sess.lastActiveTime = now;
            saveStatsStorage(data);
            return sess;
        }

        // Archive previous session if it had answered cards
        if (sess.cardsAnswered > 0) {
            archiveSessionInternal(data, Boolean(sess.completed));
        } else {
            data.currentSession = null;
        }
    }

    // Start fresh session
    const newSession = {
        id: 'sess_' + now,
        deckTitle: title,
        mode: mode,
        startTime: now,
        lastActiveTime: now,
        durationSeconds: 0,
        activeDurationSeconds: 0,
        activeCardsCount: 0,
        totalCardsInDeck: totalCards,
        cardsAnswered: currentScore > 0 ? currentScore : 0,
        correctCount: currentScore > 0 ? currentScore : 0,
        incorrectCount: 0,
        accuracy: 100,
        currentStreak: 0,
        bestStreak: 0,
        ankiRatings: { again: 0, hard: 0, good: 0, easy: 0 },
        byType: {
            open: { total: 0, correct: 0 },
            open_double: { total: 0, correct: 0 },
            multiple_choice: { total: 0, correct: 0 },
            fill: { total: 0, correct: 0 },
            flowchart: { total: 0, correct: 0 },
            anki: { total: 0, correct: 0 }
        },
        byTopic: {},
        cardAnswers: {},
        answersLog: [],
        strugglingCards: {},
        completed: false
    };

    data.currentSession = newSession;
    saveStatsStorage(data);
    console.log("[StatsTracker] Nova sessão de estatísticas iniciada:", {
        id: newSession.id,
        deck: newSession.deckTitle,
        mode: newSession.mode,
        totalCards: newSession.totalCardsInDeck
    });
    return newSession;
}

/**
 * Records an answered question in real-time.
 */
export function recordStatsAnswer({ card, isCorrect, rating, timeSpentSeconds, userAnswer }) {
    if (!card) return;
    try {
        let data = getStatsStorage();
        const now = Date.now();

        if (!data.currentSession || data.currentSession.completed) {
            console.log("[StatsTracker] Sessão ausente ou já concluída. Inicializando nova sessão...");
            initStatsSession(data.currentSession?.deckTitle || "Flashcards", data.currentSession?.mode || "normal", 0, 0, true);
            data = getStatsStorage();
        }

        const sess = data.currentSession;
        if (!sess) {
            console.warn("[StatsTracker] Falha ao recuperar currentSession para registrar resposta.");
            return;
        }
        sess.lastActiveTime = now;

    // Time clamping: reasonable 1s - 180s range per card
    const validTime = Math.max(1, Math.min(180, Math.round(timeSpentSeconds || 5)));
    sess.durationSeconds = (sess.durationSeconds || 0) + validTime;

    // Disconsider cards taking longer than 90s (breaks / idle) for average pace calculation
    if (validTime <= 90) {
        sess.activeDurationSeconds = (sess.activeDurationSeconds || 0) + validTime;
        sess.activeCardsCount = (sess.activeCardsCount || 0) + 1;
    }

    // Handle Anki specifics
    if (card.type === 'anki' && rating) {
        if (!sess.ankiRatings) sess.ankiRatings = { again: 0, hard: 0, good: 0, easy: 0 };
        sess.ankiRatings[rating] = (sess.ankiRatings[rating] || 0) + 1;
        isCorrect = rating === 'good' || rating === 'easy';
    }

    sess.cardsAnswered = (sess.cardsAnswered || 0) + 1;

    if (isCorrect) {
        sess.correctCount = (sess.correctCount || 0) + 1;
        sess.currentStreak = (sess.currentStreak || 0) + 1;
        if (sess.currentStreak > sess.bestStreak) {
            sess.bestStreak = sess.currentStreak;
        }
        if (sess.bestStreak > (data.allTime.bestStreakAllTime || 0)) {
            data.allTime.bestStreakAllTime = sess.bestStreak;
        }
    } else {
        sess.incorrectCount = (sess.incorrectCount || 0) + 1;
        sess.currentStreak = 0;
    }

    sess.accuracy = sess.cardsAnswered > 0
        ? Math.round((sess.correctCount / sess.cardsAnswered) * 100)
        : 100;

    // Question type tracking
    const typeKey = card.type === 'anki' ? 'anki'
        : card.type === 'multiple_choice' ? 'multiple_choice'
        : card.type === 'open_double' ? 'open_double'
        : card.type === 'fill' ? 'fill'
        : card.type === 'flowchart' ? 'flowchart'
        : 'open';

    if (!sess.byType) {
        sess.byType = {
            open: { total: 0, correct: 0 },
            open_double: { total: 0, correct: 0 },
            multiple_choice: { total: 0, correct: 0 },
            fill: { total: 0, correct: 0 },
            flowchart: { total: 0, correct: 0 },
            anki: { total: 0, correct: 0 }
        };
    }
    if (!sess.byType[typeKey]) sess.byType[typeKey] = { total: 0, correct: 0 };
    sess.byType[typeKey].total++;
    if (isCorrect) sess.byType[typeKey].correct++;

    // Topic & Card Signature Tracking
    const sig = getCardSignature(card);
    const cleanCardDesc = stripHtml(card.description || '');
    const cleanCardAns = stripHtml(card.answer || '');

    let cardTopic = card.topic || card.aiTopic;
    if (!cardTopic && sig) {
        try {
            const categories = getStoredAiCategories();
            cardTopic = categories?.cardTopicsBySignature?.[sig] || "Geral";
        } catch (_) {
            cardTopic = "Geral";
        }
    }
    if (!cardTopic) cardTopic = "Geral";

    if (!sess.byTopic) sess.byTopic = {};
    if (!sess.byTopic[cardTopic]) sess.byTopic[cardTopic] = { total: 0, correct: 0 };
    sess.byTopic[cardTopic].total++;
    if (isCorrect) sess.byTopic[cardTopic].correct++;

    if (!sess.cardAnswers) sess.cardAnswers = {};
    if (sig) {
        if (!sess.cardAnswers[sig]) {
            sess.cardAnswers[sig] = {
                answered: 1,
                correct: isCorrect ? 1 : 0,
                isCorrect: !!isCorrect,
                topic: cardTopic,
                rating: rating || (isCorrect ? 'correct' : 'incorrect')
            };
        } else {
            sess.cardAnswers[sig].answered++;
            if (isCorrect) sess.cardAnswers[sig].correct++;
            sess.cardAnswers[sig].isCorrect = !!isCorrect;
            sess.cardAnswers[sig].topic = cardTopic;
            sess.cardAnswers[sig].rating = rating || (isCorrect ? 'correct' : 'incorrect');
        }
    }

    // Answers Log
    if (!sess.answersLog) sess.answersLog = [];
    sess.answersLog.push({
        sig: sig,
        topic: cardTopic,
        question: cleanCardDesc.slice(0, 140),
        type: typeKey,
        isCorrect: !!isCorrect,
        rating: rating || (isCorrect ? 'correct' : 'incorrect'),
        timeSeconds: validTime,
        userAnswer: (userAnswer || '').slice(0, 100),
        expectedAnswer: cleanCardAns.slice(0, 100),
        timestamp: now
    });
    if (sess.answersLog.length > 150) sess.answersLog.shift();

    // Struggling cards tracking
    if (!sess.strugglingCards) sess.strugglingCards = {};
    const cardKey = card.description || `card_${now}`;
    const isIgnored = sess.ignoredStrugglingKeys && sess.ignoredStrugglingKeys.includes(cardKey);
    if (!isIgnored) {
        if (!isCorrect || rating === 'again' || rating === 'hard') {
            if (!sess.strugglingCards[cardKey]) {
                sess.strugglingCards[cardKey] = {
                    description: card.description || '',
                    answer: card.answer || '',
                    answer2: card.answer2 || '',
                    type: typeKey,
                    aiTopic: card.aiTopic || '',
                    aiSubject: card.aiSubject || '',
                    incorrectCount: 1,
                    correctCount: 0,
                    lastRating: rating || 'incorrect',
                    lastAttempt: now
                };
            } else {
                sess.strugglingCards[cardKey].incorrectCount++;
                sess.strugglingCards[cardKey].lastRating = rating || 'incorrect';
                sess.strugglingCards[cardKey].lastAttempt = now;
            }
        } else if (isCorrect && sess.strugglingCards[cardKey]) {
            sess.strugglingCards[cardKey].correctCount++;
        }
    }

    // Update global all-time stats
    data.allTime.totalCardsAnswered = (data.allTime.totalCardsAnswered || 0) + 1;
    if (isCorrect) data.allTime.totalCorrect = (data.allTime.totalCorrect || 0) + 1;
    data.allTime.totalTimeSeconds = (data.allTime.totalTimeSeconds || 0) + validTime;

    saveStatsStorage(data);
        console.log("[StatsTracker] Resposta gravada com sucesso:", {
            card: (card.description || '').slice(0, 35),
            isCorrect: !!isCorrect,
            rating: rating || (isCorrect ? 'correct' : 'incorrect'),
            timeSeconds: validTime,
            cardsAnswered: sess.cardsAnswered
        });
    } catch (err) {
        console.error("[StatsTracker] Erro ao gravar estatística da resposta:", err);
    }
}

/**
 * Updates stats when an answer previously evaluated as incorrect is accepted by the AI.
 */
export function recordStatsAiCorrection({ card, explanation, currentStreak }) {
    if (!card) return;
    try {
        const data = getStatsStorage();
        const sess = data.currentSession;
        if (!sess) {
            console.warn("[StatsTracker] Impossível aplicar correção de IA: currentSession inexistente.");
            return;
        }

        const now = Date.now();
        sess.lastActiveTime = now;

        // 1. Inverte a contagem de erro para acerto
        sess.incorrectCount = Math.max(0, (sess.incorrectCount || 0) - 1);
        sess.correctCount = (sess.correctCount || 0) + 1;

        // 2. Recalcula acurácia da sessão
        sess.accuracy = sess.cardsAnswered > 0
            ? Math.round((sess.correctCount / sess.cardsAnswered) * 100)
            : 100;

        // 3. Atualiza streak da sessão
        if (typeof currentStreak === 'number') {
            sess.currentStreak = currentStreak;
        } else {
            sess.currentStreak = (sess.currentStreak || 0) + 1;
        }
        if (sess.currentStreak > (sess.bestStreak || 0)) {
            sess.bestStreak = sess.currentStreak;
        }
        if (sess.bestStreak > (data.allTime.bestStreakAllTime || 0)) {
            data.allTime.bestStreakAllTime = sess.bestStreak;
        }

        // 4. Atualiza acertos no tipo da questão
        const typeKey = card.type === 'anki' ? 'anki'
            : card.type === 'multiple_choice' ? 'multiple_choice'
            : card.type === 'open_double' ? 'open_double'
            : card.type === 'fill' ? 'fill'
            : card.type === 'flowchart' ? 'flowchart'
            : 'open';

        if (sess.byType && sess.byType[typeKey]) {
            sess.byType[typeKey].correct = (sess.byType[typeKey].correct || 0) + 1;
        }

        // 5. Atualiza o registro em answersLog
        if (sess.answersLog && sess.answersLog.length > 0) {
            const cardDescShort = (card.description || '').slice(0, 120);
            let targetLog = null;
            for (let i = sess.answersLog.length - 1; i >= 0; i--) {
                const entry = sess.answersLog[i];
                if (entry.question === cardDescShort || (entry.question && card.description && card.description.includes(entry.question))) {
                    targetLog = entry;
                    break;
                }
            }
            if (!targetLog) {
                targetLog = sess.answersLog[sess.answersLog.length - 1];
            }

            if (targetLog) {
                targetLog.isCorrect = true;
                targetLog.rating = 'ai_corrected';
                targetLog.aiExplanation = explanation || 'Aceito pela IA como resposta válida';
            }
        }

        // 6. Atualiza strugglingCards (remove ou decrementa)
        if (sess.strugglingCards) {
            const cardKey = card.description || '';
            if (sess.strugglingCards[cardKey]) {
                const sc = sess.strugglingCards[cardKey];
                sc.incorrectCount = Math.max(0, (sc.incorrectCount || 1) - 1);
                sc.correctCount = (sc.correctCount || 0) + 1;
                sc.lastRating = 'ai_corrected';
                if (sc.incorrectCount === 0) {
                    delete sess.strugglingCards[cardKey];
                }
            }
        }

        // 7. Atualiza total histórico acumulado
        data.allTime.totalCorrect = (data.allTime.totalCorrect || 0) + 1;

        saveStatsStorage(data);
        console.log("[StatsTracker] Correção da IA registrada com sucesso nas estatísticas:", {
            card: (card.description || '').slice(0, 35),
            correctCount: sess.correctCount,
            incorrectCount: sess.incorrectCount,
            accuracy: sess.accuracy + '%',
            streak: sess.currentStreak
        });
    } catch (err) {
        console.error("[StatsTracker] Erro ao registrar correção da IA:", err);
    }
}

function archiveSessionInternal(data, completed = false) {
    if (!data.currentSession || data.currentSession.cardsAnswered === 0) {
        data.currentSession = null;
        return;
    }
    const sess = data.currentSession;
    sess.completed = completed || sess.completed || false;
    sess.endTime = sess.endTime || Date.now();
    if (!sess.durationSeconds && sess.startTime) {
        sess.durationSeconds = Math.max(1, Math.round((sess.endTime - sess.startTime) / 1000));
    }
    sess.aiCorrectionsCount = (sess.answersLog || []).filter(e => e.rating === 'ai_corrected').length;

    const existingIdx = (data.history || []).findIndex(h => h.id === sess.id);
    if (existingIdx >= 0) {
        data.history[existingIdx] = { ...sess };
    } else {
        data.history.unshift({ ...sess });
        if (data.history.length > 50) data.history.pop();
        data.allTime.totalSessions = (data.allTime.totalSessions || 0) + 1;
    }
    data.currentSession = null;
}

/**
 * Marks current session as completed and persists summary metrics without setting currentSession to null.
 * This ensures that when the user finishes a deck and opens the stats page, the completed session
 * remains fully accessible and rich in details.
 */
export function completeCurrentSession() {
    const data = getStatsStorage();
    if (!data.currentSession) return null;
    const sess = data.currentSession;
    sess.completed = true;
    sess.endTime = Date.now();
    sess.durationSeconds = Math.max(1, Math.round((sess.endTime - sess.startTime) / 1000));

    // Calculate active duration excluding study breaks (>90s)
    if (sess.answersLog && sess.answersLog.length > 0) {
        const validTimes = sess.answersLog.filter(e => typeof e.timeSeconds === 'number' && e.timeSeconds <= 90);
        if (validTimes.length > 0) {
            sess.activeDurationSeconds = validTimes.reduce((acc, e) => acc + e.timeSeconds, 0);
            sess.activeCardsCount = validTimes.length;
        }
    }

    // Count AI corrections
    sess.aiCorrectionsCount = (sess.answersLog || []).filter(e => e.rating === 'ai_corrected').length;

    // Put / update a copy in history
    const existingIdx = (data.history || []).findIndex(h => h.id === sess.id);
    if (existingIdx >= 0) {
        data.history[existingIdx] = { ...sess };
    } else {
        data.history.unshift({ ...sess });
        if (data.history.length > 50) data.history.pop();
        data.allTime.totalSessions = (data.allTime.totalSessions || 0) + 1;
    }

    saveStatsStorage(data);
    console.log("[StatsTracker] Sessão concluída com sucesso:", {
        deck: sess.deckTitle,
        cards: sess.cardsAnswered,
        accuracy: sess.accuracy + '%',
        aiCorrections: sess.aiCorrectionsCount,
        duration: sess.durationSeconds + 's'
    });
    return sess;
}

/**
 * Archives current session and saves storage.
 */
export function archiveCurrentSession(completed = false) {
    const data = getStatsStorage();
    archiveSessionInternal(data, completed);
    saveStatsStorage(data);
}

/**
 * Resets all stats or resets only the current session.
 */
export function resetAllStats() {
    localStorage.removeItem(STATS_KEY);
}

/**
 * Injects realistic sample history sessions if history is empty (useful for previews).
 */
export function injectSampleHistory(deckTitle = "Flashcards") {
    const data = getStatsStorage();
    const now = Date.now();
    const day = 24 * 3600 * 1000;

    const samples = [
        {
            id: 'sess_' + (now - 3 * day),
            deckTitle: deckTitle,
            mode: 'normal',
            startTime: now - 3 * day,
            endTime: now - 3 * day + 600 * 1000,
            durationSeconds: 600,
            activeDurationSeconds: 600,
            activeCardsCount: 40,
            totalCardsInDeck: 40,
            cardsAnswered: 40,
            correctCount: 28,
            incorrectCount: 12,
            accuracy: 70,
            currentStreak: 4,
            bestStreak: 6,
            ankiRatings: { again: 5, hard: 7, good: 16, easy: 12 },
            byType: {
                open: { total: 15, correct: 9 },
                open_double: { total: 5, correct: 3 },
                multiple_choice: { total: 10, correct: 8 },
                anki: { total: 10, correct: 8 }
            },
            completed: true
        },
        {
            id: 'sess_' + (now - 2 * day),
            deckTitle: deckTitle,
            mode: 'normal',
            startTime: now - 2 * day,
            endTime: now - 2 * day + 720 * 1000,
            durationSeconds: 720,
            activeDurationSeconds: 720,
            activeCardsCount: 40,
            totalCardsInDeck: 40,
            cardsAnswered: 40,
            correctCount: 32,
            incorrectCount: 8,
            accuracy: 80,
            currentStreak: 7,
            bestStreak: 9,
            ankiRatings: { again: 3, hard: 5, good: 18, easy: 14 },
            byType: {
                open: { total: 15, correct: 11 },
                open_double: { total: 5, correct: 4 },
                multiple_choice: { total: 10, correct: 9 },
                anki: { total: 10, correct: 8 }
            },
            completed: true
        },
        {
            id: 'sess_' + (now - 1 * day),
            deckTitle: deckTitle,
            mode: 'normal',
            startTime: now - 1 * day,
            endTime: now - 1 * day + 540 * 1000,
            durationSeconds: 540,
            activeDurationSeconds: 540,
            activeCardsCount: 40,
            totalCardsInDeck: 40,
            cardsAnswered: 40,
            correctCount: 36,
            incorrectCount: 4,
            accuracy: 90,
            currentStreak: 12,
            bestStreak: 12,
            ankiRatings: { again: 1, hard: 3, good: 20, easy: 16 },
            byType: {
                open: { total: 15, correct: 13 },
                open_double: { total: 5, correct: 5 },
                multiple_choice: { total: 10, correct: 9 },
                anki: { total: 10, correct: 9 }
            },
            completed: true
        }
    ];

    data.history = samples;
    data.allTime.totalSessions = samples.length;
    data.allTime.totalCardsAnswered = 120;
    data.allTime.totalCorrect = 96;
    data.allTime.totalTimeSeconds = 1860;
    data.allTime.bestStreakAllTime = 12;

    saveStatsStorage(data);
    return data;
}

/**
 * Retorna as métricas em tempo real da sessão atual para os indicadores do cabeçalho.
 * @returns {{
 *   cardsAnswered: number,
 *   correctCount: number,
 *   incorrectCount: number,
 *   accuracy: number,
 *   durationSeconds: number,
 *   activeDurationSeconds: number,
 *   activeCardsCount: number,
 *   avgTimePerCardSeconds: number,
 *   startTime: number
 * }}
 */
export function getCardsAnsweredForDate(targetDateStr) {
    try {
        const data = getStatsStorage();
        const deduped = new Map();
        const addSess = (s) => {
            if (!s || typeof s !== 'object') return;
            const key = s.id || (s.startTime ? `sess_${s.startTime}` : null);
            if (!key) return;
            const prev = deduped.get(key);
            if (!prev || (Number(s.cardsAnswered) || 0) >= (Number(prev.cardsAnswered) || 0)) {
                deduped.set(key, s);
            }
        };
        if (Array.isArray(data.history)) data.history.forEach(addSess);
        if (data.currentSession) addSess(data.currentSession);

        let sum = 0;
        for (const s of deduped.values()) {
            const ts = s.lastActiveTime || s.endTime || s.startTime;
            if (!ts) continue;
            const d = new Date(ts);
            if (isNaN(d.getTime())) continue;
            const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (dStr === targetDateStr) {
                sum += Number(s.cardsAnswered) || 0;
            }
        }
        return sum;
    } catch (_) {
        return 0;
    }
}

export function getCurrentSessionMetrics() {
    try {
        const data = getStatsStorage();
        const sess = data?.currentSession;
        if (!sess) {
            return {
                cardsAnswered: 0,
                correctCount: 0,
                incorrectCount: 0,
                accuracy: 100,
                durationSeconds: 0,
                activeDurationSeconds: 0,
                activeCardsCount: 0,
                avgTimePerCardSeconds: 0,
                startTime: Date.now()
            };
        }
        const avgTime = sess.activeCardsCount > 0
            ? (sess.activeDurationSeconds / sess.activeCardsCount)
            : (sess.cardsAnswered > 0 ? (sess.durationSeconds / sess.cardsAnswered) : 0);
        return {
            cardsAnswered: sess.cardsAnswered || 0,
            correctCount: sess.correctCount || 0,
            incorrectCount: sess.incorrectCount || 0,
            accuracy: sess.accuracy ?? 100,
            durationSeconds: sess.durationSeconds || 0,
            activeDurationSeconds: sess.activeDurationSeconds || 0,
            activeCardsCount: sess.activeCardsCount || 0,
            avgTimePerCardSeconds: avgTime,
            startTime: sess.startTime || Date.now()
        };
    } catch (e) {
        return {
            cardsAnswered: 0,
            correctCount: 0,
            incorrectCount: 0,
            accuracy: 100,
            durationSeconds: 0,
            activeDurationSeconds: 0,
            activeCardsCount: 0,
            avgTimePerCardSeconds: 0,
            startTime: Date.now()
        };
    }
}
