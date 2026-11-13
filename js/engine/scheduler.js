/**
 * js/engine/scheduler.js
 * Módulo de agendamento de repetição espaçada, cálculo de gaps proporcionais,
 * seleção adaptativa com memória entre sessões e regras de graduação/leech.
 *
 * Módulo puro: não possui acoplamento direto com o DOM ou UI gráfica.
 */

import { secureRandom } from '../utils.js';

/**
 * Filtra se um cartão é jogável (exclui divisores de seção e notas).
 * @param {Object} card 
 * @returns {boolean}
 */
export function isPlayableCard(card) {
    return Boolean(card && card.type !== 'divisor' && card.type !== 'divider' && card.type !== 'note');
}

export function getCardTopic(card) {
    if (!card) return '';
    return String(card.topic || card.aiTopic || card.subject || card.aiSubject || card.category || card.sourceDeck || '').trim().toLowerCase();
}

/**
 * Registra o resultado de uma revisão no Modo Normal/Simulado para memória entre sessões.
 * Mantém métricas acumuladas mesmo quando o baralho é reiniciado.
 *
 * @param {Object} card
 * @param {Object} [outcome]
 * @param {boolean} [outcome.isCorrect=true]
 * @param {string|null} [outcome.rating=null] - 'again' | 'hard' | 'good' | 'easy' | null
 * @param {number} [outcome.latencySec=2]
 * @returns {Object} Snapshot dos campos persistentes atualizados
 */
export function recordNormalCardOutcome(card, { isCorrect = true, rating = null, latencySec = 2 } = {}) {
    if (!card || typeof card !== 'object') return {};

    const t = Math.max(0.2, Number(latencySec) || 2);
    const prevReviews = Number(card.totalReviews) || 0;
    const prevCorrect = Number(card.totalCorrect) || 0;
    const prevWrongs = Number(card.historicalWrongs) || 0;
    const prevDifficulty = Math.min(1, Math.max(0, Number(card.difficultyScore) || 0));

    const effectiveCorrect = rating ? (rating === 'good' || rating === 'easy') : Boolean(isCorrect);
    let nextDifficulty = prevDifficulty;

    if (rating === 'again' || !effectiveCorrect) {
        nextDifficulty = Math.min(1, prevDifficulty * 0.6 + 0.4);
    } else if (rating === 'hard') {
        nextDifficulty = Math.min(1, prevDifficulty * 0.75 + 0.2);
    } else if (rating === 'easy' || (effectiveCorrect && t < 4.0)) {
        nextDifficulty = prevDifficulty * 0.45;
    } else {
        nextDifficulty = prevDifficulty * (t > 12 ? 0.80 : 0.65);
    }

    const updates = {
        totalReviews: prevReviews + 1,
        totalCorrect: effectiveCorrect ? prevCorrect + 1 : prevCorrect,
        historicalWrongs: (!effectiveCorrect && rating !== 'hard') ? prevWrongs + 1 : prevWrongs,
        difficultyScore: Math.round(nextDifficulty * 1000) / 1000,
        lastLatencySec: Math.round(t * 10) / 10,
        lastReviewedAt: Date.now()
    };

    Object.assign(card, updates);
    return updates;
}

/**
 * Reverte penalidade histórica quando a IA corrige um falso negativo no Modo Normal.
 *
 * @param {Object} card
 * @returns {Object}
 */
export function revertNormalCardErrorOnAiCorrection(card) {
    if (!card || typeof card !== 'object') return {};

    const prevCorrect = Number(card.totalCorrect) || 0;
    const prevWrongs = Number(card.historicalWrongs) || 0;
    const prevDifficulty = Math.min(1, Math.max(0, Number(card.difficultyScore) || 0));

    const updates = {
        totalCorrect: prevCorrect + 1,
        historicalWrongs: Math.max(0, prevWrongs - 1),
        difficultyScore: Math.round(Math.max(0, prevDifficulty * 0.65) * 1000) / 1000,
        lastReviewedAt: Date.now()
    };

    Object.assign(card, updates);
    return updates;
}

