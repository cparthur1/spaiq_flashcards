/**
 * js/engine/tutor.js
 * Módulo de Inteligência Artificial: cliente do Google Gemini,
 * avaliação semântica de respostas, tutor virtual para chat interativo
 * e formatação de respostas didáticas com KaTeX/Markdown.
 */

import { renderMathAndMarkdown, stripHtml, escapeHtml } from '../utils.js';
import { isUserPro } from '../explore-modal.js';
import { getCurrentUserToken } from '../firebase-client.js';
import { BACKEND_URL } from '../backend-api.js';
import { t } from '../i18n.js';

let lastUserAnswerForChat = "";
let currentBackendChatHistory = [];
let currentChatModel = "flash-lite";
export const BACKGROUND_CORRECTOR_MODEL = "gemini-decision-1";
const BACKGROUND_CORRECTOR_FALLBACK_MODEL = "flash-lite";
const DECISION_ACCEPT_THRESHOLD = 0.60;
const DECISION_CORROBORATED_THRESHOLD = 0.50;
let hasChatInteraction = false;

export function isTutorEnabled() {
    return Boolean(isUserPro() && localStorage.getItem('flashcards_ai_enabled') !== 'false');
}

export function setTutorApiKey() {}

export function disableTutor() {
    currentBackendChatHistory = [];
}

export function initTutor() {}

export function updateTutorUI(elements = {}) {
    const menuAiIcon = elements.menuAiIcon || document.getElementById('menu-ai-icon');
    const menuAiStatusBadge = elements.menuAiStatusBadge || document.getElementById('menu-ai-status-badge');
    const menuAiSubtitle = elements.menuAiSubtitle || document.getElementById('menu-ai-subtitle');
    const aiIconOff = elements.aiIconOff || document.getElementById('ai-icon-off');
    const aiIconOn = elements.aiIconOn || document.getElementById('ai-icon-on');
    const aiSwitch = elements.aiSwitch || document.getElementById('ai-switch');

    const isAiEnabled = isTutorEnabled();
    if (isAiEnabled) {
        if (menuAiIcon) menuAiIcon.src = '../assets/img/enabled_ai.svg';
        if (menuAiStatusBadge) {
            menuAiStatusBadge.textContent = t('active_status_fem');
            menuAiStatusBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
        }
        if (menuAiSubtitle) menuAiSubtitle.textContent = t('smart_verification_active');
        if (aiIconOff) aiIconOff.classList.add('hidden');
        if (aiIconOn) aiIconOn.classList.remove('hidden');
        if (aiSwitch) aiSwitch.selected = true;
    } else {
        if (menuAiIcon) menuAiIcon.src = '../assets/img/config_ai.svg';
        if (menuAiStatusBadge) {
            menuAiStatusBadge.textContent = t('disabled_status_fem');
            menuAiStatusBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500';
        }
        if (menuAiSubtitle) menuAiSubtitle.textContent = t('click_to_configure');
        if (aiIconOff) aiIconOff.classList.remove('hidden');
        if (aiIconOn) aiIconOn.classList.add('hidden');
        if (aiSwitch) aiSwitch.selected = false;
    }
}

export function setLastUserAnswerForChat(ans) {
    lastUserAnswerForChat = ans || "";
}

export function getLastUserAnswerForChat() {
    return lastUserAnswerForChat;
}

export function resetTutorChatSession() {
    currentBackendChatHistory = [];
}

export function getHasChatInteraction() {
    return hasChatInteraction;
}

export function setHasChatInteraction(val) {
    hasChatInteraction = Boolean(val);
}

/**
 * Formata a resposta esperada do cartão para avaliação semântica.
 */
function formatExpectedAnswerForEvaluation(questionObj) {
    if (questionObj.type === 'fill' && questionObj.answers && questionObj.answers.length > 0) {
        return questionObj.answers.join(' ; ');
    }
    if (questionObj.type === 'flowchart') {
        if (!Array.isArray(questionObj?.nodes) || questionObj.nodes.length === 0) {
            return questionObj?.answer || '';
        }
        const idToLabel = new Map();
        questionObj.nodes.forEach((n, idx) => {
            let bIdx = 0;
            const filled = String(n.text || '').replace(/_/g, () => {
                const ans = Array.isArray(n.blanks) && n.blanks[bIdx] !== undefined ? n.blanks[bIdx] : '_';
                bIdx++;
                return `[${ans}]`;
            });
            idToLabel.set(n.id, `${idx + 1}. ${filled}`);
        });
        return questionObj.nodes.map(n => {
            const label = idToLabel.get(n.id);
            const nexts = Array.isArray(n.next) && n.next.length > 0
                ? ` -> [${n.next.map(nid => idToLabel.get(nid) || nid).join(', ')}]`
                : '';
            return `${label}${nexts}`;
        }).join(' | ');
    }
    if (questionObj.type === 'image_arrows' && Array.isArray(questionObj.imageArrows) && questionObj.imageArrows.length > 0) {
        return questionObj.imageArrows.map((a, i) => `${i + 1}. ${a.label || ''}`).join(' ; ');
    }
    const separator = questionObj.type === 'open_double' ? ' ; ' : ' / ';
    return [questionObj.answer, questionObj.answer2].filter(Boolean).join(separator);
}

