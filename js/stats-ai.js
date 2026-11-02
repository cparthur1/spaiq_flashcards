/**
 * stats-ai.js
 * AI-powered deck and topic categorization using Gemini Flash-Lite with Function Calling.
 * Groups decks into broad subjects (matérias) and cards into specific topics (assuntos)
 * with the minimal possible number of categories for clear, aggregated analytics.
 */

import { stripHtml } from './utils.js';
import { BACKEND_URL } from './backend-api.js';
import { getCurrentUserToken } from './firebase-client.js';
import { debouncedSyncSlotsToCloud } from './slot-manager.js';

const AI_CATEGORIES_KEY = 'flashcards_ai_categories';
const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const FALLBACK_MODEL = 'gemini-flash-latest';

// Gemini Function Calling Schema
export const categorizeTool = {
    functionDeclarations: [
        {
            name: "salvar_categorizacao_estudos",
            description: "Salva a categorização consolidada de baralhos em matérias gerais e dos cartões em assuntos específicos com agrupamento máximo e o menor número possível de categorias.",
            parameters: {
                type: "OBJECT",
                properties: {
                    deckSubjects: {
                        type: "ARRAY",
                        description: "Mapeamento de cada baralho para uma matéria geral ampla agregadora (ex: Medicina, Semiologia, Farmacologia, Direito Constitucional, etc.).",
                        items: {
                            type: "OBJECT",
                            properties: {
                                deckTitle: { type: "STRING", description: "Nome exato do baralho fornecido" },
                                subject: { type: "STRING", description: "Nome da matéria ou disciplina ampla de alto nível" }
                            },
                            required: ["deckTitle", "subject"]
                        }
                    },
                    cardTopics: {
                        type: "ARRAY",
                        description: "Mapeamento de cada cartão do baralho atual para um assunto/tópico conciso (agrupado ao máximo, agrupando cartões correlatos no mesmo tema).",
                        items: {
                            type: "OBJECT",
                            properties: {
                                cardIndex: { type: "NUMBER", description: "Índice numérico do cartão (0 a N-1)" },
                                topic: { type: "STRING", description: "Nome do assunto conciso agrupador (ex: Valvopatias, Eletrocardiograma, Arritmias, etc.)" }
                            },
                            required: ["cardIndex", "topic"]
                        }
                    }
                },
                required: ["deckSubjects", "cardTopics"]
            }
        }
    ]
};