/**
 * Limpa apenas o estado transitório da sessão ao reiniciar um baralho normal,
 * preservando a memória entre sessões (histórico de erros, dificuldade e revisões).
 *
 * @param {Object} card
 */
export function resetCardForNewSession(card) {
    if (!card || typeof card !== 'object') return;
    delete card.dueStep;
    delete card.correctStreak;
    delete card.wrongCount;
    delete card.isBeingCorrected;
    card.historicalSessions = (Number(card.historicalSessions) || 0) + 1;
}

/**
 * Calcula o intervalo adaptativo (gap de cartões futuros) proporcional ao tamanho do deck,
 * aproveitando Dificuldades Desejáveis, Latência de Resposta e Memória Entre Sessões.
 *
 * @param {number} thinkingTimeSec - Tempo de reflexão/latência em segundos
 * @param {Object} [card=null] - Cartão avaliado com histórico de erros
 * @param {number} [poolSize=0] - Quantidade atual de cartões no pool ativo
 * @returns {number}
 */
export function calculateThinkingGap(thinkingTimeSec, card = null, poolSize = 0) {
    const t = Math.max(0.5, Number(thinkingTimeSec) || 1);
    const wrongCount = card ? (card.wrongCount || 1) : 1;
    const difficultyScore = card ? Math.min(1, Math.max(0, Number(card.difficultyScore) || 0)) : 0;
    const currentPool = Math.max(1, Number(poolSize) || (card && card.poolSize) || 20);

    // 1. Base proporcional ao tamanho do baralho (mantendo 'again' mais curto que 'hard' e 'good')
    if (currentPool <= 2) {
        return 1;
    }

    let baseGap;
    let minGap;
    let maxCap;
    if (currentPool <= 5) {
        baseGap = 1;
        minGap = 1;
        maxCap = 2;
    } else {
        baseGap = Math.min(10, Math.max(2, Math.round(currentPool * 0.14)));
        minGap = Math.min(8, Math.max(2, Math.round(currentPool * 0.12)));
        maxCap = Math.min(13, Math.max(3, Math.round(currentPool * 0.25)));
    }

    // 2. Bônus por latência de resposta (Erro de Predição)
    let latencyBonus = 0;
    if (currentPool > 5) {
        if (t < 2.5) {
            latencyBonus = currentPool >= 20 ? 2 : 1;
        } else if (t < 7.0) {
            latencyBonus = 1;
        }
    }

    // 3. Expansão de respiro para erros repetidos na sessão e histórico difícil entre sessões
    const sessionBreathing = currentPool > 5 ? Math.max(0, wrongCount - 1) : 0;
    const crossSessionBreathing = (currentPool > 5 && difficultyScore >= 0.5) ? Math.round(difficultyScore * 2) : 0;
    const maxBreathing = currentPool <= 5 ? 1 : Math.max(1, Math.min(4, Math.round(currentPool * 0.06)));
    const repeatedErrorBreathing = Math.min(maxBreathing, sessionBreathing + crossSessionBreathing);

    // 4. Jitter anti-clustering proporcional
    const jitter = currentPool >= 25 ? (Math.floor(secureRandom() * 3) - 1) : 0;

    let gap = baseGap + latencyBonus + repeatedErrorBreathing + jitter;
    gap = Math.max(minGap, Math.min(maxCap, gap));

    console.log("[Algorithm] calculateThinkingGap (Proportional v3):", {
        thinkingTime: Math.round(t * 10) / 10 + 's',
        wrongCount,
        difficultyScore,
        currentPool,
        baseGap,
        latencyBonus,
        repeatedErrorBreathing,
        jitter,
        finalGap: gap
    });
    return gap;
}

/**
 * Calcula o gap proporcional ao tamanho do deck para avaliações explícitas (Anki / Voz)
 * no Modo Normal e Semana de Provas.
 *
 * @param {Object} params
 * @param {'again'|'hard'|'good'|'easy'} params.rating
 * @param {number} [params.thinkingTimeSec=2]
 * @param {Object} [params.card=null]
 * @param {number} [params.poolSize=0]
 * @returns {number}
 */