const ACCEPTED_DECISION_REASON_KEYS = {
    exact_synonym: 'ai_decision_reason_exact_synonym',
    standard_abbreviation: 'ai_decision_reason_standard_abbreviation',
    core_technical_concept: 'ai_decision_reason_core_technical_concept',
    minor_typo: 'ai_decision_reason_minor_typo'
};

const REJECTED_DECISION_REASON_KEYS = {
    wrong_value_or_sequence: 'ai_decision_reason_wrong_value_or_sequence',
    factual_error: 'ai_decision_reason_factual_error',
    vague_or_incomplete: 'ai_decision_reason_vague_or_incomplete'
};

function formatDecisionJustification(correto, reasonChoice, confidence) {
    const pct = Math.round((Number(confidence) || 0) * 100);
    const keyMap = correto ? ACCEPTED_DECISION_REASON_KEYS : REJECTED_DECISION_REASON_KEYS;
    const defaultKey = correto ? 'ai_decision_reason_accepted' : 'ai_decision_reason_rejected';
    const key = (reasonChoice && keyMap[reasonChoice]) ? keyMap[reasonChoice] : defaultKey;
    return t(key, { confidence: pct });
}

/**
 * Avalia semanticamente se a resposta digitada pelo usuário está correta
 * usando Gemini Decision 1 (Decisions API) como modelo principal do corretor em segundo plano,
 * com fallback automático para gemini-flash-lite-latest em caso de indisponibilidade.
 * 
 * @param {Object} options
 * @param {Object} options.questionObj - O cartão atual
 * @param {string} options.actualAnswer - Resposta digitada pelo usuário
 * @param {Function} [options.onSlowConnection] - Callback quando latência > 15s
 * @param {Function} [options.onAiDisabledByErrors] - Callback quando múltiplos erros 503 ocorrem
 * @returns {Promise<{correto: boolean, justificativa: string, model?: string, probability?: number, confidence?: number}|null>}
 */
