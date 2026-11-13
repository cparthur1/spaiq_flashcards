/**
 * js/engine/notebook-scheduler.js
 * Módulo puro de repetição espaçada contínua (SRS), cálculo adaptativo de intervalos
 * em dias e passos de sessão, inferência automática de dificuldade e rastreador
 * de streak diário consecutivo de estudo.
 *
 * Especializado para o Caderno (baralho único e massivo para revisão de longo prazo).
 */

import { secureRandom, stripHtml } from '../utils.js';
import { isLeechCard } from './scheduler.js';
import { debouncedSyncSlotsToCloud } from '../slot-manager.js';
import { t } from '../i18n.js';

const DAILY_STREAK_KEY = 'flashcards_daily_streak';
const MAX_FREEZES = 2;

/**
 * Converte data 'YYYY-MM-DD' para número absoluto de dias (UTC).
 * @param {string} dateStr 
 * @returns {number|null}
 */
export function parseDateToDays(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
}

/**
 * Calcula a diferença em dias entre duas datas (dateStrA - dateStrB).
 * @param {string} dateStrA 
 * @param {string} dateStrB 
 * @returns {number}
 */
export function diffInDays(dateStrA, dateStrB) {
    const a = parseDateToDays(dateStrA);
    const b = parseDateToDays(dateStrB);
    if (a === null || b === null) return 999;
    return a - b;
}

/**
 * Retorna a data local atual formatada como 'YYYY-MM-DD'.
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export function getTodayDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Retorna o dia anterior a uma data 'YYYY-MM-DD'.
 * @param {string} dateStr 
 * @returns {string}
 */
export function getYesterdayDateString(dateStr = getTodayDateString()) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 1);
    return getTodayDateString(date);
}

/**
 * Adiciona N dias a uma data string 'YYYY-MM-DD'.
 * @param {string} dateStr 
 * @param {number} days 
 * @returns {string}
 */
export function addDaysToDateString(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + Math.max(1, Math.round(days)));
    return getTodayDateString(date);
}

/**
 * Obtém os dados persistidos de streak diário e gerencia o Streak Freeze automático.
 * Se o usuário faltou 1 dia mas tem freeze disponível, consome a proteção e salva o streak.
 *
 * @returns {{
 *   streak: number,
 *   isTodayStudied: boolean,
 *   lastStudiedDate: string,
 *   bestStreak: number,
 *   freezesAvailable: number,
 *   frozenDates: string[],
 *   history: Record<string, number>,
 *   streakProtectedByFreeze: boolean
 * }}
 */
export function getDailyStreak() {
    try {
        const raw = localStorage.getItem(DAILY_STREAK_KEY);
        const today = getTodayDateString();

        if (!raw) {
            return {
                streak: 0,
                isTodayStudied: false,
                lastStudiedDate: '',
                bestStreak: 0,
                freezesAvailable: 1, // Usuários novos começam com 1 protetor de cortesia
                frozenDates: [],
                goalMetDates: [],
                history: {},
                streakProtectedByFreeze: false
            };
        }

        let data = JSON.parse(raw);
        let streak = Number(data.streak) || 0;
        let bestStreak = Number(data.bestStreak) || streak;
        let lastDate = String(data.lastStudiedDate || '');
        let freezesAvailable = typeof data.freezesAvailable === 'number' ? data.freezesAvailable : 1;
        let frozenDates = Array.isArray(data.frozenDates) ? [...data.frozenDates] : [];
        let goalMetDates = Array.isArray(data.goalMetDates) ? [...data.goalMetDates] : [];
        let history = (data.history && typeof data.history === 'object') ? data.history : {};
        let streakProtectedByFreeze = false;

        if (lastDate === today) {
            return {
                streak,
                isTodayStudied: true,
                lastStudiedDate: lastDate,
                bestStreak,
                freezesAvailable,
                frozenDates,
                goalMetDates,
                history,
                streakProtectedByFreeze: false
            };
        }

        const diffDays = diffInDays(today, lastDate);

        if (diffDays === 1) {
            // Estudado ontem, streak preservado aguardando o estudo de hoje
            return {
                streak,
                isTodayStudied: false,
                lastStudiedDate: lastDate,
                bestStreak,
                freezesAvailable,
                frozenDates,
                goalMetDates,
                history,
                streakProtectedByFreeze: false
            };
        }

        if (diffDays > 1 && streak > 0) {
            // Dias foram perdidos. Avalia proteção pelo Streak Freeze
            const missedCount = diffDays - 1;
            if (missedCount <= freezesAvailable) {
                // Streak Freeze ativado com sucesso!
                freezesAvailable -= missedCount;
                for (let i = 1; i <= missedCount; i++) {
                    const missedDayStr = addDaysToDateString(lastDate, i);
                    if (!frozenDates.includes(missedDayStr)) {
                        frozenDates.push(missedDayStr);
                    }
                }
                lastDate = getYesterdayDateString(today);
                streakProtectedByFreeze = true;

                // Persiste imediatamente o consumo do freeze
                data.freezesAvailable = freezesAvailable;
                data.frozenDates = frozenDates;
                data.lastStudiedDate = lastDate;
                data.updatedAt = Date.now();
                localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(data));
                debouncedSyncSlotsToCloud();

                return {
                    streak,
                    isTodayStudied: false,
                    lastStudiedDate: lastDate,
                    bestStreak,
                    freezesAvailable,
                    frozenDates,
                    goalMetDates,
                    history,
                    streakProtectedByFreeze: true
                };
            }
        }

        // Streak quebrado por inatividade prolongada sem proteções suficientes
        return {
            streak: 0,
            isTodayStudied: false,
            lastStudiedDate: lastDate,
            bestStreak,
            freezesAvailable,
            frozenDates,
            goalMetDates,
            history,
            streakProtectedByFreeze: false
        };
    } catch (e) {
        console.error("[Notebook SRS] Erro ao ler streak diário:", e);
        return {
            streak: 0,
            isTodayStudied: false,
            lastStudiedDate: '',
            bestStreak: 0,
            freezesAvailable: 1,
            frozenDates: [],
            goalMetDates: [],
            history: {},
            streakProtectedByFreeze: false
        };
    }
}