export function calculateProportionalStepGap({ rating, thinkingTimeSec = 2, card = null, poolSize = 0 }) {
    const currentPool = Math.max(1, Number(poolSize) || (card && card.poolSize) || 10);

    if (rating === 'again') {
        return calculateThinkingGap(thinkingTimeSec, card, currentPool);
    }

    if (currentPool <= 2) return 1;

    if (rating === 'hard') {
        if (currentPool <= 5) return Math.max(2, currentPool - 2);
        const minHard = Math.min(14, Math.max(4, Math.round(currentPool * 0.25) + 1));
        const raw = Math.round(currentPool * 0.36);
        const jitter = currentPool >= 16 ? (Math.floor(secureRandom() * 3) - 1) : 0;
        return Math.max(minHard, Math.min(20, raw + jitter));
    }

    if (rating === 'good') {
        if (currentPool <= 5) return Math.max(3, currentPool - 1);
        const minGood = Math.min(22, Math.max(7, Math.round(currentPool * 0.42)));
        const raw = Math.round(currentPool * 0.52);
        const jitter = currentPool >= 16 ? (Math.floor(secureRandom() * 3) - 1) : 0;
        return Math.max(minGood, Math.min(30, raw + jitter));
    }

    // easy (quando mantido para consolidação por ser leech/crônico)
    if (currentPool <= 5) return currentPool;
    return Math.max(8, Math.min(34, Math.round(currentPool * 0.60)));
}

/**
 * Seleciona o próximo cartão com arquitetura cognitiva de fluxo de aprendizado:
 * - Anti-Aprisionamento: Não deixa o usuário preso em cartões errados.
 * - Ordenação por Urgência: Prioriza cards mais atrasados (menor dueStep) entre os vencidos.
 * - Memória Entre Sessões: Traz cards historicamente difíceis mais cedo enquanto o foco está alto.
 * - Ritmo Intercalado (Interleaving Effect): Evita repetir os tópicos mais recentes.
 *
 * @param {Array<Object>|Object} candidateListOrConfig - Lista de candidatos ou objeto de configuração
 * @param {number} [step=0] - Passo atual da sessão
 * @param {number} [consecutiveDueCardsCount=0] - Contador de revisões consecutivas de vencidos
 * @param {string} [lastCardTopic=''] - Tópico do cartão anterior para intercalação
 * @param {Object} [currentCard=null] - Cartão atual para evitar repetição consecutiva imediata
 * @param {number} [consecutiveNewCardsCount=0] - Contador de cartas novas consecutivas
 * @returns {Object|null}
 */