export async function evaluateAnswerSemantic({ questionObj, actualAnswer, onSlowConnection, onAiDisabledByErrors }) {
    if (!isTutorEnabled() || !questionObj) return null;

    try {
        const cleanQuestion = stripHtml(questionObj.description || '') || String(questionObj.description || '');
        const expected = formatExpectedAnswerForEvaluation(questionObj);

        const token = await getCurrentUserToken().catch(() => null);
        if (!token) return null;

        const decisionInput = [
            `Flashcard Question: ${cleanQuestion}`,
            `Card Type: ${questionObj.type || 'open'}`,
            `Expected Answer(s): ${expected}`,
            `User's Typed Answer: ${actualAnswer}`
        ].join('\n');

        const decisionQuestions = {
            is_correct: {
                type: 'noul',
                instructions: [
                    "Determine whether the User's Typed Answer is semantically valid or an acceptable equivalent to the Expected Answer(s) for this academic flashcard.",
                    "Answer YES (true) ONLY if: (1) it is an exact synonym, equivalent academic term, or standard abbreviation/acronym; (2) it has a minor typo/spelling variation preserving the exact technical meaning; OR (3) it states the core essential technical term demonstrating exact knowledge (e.g., 'Braquial' for 'Músculo braquial').",
                    "Answer NO (false) if: (1) the card asks for multiple values, durations, or a sequence (e.g., in order or 'respectively') and ANY value, duration, or order is wrong or missing (e.g., 50 ms instead of 40 ms); OR (2) it contains factual errors, wrong numbers, refers to a different structure/concept, or is too vague."
                ].join(' ')
            },
            reason_category: {
                type: 'choice',
                instructions: "Classify the primary reason why the User's Typed Answer should be accepted or rejected relative to the Expected Answer(s).",
                criteria: {
                    exact_synonym: "Accepted: Exact synonym or equivalent academic term.",
                    standard_abbreviation: "Accepted: Standard abbreviation or acronym with identical meaning.",
                    core_technical_concept: "Accepted: Essential core term demonstrating exact technical knowledge.",
                    minor_typo: "Accepted: Minor spelling or typing variation preserving exact meaning.",
                    wrong_value_or_sequence: "Rejected: Incorrect numerical value, duration, unit, or sequence order.",
                    factual_error: "Rejected: Factually incorrect or refers to a different concept/structure.",
                    vague_or_incomplete: "Rejected: Too vague, ambiguous, or missing required elements."
                }
            }
        };

        const decisionRes = await fetch(`${BACKEND_URL}/api/ai/tutor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: BACKGROUND_CORRECTOR_MODEL,
                input: decisionInput,
                questions: decisionQuestions
            })
        });

        if (decisionRes.ok) {
            const decisionData = await decisionRes.json().catch(() => null);
            const isCorrectAns = decisionData?.answers?.is_correct;
            const reasonAns = decisionData?.answers?.reason_category;
            if (isCorrectAns && typeof isCorrectAns.noul === 'number') {
                const probability = isCorrectAns.noul;
                const confidence = typeof isCorrectAns.confidence === 'number'
                    ? isCorrectAns.confidence
                    : Math.max(probability, 1 - probability);
                const reasonChoice = reasonAns?.choice || null;
                const isAcceptedReason = Boolean(reasonChoice && ACCEPTED_DECISION_REASON_KEYS[reasonChoice]);
                const correto = probability >= DECISION_ACCEPT_THRESHOLD
                    || (probability >= DECISION_CORROBORATED_THRESHOLD && isAcceptedReason);
                const justificativa = formatDecisionJustification(correto, reasonChoice, confidence);
                console.log(`[Tutor] Corretor em segundo plano (${BACKGROUND_CORRECTOR_MODEL}):`, {
                    correto,
                    probability,
                    confidence,
                    reason: reasonChoice
                });
                return {
                    correto,
                    justificativa,
                    model: BACKGROUND_CORRECTOR_MODEL,
                    probability,
                    confidence
                };
            }
            console.warn(`[Tutor] Resposta inesperada de ${BACKGROUND_CORRECTOR_MODEL}, tentando fallback...`, decisionData);
        } else {
            if (decisionRes.status === 401 || decisionRes.status === 403) {
                return null;
            }
            console.warn(`[Tutor] ${BACKGROUND_CORRECTOR_MODEL} retornou status ${decisionRes.status}, tentando fallback para ${BACKGROUND_CORRECTOR_FALLBACK_MODEL}...`);
        }

        // Fallback para modelo generativo caso o endpoint de Decisions não esteja disponível
        const prompt = `
            Você é um revisor de flashcards acadêmicos rigoroso. 
            O sistema automático marcou a resposta do usuário como incorreta. Avalie se a resposta digitada é semanticamente válida ou uma variação aceitável em relação à resposta esperada.

            Pergunta: "${cleanQuestion}"
            Resposta(s) Esperada(s) no Banco: "${expected}"
            Resposta Digitada pelo Usuário: "${actualAnswer}"

            DIRETRIZES DE AVALIAÇÃO:
            1. Se o usuário usou um sinônimo exato, termo equivalente aceito pela comunidade acadêmica ou abreviação padrão, considere CORRETO (correto: true).
            2. Se o usuário digitou uma parte fundamental suficiente para demonstrar conhecimento técnico exato (ex: "Braquial" para "Músculo braquial"), considere CORRETO (correto: true).
            3. Se a questão pedir múltiplos valores, durações ou sequências (ex: em ordem ou 'respectivamente'), TODOS os valores/sequências devem estar corretos. Se qualquer valor numérico ou duração estiver incorreto (ex: 50 ms em vez de 40 ms, ou números errados na sequência), considere INCORRETO (correto: false).
            4. Se a resposta contiver erros factuais, dados numéricos incorretos, for vaga ou sobre outra estrutura, considere INCORRETO (correto: false).

            Retorne um JSON com 'correto' (boolean) e 'justificativa' (string).
        `;

        const res = await fetch(`${BACKEND_URL}/api/ai/tutor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: BACKGROUND_CORRECTOR_FALLBACK_MODEL,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    thinkingConfig: { thinkingLevel: "LOW" },
                    responseMimeType: "application/json"
                }
            })
        });
        if (!res.ok) return null;
        const resData = await res.json();
        const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        return text ? JSON.parse(text) : null;
    } catch (e) {
        console.error("[Tutor] Erro na avaliação IA:", e);
        return null;
    }
}