/**
 * Registra a resolução de um card no dia.
 * Atualiza o histórico diário para o Heatmap, aplica Streak Freeze se necessário,
 * e recompensa +1 proteção a cada 7 dias consecutivos de estudo (limite máx: 2).
 *
 * @returns {{
 *   isFirstCardToday: boolean,
 *   streak: number,
 *   bestStreak: number,
 *   freezesAvailable: number,
 *   frozenDates: string[],
 *   streakProtectedByFreeze: boolean,
 *   freezeAwarded: boolean
 * }}
 */
export function recordDailyCardAnswered() {
    try {
        const today = getTodayDateString();
        const current = getDailyStreak();

        // Incrementa contagem diária no histórico para o Heatmap
        const raw = localStorage.getItem(DAILY_STREAK_KEY);
        let data = {};
        if (raw) {
            try { data = JSON.parse(raw); } catch (e) {}
        }

        let history = (data.history && typeof data.history === 'object') ? data.history : (current.history || {});
        history[today] = (history[today] || 0) + 1;

        if (current.isTodayStudied) {
            // Já havia estudado hoje: apenas atualiza o card count
            data.history = history;
            data.updatedAt = Date.now();
            localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(data));
            debouncedSyncSlotsToCloud();

            return {
                isFirstCardToday: false,
                streak: current.streak,
                bestStreak: current.bestStreak,
                freezesAvailable: current.freezesAvailable,
                frozenDates: current.frozenDates,
                streakProtectedByFreeze: false,
                freezeAwarded: false
            };
        }

        // Primeiro card respondido hoje
        let newStreak = 1;
        const diffDays = diffInDays(today, current.lastStudiedDate);
        let freezesAvailable = typeof current.freezesAvailable === 'number' ? current.freezesAvailable : 1;
        let frozenDates = Array.isArray(current.frozenDates) ? [...current.frozenDates] : [];
        let streakProtectedByFreeze = current.streakProtectedByFreeze || false;
        let freezeAwarded = false;
        let lastFreezeAwardedStreak = Number(data.lastFreezeAwardedStreak) || 0;

        if (diffDays === 1 && current.streak > 0) {
            newStreak = current.streak + 1;
        } else if (diffDays > 1 && current.streak > 0) {
            const missedCount = diffDays - 1;
            if (missedCount <= freezesAvailable) {
                freezesAvailable -= missedCount;
                for (let i = 1; i <= missedCount; i++) {
                    const missedDayStr = addDaysToDateString(current.lastStudiedDate, i);
                    if (!frozenDates.includes(missedDayStr)) {
                        frozenDates.push(missedDayStr);
                    }
                }
                streakProtectedByFreeze = true;
                newStreak = current.streak + 1;
            } else {
                newStreak = 1;
            }
        } else {
            newStreak = 1;
        }

        // Recompensa de Streak Freeze: +1 proteção a cada múltiplo de 7 dias de streak (máx 2)
        if (newStreak % 7 === 0 && newStreak > lastFreezeAwardedStreak && freezesAvailable < MAX_FREEZES) {
            freezesAvailable = Math.min(MAX_FREEZES, freezesAvailable + 1);
            lastFreezeAwardedStreak = newStreak;
            freezeAwarded = true;
        }

        const newBestStreak = Math.max(newStreak, current.bestStreak || 0);

        const payload = {
            streak: newStreak,
            lastStudiedDate: today,
            bestStreak: newBestStreak,
            freezesAvailable,
            frozenDates,
            history,
            lastFreezeAwardedStreak,
            updatedAt: Date.now()
        };

        localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(payload));
        debouncedSyncSlotsToCloud();

        return {
            isFirstCardToday: true,
            streak: newStreak,
            bestStreak: newBestStreak,
            freezesAvailable,
            frozenDates,
            streakProtectedByFreeze,
            freezeAwarded
        };
    } catch (e) {
        console.error("[Notebook SRS] Erro ao salvar streak diário:", e);
        return {
            isFirstCardToday: false,
            streak: 1,
            bestStreak: 1,
            freezesAvailable: 1,
            frozenDates: [],
            streakProtectedByFreeze: false,
            freezeAwarded: false
        };
    }
}

/**
 * Infere a qualidade de resposta (again | hard | good | easy)
 * Para Anki cards: respeita a escolha explícita do usuário.
 * Para outros tipos (open, open_double, multiple_choice, fill): analisa
 * acurácia, histórico prévio de erros e latência de recuperação neurobiológica.
 *
 * @param {Object} params
 * @param {Object} params.card
 * @param {boolean} params.isCorrect
 * @param {number} params.elapsedSeconds
 * @param {string} [params.rating] - Rating explícito do usuário (ex: Anki)
 * @returns {'again' | 'hard' | 'good' | 'easy'}
 */
export function inferNotebookQuality({ card, isCorrect, elapsedSeconds = 2, rating = null }) {
    if (rating && ['again', 'hard', 'good', 'easy'].includes(rating)) {
        return rating;
    }

    if (!isCorrect) {
        return 'again';
    }

    const t = Math.max(0.6, Number(elapsedSeconds) || 2);
    const type = card?.type || 'open';
    const hadPriorWrongs = Boolean((card?.wrongCount || 0) > 0 || (card?.lapses || 0) > 0);

    if (type === 'multiple_choice') {
        if (t < 2.5 && !hadPriorWrongs) return 'easy';
        if (t <= 7.0) return 'good';
        return 'hard';
    }

    if (type === 'fill') {
        if (t < 4.5 && !hadPriorWrongs) return 'easy';
        if (t <= 11.0) return 'good';
        return 'hard';
    }

    if (type === 'flowchart') {
        const nodeCount = Math.max(2, Array.isArray(card?.nodes) ? card.nodes.length : 3);
        const blankCount = Array.isArray(card?.nodes)
            ? card.nodes.reduce((sum, n) => sum + (Array.isArray(n.blanks) ? n.blanks.length : 0), 0)
            : 0;
        const easyCeiling = 2.0 * nodeCount + 1.5 * blankCount;
        const goodCeiling = 4.5 * nodeCount + 3.0 * blankCount;
        if (t < easyCeiling && !hadPriorWrongs) return 'easy';
        if (t <= goodCeiling) return 'good';
        return 'hard';
    }

    // Aberta / Dupla
    if (t < 3.2 && !hadPriorWrongs) return 'easy';
    if (t <= 9.0) return 'good';
    return 'hard';
}