export function selectNextCard(
    candidateListOrConfig,
    step = 0,
    consecutiveDueCardsCount = 0,
    lastCardTopic = '',
    currentCard = null,
    consecutiveNewCardsCount = 0
) {
    let candidateList = candidateListOrConfig;
    let recentTopics = [];
    if (candidateListOrConfig && !Array.isArray(candidateListOrConfig) && typeof candidateListOrConfig === 'object') {
        candidateList = candidateListOrConfig.candidateList || candidateListOrConfig.pool || [];
        step = candidateListOrConfig.step ?? step;
        consecutiveDueCardsCount = candidateListOrConfig.consecutiveDueCardsCount ?? consecutiveDueCardsCount;
        lastCardTopic = candidateListOrConfig.lastCardTopic ?? lastCardTopic;
        currentCard = candidateListOrConfig.currentCard ?? currentCard;
        consecutiveNewCardsCount = candidateListOrConfig.consecutiveNewCardsCount ?? consecutiveNewCardsCount;
        if (Array.isArray(candidateListOrConfig.recentTopics)) {
            recentTopics = candidateListOrConfig.recentTopics;
        }
    }

    if (!candidateList || candidateList.length === 0) return null;
    if (candidateList.length === 1) return candidateList[0];

    // Evita o mesmo card imediatamente consecutivo (quando há mais de 1 opção)
    let pool = candidateList;
    if (currentCard && candidateList.length > 1) {
        const withoutCurrent = candidateList.filter(c => c !== currentCard);
        if (withoutCurrent.length > 0) {
            pool = withoutCurrent;
        }
    }

    const isFiniteDue = (c) => typeof c.dueStep === 'number' && Number.isFinite(c.dueStep);
    const dueCards = pool.filter(c => isFiniteDue(c) && c.dueStep <= step);
    const newCards = pool.filter(c => c.dueStep === undefined || c.dueStep === null);
    const futureCards = pool.filter(c => isFiniteDue(c) && c.dueStep > step);

    // Ordena vencidos por urgência (mais atrasados primeiro)
    dueCards.sort((a, b) => (a.dueStep || 0) - (b.dueStep || 0));

    // Filtro de intercalação de tópicos (suporta janela recente + fallback para último tópico)
    const normalizedLastTopic = String(lastCardTopic || '').trim().toLowerCase();
    const normalizedRecent = recentTopics
        .map(t => String(t || '').trim().toLowerCase())
        .filter(Boolean);

    const filterInterleaved = (list) => {
        if (list.length <= 1) return list;
        if (normalizedRecent.length > 1) {
            const recentSet = new Set(normalizedRecent.slice(-2));
            const diffRecent = list.filter(c => !recentSet.has(getCardTopic(c)));
            if (diffRecent.length > 0) return diffRecent;
        }
        if (!normalizedLastTopic) return list;
        const diffTopic = list.filter(c => getCardTopic(c) !== normalizedLastTopic);
        return diffTopic.length > 0 ? diffTopic : list;
    };

    const pickDueFrom = (list, reason = '') => {
        const topSlice = list.slice(0, Math.max(2, Math.ceil(list.length * 0.45)));
        const interleaved = filterInterleaved(topSlice);
        const picked = interleaved[Math.floor(secureRandom() * interleaved.length)] || list[0];
        console.log(`[Algorithm] Card selecionado (${reason}):`, {
            desc: (picked.description || '').slice(0, 35),
            tipo: 'due',
            topic: getCardTopic(picked) || 'Geral',
            dueStep: picked.dueStep,
            step
        });
        return picked;
    };

    const pickNewFrom = (list, reason = '') => {
        let candidates = list;
        // Memória entre sessões: prioriza levemente cards historicamente difíceis
        const hasHistory = list.some(c => (Number(c.difficultyScore) || 0) > 0.15 || (Number(c.historicalWrongs) || 0) > 0);
        if (hasHistory && list.length > 3 && secureRandom() < 0.70) {
            const ranked = [...list].sort((a, b) => {
                const scoreA = (Number(a.difficultyScore) || 0) + Math.min(0.5, (Number(a.historicalWrongs) || 0) * 0.1);
                const scoreB = (Number(b.difficultyScore) || 0) + Math.min(0.5, (Number(b.historicalWrongs) || 0) * 0.1);
                return scoreB - scoreA;
            });
            candidates = ranked.slice(0, Math.max(3, Math.ceil(ranked.length * 0.5)));
        }
        const interleaved = filterInterleaved(candidates);
        const picked = interleaved[Math.floor(secureRandom() * interleaved.length)] || list[0];
        console.log(`[Algorithm] Card selecionado (${reason}):`, {
            desc: (picked.description || '').slice(0, 35),
            tipo: 'novo',
            topic: getCardTopic(picked) || 'Geral',
            difficultyScore: picked.difficultyScore || 0,
            step,
            newCardsLeft: newCards.length,
            dueCardsLeft: dueCards.length
        });
        return picked;
    };

    // CENÁRIO 1: Existem tanto Cartas Novas quanto Cartas Vencidas (Due)
    if (newCards.length > 0 && dueCards.length > 0) {
        if (consecutiveDueCardsCount >= 2) {
            return pickNewFrom(newCards, 'anti-trap: forçando carta nova após 2 revisões seguidas');
        }

        if (consecutiveDueCardsCount === 1) {
            if (secureRandom() < 0.80) {
                return pickNewFrom(newCards, 'fluxo saudável: alternando para carta nova após revisão');
            } else {
                return pickDueFrom(dueCards, 'revisão due espaçada (20%)');
            }
        }

        if (consecutiveNewCardsCount >= 3) {
            return pickDueFrom(dueCards, 'consolidação periódica: cartão due após sequência de novos');
        }

        const newCardShare = newCards.length / (newCards.length + dueCards.length);
        const targetNewChance = Math.min(0.75, Math.max(0.45, newCardShare));

        if (secureRandom() < targetNewChance) {
            return pickNewFrom(newCards, `ritmo balanceado: carta nova (chance: ${Math.round(targetNewChance * 100)}%)`);
        } else {
            return pickDueFrom(dueCards, 'ritmo balanceado: revisão due');
        }
    }

    // CENÁRIO 2: Apenas Cartas Novas disponíveis
    if (newCards.length > 0) {
        return pickNewFrom(newCards, 'novo: nenhum vencido no momento');
    }

    // CENÁRIO 3: Fase de Consolidação (sem cartas novas, com vencidos)
    if (dueCards.length > 0) {
        if (consecutiveDueCardsCount >= 3 && futureCards.length > 0 && secureRandom() < 0.30) {
            const sortedFuture = [...futureCards].sort((a, b) => (a.dueStep || 0) - (b.dueStep || 0));
            return pickDueFrom(sortedFuture, 'intercalação leve com cartão futuro próximo');
        }
        return pickDueFrom(dueCards, 'revisão: consolidação de cartões vencidos');
    }

    // CENÁRIO 4: Todas as cartas restantes estão no futuro (dueStep > step)
    let minDue = Infinity;
    for (const c of pool) {
        const d = c.dueStep || 0;
        if (d < minDue) minDue = d;
    }
    const earliestCards = pool.filter(c => (c.dueStep || 0) === minDue);
    const interleaved = filterInterleaved(earliestCards);
    return interleaved[Math.floor(secureRandom() * interleaved.length)] || earliestCards[0];
}