export function getStoredAiCategories() {
    try {
        const raw = localStorage.getItem(AI_CATEGORIES_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.error("Erro ao ler categorias de IA do localStorage:", e);
        return null;
    }
}

export function saveStoredAiCategories(data) {
    try {
        localStorage.setItem(AI_CATEGORIES_KEY, JSON.stringify(data));
        debouncedSyncSlotsToCloud();
    } catch (e) {
        console.error("Erro ao salvar categorias de IA no localStorage:", e);
    }
}

/**
 * Creates a normalized content signature for a card.
 */
export function getCardSignature(card) {
    if (!card) return '';
    const cleanDesc = stripHtml(card.description || '').toLowerCase();
    const cleanAns = stripHtml(card.answer || '').toLowerCase();
    return `${cleanDesc}:::${cleanAns}`.slice(0, 200);
}

/**
 * Checks if a deck or its cards are already categorized, avoiding redundant AI requests.
 */
export function isDeckCategorized({ allQuestions, currentDeckTitle, categories }) {
    const playable = (allQuestions || []).filter(q => q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
    if (playable.length === 0) return true;

    // 1. Check if any playable card has topic, aiTopic, subject, or aiSubject directly in its data
    const hasCardProp = playable.some(c => Boolean(c.topic || c.aiTopic || c.subject || c.aiSubject));
    if (hasCardProp) return true;

    if (!categories) return false;

    // 2. Check if any card signature is mapped in persistent cardTopicsBySignature
    if (categories.cardTopicsBySignature) {
        const hasSigMatch = playable.some(c => {
            const sig = getCardSignature(c);
            return sig && Boolean(categories.cardTopicsBySignature[sig]);
        });
        if (hasSigMatch) return true;
    }

    // 3. Check if deck has registered topics in cardTopicsByDeck
    const deckTopics = categories.cardTopicsByDeck?.[currentDeckTitle];
    if (deckTopics && deckTopics.length > 0) return true;

    return false;
}

/**
 * Calls Gemini Flash-Lite using Function Calling to categorize all decks and current cards at once.
 */
export async function callGeminiFlashLiteCategorization({
    currentDeckTitle,
    deckTitles,
    cards,
    existingCategories
}) {
    const token = await getCurrentUserToken().catch(() => null);
    if (!token) {
        throw new Error("Recurso exclusivo Flashcards Pro. Faça login com sua conta Pro para categorizar com IA.");
    }

    // Clean and truncate cards for prompt efficiency
    const formattedCards = (cards || []).map((c, idx) => {
        const cleanDesc = stripHtml(c.description || '').slice(0, 120);
        const cleanAns = stripHtml(c.answer || '').slice(0, 80);
        return {
            index: idx,
            text: `${cleanDesc}${cleanAns ? ` | R: ${cleanAns}` : ''}`
        };
    });

    const knownSubjects = existingCategories?.knownSubjects || [];
    const knownTopics = existingCategories?.knownTopicsByDeck?.[currentDeckTitle] || [];

    const promptText = `Você é um classificador pedagógico de alta eficiência.
Sua missão é classificar os baralhos em Matérias/Disciplinas amplas e classificar os cartões do baralho atual em Assuntos/Tópicos específicos.

BARALHOS PARA CATEGORIZAR EM MATÉRIAS:
${JSON.stringify(deckTitles, null, 2)}

CARTÕES DO BARALHO ATUAL ("${currentDeckTitle}") PARA CATEGORIZAR EM ASSUNTOS:
${JSON.stringify(formattedCards, null, 2)}

CATEGORIAS JÁ EXISTENTES PARA REUTILIZAR E MANTER O AGRUPAMENTO CONSISTENTE:
- Matérias já existentes no histórico: ${JSON.stringify(knownSubjects)}
- Assuntos já existentes para este baralho: ${JSON.stringify(knownTopics)}

REGRAS CRÍTICAS E OBRIGATÓRIAS:
1. MENOR NÚMERO POSSÍVEL DE CATEGORIAS: Agrupe ao máximo! Utilize temas consolidados e amplos (por exemplo: agrupe baralhos de cardiologia, nefrologia e pneumologia em 'Medicina Clínica' ou 'Medicina', a menos que haja necessidade clara de separar; agrupe perguntas semelhantes no mesmo assunto). Evite categorizações excessivamente fragmentadas.
2. REUTILIZAÇÃO: Priorize reutilizar as Matérias e Assuntos já existentes fornecidos acima sempre que coerente.
3. CHAME A FUNÇÃO: Você DEVE chamar obrigatoriamente a função 'salvar_categorizacao_estudos' enviando o mapeamento completo em 'deckSubjects' e 'cardTopics'.`;

    // Try primary model (gemini-flash-lite-latest), then fallback
    const models = [DEFAULT_MODEL, FALLBACK_MODEL];
    let lastError = null;

    for (const modelName of models) {
        try {
            const url = `${BACKEND_URL}/api/ai/stats`;
            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            };

            const requestBody = {
                model: modelName,
                contents: [
                    {
                        role: "user",
                        parts: [{ text: promptText }]
                    }
                ],
                tools: [categorizeTool],
                toolConfig: {
                    functionCallingConfig: {
                        mode: "ANY",
                        allowedFunctionNames: ["salvar_categorizacao_estudos"]
                    }
                }
            };

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || `Erro HTTP ${response.status}`;
                throw new Error(errMsg);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            if (!candidate) {
                throw new Error("Nenhum resultado retornado pelo modelo.");
            }

            // Extract functionCall
            let functionCall = null;
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.functionCall && part.functionCall.name === "salvar_categorizacao_estudos") {
                        functionCall = part.functionCall;
                        break;
                    }
                }
            }

            // Fallback parse if model returned JSON directly in text
            if (!functionCall && candidate.content?.parts?.[0]?.text) {
                try {
                    const text = candidate.content.parts[0].text;
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.deckSubjects && parsed.cardTopics) {
                            functionCall = { args: parsed };
                        }
                    }
                } catch (e) {
                    // Ignore parse fallback error
                }
            }

            if (!functionCall || !functionCall.args) {
                throw new Error("O Gemini não retornou a chamada de categorização estruturada.");
            }

            const args = typeof functionCall.args === 'string' ? JSON.parse(functionCall.args) : functionCall.args;
            const deckSubjects = args.deckSubjects || [];
            const cardTopics = args.cardTopics || [];

            // Merge with known categories
            const newSubjects = Array.from(new Set([...knownSubjects, ...deckSubjects.map(ds => ds.subject)])).filter(Boolean);
            const deckTopicsList = Array.from(new Set([...knownTopics, ...cardTopics.map(ct => ct.topic)])).filter(Boolean);

            const cardTopicsBySignature = { ...(existingCategories?.cardTopicsBySignature || {}) };
            const cardSubjectsBySignature = { ...(existingCategories?.cardSubjectsBySignature || {}) };

            const deckSubjectMap = {
                ...(existingCategories?.deckSubjectMap || {}),
                ...Object.fromEntries(deckSubjects.map(ds => [ds.deckTitle, ds.subject]))
            };
            const currentDeckSubject = deckSubjectMap[currentDeckTitle] || "Geral";

            // Map and persist each classified card
            cardTopics.forEach(ct => {
                const idx = Number(ct.cardIndex);
                const topic = ct.topic;
                if (!isNaN(idx) && cards && cards[idx] && topic) {
                    cards[idx].aiTopic = topic;
                    cards[idx].aiSubject = currentDeckSubject;
                    const sig = getCardSignature(cards[idx]);
                    if (sig) {
                        cardTopicsBySignature[sig] = topic;
                        cardSubjectsBySignature[sig] = currentDeckSubject;
                    }
                }
            });

            const updatedCategories = {
                ...existingCategories,
                knownSubjects: newSubjects,
                knownTopicsByDeck: {
                    ...(existingCategories?.knownTopicsByDeck || {}),
                    [currentDeckTitle]: deckTopicsList
                },
                deckSubjectMap,
                cardTopicsByDeck: {
                    ...(existingCategories?.cardTopicsByDeck || {}),
                    [currentDeckTitle]: cardTopics
                },
                cardTopicsBySignature,
                cardSubjectsBySignature,
                lastUpdated: Date.now()
            };

            saveStoredAiCategories(updatedCategories);

            return {
                deckSubjects,
                cardTopics,
                updatedCategories
            };

        } catch (err) {
            console.warn(`Tentativa com ${modelName} falhou:`, err.message);
            lastError = err;
        }
    }

    throw lastError || new Error("Falha ao categorizar com Gemini Flash-Lite.");
}