/**
 * Calcula o próximo agendamento do cartão no Caderno (SRS de Longo Prazo + In-Session Gap).
 *
 * Regras Neurobiológicas para Decks Massivos:
 * 1. Os cards NUNCA são removidos do deck.
 * 2. Em decks grandes, as distâncias para repetição dentro da sessão (dueStep)
 *    são substancialmente maiores (15 a 45+ cards) para evitar loops e efeito de recência artificial.
 * 3. As repetições bem-sucedidas ('good' / 'easy') expandem o intervalo em DIAS
 *    e são dispensadas pelo restante da sessão atual (dueStep = Infinity).
 * 4. Cards com 'again' reduzem o intervalo para 1 dia e são reagendados
 *    distantes na sessão atual.
 *
 * @param {Object} params
 * @param {Object} params.card
 * @param {'again'|'hard'|'good'|'easy'} params.quality
 * @param {number} params.currentStep
 * @param {number} params.poolSize - Tamanho total do pool do caderno
 * @param {string} [params.todayStr]
 * @returns {Object} Atualizações calculadas para o card
 */
const NOTEBOOK_SCHEDULER_KEY = 'flashcards_notebook_scheduler';
const NOTEBOOK_DESIRED_RETENTION_KEY = 'flashcards_notebook_desired_retention';

const FSRS_DECAY = -0.5;
const FSRS_FACTOR = 19 / 81;
const FSRS_DEFAULT_WEIGHTS = [
    0.40255, 1.18385, 3.173, 15.69105,
    7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925,
    1.9395, 0.11, 0.29605, 2.2698,
    0.2315, 2.9898,
    0.51655, 0.6621
];