/**
 * Verifica se o cartão atingiu o limiar de sanguessuga (leech: >= 4 erros na sessão ou acumulado crônico).
 * @param {Object} card 
 * @returns {boolean}
 */
export function isLeechCard(card) {
    if (!card) return false;
    return (card.wrongCount || 0) >= 4 || (card.historicalWrongs || 0) >= 6;
}

/**
 * Determina se o cartão deve ser graduado/removido do pool ativo na sessão.
 * Considera leech, esforço extremo, memória entre sessões e o rating explícito (quando Anki/Voz).
 *
 * @param {Object} card
 * @param {number} [latencySec=0]
 * @param {string|null} [rating=null] - 'again' | 'hard' | 'good' | 'easy' | null
 * @returns {boolean}
 */
export function shouldGraduateCard(card, latencySec = 0, rating = null) {
    if (!card) return true;

    if (rating === 'again' || rating === 'hard') {
        return false;
    }

    const streak = card.correctStreak || 0;
    const isLeech = isLeechCard(card);
    if (isLeech) {
        return streak >= 2;
    }

    const difficultyScore = Number(card.difficultyScore) || 0;
    const chronicStruggler = (card.wrongCount || 0) >= 3;
    const extremeLatency = Number(latencySec) > 15;

    if (rating === 'good') {
        return streak >= (difficultyScore >= 0.75 ? 3 : 2);
    }

    if (chronicStruggler && extremeLatency) {
        return streak >= 2;
    }

    // Memória entre sessões: card historicamente difícil que teve hesitação ou erro recente
    if (difficultyScore >= 0.6 && (Number(latencySec) > 10 || (card.wrongCount || 0) >= 1)) {
        return streak >= 2;
    }

    return true;
}

/**
 * Formata segundos no formato MM:SS.
 * @param {number} totalSeconds 
 * @returns {string}
 */
export function formatTimeDisplay(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