/**
 * Computes performance analytics for Subjects (all decks) and Topics (current deck).
 */
export function computeAiStats({
    categories,
    currentDeckTitle,
    allQuestions,
    currentSession,
    history
}) {
    if (!categories) {
        categories = { knownSubjects: [], deckSubjectMap: {}, cardTopicsByDeck: {}, cardTopicsBySignature: {} };
    }

    const deckSubjectMap = { ...(categories.deckSubjectMap || {}) };
    // Check if cards have a subject defined directly
    if (currentDeckTitle && !deckSubjectMap[currentDeckTitle]) {
        const cardWithSubject = (allQuestions || []).find(c => c && (c.subject || c.aiSubject));
        deckSubjectMap[currentDeckTitle] = cardWithSubject ? (cardWithSubject.subject || cardWithSubject.aiSubject) : "Geral";
    }

    // 1. Group Decks into Subjects
    const subjectsMap = {};

    // Seed subjects with known mapped decks
    Object.keys(deckSubjectMap).forEach(title => {
        const subj = deckSubjectMap[title] || "Outros";
        if (!subjectsMap[subj]) {
            subjectsMap[subj] = {
                subject: subj,
                decks: [],
                totalAnswered: 0,
                totalCorrect: 0,
                totalSessions: 0
            };
        }
        if (!subjectsMap[subj].decks.includes(title)) {
            subjectsMap[subj].decks.push(title);
        }
    });

    // Aggregate stats from history sessions
    (history || []).forEach(sess => {
        const title = sess.deckTitle || currentDeckTitle;
        const subj = deckSubjectMap[title] || "Outros";
        if (!subjectsMap[subj]) {
            subjectsMap[subj] = { subject: subj, decks: [title], totalAnswered: 0, totalCorrect: 0, totalSessions: 0 };
        }
        subjectsMap[subj].totalSessions++;
        subjectsMap[subj].totalAnswered += (sess.cardsAnswered || 0);
        subjectsMap[subj].totalCorrect += (sess.correctCount || 0);
    });

    // Aggregate stats from current session
    if (currentSession && currentSession.cardsAnswered > 0) {
        const title = currentSession.deckTitle || currentDeckTitle;
        const subj = deckSubjectMap[title] || "Outros";
        if (!subjectsMap[subj]) {
            subjectsMap[subj] = { subject: subj, decks: [title], totalAnswered: 0, totalCorrect: 0, totalSessions: 0 };
        }
        subjectsMap[subj].totalAnswered += (currentSession.cardsAnswered || 0);
        subjectsMap[subj].totalCorrect += (currentSession.correctCount || 0);
        // Only increment session count if not already archived
        if (!history || !history.some(h => h.id === currentSession.id)) {
            subjectsMap[subj].totalSessions++;
        }
    }

    const subjectsStats = Object.values(subjectsMap).map(s => {
        const acc = s.totalAnswered > 0 ? Math.round((s.totalCorrect / s.totalAnswered) * 100) : 0;
        return {
            subject: s.subject,
            decks: s.decks,
            totalAnswered: s.totalAnswered,
            totalCorrect: s.totalCorrect,
            totalSessions: s.totalSessions,
            accuracy: acc
        };
    }).sort((a, b) => b.accuracy - a.accuracy || b.totalAnswered - a.totalAnswered);

    // 2. Group Cards of Current Deck into Topics
    const cardTopicsList = categories.cardTopicsByDeck?.[currentDeckTitle] || [];
    const cardTopicMap = {};
    cardTopicsList.forEach(ct => {
        if (ct.cardIndex !== undefined) cardTopicMap[ct.cardIndex] = ct.topic;
    });

    const cardTopicsBySignature = categories.cardTopicsBySignature || {};

    const playableCards = (allQuestions || []).filter(c => c && c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note');
    const isCompleted = Boolean(
        currentSession?.completed || 
        (playableCards.length > 0 && currentSession?.cardsAnswered >= playableCards.length)
    );

    const cardAnswers = currentSession?.cardAnswers || {};
    const sessionByTopic = currentSession?.byTopic || {};

    // Pre-normalize answersLog and strugglingCards
    const answersLogNormalized = (currentSession?.answersLog || []).map(e => ({
        entry: e,
        sig: e.sig || '',
        key: stripHtml(e.question || '').toLowerCase()
    })).filter(item => item.key.length > 0 || item.sig.length > 0);

    const strugglingKeys = Object.values(currentSession?.strugglingCards || {}).map(sc =>
        stripHtml(sc.description || '').toLowerCase()
    ).filter(k => k.length > 0);

    const topicsMap = {};
    (allQuestions || []).forEach((card, idx) => {
        if (!card || card.type === 'divisor' || card.type === 'divider' || card.type === 'note') return;

        const sig = getCardSignature(card);
        const topic = card.topic || card.aiTopic || (sig ? cardTopicsBySignature[sig] : null) || cardTopicMap[idx] || "Geral";
        if (!card.aiTopic && topic !== "Geral") {
            card.aiTopic = topic;
        }
        if (!card.topic && topic !== "Geral") {
            card.topic = topic;
        }
        if (sig && topic !== "Geral" && !cardTopicsBySignature[sig]) {
            cardTopicsBySignature[sig] = topic;
        }
        if (!topicsMap[topic]) {
            topicsMap[topic] = {
                topic: topic,
                cardsCount: 0,
                answeredCount: 0,
                correctCount: 0,
                hasStruggling: false
            };
        }
        topicsMap[topic].cardsCount++;

        const cardCleanDesc = stripHtml(card.description || '').toLowerCase();
        const shortCardDesc = cardCleanDesc.slice(0, 40);

        // Check if card is struggling
        const isStruggling = strugglingKeys.length > 0 && strugglingKeys.some(sk => 
            sk === cardCleanDesc || 
            (shortCardDesc.length > 10 && (sk.includes(shortCardDesc) || shortCardDesc.includes(sk.slice(0, 40))))
        );
        if (isStruggling) {
            topicsMap[topic].hasStruggling = true;
        }

        // 1. Precise lookup via cardAnswers[sig]
        let cardAnswer = sig && cardAnswers[sig] ? cardAnswers[sig] : null;

        // 2. Lookup via answersLog
        let logEntry = null;
        if (!cardAnswer && answersLogNormalized.length > 0) {
            const found = answersLogNormalized.find(item => 
                (sig && item.sig && item.sig === sig) ||
                (cardCleanDesc && item.key === cardCleanDesc) ||
                (shortCardDesc.length > 15 && (item.key.includes(shortCardDesc) || shortCardDesc.includes(item.key.slice(0, 40))))
            );
            if (found) logEntry = found.entry;
        }

        if (cardAnswer) {
            topicsMap[topic].answeredCount++;
            if (cardAnswer.isCorrect) topicsMap[topic].correctCount++;
        } else if (logEntry) {
            topicsMap[topic].answeredCount++;
            if (logEntry.isCorrect) topicsMap[topic].correctCount++;
        } else if (isCompleted) {
            // Deck was completed in this session: every card in the deck was answered!
            topicsMap[topic].answeredCount++;
            if (isStruggling || (typeof card.wrongCount === 'number' && card.wrongCount > 0)) {
                // Answered with error
            } else {
                topicsMap[topic].correctCount++;
            }
        }
    });

    // If sessionByTopic has recorded counts that are higher/richer, reconcile:
    Object.keys(sessionByTopic).forEach(topName => {
        if (topicsMap[topName] && sessionByTopic[topName].total > topicsMap[topName].answeredCount) {
            topicsMap[topName].answeredCount = sessionByTopic[topName].total;
            topicsMap[topName].correctCount = Math.min(topicsMap[topName].answeredCount, sessionByTopic[topName].correct);
        }
    });

    const topicsStats = Object.values(topicsMap).map(t => {
        const acc = t.answeredCount > 0 ? Math.round((t.correctCount / t.answeredCount) * 100) : null;
        return {
            topic: t.topic,
            cardsCount: t.cardsCount,
            answeredCount: t.answeredCount,
            correctCount: t.correctCount,
            accuracy: acc,
            hasStruggling: t.hasStruggling
        };
    }).sort((a, b) => {
        // Ordenação do PIOR para o MELHOR desempenho:
        // Tópicos com dados de acurácia vêm primeiro, em ordem crescente (menor acurácia = pior primeiro)
        if (a.accuracy !== null && b.accuracy !== null) {
            if (a.accuracy !== b.accuracy) {
                return a.accuracy - b.accuracy;
            }
            // Critério de desempate 1: maior número absoluto de erros primeiro
            const aErrors = a.answeredCount - a.correctCount;
            const bErrors = b.answeredCount - b.correctCount;
            if (bErrors !== aErrors) {
                return bErrors - aErrors;
            }
            // Critério de desempate 2: tópicos com cards marcados como struggling vêm primeiro
            if (a.hasStruggling !== b.hasStruggling) {
                return a.hasStruggling ? -1 : 1;
            }
            return b.cardsCount - a.cardsCount;
        }
        // Tópicos já respondidos vêm antes de tópicos ainda pendentes (null)
        if (a.accuracy !== null) return -1;
        if (b.accuracy !== null) return 1;
        return b.cardsCount - a.cardsCount;
    });

    return { subjectsStats, topicsStats };
}