function clampNumber(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

/**
 * Retorna o algoritmo configurado para o Caderno ('fsrs' | 'sm2').
 * @returns {'fsrs' | 'sm2'}
 */
export function getNotebookSchedulerMode() {
    try {
        if (typeof localStorage === 'undefined') return 'fsrs';
        const val = localStorage.getItem(NOTEBOOK_SCHEDULER_KEY);
        return val === 'sm2' ? 'sm2' : 'fsrs';
    } catch (e) {
        return 'fsrs';
    }
}

/**
 * Define e persiste o algoritmo do Caderno ('fsrs' | 'sm2').
 * @param {'fsrs'|'sm2'} mode
 */
export function setNotebookSchedulerMode(mode) {
    try {
        if (typeof localStorage === 'undefined') return;
        const normalized = mode === 'sm2' ? 'sm2' : 'fsrs';
        localStorage.setItem(NOTEBOOK_SCHEDULER_KEY, normalized);
        localStorage.setItem('flashcards_settings_updated_at', String(Date.now()));
        debouncedSyncSlotsToCloud();
    } catch (e) {}
}

/**
 * Retorna a retenção alvo do FSRS (padrão 0.90 = 90%).
 * @returns {number}
 */
export function getNotebookDesiredRetention() {
    try {
        if (typeof localStorage === 'undefined') return 0.90;
        const raw = Number(localStorage.getItem(NOTEBOOK_DESIRED_RETENTION_KEY));
        if (!Number.isFinite(raw) || raw <= 0) return 0.90;
        return clampNumber(raw, 0.75, 0.97);
    } catch (e) {
        return 0.90;
    }
}

/**
 * Define e persiste a retenção alvo do FSRS (entre 0.75 e 0.97).
 * @param {number} retention
 */
export function setNotebookDesiredRetention(retention) {
    try {
        if (typeof localStorage === 'undefined') return;
        const clamped = clampNumber(Number(retention) || 0.90, 0.75, 0.97);
        localStorage.setItem(NOTEBOOK_DESIRED_RETENTION_KEY, String(clamped));
        localStorage.setItem('flashcards_settings_updated_at', String(Date.now()));
        debouncedSyncSlotsToCloud();
    } catch (e) {}
}

/**
 * Calcula o tempo real decorrido em dias desde a última revisão do card.
 * Retorna 0 para cards novos ou com data inválida/futura.
 *
 * @param {Object} card
 * @param {string} [todayStr=getTodayDateString()]
 * @returns {number}
 */
export function computeElapsedDays(card, todayStr = getTodayDateString()) {
    if (!card || !card.lastReviewedDate) return 0;
    const lastDays = parseDateToDays(card.lastReviewedDate);
    const todayDays = parseDateToDays(todayStr);
    if (lastDays === null || todayDays === null) return 0;
    return Math.max(0, todayDays - lastDays);
}

function deterministicUnitHash(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
        h ^= seedStr.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}

/**
 * Aplica fuzz determinístico inspirado no Anki para intervalos >= 3 dias,
 * evitando acúmulo de revisões ("avalanches") no mesmo dia futuro.
 *
 * @param {number} intervalDays
 * @param {Object} [card=null]
 * @param {Object} [bounds]
 * @param {number} [bounds.minInterval=2]
 * @param {number} [bounds.maxInterval=36500]
 * @returns {number}
 */
export function applyIntervalFuzz(intervalDays, card = null, { minInterval = 2, maxInterval = 36500 } = {}) {
    const base = Math.max(1, Math.round(Number(intervalDays) || 1));
    if (base < 3) {
        return clampNumber(base, 1, maxInterval);
    }

    let deltaRange;
    if (base < 7) {
        deltaRange = 1;
    } else if (base < 30) {
        deltaRange = Math.max(1, Math.round(base * 0.10));
    } else {
        deltaRange = Math.max(2, Math.round(base * 0.05));
    }

    const low = Math.max(minInterval, base - deltaRange);
    const high = Math.min(maxInterval, base + deltaRange);
    if (low >= high) return low;

    const idPart = String(card?.id || card?.description || 'card').slice(0, 48);
    const seed = `${idPart}|${card?.repetitions || 0}|${card?.lapses || 0}|${card?.lastReviewedDate || ''}|${base}`;
    const u = deterministicUnitHash(seed);
    return Math.floor(low + u * (high - low + 1));
}

function computeNotebookInSessionGap(poolSize, isAgain = true) {
    if (poolSize <= 2) return 1;
    if (poolSize <= 10) return poolSize - 1;
    const ratio = isAgain ? 0.28 : 0.40;
    const minGap = isAgain ? 12 : 20;
    const calculated = Math.floor(poolSize * ratio);
    return Math.min(poolSize - 1, Math.max(minGap, calculated));
}

function scheduleWithImprovedSM2({ c, quality, currentStep, poolSize, todayStr, elapsedDays, applyFuzz }) {
    const ease = clampNumber(Number(c.easeFactor) || 2.5, 1.3, 3.2);
    const reps = Number(c.repetitions) || 0;
    const currentInterval = Math.max(1, Number(c.intervalDays) || 1);
    const prevState = c.srsState || (c.lastReviewedDate ? (reps >= 2 ? 'review' : 'learning') : 'new');
    const sameDayRelearn = prevState === 'relearning' && c.lastReviewedDate === todayStr;

    let newIntervalDays = 1;
    let newReps = reps;
    let newLapses = Number(c.lapses) || 0;
    let newEase = ease;
    let newState = prevState;
    let newDueStep = null;

    if (quality === 'again') {
        if (!sameDayRelearn) {
            if (prevState === 'review' || reps >= 2) {
                newLapses += 1;
                newEase = Math.max(1.3, ease - 0.20);
            }
        }
        newState = (prevState === 'review' || reps >= 2) ? 'relearning' : 'learning';
        newReps = (prevState === 'review' || reps >= 2) ? 1 : 0;
        newIntervalDays = (prevState === 'review' || reps >= 2)
            ? Math.max(1, Math.min(14, Math.round(currentInterval * 0.25)))
            : 1;
        newDueStep = currentStep + computeNotebookInSessionGap(poolSize, true);
    } else if (quality === 'hard') {
        if (prevState === 'new' || prevState === 'learning' || prevState === 'relearning' || reps < 2) {
            newState = 'learning';
            newIntervalDays = 1;
            newDueStep = currentStep + computeNotebookInSessionGap(poolSize, false);
        } else {
            newReps = reps + 1;
            newState = 'review';
            newEase = Math.max(1.3, ease - 0.15);
            if (elapsedDays === 0) {
                newIntervalDays = currentInterval;
            } else if (elapsedDays < currentInterval) {
                const fullTarget = Math.round(currentInterval * 1.2);
                const gain = (fullTarget - currentInterval) * (elapsedDays / currentInterval);
                newIntervalDays = Math.max(currentInterval, Math.round(currentInterval + gain));
            } else {
                const daysLate = elapsedDays - currentInterval;
                newIntervalDays = Math.max(currentInterval + 1, Math.round((currentInterval + daysLate / 4) * 1.2));
            }
            newDueStep = null;
        }
    } else if (quality === 'good') {
        if (reps === 0) {
            newReps = 1;
            newState = 'learning';
            newIntervalDays = 1;
        } else if (reps === 1) {
            newReps = 2;
            newState = 'review';
            newIntervalDays = 3;
        } else {
            newReps = reps + 1;
            newState = 'review';
            if (elapsedDays === 0) {
                newIntervalDays = currentInterval;
            } else if (elapsedDays < currentInterval) {
                const fullTarget = Math.round(currentInterval * newEase);
                const gain = (fullTarget - currentInterval) * (elapsedDays / currentInterval);
                newIntervalDays = Math.max(currentInterval, Math.round(currentInterval + gain));
            } else {
                const daysLate = elapsedDays - currentInterval;
                newIntervalDays = Math.max(currentInterval + 1, Math.round((currentInterval + daysLate / 2) * newEase));
            }
        }
        newDueStep = null;
    } else if (quality === 'easy') {
        newEase = Math.min(3.2, ease + 0.15);
        if (reps === 0) {
            newReps = 2;
            newState = 'review';
            newIntervalDays = 3;
        } else if (reps === 1) {
            newReps = 2;
            newState = 'review';
            newIntervalDays = 7;
        } else {
            newReps = reps + 1;
            newState = 'review';
            if (elapsedDays === 0) {
                newIntervalDays = Math.max(currentInterval + 1, Math.round(currentInterval * 1.1));
            } else if (elapsedDays < currentInterval) {
                const fullTarget = Math.round(currentInterval * newEase * 1.3);
                const gain = (fullTarget - currentInterval) * (elapsedDays / currentInterval);
                newIntervalDays = Math.max(currentInterval + 1, Math.round(currentInterval + gain));
            } else {
                const daysLate = elapsedDays - currentInterval;
                newIntervalDays = Math.max(currentInterval + 2, Math.round((currentInterval + daysLate) * newEase * 1.3));
            }
        }
        newDueStep = null;
    }

    if (applyFuzz && quality !== 'again' && newIntervalDays >= 3) {
        newIntervalDays = applyIntervalFuzz(newIntervalDays, c, { minInterval: 2 });
    }

    const dueDate = addDaysToDateString(todayStr, newIntervalDays);

    return {
        schedulerUsed: 'sm2',
        srsState: newState,
        intervalDays: newIntervalDays,
        elapsedDays,
        dueDate,
        dueStep: newDueStep,
        lastReviewedDate: todayStr,
        lastQuality: quality,
        easeFactor: Math.round(newEase * 100) / 100,
        repetitions: newReps,
        lapses: newLapses,
        reviewTimestamp: Date.now()
    };
}

function scheduleWithFSRS({ c, quality, currentStep, poolSize, todayStr, elapsedDays, desiredRetention, applyFuzz }) {
    const w = FSRS_DEFAULT_WEIGHTS;
    const ratingMap = { again: 1, hard: 2, good: 3, easy: 4 };
    const G = ratingMap[quality] || 3;

    const reps = Number(c.repetitions) || 0;
    const prevLapses = Number(c.lapses) || 0;
    const ease = clampNumber(Number(c.easeFactor) || 2.5, 1.3, 3.2);
    const currentInterval = Math.max(1, Number(c.intervalDays) || 1);
    const isNewCard = !c.lastReviewedDate;
    const prevState = c.srsState || (isNewCard ? 'new' : (reps >= 2 ? 'review' : 'learning'));
    const sameDayRelearn = prevState === 'relearning' && c.lastReviewedDate === todayStr;

    let stability = Number(c.fsrsStability);
    let difficulty = Number(c.fsrsDifficulty);
    if (!isNewCard && (!Number.isFinite(stability) || stability <= 0 || !Number.isFinite(difficulty))) {
        stability = Math.max(0.5, currentInterval);
        difficulty = clampNumber(11 - ((ease - 1.3) / (3.2 - 1.3)) * 8, 1, 10);
    }

    let newS;
    let newD;
    let newLapses = prevLapses;
    let newReps = reps;
    let newState = prevState;
    let newDueStep = null;
    let retrievability = 1;

    if (isNewCard) {
        newS = Math.max(0.1, w[G - 1]);
        newD = clampNumber(w[4] - Math.exp(w[5] * (G - 1)) + 1, 1, 10);
        if (G === 1) {
            newState = 'learning';
            newReps = 0;
            newDueStep = currentStep + computeNotebookInSessionGap(poolSize, true);
        } else if (G === 2) {
            newState = 'learning';
            newReps = 0;
            newDueStep = currentStep + computeNotebookInSessionGap(poolSize, false);
        } else {
            newState = 'review';
            newReps = 1;
            newDueStep = null;
        }
    } else if (elapsedDays === 0) {
        retrievability = 1;
        const shortTermFactor = Math.exp(w[17] * (G - 3 + w[18]));
        if (G === 1) {
            newS = Math.max(0.1, Math.min(stability, stability * shortTermFactor));
            newD = sameDayRelearn ? difficulty : clampNumber(difficulty + w[6] * 1.5, 1, 10);
            if (!sameDayRelearn && (prevState === 'review' || reps >= 1)) {
                newLapses += 1;
            }
            newState = 'relearning';
            newReps = 0;
            newDueStep = currentStep + computeNotebookInSessionGap(poolSize, true);
        } else {
            const cappedFactor = G >= 3 ? Math.min(1.25, Math.max(1.0, shortTermFactor)) : Math.min(1.05, Math.max(0.85, shortTermFactor));
            newS = Math.max(0.1, stability * cappedFactor);
            newD = sameDayRelearn ? difficulty : clampNumber(difficulty - w[6] * (G - 3) * 0.5, 1, 10);
            newState = G === 2 && prevState === 'learning' ? 'learning' : 'review';
            newReps = reps + 1;
            newDueStep = (G === 2 && prevState === 'learning')
                ? currentStep + computeNotebookInSessionGap(poolSize, false)
                : null;
        }
    } else {
        retrievability = Math.pow(1 + FSRS_FACTOR * (elapsedDays / stability), FSRS_DECAY);
        const d0Easy = clampNumber(w[4] - Math.exp(w[5] * 3) + 1, 1, 10);
        const deltaD = -w[6] * (G - 3);
        const dNext = difficulty + deltaD * ((10 - difficulty) / 9);
        newD = clampNumber(w[7] * d0Easy + (1 - w[7]) * dNext, 1, 10);

        if (G === 1) {
            const forgetStability =
                w[11] *
                Math.pow(newD, -w[12]) *
                (Math.pow(stability + 1, w[13]) - 1) *
                Math.exp(w[14] * (1 - retrievability));
            newS = clampNumber(forgetStability, 0.1, stability);
            newLapses += 1;
            newReps = 0;
            newState = 'relearning';
            newDueStep = currentStep + computeNotebookInSessionGap(poolSize, true);
        } else {
            const hardPenalty = G === 2 ? w[15] : 1;
            const easyBonus = G === 4 ? w[16] : 1;
            const recallGrowth =
                1 +
                Math.exp(w[8]) *
                (11 - newD) *
                Math.pow(stability, -w[9]) *
                (Math.exp(w[10] * (1 - retrievability)) - 1) *
                hardPenalty *
                easyBonus;
            newS = Math.max(0.1, stability * recallGrowth);
            newReps = reps + 1;
            newState = 'review';
            newDueStep = null;
        }
    }

    const rawInterval = (newS / FSRS_FACTOR) * (Math.pow(desiredRetention, 1 / FSRS_DECAY) - 1);
    let newIntervalDays;
    if (G === 1) {
        newIntervalDays = Math.max(1, Math.min(14, Math.round(rawInterval)));
    } else if (G === 2 && isNewCard) {
        newIntervalDays = 1;
    } else if (G === 4) {
        newIntervalDays = Math.max(2, Math.round(rawInterval));
    } else {
        newIntervalDays = Math.max(1, Math.round(rawInterval));
    }

    if (applyFuzz && G !== 1 && newIntervalDays >= 3) {
        newIntervalDays = applyIntervalFuzz(newIntervalDays, c, { minInterval: 2 });
    }

    const dueDate = addDaysToDateString(todayStr, newIntervalDays);
    const mappedEase = clampNumber(3.2 - ((newD - 1) / 9) * 1.9, 1.3, 3.2);

    return {
        schedulerUsed: 'fsrs',
        srsState: newState,
        fsrsStability: Math.round(newS * 1000) / 1000,
        fsrsDifficulty: Math.round(newD * 1000) / 1000,
        lastRetrievability: Math.round(retrievability * 1000) / 1000,
        intervalDays: newIntervalDays,
        elapsedDays,
        dueDate,
        dueStep: newDueStep,
        lastReviewedDate: todayStr,
        lastQuality: quality,
        easeFactor: Math.round(mappedEase * 100) / 100,
        repetitions: newReps,
        lapses: newLapses,
        reviewTimestamp: Date.now()
    };
}

/**
 * Calcula o próximo agendamento do cartão no Caderno (FSRS ou SM-2 Melhorado),
 * usando tempo real decorrido e interval fuzz determinístico.
 *
 * @param {Object} params
 * @param {Object} params.card
 * @param {'again'|'hard'|'good'|'easy'} params.quality
 * @param {number} params.currentStep
 * @param {number} [params.poolSize=30]
 * @param {string} [params.todayStr]
 * @param {'fsrs'|'sm2'} [params.schedulerMode]
 * @param {number} [params.desiredRetention]
 * @param {boolean} [params.applyFuzz=true]
 * @returns {Object} Atualizações calculadas para o card
 */
export function calculateNotebookNextSchedule({
    card,
    quality,
    currentStep = 0,
    poolSize = 30,
    todayStr = getTodayDateString(),
    schedulerMode = getNotebookSchedulerMode(),
    desiredRetention = getNotebookDesiredRetention(),
    applyFuzz = true
}) {
    const c = card || {};
    const elapsedDays = computeElapsedDays(c, todayStr);
    const mode = schedulerMode === 'sm2' ? 'sm2' : 'fsrs';

    const result = mode === 'sm2'
        ? scheduleWithImprovedSM2({
            c,
            quality,
            currentStep,
            poolSize,
            todayStr,
            elapsedDays,
            applyFuzz
        })
        : scheduleWithFSRS({
            c,
            quality,
            currentStep,
            poolSize,
            todayStr,
            elapsedDays,
            desiredRetention,
            applyFuzz
        });

    // Preserva e atualiza contagem histórica de revisões/acertos para cálculo justo de dificuldade
    const legacyReps = Math.max(0, Number(c.repetitions) || 0);
    const prevTotalReviews = c.totalReviews !== undefined ? (Number(c.totalReviews) || 0) : legacyReps;
    const prevTotalCorrect = c.totalCorrect !== undefined
        ? (Number(c.totalCorrect) || 0)
        : (c.correctCount !== undefined ? (Number(c.correctCount) || 0) : legacyReps);
    const isPass = quality === 'good' || quality === 'easy';

    result.totalReviews = prevTotalReviews + 1;
    result.totalCorrect = isPass ? prevTotalCorrect + 1 : prevTotalCorrect;
    if (quality === 'again') {
        result.historicalWrongs = (Number(c.historicalWrongs) || 0) + 1;
    }

    return result;
}

/**
 * Gera previsão dos próximos intervalos para os 4 botões de avaliação sem mutar o card.
 *
 * @param {Object} params
 * @returns {{ again: number, hard: number, good: number, easy: number }}
 */
export function previewNotebookIntervals({
    card,
    currentStep = 0,
    poolSize = 30,
    todayStr = getTodayDateString(),
    schedulerMode = getNotebookSchedulerMode(),
    desiredRetention = getNotebookDesiredRetention()
}) {
    const ratings = ['again', 'hard', 'good', 'easy'];
    const result = {};
    for (const quality of ratings) {
        const res = calculateNotebookNextSchedule({
            card,
            quality,
            currentStep,
            poolSize,
            todayStr,
            schedulerMode,
            desiredRetention,
            applyFuzz: false
        });
        result[quality] = res.intervalDays;
    }
    return result;
}

/**
 * Normaliza assunto/tópico para interleaving.
 */
function getNormalizedTopic(card) {
    if (!card) return '';
    return String(card.topic || card.aiTopic || card.subject || card.aiSubject || card.sourceDeck || '').trim().toLowerCase();
}

/**
 * Seleciona o próximo cartão no modo Caderno (Espaçado por dias, sem expulsar cards do deck).
 *
 * Estratégia de Priorização:
 * 1. Exclui o cartão que acabou de ser respondido (se pool > 1).
 * 2. Filtra cards bloqueados na sessão atual (dueStep > currentStep). Se todos estiverem
 *    bloqueados por gap, seleciona aquele com menor dueStep para não travar a experiência.
 * 3. Entre os disponíveis, prioriza:
 *    a) Cards com revisão vencida (dueDate <= today).
 *    b) Cards novos que nunca foram revisados (lastReviewedDate ausente).
 *    c) Se todos do dia estiverem em dia, adianta cards com menor dueDate (próximos do esquecimento).
 * 4. Aplica interleaving (alternância entre matérias / decks de origem).
 *
 * @param {Object} params
 * @param {Array<Object>} params.pool - Todos os cartões jogáveis do caderno
 * @param {number} params.currentStep - Passo da sessão atual
 * @param {string} [params.lastCardTopic=''] - Assunto do cartão anterior
 * @param {string} [params.lastSourceDeck=''] - Baralho de origem anterior
 * @param {Object} [params.currentQuestion=null] - Cartão atual
 * @param {string} [params.todayStr]
 * @returns {Object|null}
 */
export function selectNextNotebookCard({
    pool,
    currentStep,
    lastCardTopic = '',
    lastSourceDeck = '',
    currentQuestion = null,
    todayStr = getTodayDateString()
}) {
    if (!pool || pool.length === 0) return null;
    if (pool.length === 1) return pool[0];

    // Evita o mesmo card consecutivamente
    const validCandidates = pool.filter(c => c !== currentQuestion);
    const candidatePool = validCandidates.length > 0 ? validCandidates : pool;

    const isInSessionCooldown = (c) =>
        typeof c.dueStep === 'number' && Number.isFinite(c.dueStep) && c.dueStep > currentStep;

    const isDismissedToday = (c) =>
        c.dueStep === null && c.lastReviewedDate === todayStr;

    // 1. Separa por disponibilidade na sessão de hoje (corrige dueStep=null após serialização JSON)
    const availableInSession = candidatePool.filter(c => !isInSessionCooldown(c) && !isDismissedToday(c));

    let workingPool = availableInSession;
    if (workingPool.length === 0) {
        const cooldownCards = candidatePool.filter(isInSessionCooldown);
        if (cooldownCards.length > 0) {
            let minDue = Infinity;
            for (const c of cooldownCards) {
                if (c.dueStep < minDue) minDue = c.dueStep;
            }
            workingPool = cooldownCards.filter(c => c.dueStep === minDue);
        } else {
            workingPool = candidatePool;
        }
    }

    // 2. Classifica cartões do dia
    const isDue = (c) => !c.dueDate || c.dueDate <= todayStr;
    const isNew = (c) => !c.lastReviewedDate;

    const dueCards = workingPool.filter(isDue);
    const newCards = dueCards.filter(isNew);
    const overdueCards = dueCards.filter(c => !isNew(c));

    // 3. Interleaving helper
    const normalizedTopic = String(lastCardTopic || '').trim().toLowerCase();
    const normalizedDeck = String(lastSourceDeck || '').trim().toLowerCase();

    const applyInterleaving = (list) => {
        if (!list || list.length <= 1) return list;
        const different = list.filter(c => {
            const topicMatches = normalizedTopic && getNormalizedTopic(c) === normalizedTopic;
            const deckMatches = normalizedDeck && String(c.sourceDeck || '').trim().toLowerCase() === normalizedDeck;
            return !(topicMatches || deckMatches);
        });
        return different.length > 0 ? different : list;
    };

    // 4. Seleção prioritária
    // Prioridade 1: Cards com revisão atrasada ou vencida hoje
    if (overdueCards.length > 0) {
        overdueCards.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
        const topSlice = overdueCards.slice(0, Math.max(3, Math.floor(overdueCards.length * 0.4)));
        const interleaved = applyInterleaving(topSlice);
        return interleaved[Math.floor(secureRandom() * interleaved.length)];
    }

    // Prioridade 2: Cards novos favoritados nunca estudados
    if (newCards.length > 0) {
        const interleaved = applyInterleaving(newCards);
        return interleaved[Math.floor(secureRandom() * interleaved.length)];
    }

    // Prioridade 3: Se todo o caderno de hoje estiver zerado, avança cards futuros (menor dueDate)
    const sortedUpcoming = [...workingPool].sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    const topUpcoming = sortedUpcoming.slice(0, Math.max(4, Math.floor(sortedUpcoming.length * 0.35)));
    const interleaved = applyInterleaving(topUpcoming);
    return interleaved[Math.floor(secureRandom() * interleaved.length)] || sortedUpcoming[0];
}

/**
 * Retorna contagens informativas de revisões do caderno para a UI.
 * @param {Array<Object>} pool 
 * @param {string} [todayStr]
 * @returns {{ total: number, dueToday: number, newCards: number, reviewedToday: number }}
 */
export function getNotebookDueCounts(pool = [], todayStr = getTodayDateString()) {
    if (!pool || !Array.isArray(pool)) {
        return { total: 0, dueToday: 0, newCards: 0, reviewedToday: 0 };
    }

    let dueToday = 0;
    let newCards = 0;
    let reviewedToday = 0;

    for (const c of pool) {
        if (!c) continue;
        if (!c.lastReviewedDate) {
            newCards++;
            dueToday++;
        } else {
            if (c.dueDate && c.dueDate <= todayStr) {
                dueToday++;
            }
            if (c.lastReviewedDate === todayStr) {
                reviewedToday++;
            }
        }
    }

    return {
        total: pool.length,
        dueToday,
        newCards,
        reviewedToday
    };
}

/**
 * Retorna informações sobre o estágio de consolidação do card para exibir chip/pill na UI.
 * @param {Object} card 
 * @param {string} [todayStr]
 * @returns {{ label: string, colorClass: string, isDue: boolean }}
 */
export function getCardMemoryStage(card, todayStr = getTodayDateString()) {
    if (!card) {
        return { label: 'Card', colorClass: 'bg-gray-100 text-gray-600', isDue: false };
    }

    if (!card.lastReviewedDate) {
        return {
            label: t('new_card_stage'),
            colorClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
            isDue: true
        };
    }

    const interval = Number(card.intervalDays) || 1;
    const isDue = Boolean(!card.dueDate || card.dueDate <= todayStr);

    if (isDue) {
        return {
            label: t('overdue_review'),
            colorClass: 'bg-amber-50 text-amber-700 border border-amber-200/80',
            isDue: true
        };
    }

    if (interval >= 14) {
        return {
            label: t('memory_fixed_days', { days: interval }),
            colorClass: 'bg-purple-50 text-purple-700 border border-purple-200/80',
            isDue: false
        };
    }

    return {
        label: t('interval_days_stage', { days: interval }),
        colorClass: 'bg-blue-50 text-blue-700 border border-blue-200/80',
        isDue: false
    };
}

/**
 * Determina se um cartão geralmente é respondido incorretamente.
 * Usado para exibir o chip vermelho pastel "Difícil" na interface de jogo.
 *
 * @param {Object} card
 * @param {Object} [strugglingMap] - Mapa opcional de strugglingCards da sessão
 * @returns {boolean}
 */
export function isDifficultCard(card, strugglingMap = null) {
    if (!card) return false;

    const wrongs = Number(card.wrongCount) || 0;
    const lapses = Number(card.lapses) || 0;
    const reps = Number(card.repetitions) || 0;
    const recoveredInSrs = card.srsState === 'review' && reps >= 3 && (Number(card.fsrsDifficulty) || 0) < 7.5;

    // Critério 1: Acúmulo de 3 ou mais erros recentes sem recuperação consecutiva
    if (wrongs >= 3 && !recoveredInSrs) return true;

    // Critério 2: Falhas repetidas de retenção no SRS (lapses >= 2) sem recuperação
    if (lapses >= 2 && !recoveredInSrs) return true;

    // Critério 3: Leech ativo ou dificuldade alta comprovada
    if (isLeechCard(card) && !recoveredInSrs) return true;
    if ((Number(card.difficultyScore) || 0) >= 0.6 && !recoveredInSrs) return true;
    if ((Number(card.fsrsDifficulty) || 0) >= 7.5 && lapses >= 1) return true;

    // Critério 4: Histórico de acurácia baixa (< 50% com ao menos 3 revisões explicitamente registradas)
    const hasExplicitAccuracy =
        Number(card.totalReviews) >= 3 &&
        (card.totalCorrect !== undefined || card.correctCount !== undefined);
    if (hasExplicitAccuracy) {
        const totalRevs = Number(card.totalReviews);
        const totalOk = Number(card.totalCorrect ?? card.correctCount ?? 0);
        if ((totalOk / totalRevs) < 0.5) {
            return true;
        }
    }

    // Critério 5: Presente no mapa de strugglingCards da sessão com >= 2 erros
    if (strugglingMap && typeof strugglingMap === 'object') {
        const key = String(card.id || card.description || '').trim();
        const sc = strugglingMap[key];
        if (sc && (Number(sc.incorrectCount) || 0) >= 2) {
            return true;
        }
    }

    return false;
}

/**
 * Agrega e combina os dados de atividade diária (cards respondidos por data)
 * unindo o histórico do Streak Tracker com as sessões arquivadas do StatsTracker.
 *
 * @param {Array<Object>} [statsHistory=[]]
 * @param {Object|null} [currentSession=null]
 * @returns {Record<string, number>} Mapa 'YYYY-MM-DD' -> totalCardsAnswered
 */
export function getHeatmapActivityMap(statsHistory = [], currentSession = null) {
    const streakData = getDailyStreak();
    const map = { ...(streakData.history || {}) };

    if (Array.isArray(statsHistory)) {
        for (const sess of statsHistory) {
            if (!sess || !sess.cardsAnswered) continue;
            const time = sess.startTime || sess.lastActiveTime;
            if (!time) continue;
            const d = new Date(time);
            if (isNaN(d.getTime())) continue;
            const dStr = getTodayDateString(d);
            map[dStr] = Math.max(map[dStr] || 0, Number(sess.cardsAnswered) || 0);
        }
    }

    if (currentSession && Number(currentSession.cardsAnswered) > 0) {
        const todayStr = getTodayDateString();
        map[todayStr] = Math.max(map[todayStr] || 0, Number(currentSession.cardsAnswered) || 0);
    }

    return map;
}

/**
 * Retorna a meta diária configurada do Caderno (ou 0 se não configurada).
 * @returns {number}
 */
export function getNotebookDailyGoal() {
    try {
        const val = localStorage.getItem('flashcards_notebook_daily_goal');
        if (val !== null && val !== '') {
            const num = parseInt(val, 10);
            return isNaN(num) ? 0 : Math.max(0, num);
        }
        return 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Registra que a meta diária do Caderno foi batida na data especificada (padrão hoje).
 * A cada 7 metas batidas, recompensa o usuário com +1 Streak Freeze (máx 2).
 *
 * @param {string} [dateStr=getTodayDateString()]
 * @returns {{
 *   newlyAchieved: boolean,
 *   totalGoalsMet: number,
 *   freezeAwarded: boolean,
 *   freezesAvailable: number
 * }}
 */
export function recordNotebookGoalBeaten(dateStr = getTodayDateString()) {
    try {
        const raw = localStorage.getItem(DAILY_STREAK_KEY);
        let data = {};
        if (raw) {
            try { data = JSON.parse(raw); } catch (e) {}
        }

        let goalMetDates = Array.isArray(data.goalMetDates) ? [...data.goalMetDates] : [];
        let freezesAvailable = typeof data.freezesAvailable === 'number' ? data.freezesAvailable : 1;
        let lastGoalFreezeAwardedCount = Number(data.lastGoalFreezeAwardedCount) || 0;
        let freezeAwarded = false;

        const newlyAchieved = !goalMetDates.includes(dateStr);
        if (newlyAchieved) {
            goalMetDates.push(dateStr);
        }

        const totalGoalsMet = goalMetDates.length;
        if (newlyAchieved) {
            const milestoneReached = Math.floor(totalGoalsMet / 7) * 7;
            if (milestoneReached >= 7 && milestoneReached > lastGoalFreezeAwardedCount && freezesAvailable < MAX_FREEZES) {
                freezesAvailable = Math.min(MAX_FREEZES, freezesAvailable + 1);
                lastGoalFreezeAwardedCount = milestoneReached;
                freezeAwarded = true;
            }
        }

        data.goalMetDates = goalMetDates;
        data.freezesAvailable = freezesAvailable;
        data.lastGoalFreezeAwardedCount = lastGoalFreezeAwardedCount;
        data.updatedAt = Date.now();

        localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(data));
        debouncedSyncSlotsToCloud();

        return {
            newlyAchieved,
            totalGoalsMet,
            freezeAwarded,
            freezesAvailable
        };
    } catch (e) {
        console.error('[Notebook SRS] Erro ao registrar meta batida:', e);
        return {
            newlyAchieved: false,
            totalGoalsMet: 0,
            freezeAwarded: false,
            freezesAvailable: 1
        };
    }
}