export function addMsg(sender, text, chatMessages) {
    const container = chatMessages || document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = sender === 'ai' ? 'chat-message-ai' : 'chat-message-user';

    if (sender === 'ai' && typeof marked !== 'undefined') {
        const rendered = renderMathAndMarkdown(text);
        if (typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function') {
            div.innerHTML = DOMPurify.sanitize(rendered, {
                USE_PROFILES: { html: true, mathMl: true, svg: true },
                ADD_TAGS: ['semantics', 'annotation', 'mark'],
                ADD_ATTR: ['target', 'class', 'style', 'aria-hidden', 'columnspacing', 'columnalign', 'rowspacing']
            });
        } else {
            div.innerHTML = escapeHtml(rendered);
        }
    } else {
        div.textContent = text;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

export function showTyping(chatMessages) {
    const chatContainer = document.getElementById('ai-chat-container');
    if (chatContainer) {
        chatContainer.classList.add('gemini-thinking');
    }
    const container = chatMessages || document.getElementById('chat-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
    return 'thinking-glow';
}

export function hideTyping(id) {
    const chatContainer = document.getElementById('ai-chat-container');
    if (chatContainer) {
        chatContainer.classList.remove('gemini-thinking');
    }
}

/**
 * Envia mensagem do usuário para o Tutor AI e exibe resposta.
 */
export async function sendTutorChatMessage({ msg, currentQuestion, chatInput, chatMessages }) {
    const text = (msg !== undefined ? msg : chatInput?.value || '').trim();
    const messagesContainer = chatMessages || document.getElementById('chat-messages');
    const inputElem = chatInput || document.getElementById('chat-input');

    if (!text || !isTutorEnabled() || !currentQuestion) return;

    hasChatInteraction = true;
    addMsg('user', text, messagesContainer);
    if (inputElem) inputElem.value = '';

    const tid = showTyping(messagesContainer);
    try {
        const correctAnswers = (currentQuestion.type === 'fill' && currentQuestion.answers && currentQuestion.answers.length > 0)
            ? [currentQuestion.answers.join(' ; ')]
            : currentQuestion.type === 'flowchart' && Array.isArray(currentQuestion.nodes) && currentQuestion.nodes.length > 0
                ? [currentQuestion.nodes.map((n, idx) => {
                    let bIdx = 0;
                    const filled = String(n.text || '').replace(/_/g, () => {
                        const ans = Array.isArray(n.blanks) && n.blanks[bIdx] !== undefined ? n.blanks[bIdx] : '_';
                        bIdx++;
                        return `[${ans}]`;
                    });
                    const nextStr = Array.isArray(n.next) && n.next.length > 0 ? ` -> ${n.next.join(', ')}` : '';
                    return `(${n.id || idx + 1}) ${filled}${nextStr}`;
                }).join(' | ')]
                : [currentQuestion.answer];
        if (currentQuestion.type !== 'fill' && currentQuestion.type !== 'flowchart' && currentQuestion.answer2) correctAnswers.push(currentQuestion.answer2);

        const systemPrompt = `
            Você é um professor tutor ajudando um estudante com um flashcard.
            
            CONTEXTO DA QUESTÃO:
            Pergunta: "${currentQuestion.description}"
            Resposta(s) Correta(s) no Banco: "${correctAnswers.join(' / ')}"
            Resposta que o Usuário deu inicialmente: "${lastUserAnswerForChat}"
            
            Responda de forma didática, objetiva e curta. Se o usuário errou, explique o porquê de forma simples. Use Markdown para listas, tabelas, ênfase e fórmulas matemáticas/químicas em LaTeX ($...$ ou $$...$$).
            Mantenha o contexto desta questão durante toda a conversa.
        `;

        const token = await getCurrentUserToken().catch(() => null);
        if (!token) {
            hideTyping(tid);
            addMsg('ai', t('tutor_login_pro_required'), messagesContainer);
            return;
        }

        if (!currentBackendChatHistory || currentBackendChatHistory.length === 0) {
            currentBackendChatHistory = [];
        }
        currentBackendChatHistory.push({ role: 'user', parts: [{ text }] });

            const res = await fetch(`${BACKEND_URL}/api/ai/tutor`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    model: currentChatModel || 'flash-lite',
                    contents: currentBackendChatHistory,
                    systemInstruction: { parts: [{ text: systemPrompt }] }
                })
            });

            hideTyping(tid);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                addMsg('ai', errData.message || t('tutor_connection_error'), messagesContainer);
                return;
            }

            const data = await res.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            currentBackendChatHistory.push({ role: 'model', parts: [{ text: reply }] });
            addMsg('ai', reply, messagesContainer);
        } catch (e) {
            console.error("[Tutor] Erro no chat:", e);
            hideTyping(tid);
            addMsg('ai', t('tutor_connection_error'), messagesContainer);
        }
    }

