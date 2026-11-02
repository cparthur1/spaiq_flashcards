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
export function calculateNotebookNextSchedule({ card, quality, currentStep, poolSize = 30, todayStr = getTodayDateString() }) {
    const c = card || {};
    const ease = Math.max(1.3, Number(c.easeFactor) || 2.5);
    const reps = Number(c.repetitions) || 0;
    const currentInterval = Math.max(1, Number(c.intervalDays) || 1);

    // Distância na sessão (in-session gap) para evitar loops:
    // Em decks pequenos (ex: 8 cards), o gap é limitado ao tamanho disponível.
    // Em decks grandes (ex: 100+ cards), o gap varia entre 15 e 40 cards.
    const computeInSessionGap = (isAgain = true) => {
        if (poolSize <= 2) return 1;
        if (poolSize <= 10) return poolSize - 1;

        const ratio = isAgain ? 0.28 : 0.40;
        const minGap = isAgain ? 12 : 20;
        const calculated = Math.floor(poolSize * ratio);
        return Math.min(poolSize - 1, Math.max(minGap, calculated));
    };

    let newIntervalDays = 1;
    let newReps = reps;
    let newLapses = Number(c.lapses) || 0;
    let newEase = ease;
    let newDueStep = Infinity; // Por padrão, cards aprendidos não repetem na mesma sessão

    if (quality === 'again') {
        newIntervalDays = 1;
        newReps = 0;
        newLapses += 1;
        newEase = Math.max(1.3, ease - 0.20);
        newDueStep = currentStep + computeInSessionGap(true);
    } else if (quality === 'hard') {
        newReps += 1;
        // Incremento modesto de dias para reforçar consolidação
        newIntervalDays = Math.max(1, Math.round(currentInterval * 1.25));
        newEase = Math.max(1.3, ease - 0.15);
        // Em hard, se o card ainda é recente (intervalo <= 1d), dá mais uma passada adiante na sessão
        if (newIntervalDays <= 1) {
            newDueStep = currentStep + computeInSessionGap(false);
        } else {
            newDueStep = Infinity;
        }
    } else if (quality === 'good') {
        newReps += 1;
        if (newReps === 1) {
            newIntervalDays = 1;
        } else if (newReps === 2) {
            newIntervalDays = 3;
        } else {
            newIntervalDays = Math.max(2, Math.round(currentInterval * newEase));
        }
        newDueStep = Infinity;
    } else if (quality === 'easy') {
        newReps += 1;
        if (newReps === 1) {
            newIntervalDays = 3;
        } else if (newReps === 2) {
            newIntervalDays = 7;
        } else {
            newIntervalDays = Math.max(4, Math.round(currentInterval * newEase * 1.35));
        }
        newEase = Math.min(3.2, ease + 0.15);
        newDueStep = Infinity;
    }

    const dueDate = addDaysToDateString(todayStr, newIntervalDays);

    return {
        intervalDays: newIntervalDays,
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

    // 1. Separa por disponibilidade na sessão
    const availableInSession = candidatePool.filter(c => c.dueStep === undefined || c.dueStep <= currentStep);
    
    // Se todos estiverem em espera de gap na sessão, pega o que tem menor dueStep
    let workingPool = availableInSession;
    if (workingPool.length === 0) {
        let minDue = Infinity;
        for (const c of candidatePool) {
            const d = c.dueStep || 0;
            if (d < minDue) minDue = d;
        }
        workingPool = candidatePool.filter(c => (c.dueStep || 0) === minDue);
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
        // Ordena pelos mais antigos na fila de vencimento (menor dueDate)
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
    workingPool.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    const topUpcoming = workingPool.slice(0, Math.max(4, Math.floor(workingPool.length * 0.35)));
    const interleaved = applyInterleaving(topUpcoming);
    return interleaved[Math.floor(secureRandom() * interleaved.length)] || workingPool[0];
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

    // Critério 1: Acúmulo de 3 ou mais erros na sessão/deck
    if (wrongs >= 3) return true;

    // Critério 2: Falhas repetidas de retenção no SRS (lapses >= 2)
    if (lapses >= 2) return true;

    // Critério 3: Identificado como Leech (persistência de erro crônica > 4)
    if (isLeechCard(card)) return true;

    // Critério 4: Histórico de acurácia baixa (< 50% de acertos com ao menos 3 revisões)
    const reps = Number(card.repetitions || card.totalReviews || 0);
    const correct = Number(card.correctCount) || 0;
    if (reps >= 3 && (correct / reps) < 0.5) {
        return true;
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