/**
 * Obtém uma definição extremamente resumida do texto selecionado no contexto do flashcard.
 * @param {string} selectedText Termo selecionado
 * @param {object} currentQuestion Objeto do cartão atual
 * @returns {Promise<string>} Definição resumida gerada pelo gemini-flash-lite-latest
 */
export async function getTermDefinition({ selectedText, currentQuestion }) {
    if (!isTutorEnabled() || !selectedText) return null;

    try {
        const cleanQuestion = currentQuestion?.description ? stripHtml(currentQuestion.description) : '';
        const cleanAnswer = (currentQuestion?.type === 'fill' && currentQuestion?.answers && currentQuestion.answers.length > 0)
            ? currentQuestion.answers.join(' ; ')
            : currentQuestion?.type === 'image_arrows' && Array.isArray(currentQuestion?.imageArrows) && currentQuestion.imageArrows.length > 0
                ? currentQuestion.imageArrows.map((a, idx) => `${idx + 1}. ${stripHtml(String(a?.label || ''))}`).join(' ; ')
            : currentQuestion?.type === 'flowchart' && Array.isArray(currentQuestion?.nodes) && currentQuestion.nodes.length > 0
                ? currentQuestion.nodes.map(n => {
                    let bIdx = 0;
                    return stripHtml(String(n.text || '')).replace(/_/g, () => (Array.isArray(n.blanks) && n.blanks[bIdx++] ? n.blanks[bIdx - 1] : '_'));
                }).join(' -> ')
                : [currentQuestion?.answer, currentQuestion?.answer2].filter(Boolean).map(a => stripHtml(String(a))).join(' / ');

        const systemPrompt = `Você é um tutor acadêmico de flashcards. Sua tarefa é fornecer uma definição EXTREMAMENTE resumida (no máximo 1 ou 2 frases curtas, direta ao ponto) do termo ou trecho selecionado pelo estudante, considerando estritamente o contexto da pergunta e resposta deste flashcard.
Não inclua preâmbulos, saudações, nem repita "o termo significa...". Seja direto e conciso.`;

        const prompt = `Flashcard:
Pergunta: "${cleanQuestion}"
Resposta: "${cleanAnswer}"

Termo selecionado para definir: "${selectedText}"`;

        const token = await getCurrentUserToken().catch(() => null);
        if (!token) return null;

        const res = await fetch(`${BACKEND_URL}/api/ai/tutor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: "flash-lite",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    thinkingConfig: { thinkingLevel: "LOW" }
                }
            })
        });

        if (!res.ok) return null;
        const data = await res.json();
        return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    } catch (e) {
        console.error("[Tutor] Erro ao obter definição do termo:", e);
        return null;
    }
}

/**
 * Registra a definição do popup no histórico de chat do tutor como se o usuário
 * tivesse perguntado "Defina [termo]" e o agente tivesse respondido com a definição.
 * Atualiza o histórico da sessão de chat da IA e deixa o usuário livre para digitar a próxima dúvida.
 */
export async function logDefinitionToChat({ term, definition, currentQuestion, chatMessages, chatInput }) {
    if (!term || !definition) return;

    const messagesContainer = chatMessages || document.getElementById('chat-messages');
    const inputElem = chatInput || document.getElementById('chat-input');

    hasChatInteraction = true;

    const userText = `Defina ${term}`;

    // 1. Registra as mensagens na UI do chat
    addMsg('user', userText, messagesContainer);
    addMsg('ai', definition, messagesContainer);

    // 2. Limpa o input e foca para a próxima pergunta
    if (inputElem) {
        inputElem.value = '';
        inputElem.focus();
    }

    // 3. Atualiza histórico do backend
    currentBackendChatHistory = [
        ...(currentBackendChatHistory || []),
        { role: 'user', parts: [{ text: userText }] },
        { role: 'model', parts: [{ text: definition }] }
    ];
}


