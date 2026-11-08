import { callWithRetry, sanitizeChatHistory, renderMathAndMarkdown, stripHtml, escapeHtml, sanitizeImageUrl, generateSecureId, NOTEBOOK_STORAGE_KEY, encodeStoragePayload } from './utils.js';
import { initExploreModal, openProModal, openExtraDeckModal, isUserPro, getUserProStatus, refreshUserProStatus } from './explore-modal.js';
import { onAuthChange, getCurrentUserToken } from './firebase-client.js';
import { BACKEND_URL } from './backend-api.js';
import { openDeckInSlots, syncSlotsToCloud, debouncedSyncSlotsToCloud, getLocalSlots, saveLocalSlots } from './slot-manager.js';
import { syncSharedDeckToFirestore, shareDeckToCloud, showShareSuccessDialog } from './share-manager.js';
import { t, getCurrentLanguage } from './i18n.js';
import { savePendingGeneration, getPendingGeneration, clearPendingGeneration, hasPendingGenerationFlag } from './pending-generation.js';
import { openImageEditorModal, renderAnnotatedImage, isImageAnnotated, getArrowColorTheme } from './image-editor-modal.js';

try {
    initExploreModal();
} catch (e) {}

function compressPDFWithWorker(file) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('../js/pdf-worker.js');
        worker.onmessage = (e) => {
            if (e.data.success) resolve(e.data.blob);
            else reject(new Error(e.data.error));
            worker.terminate();
        };
        worker.onerror = (err) => {
            reject(err);
            worker.terminate();
        };
        worker.postMessage({ file, fileName: file.name });
    });
}

// --- DOM ELEMENTS ---
const dashboardView = document.getElementById('dashboard-view');
const editorView = document.getElementById('editor-view');
const globalError = document.getElementById('global-error');

// Mode Selection Cards (Netflix Style)
const cardMode11 = document.getElementById('card-mode-1-1');
const cardMode12 = document.getElementById('card-mode-1-2');
const cardMode21 = document.getElementById('card-mode-2-1');
const cardMode22 = document.getElementById('card-mode-2-2');

// Pro Status Button
const openProBtn = document.getElementById('open-pro-btn');
const dashboardProStatus = document.getElementById('dashboard-pro-status');

// Modal 1.2 Elements (Convert Doc)
const modal12 = document.getElementById('modal-1-2');
const closeModal12Btn = document.getElementById('close-modal-1-2-btn');
const cancelModal12Btn = document.getElementById('cancel-modal-1-2-btn');
const submitModal12Btn = document.getElementById('submit-modal-1-2-btn');
const modal12File = document.getElementById('modal-1-2-file');
const modal12FileName = document.getElementById('modal-1-2-file-name');
const modal12Error = document.getElementById('modal-1-2-error');
const modal12SandboxInput = document.getElementById('modal-1-2-sandbox-input');
const modal12PreviewCards = document.getElementById('modal-1-2-preview-cards');
const modal12PreviewCount = document.getElementById('modal-1-2-preview-count');
const modal12ResetSandboxBtn = document.getElementById('modal-1-2-reset-sandbox-btn');
const modal12UseSandboxBtn = document.getElementById('modal-1-2-use-sandbox-btn');

// Modal 2.1 Elements (AI Materials)
const modal21 = document.getElementById('modal-2-1');
const closeModal21Btn = document.getElementById('close-modal-2-1-btn');
const cancelModal21Btn = document.getElementById('cancel-modal-2-1-btn');
const submitModal21Btn = document.getElementById('submit-modal-2-1-btn');
const modal21Files = document.getElementById('modal-2-1-files');
const modal21FilesText = document.getElementById('modal-2-1-files-text');
const modal21FilesCount = document.getElementById('modal-2-1-files-count');
const modal21IconsContainer = document.getElementById('modal-2-1-icons-container');
const modal21Prompt = document.getElementById('modal-2-1-prompt');
const modal21Error = document.getElementById('modal-2-1-error');
const modal21LoadingMsg = document.getElementById('modal-2-1-loading-msg');
const modal21Spinner = document.getElementById('modal-2-1-spinner');
const modal21LangContainer = document.getElementById('modal-2-1-language-container');
const modal21LangChips = document.getElementById('modal-2-1-lang-chips');
const modal21CustomLangContainer = document.getElementById('modal-2-1-custom-language-container');
const modal21CustomLangInput = document.getElementById('modal-2-1-custom-language-input');
let modal21SelectedLanguage = 'Inglês';

function updateModal21LanguageUI() {
    if (!modal21LangContainer) return;
    if (getCurrentLanguage() !== 'pt-BR') {
        modal21LangContainer.classList.remove('hidden');
    } else {
        modal21LangContainer.classList.add('hidden');
    }
}

function resetModal21LanguageSelection() {
    modal21SelectedLanguage = 'Inglês';
    if (modal21LangChips) {
        const langButtons = modal21LangChips.querySelectorAll('.modal-2-1-lang-btn');
        langButtons.forEach(btn => {
            if (btn.dataset.value === 'Inglês') {
                btn.classList.remove('bg-white', 'text-gray-700', 'border-gray-300', 'font-semibold');
                btn.classList.add('bg-purple-600', 'text-white', 'border-purple-600', 'font-bold', 'shadow-xs');
            } else {
                btn.classList.remove('bg-purple-600', 'text-white', 'border-purple-600', 'font-bold', 'shadow-xs');
                btn.classList.add('bg-white', 'text-gray-700', 'border-gray-300', 'font-semibold');
            }
        });
    }
    if (modal21CustomLangContainer) modal21CustomLangContainer.classList.add('hidden');
    if (modal21CustomLangInput) modal21CustomLangInput.value = '';
}

if (modal21LangChips) {
    const langButtons = modal21LangChips.querySelectorAll('.modal-2-1-lang-btn');
    langButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.value;
            modal21SelectedLanguage = val;
            langButtons.forEach(b => {
                b.classList.remove('bg-purple-600', 'text-white', 'border-purple-600', 'font-bold', 'shadow-xs');
                b.classList.add('bg-white', 'text-gray-700', 'border-gray-300', 'font-semibold');
            });
            btn.classList.remove('bg-white', 'text-gray-700', 'border-gray-300', 'font-semibold');
            btn.classList.add('bg-purple-600', 'text-white', 'border-purple-600', 'font-bold', 'shadow-xs');

            if (val === 'custom') {
                modal21CustomLangContainer?.classList.remove('hidden');
                modal21CustomLangInput?.focus();
            } else {
                modal21CustomLangContainer?.classList.add('hidden');
            }
        });
    });
}

window.addEventListener('storage', (e) => {
    if (e.key === 'flashcards_language' || e.key === 'flashcards_settings_updated_at') {
        updateModal21LanguageUI();
    }
});

// Modal 2.2 Elements (AI Enhance Doc)
const modal22 = document.getElementById('modal-2-2');
const closeModal22Btn = document.getElementById('close-modal-2-2-btn');
const cancelModal22Btn = document.getElementById('cancel-modal-2-2-btn');
const submitModal22Btn = document.getElementById('submit-modal-2-2-btn');
const modal22File = document.getElementById('modal-2-2-file');
const modal22FileName = document.getElementById('modal-2-2-file-name');
const modal22Error = document.getElementById('modal-2-2-error');
const modal22LoadingMsg = document.getElementById('modal-2-2-loading-msg');
const modal22Spinner = document.getElementById('modal-2-2-spinner');

// Gemini Down Modal
const geminiDownModal = document.getElementById('gemini-down-modal');
const useTraditionalTxtBtn = document.getElementById('use-traditional-txt-btn');
const retryGeminiBtn = document.getElementById('retry-gemini-btn');
const closeGeminiDownModalBtn = document.getElementById('close-gemini-down-modal-btn');

// Editor Sidebar Tabs & Panels
const tabCreatorBtn = document.getElementById('tab-creator-btn');
const tabAiChatBtn = document.getElementById('tab-ai-chat-btn');
const cardCreatorPanel = document.getElementById('card-creator-panel');
const aiEditorChatPanel = document.getElementById('ai-editor-chat-panel');

// Card Creator UI Elements
const creatorCardType = document.getElementById('creator-card-type');
const creatorTypeHint = document.getElementById('creator-type-hint');
const creatorQuestionLabel = document.getElementById('creator-question-label');
const creatorQuestion = document.getElementById('creator-question');
const creatorQImgUrl = document.getElementById('creator-q-img-url');
const creatorQImgPreviewContainer = document.getElementById('creator-q-img-preview-container');
const creatorQImgPreview = document.getElementById('creator-q-img-preview');
const creatorRemoveQImg = document.getElementById('creator-remove-q-img');
const creatorEditQImg = document.getElementById('creator-edit-q-img');

const creatorGroupOpen = document.getElementById('creator-group-open');
const creatorAnsOpen = document.getElementById('creator-ans-open');

const creatorGroupOpenDouble = document.getElementById('creator-group-open-double');
const creatorAnsDouble1 = document.getElementById('creator-ans-double-1');
const creatorAnsDouble2 = document.getElementById('creator-ans-double-2');

const creatorGroupFill = document.getElementById('creator-group-fill');
const creatorAnsFill = document.getElementById('creator-ans-fill');

const creatorGroupAnki = document.getElementById('creator-group-anki');
const creatorAnsAnki = document.getElementById('creator-ans-anki');
const creatorAnsImgUrl = document.getElementById('creator-ans-img-url');
const creatorAnsImgPreviewContainer = document.getElementById('creator-ans-img-preview-container');
const creatorAnsImgPreview = document.getElementById('creator-ans-img-preview');
const creatorRemoveAnsImg = document.getElementById('creator-remove-ans-img');
const creatorEditAnsImg = document.getElementById('creator-edit-ans-img');

const creatorGroupMc = document.getElementById('creator-group-mc');
const creatorMcOptionsList = document.getElementById('creator-mc-options-list');
const creatorAddMcOptBtn = document.getElementById('creator-add-mc-opt-btn');

const creatorGroupImageArrows = document.getElementById('creator-group-image-arrows');
const creatorArrowsCountBadge = document.getElementById('creator-arrows-count-badge');
const creatorArrowsEmptyMsg = document.getElementById('creator-arrows-empty-msg');
const creatorArrowsInputsList = document.getElementById('creator-arrows-inputs-list');

const creatorGroupVoice = document.getElementById('creator-group-voice');
const creatorAnsVoice = document.getElementById('creator-ans-voice');

const creatorFeedback = document.getElementById('creator-feedback');
const creatorSubmitCardBtn = document.getElementById('creator-submit-card-btn');

// AI Chat Elements
const chatHistory = document.getElementById('chat-history');
const chatPromptQueue = document.getElementById('chat-prompt-queue');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatSpinner = document.getElementById('chat-spinner');

// Deck Preview (Right Column)
const cardsList = document.getElementById('cards-list');
const deckSizeBadge = document.getElementById('deck-size-badge');
const deckTitleDisplay = document.getElementById('deck-title-display');
const downloadDeckBtn = document.getElementById('download-deck-btn');
const shareDeckBtn = document.getElementById('share-deck-btn');
const playDeckBtn = document.getElementById('play-deck-btn');
const addCardBtn = document.getElementById('add-card-btn');

// Inline Edit Modal
const inlineEditModal = document.getElementById('inline-edit-modal');
const closeInlineEditBtn = document.getElementById('close-inline-edit-btn');
const cancelInlineEditBtn = document.getElementById('cancel-inline-edit-btn');
const saveInlineEditBtn = document.getElementById('save-inline-edit-btn');
const editCardIndex = document.getElementById('edit-card-index');
const editCardType = document.getElementById('edit-card-type');
const editCardDesc = document.getElementById('edit-card-desc');
const editCardAns1 = document.getElementById('edit-card-ans1');
const editCardAns1Group = document.getElementById('edit-card-ans1-group');
const editCardAns1Label = document.getElementById('edit-card-ans1-label');
const editCardAns2Group = document.getElementById('edit-card-ans2-group');
const editCardAns2 = document.getElementById('edit-card-ans2');
const editCardFillGroup = document.getElementById('edit-card-fill-group');
const editCardFillAnswer = document.getElementById('edit-card-fill-answer');
const editCardAnkiGroup = document.getElementById('edit-card-anki-group');
const editCardAnkiAnswer = document.getElementById('edit-card-anki-answer');
const editCardVoiceGroup = document.getElementById('edit-card-voice-group');
const editCardVoiceAnswer = document.getElementById('edit-card-voice-answer');
const editCardMcGroup = document.getElementById('edit-card-mc-group');
const editCardMcList = document.getElementById('edit-card-mc-list');
const editCardAddMcOptBtn = document.getElementById('edit-card-add-mc-opt-btn');

const inlineEditImageArrowsGroup = document.getElementById('inline-edit-image-arrows-group');
const inlineEditArrowsCountBadge = document.getElementById('inline-edit-arrows-count-badge');
const inlineEditArrowsEmptyMsg = document.getElementById('inline-edit-arrows-empty-msg');
const inlineEditArrowsInputsList = document.getElementById('inline-edit-arrows-inputs-list');

const inlineEditImagePreviewContainer = document.getElementById('inline-edit-image-preview-container');
const inlineEditImagePreview = document.getElementById('inline-edit-image-preview');
const inlineEditRemoveImageBtn = document.getElementById('inline-edit-remove-image-btn');
const inlineEditCropImageBtn = document.getElementById('inline-edit-crop-image-btn');
const inlineEditImageUrl = document.getElementById('inline-edit-image-url');

const inlineEditAnsImageGroup = document.getElementById('inline-edit-ans-image-group');
const inlineEditAnsImagePreviewContainer = document.getElementById('inline-edit-ans-image-preview-container');
const inlineEditAnsImagePreview = document.getElementById('inline-edit-ans-image-preview');
const inlineEditRemoveAnsImageBtn = document.getElementById('inline-edit-remove-ans-image-btn');
const inlineEditCropAnsImageBtn = document.getElementById('inline-edit-crop-ans-image-btn');
const inlineEditAnsImageUrl = document.getElementById('inline-edit-ans-image-url');

// --- STATE ---
let deckCards = [];
let geminiChatSession = null;
let inlineEditSavedScrollTop = 0;
let inlineEditSavedWindowY = 0;
let currentEditingMode = 'normal'; // 'normal' | 'exam'
let currentEditingSlotIndex = null; // number | null
let currentEditingExamData = null; // object | null

function syncCurrentDeckToSlotAndCloud() {
    if (!Array.isArray(deckCards)) return;

    const title = (deckTitleDisplay?.value || '').trim() || (currentEditingMode === 'exam' ? 'Semana de Provas' : 'Meu Baralho');
    const playableCards = deckCards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note');

    const sanitizeCard = (card) => {
        if (!card || typeof card !== 'object') return card;
        const copy = { ...card };
        delete copy.isBeingCorrected;
        delete copy._lastUserAnswer;
        return copy;
    };

    const isFreeTrial = Boolean(
        window.currentDeckIsFreeAiTrial || 
        deckCards.some(c => c && c.isFreeAiTrial) || 
        localStorage.getItem('editing_deck_is_free_trial') === 'true'
    );

    const isExam = currentEditingMode === 'exam';
    const now = Date.now();

    const gameState = {
        deckTitle: title,
        questionsPool: playableCards.map(sanitizeCard),
        allQuestions: deckCards.map(c => {
            const sc = sanitizeCard(c);
            if (isFreeTrial && sc && typeof sc === 'object') {
                sc.isFreeAiTrial = true;
            }
            return sc;
        }),
        score: 0,
        isFreeAiTrial: isFreeTrial,
        updatedAt: now
    };

    if (isExam) {
        let existingExam = currentEditingExamData;
        if (!existingExam) {
            try { existingExam = JSON.parse(localStorage.getItem('flashcardsExam') || '{}'); } catch(e){}
        }
        gameState.decks = existingExam?.decks || [];
        gameState.deckId = existingExam?.deckId || `exam_${now}`;
        gameState.isExam = true;
        gameState.mode = 'exam';
        currentEditingExamData = gameState;

        localStorage.setItem('flashcardsExam', encodeStoragePayload(gameState));
        localStorage.setItem('flashcardsActiveMode', 'exam');
    } else {
        localStorage.setItem('flashcardsSave', encodeStoragePayload(gameState));
        localStorage.setItem('flashcardsActiveMode', 'normal');
    }

    try {
        const slots = getLocalSlots();
        let targetIdx = currentEditingSlotIndex;

        if (targetIdx === null || targetIdx < 0 || targetIdx >= slots.length) {
            // Check if there is an empty slot to safely claim without overwriting existing decks
            const emptyIdx = slots.findIndex(s => !s || !s.deckData || s.cardCount === 0);
            if (emptyIdx !== -1) {
                targetIdx = emptyIdx;
                currentEditingSlotIndex = emptyIdx;
            } else {
                // All 3 slots are currently in use! Do not overwrite any existing deck silently.
                // The deck remains safely stored in localStorage as active editing state.
                debouncedSyncSlotsToCloud(300);
                return;
            }
        }

        if (targetIdx !== -1 && slots[targetIdx]) {
            slots[targetIdx].deckData = gameState;
            slots[targetIdx].title = title;
            slots[targetIdx].cardCount = deckCards.length;
            slots[targetIdx].isExam = isExam;
            slots[targetIdx].mode = isExam ? 'exam' : 'normal';
            slots[targetIdx].updatedAt = now;
            slots.forEach((s, idx) => { s.isCurrent = (idx === targetIdx); });
            saveLocalSlots(slots);
            currentEditingSlotIndex = targetIdx;
        }

        // Auto-sync to Firestore share document if this deck is being shared
        const activeSlot = (currentEditingSlotIndex !== null && slots[currentEditingSlotIndex]) ? slots[currentEditingSlotIndex] : null;
        if (activeSlot?.shareSlug) {
            syncSharedDeckToFirestore(activeSlot.shareSlug, gameState, title);
        }
    } catch (e) {
        console.warn('Erro ao atualizar slots do baralho:', e);
    }

    debouncedSyncSlotsToCloud(300);
    try {
        window.dispatchEvent(new CustomEvent('flashcards:sync-updated', { detail: { hasSlotChanges: true } }));
    } catch (e) {}
}

function closeInlineEditModal() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    if (inlineEditModal) {
        inlineEditModal.classList.add('hidden');
    }
    if (cardsList) {
        cardsList.scrollTop = inlineEditSavedScrollTop;
    }
    window.scrollTo({ top: inlineEditSavedWindowY, behavior: 'instant' });
    requestAnimationFrame(() => {
        if (cardsList) {
            cardsList.scrollTop = inlineEditSavedScrollTop;
        }
        window.scrollTo({ top: inlineEditSavedWindowY, behavior: 'instant' });
    });
}
let currentEditorModel = "gemini-flash-lite-latest";
let promptQueue = [];
let isProcessingPromptQueue = false;

let pendingCreatorQImage = '';
let pendingCreatorQImageCrop = null;
let pendingCreatorQImageArrows = [];
let pendingCreatorAnsImage = '';
let pendingCreatorAnsImageCrop = null;
let pendingCreatorAnsImageArrows = [];
let pendingInlineEditQImage = '';
let pendingInlineEditQImageCrop = null;
let pendingInlineEditQImageArrows = [];
let pendingInlineEditAnsImage = '';
let pendingInlineEditAnsImageCrop = null;
let pendingInlineEditAnsImageArrows = [];

let lastFailedSourceType = null;
let lastFailedLocalCards = null;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const FILES_DEFAULT_SVG = '<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>';

const systemInstruction = "Sua função é gerenciar um baralho de flashcards para um estudante universitário. Você pode adicionar, editar ou remover cards usando as ferramentas fornecidas. Tipos suportados: 'open' (conceito aberto), 'open_double' (dupla resposta), 'multiple_choice' (múltipla escolha com 2 a 6 opções), 'fill' (preencher lacunas marcadas por '_' em frases ou textos), e 'anki' (conceito/pergunta e explicação detalhada para repetição espaçada).\n\n" +
    "REGRAS MANDATÓRIAS DE RESPOSTA E FORMATAÇÃO:\n" +
    "1. PERGUNTAS E ENUNCIADOS ('description'): As perguntas de TODOS os tipos de cartões — inclusive cartões de resposta escrita ('open', 'open_double' e 'fill') — PODEM e DEVEM conter elementos Markdown ricos (**negrito**, *itálico*, listas, tabelas) e fórmulas LaTeX ($...$ e $$...$$) livremente para destacar termos essenciais e organizar o raciocínio.\n" +
    "2. RESPOSTAS DIGITADAS NA GAMEPLAY ('open', 'open_double' e lacunas de 'fill'): A ÚNICA coisa que NÃO pode conter Markdown é a resposta que o estudante precisa digitar na gameplay. Os campos 'answer', 'answer2' e itens do array 'answers' DEVEM ser estritamente TEXTO PURO (sem negrito **, sem itálico *, sem crases ` de código).\n" +
    "3. FÓRMULAS NUNCA DEVEM SER RESPOSTAS DIGITADAS: Fórmulas matemáticas, químicas ou expressões em LaTeX ($...$, $$...$$, frações, potências, etc.) JAMAIS devem ser respostas digitadas nos tipos 'open', 'open_double' ou 'fill'. O estudante digita com teclado comum e não pode digitar fórmulas complexas. Se o conteúdo for sobre uma fórmula ou equação, crie OBRIGATORIAMENTE um card do tipo 'anki' (frente com o conceito e verso com a fórmula em LaTeX) ou 'multiple_choice' (onde o estudante seleciona a alternativa).\n" +
    "4. LIBERDADE TOTAL DE MARKDOWN EM 'ANKI' E 'MULTIPLE_CHOICE': Os tipos 'anki' (frente e verso) e 'multiple_choice' (enunciado, opções e resposta) podem e devem usar Markdown rico (tabelas, listas, negrito) e fórmulas LaTeX ($...$ e $$...$$) livremente.\n" +
    "5. NO TIPO 'FILL': O enunciado ('description') pode conter Markdown e fórmulas LaTeX para contextualização, mas as lacunas '_' devem ser preenchidas apenas com termos simples, números ou parâmetros em texto puro, sem Markdown.\n" +
    "6. RESPOSTAS CONVERSACIONAIS NO CHAT DO AGENTE: Em suas mensagens de resposta ao usuário no chat do assistente, utilize sempre formatação Markdown estruturada e limpa (títulos curtos como ###, listas com marcadores -, destaques em **negrito**, códigos em `...` e tabelas ou fórmulas LaTeX quando aplicável). Mantenha as respostas concisas, bem diagramadas e visualmente organizadas para leitura rápida.\n" +
    "7. CLASSIFICAÇÃO TAXONÔMICA ('subject' e 'topic'): Ao adicionar novos cards ('adicionar_card' ou 'adicionar_varios_cards'), atribua sempre 'subject' (disciplina ampla de alto nível, ex: 'Cardiologia') e 'topic' (assunto específico conciso, ex: 'Valvopatias') para possibilitar estatísticas e métricas de desempenho detalhadas.\n\n" +
    "Mantenha o tom profissional, analítico e pragmático.";

const generationSystemInstruction = `Você é um especialista em educação e elaboração de flashcards acadêmicos de alto rendimento.
Sua missão é sintetizar materiais de estudo (artigos, livros, apresentações, apostilas ou anotações) em flashcards de nível universitário/pós-graduação com máxima precisão conceitual, adaptando-se com rigor e profundidade ao domínio temático abordado (ciências da saúde, biológicas, exatas, engenharia, direito, humanas ou tecnologia).

DIRETRIZES DE FORMATO E QUALIDADE:
1. Retorne EXCLUSIVAMENTE um array JSON ([]) contendo os objetos de flashcards.
2. PROIBIDO incluir texto explicativo, introduções ou notas fora do array JSON.
3. Linhas ou anotações iniciadas por "#" nos arquivos de texto/documentos são notas ou títulos e devem ser ignoradas como perguntas diretas.

CLASSIFICAÇÃO TAXONÔMICA OBRIGATÓRIA ("subject" e "topic"):
Para CADA flashcard gerado, atribua OBRIGATORIAMENTE os seguintes campos de metadados:
- "subject": Nome da matéria ou disciplina ampla de alto nível (ex: "Cardiologia", "Fisiologia Humana", "Bioquímica", "Direito Constitucional", "Cálculo"). Mantenha a mesma matéria para todos os cards provenientes do mesmo material/disciplina.
- "topic": Nome do assunto ou subtópico conciso e específico agrupador (ex: "Valvopatias", "Eletrocardiograma", "Ciclo de Krebs", "Controle de Constitucionalidade", "Limites e Derivadas"). Agrupe cards sobre o mesmo conceito sob o mesmo "topic" padronizado para permitir acompanhamento de maestria e fraquezas do estudante por assunto.

REGRAS MANDATÓRIAS DE RESPOSTA E FORMATAÇÃO:
• PERGUNTAS E ENUNCIADOS PODEM USAR MARKDOWN LIVREMENTE:
  - As perguntas e enunciados ("description") de TODOS os tipos de cartões — inclusive cartões de resposta escrita ("open", "open_double", "fill") — PODEM E DEVEM usar elementos Markdown (**negrito**, *itálico*, listas, tabelas) e fórmulas LaTeX ($...$ e $$...$$) livremente para destacar termos essenciais e organizar o raciocínio.
• PROIBIDO O USO DE MARKDOWN EM RESPOSTAS DIGITADAS NA GAMEPLAY:
  - A ÚNICA coisa que NÃO PODE conter Markdown é a resposta que o usuário precisa digitar na gameplay.
  - Nos cartões com resposta digitada ("open", "open_double" e as lacunas de "fill"), os campos "answer", "answer2" e cada item do array "answers" DEVEM CONTER EXCLUSIVAMENTE TEXTO PURO (plain text).
  - NUNCA use negrito (**texto**), itálico (*texto* ou _texto_), crases de código (\`texto\`), cabeçalhos (#) ou delimitadores matemáticos nesses campos de resposta digitada.
• FÓRMULAS NUNCA DEVEM SER RESPOSTAS DIGITADAS:
  - Fórmulas matemáticas, equações físicas, reações químicas ou expressões em LaTeX ($...$, $$...$$, frações \\frac, potências, etc.) JAMAIS devem ser a resposta a ser digitada pelo estudante nos tipos "open", "open_double" ou "fill". O estudante utiliza teclado comum e não dispõe de teclado LaTeX para digitar fórmulas.
  - Se o material exigir a memorização de uma fórmula matemática ou científica:
    * Crie OBRIGATORIAMENTE um cartão "anki" (frente com o questionamento/conceito e verso com a fórmula completa em LaTeX KaTeX e explicação detalhada) OU um cartão "multiple_choice" (onde as alternativas contêm as fórmulas para o estudante reconhecer e escolher).
    * NUNCA crie perguntas abertas ou lacunas cuja resposta digitada seja uma fórmula!
• LIBERDADE DE MARKDOWN E LATEX EM "ANKI" E "MULTIPLE_CHOICE":
  - Cartões "anki": Uso de Markdown rico (tabelas, listas com marcadores, negrito de destaque) e fórmulas matemáticas/científicas em LaTeX ($fórmula$ inline e $$fórmula$$ em bloco) é TOTALMENTE LIBERADO E INCENTIVADO na frente ("description") e no verso/explicação ("answer").
  - Cartões "multiple_choice": Uso de Markdown e fórmulas LaTeX ($...$) é TOTALMENTE LIBERADO na pergunta ("description"), nas opções ("options") e na resposta correta ("answer").
• NO TIPO "FILL":
  - O enunciado ("description") PODE usar tabelas, listas e fórmulas LaTeX para contextualizar o texto com as lacunas "_".
  - Porém, as lacunas omitidas e suas respectivas respostas em "answers" DEVEM ser termos simples, palavras-chave, dosagens ou números em texto puro digitável, NUNCA código LaTeX ou fórmulas.

DISTRIBUIÇÃO E REGRAS POR TIPO DE CARTÃO:
- "open":
  • Pergunta ("description"): Formulação clara, direta e objetiva de um conceito, termo, estrutura, lei, patologia ou princípio. Pode e deve conter formatação Markdown (**negrito**, *itálico*, listas, destaques) e fórmulas LaTeX ($...$).
  • Resposta ("answer"): Curta, telegráfica e precisa (idealmente de 1 a 3 palavras) em TEXTO PURO, SEM Markdown (sem **, *, \`) e SEM fórmulas.
- "open_double":
  • Pergunta ("description"): Questionamento comparativo ou que envolva dois conceitos interligados (ex: causa e efeito, agonista e antagonista, dois parâmetros ou limites). Pode e deve conter formatação Markdown e fórmulas LaTeX ($...$).
  • Respostas ("answer" e "answer2"): Duas respostas diretas em TEXTO PURO, SEM Markdown e SEM fórmulas.
  • Rótulos ("placeholder1" e "placeholder2"): Rótulos descritivos e concisos para cada campo de resposta.
- "fill":
  • Enunciado / Frase ("description"): Texto, tabela, lista estruturada ou frase contendo lacunas representadas por "_" (ou "___") nos locais exatos onde os valores numéricos, dosagens, parâmetros ou termos foram omitidos para o estudante preencher diretamente no texto. Pode conter formatação Markdown e LaTeX no enunciado para contextualizar.
  • Respostas ("answer" e "answers"): As respostas corretas em TEXTO PURO (sem Markdown, sem LaTeX e sem fórmulas), na ordem exata de aparição das lacunas no texto. Forneça como array "answers" (ex: ["30", "3", "300"]) e como string "answer" separada por ponto e vírgula ";" (ex: "30; 3; 300"). Quando houver sinônimos aceitáveis para uma mesma lacuna, separe por "/" (ex: "30 / trinta").
- "multiple_choice":
  • Enunciado ("description"): Questão bem contextualizada, cenário aplicado, problema técnico ou pergunta conceitual.
  • Resposta ("answer"): A alternativa correta exata. Pode conter Markdown e fórmulas LaTeX ($...$).
  • Opções ("options"): Array com 4 alternativas plausíveis (1 correta e 3 distratores inteligentes). A resposta correta DEVE estar contida obrigatoriamente neste array.
- "anki":
  • Frente ("description"): Conceito, processo, dedução ou pergunta sobre fórmula a ser compreendida e memorizada. Suporta Markdown e fórmulas LaTeX ($...$).
  • Verso ("answer"): Explicação aprofundada, completa e estruturada para repetição espaçada. Suporta e deve utilizar Markdown rico (tópicos com marcadores, negrito para termos-chave, tabelas comparativas) e fórmulas matemáticas/científicas em LaTeX/KaTeX ($fórmula$ inline ou $$fórmula$$ em bloco) quando pertinentes.

EXEMPLOS DE ESTRUTURA (FEW-SHOT):
[
  {
    "type": "open",
    "description": "Enzima mitocondrial que catalisa a descarboxilação oxidativa do piruvato em acetil-CoA.",
    "answer": "Complexo Piruvato Desidrogenase",
    "topic": "Ciclo de Krebs e Bioenergética",
    "subject": "Bioquímica"
  },
  {
    "type": "open_double",
    "description": "Quais são, respectivamente, o principal neurotransmissor inibitório no encéfalo e o principal na medula espinhal?",
    "answer": "GABA",
    "answer2": "Glicina",
    "placeholder1": "Encéfalo",
    "placeholder2": "Medula espinhal",
    "topic": "Neurotransmissão",
    "subject": "Neurofisiologia"
  },
  {
    "type": "fill",
    "description": "Quais são as faixas de categorização da albuminúria pela Relação Albumina/Creatinina (RAC) em amostra isolada de urina?\\n\\nEstadiamento da Albuminúria (KDIGO / SBD):\\n• A1 (Normoalbuminúria ou ligeiro aumento): RAC < _ mg/g (< _ mg/mmol)\\n• A2 (Microalbuminúria / Aumento moderado): RAC entre _ e _ mg/g (_ — _ mg/mmol)\\n• A3 (Macroalbuminúria / Aumento grave): RAC > _ mg/g (> _ mg/mmol)",
    "answer": "30; 3; 30; 300; 3; 30; 300; 30",
    "answers": ["30", "3", "30", "300", "3", "30", "300", "30"],
    "topic": "Nefropatias e Albuminúria",
    "subject": "Nefrologia"
  },
  {
    "type": "multiple_choice",
    "description": "Qual das seguintes alterações fisiológicas promove o desvio da curva de dissociação da oxi-hemoglobina para a direita (efeito Bohr)?",
    "answer": "Aumento da concentração de $H^+$ (acidose)",
    "options": [
      "Aumento da concentração de $H^+$ (acidose)",
      "Redução da temperatura corpórea",
      "Queda nos níveis intraeritrocitários de 2,3-DPG",
      "Alcalose respiratória aguda"
    ],
    "topic": "Transporte de Gases",
    "subject": "Fisiologia Respiratória"
  },
  {
    "type": "anki",
    "description": "Qual é a base biofísica do potencial de equilíbrio de um íon e sua respectiva formulação matemática?",
    "answer": "O potencial de equilíbrio é a diferença de potencial elétrico transmembrana que contrabalança com exatidão a tendência termodinâmica de difusão de um íon gerada por seu gradiente de concentração.\\n\\n### Equação de Nernst:\\n$$E_{ion} = \\\\frac{RT}{zF} \\\\ln\\\\left(\\\\frac{[ion]_{ext}}{[ion]_{int}}\\\\right)$$\\n\\n**Pontos essenciais:**\\n- Para o íon $K^+$ em temperatura corporal ($37^\\\\circ\\\\text{C}$): $E_K \\\\approx -90\\\\text{ mV}$.\\n- Determina a voltagem em que o fluxo iônico líquido resultante é zero.",
    "topic": "Potenciais de Membrana",
    "subject": "Biofísica Celular"
  }
]`;

// Gemini Tools Definitions for Agentic Editing
const deckTools = [
    {
        functionDeclarations: [
            {
                name: "adicionar_card",
                description: "Adiciona um novo flashcard ao baralho.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        type: { type: "STRING", enum: ["open", "open_double", "multiple_choice", "anki", "divisor", "fill"], description: "Tipo do card: 'open', 'open_double', 'multiple_choice', 'anki', 'divisor' ou 'fill' (preencher lacunas '_')" },
                        description: { type: "STRING", description: "Pergunta, conceito, texto do divisor ou frase com lacunas '_' (para tipo 'fill'). As perguntas de TODOS os tipos de cartões (incluindo 'open', 'open_double', 'fill', 'anki') podem e devem usar Markdown (**negrito**, *itálico*, listas) e fórmulas LaTeX ($...$ ou $$...$$)." },
                        answer: { type: "STRING", description: "Resposta principal, explicação detalhada ou respostas das lacunas separadas por ';' (tipo 'fill'). REGRA: Para respostas digitadas ('open', 'open_double', 'fill'), use estritamente texto puro SEM Markdown (sem **, *, `) e NUNCA use fórmulas matemáticas/LaTeX como resposta digitada. Fórmulas e Markdown rico são permitidos apenas para 'anki' e 'multiple_choice'." },
                        answer2: { type: "STRING", description: "Resposta secundária (apenas para open_double). Estritamente texto puro, sem Markdown e sem fórmulas." },
                        answers: { type: "ARRAY", items: { type: "STRING" }, description: "Lista ordenada de respostas para preencher as lacunas '_' no tipo 'fill'. Use estritamente texto puro sem Markdown e sem fórmulas." },
                        options: { type: "ARRAY", items: { type: "STRING" }, description: "Opções (apenas para multiple_choice). Suporta Markdown e fórmulas LaTeX." },
                        topic: { type: "STRING", description: "Assunto específico conciso agrupador do card (ex: 'Valvopatias', 'Eletrocardiograma', 'Controle Concentrado')." },
                        subject: { type: "STRING", description: "Matéria ou disciplina ampla à qual o card pertence (ex: 'Cardiologia', 'Direito Constitucional')." },
                        image: { type: "STRING", description: "URL ou Base64 da imagem da pergunta (opcional)" },
                        answerImage: { type: "STRING", description: "URL ou Base64 da imagem da resposta (opcional)" }
                    },
                    required: ["type", "description"]
                }
            },
            {
                name: "editar_card",
                description: "Edita um flashcard existente pelo índice.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        index: { type: "NUMBER", description: "O índice (começando em 0) do card a ser editado." },
                        type: { type: "STRING", enum: ["open", "open_double", "multiple_choice", "anki", "divisor", "fill"] },
                        description: { type: "STRING", description: "Pergunta, conceito, texto do divisor ou frase com lacunas '_' (para tipo 'fill'). Suporta e incentiva Markdown e fórmulas LaTeX para todos os tipos de card." },
                        answer: { type: "STRING", description: "Resposta, explicação detalhada ou respostas das lacunas separadas por ';' (tipo 'fill'). REGRA: Para respostas digitadas ('open', 'open_double', 'fill'), use estritamente texto puro SEM Markdown e SEM fórmulas." },
                        answer2: { type: "STRING", description: "Resposta secundária (apenas para open_double). Estritamente texto puro, sem Markdown e sem fórmulas." },
                        answers: { type: "ARRAY", items: { type: "STRING" }, description: "Lista ordenada de respostas das lacunas (tipo 'fill'). Use estritamente texto puro sem Markdown e sem fórmulas." },
                        options: { type: "ARRAY", items: { type: "STRING" } },
                        topic: { type: "STRING", description: "Assunto específico agrupador do card." },
                        subject: { type: "STRING", description: "Matéria ampla à qual o card pertence." },
                        image: { type: "STRING" },
                        answerImage: { type: "STRING" }
                    },
                    required: ["index"]
                }
            },
            {
                name: "remover_card",
                description: "Remove um único flashcard permanentemente do baralho.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        index: { type: "NUMBER", description: "Índice do card a ser removido." }
                    },
                    required: ["index"]
                }
            },
            {
                name: "remover_cards_por_indice",
                description: "Remove múltiplos flashcards de uma vez usando uma lista de índices.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        indices: {
                            type: "ARRAY",
                            items: { type: "NUMBER" },
                            description: "Lista de índices dos cards a serem removidos."
                        }
                    },
                    required: ["indices"]
                }
            },
            {
                name: "adicionar_varios_cards",
                description: "Adiciona múltiplos cards de uma vez.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        cards: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    type: { type: "STRING", enum: ["open", "open_double", "multiple_choice", "anki", "divisor", "fill"] },
                                    description: { type: "STRING", description: "Pergunta, conceito, texto do divisor ou frase com lacunas '_' (tipo 'fill'). Suporta e incentiva Markdown e fórmulas LaTeX para todos os tipos de card." },
                                    answer: { type: "STRING", description: "Resposta principal, explicação detalhada ou respostas das lacunas separadas por ';' (tipo 'fill'). REGRA: Para respostas digitadas ('open', 'open_double', 'fill'), use estritamente texto puro SEM Markdown e SEM fórmulas." },
                                    answer2: { type: "STRING", description: "Resposta secundária (apenas para open_double). Estritamente texto puro, sem Markdown e sem fórmulas." },
                                    answers: { type: "ARRAY", items: { type: "STRING" }, description: "Lista ordenada de respostas das lacunas (tipo 'fill'). Use estritamente texto puro sem Markdown e sem fórmulas." },
                                    options: { type: "ARRAY", items: { type: "STRING" } },
                                    topic: { type: "STRING", description: "Assunto específico conciso agrupador do card (ex: 'Valvopatias', 'Eletrocardiograma')." },
                                    subject: { type: "STRING", description: "Matéria ou disciplina ampla à qual o card pertence (ex: 'Cardiologia', 'Direito Constitucional')." },
                                    image: { type: "STRING" },
                                    answerImage: { type: "STRING" }
                                },
                                required: ["type", "description"]
                            }
                        }
                    },
                    required: ["cards"]
                }
            }
        ]
    }
];

// Gemini Tool Declaration for Task Handoff from Lite to Advanced Model
const handoffToolDeclaration = {
    name: "handoff_to_gemini_flash",
    description: "Transfere a execução do prompt para o modelo avançado (gemini-flash-latest) quando a tarefa for complexa demais para suas capacidades como modelo leve (ex.: raciocínio avançado de múltiplos passos, síntese profunda de temas complexos, reorganização pedagógica global ou análise conceitual densa). Se a tarefa for simples ou padrão, NÃO chame esta ferramenta.",
    parameters: {
        type: "OBJECT",
        properties: {
            reason: {
                type: "STRING",
                description: "Justificativa técnica detalhada do motivo para transferir a tarefa para o gemini-flash-latest."
            }
        },
        required: ["reason"]
    }
};

const handoffTools = [
    {
        functionDeclarations: [handoffToolDeclaration]
    }
];

const deckToolsWithHandoff = [
    {
        functionDeclarations: [
            ...deckTools[0].functionDeclarations,
            handoffToolDeclaration
        ]
    }
];

// Local implementations for Gemini to call
const toolFunctions = {
    handoff_to_gemini_flash: (args) => {
        console.log('[AI Agent] [Tool Call] handoff_to_gemini_flash acionada:', args?.reason);
        return { success: true, message: "Handoff registrado para execução pelo modelo avançado." };
    },
    adicionar_card: (args) => {
        const card = normalizeCard(args) || args;
        if (card && card.type === 'voice') {
            const voiceCount = deckCards.filter(c => c && c.type === 'voice').length;
            if (voiceCount >= 5) {
                return { success: false, message: "Limite de 5 cards de voz por baralho atingido." };
            }
        }
        appendNewCardWithElasticCollision(card);
        return { success: true, message: "Card adicionado com sucesso." };
    },
    editar_card: (args) => {
        const { index, ...updates } = args;
        if (deckCards[index]) {
            const merged = { ...deckCards[index], ...updates };
            deckCards[index] = normalizeCard(merged) || merged;
            renderCardsList(true);
            syncCurrentDeckToSlotAndCloud();
            return { success: true, message: `Card no índice ${index} foi editado.` };
        }
        return { success: false, message: `Erro: Card no índice ${index} não encontrado.` };
    },
    remover_card: (args) => {
        const { index } = args;
        if (deckCards[index]) {
            const removed = deckCards.splice(index, 1);
            renderCardsList(true);
            syncCurrentDeckToSlotAndCloud();
            return { success: true, message: `Card "${removed[0].description.substring(0, 20)}..." removido.` };
        }
        return { success: false, message: `Erro: Card no índice ${index} não encontrado.` };
    },
    remover_cards_por_indice: (args) => {
        const { indices } = args;
        const sortedIndices = [...new Set(indices)].sort((a, b) => b - a);
        let count = 0;
        sortedIndices.forEach(idx => {
            if (deckCards[idx]) {
                deckCards.splice(idx, 1);
                count++;
            }
        });
        renderCardsList(true);
        syncCurrentDeckToSlotAndCloud();
        return { success: true, message: `${count} cards foram removidos com sucesso.` };
    },
    adicionar_varios_cards: (args) => {
        const cardsToAdd = (args.cards || []).map(c => normalizeCard(c) || c);
        let addedCount = 0;
        let voiceCount = deckCards.filter(c => c && c.type === 'voice').length;
        for (const card of cardsToAdd) {
            if (card && card.type === 'voice') {
                if (voiceCount >= 5) continue;
                voiceCount++;
            }
            appendNewCardWithElasticCollision(card);
            addedCount++;
        }
        return { success: true, message: `${addedCount} cards adicionados ao deck.` };
    }
};

// --- HELPER FUNCTIONS ---
function updateAiConfigStatusUI() {
    if (dashboardProStatus) {
        dashboardProStatus.textContent = isUserPro() ? "Flashcards Pro ✓" : "Flashcards Pro";
    }
}

function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
}

function renderFileIcons(files, container, defaultSvg) {
    container.innerHTML = '';
    if (files.length === 0) {
        container.innerHTML = defaultSvg;
        return;
    }

    Array.from(files).forEach(file => {
        const ext = getFileExtension(file.name) || '???';
        const icon = document.createElement('div');
        icon.className = 'squircle';
        icon.textContent = ext.substring(0, 4);
        icon.title = file.name;
        container.appendChild(icon);
    });
}

/**
 * Strips markdown and LaTeX markup from typed answers (open, open_double, fill).
 * Multiple choice options and Anki cards are intentionally exempted.
 */
function stripMarkdownFromTypedAnswer(str) {
    if (!str || typeof str !== 'string') return '';
    let s = str.trim();
    // Strip LaTeX block ($$formula$$) and inline ($formula$)
    s = s.replace(/\$\$([^$]+)\$\$/g, '$1');
    s = s.replace(/\$([^$]+)\$/g, '$1');
    // Strip bold and italics: **text**, *text*, __text__
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/\*([^*]+)\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    // Strip code backticks `text`
    s = s.replace(/`([^`]+)`/g, '$1');
    // Strip markdown headers (#, ##, etc.)
    s = s.replace(/^#+\s*/gm, '');
    // Clean common LaTeX formatting wrappers like \text{...}, \mathrm{...}
    s = s.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]+)\}/g, '$1');
    // Remove isolated backslashes from simple LaTeX commands
    s = s.replace(/\\([a-zA-Z]+)/g, '$1');
    return s.trim();
}

/**
 * Checks if a string contains a complex LaTeX or mathematical formula that cannot be typed.
 */
function containsComplexFormula(str) {
    if (!str || typeof str !== 'string') return false;
    // Detect typical LaTeX formula commands, block math, or equations with sub/superscript
    return /\\(?:frac|sqrt|int|sum|prod|partial|pm|times|div|alpha|beta|gamma|delta|theta|lambda|mu|sigma|omega|approx|leq|geq|infty|lim|sin|cos|tan|log|ln)\b|\$\$|\\begin\{|\b[a-zA-Z]\s*=\s*[^;,\n]{4,}/.test(str);
}

// Normalizes and validates card properties across all supported modes and aliases
function normalizeCard(raw) {
    if (!raw || typeof raw !== 'object') return null;

    let type = raw.type ? String(raw.type).toLowerCase().replace(/[-\s]/g, '_') : '';
    if (type === 'divisor' || type === 'divider' || type === 'note' || type === 'secao' || type === 'section') {
        const text = (raw.text || raw.description || raw.title || '').trim();
        if (!text) return null;
        return {
            type: 'divisor',
            text: text,
            description: text,
            answer: ''
        };
    }
    if (type === 'image_arrows' || type === 'arrows' || type === 'setas' || type === 'imagearrows') {
        type = 'image_arrows';
    } else if (type === 'multiple_choice' || type === 'multipla_escolha' || type === 'mc') {
        type = 'multiple_choice';
    } else if (type === 'open_double' || type === 'duplo' || type === 'double') {
        type = 'open_double';
    } else if (type === 'fill' || type === 'fill_in_the_blank' || type === 'fill_blanks' || type === 'cloze' || type === 'preencher' || type === 'lacuna' || type === 'lacunas') {
        type = 'fill';
    } else if (type === 'anki' || type === 'anki_like') {
        type = 'anki';
    } else if (type === 'open' || type === 'open_ended' || type === 'traditional' || type === 'aberto') {
        type = 'open';
    } else {
        if (Array.isArray(raw.options) && raw.options.length >= 2) type = 'multiple_choice';
        else if (raw.answer2) type = 'open_double';
        else if (raw.answers && Array.isArray(raw.answers)) type = 'fill';
        else if (raw.description && /(?:\[\s*_{1,}\s*\]|(?<![a-zA-Z0-9\u00C0-\u017F])_{1,}(?![a-zA-Z0-9\u00C0-\u017F]))/.test(raw.description) && (raw.answer && raw.answer.includes(';'))) type = 'fill';
        else if (raw.description && /\{[^{}]+\}/.test(raw.description)) type = 'fill';
        else type = 'open';
    }

    let description = (raw.description || raw.question || raw.pergunta || raw.frente || raw.phrase || raw.text || '').trim();
    if (!description) return null;

    let answer = (raw.answer || raw.resposta || raw.verso || '').trim();
    let answer2 = (raw.answer2 || raw.resposta2 || '').trim();
    let options = Array.isArray(raw.options) ? raw.options.map(o => String(o).trim()).filter(Boolean) : (Array.isArray(raw.alternativas) ? raw.alternativas.map(o => String(o).trim()).filter(Boolean) : []);

    let answers = [];
    if (Array.isArray(raw.answers)) {
        answers = raw.answers.map(a => String(a).trim()).filter(Boolean);
    } else if (type === 'fill' && answer) {
        answers = answer.split(';').map(a => a.trim()).filter(Boolean);
    }

    // Extract {answers} in fill descriptions and normalize to '_'
    if (type === 'fill' && /\{[^{}]+\}/.test(description)) {
        const braceRegex = /\{([^{}]+)\}/g;
        const braceAnswers = [];
        let bMatch;
        while ((bMatch = braceRegex.exec(description)) !== null) {
            const trimmed = bMatch[1].trim();
            if (trimmed.length > 0) braceAnswers.push(trimmed);
        }
        if (braceAnswers.length > 0) {
            description = description.replace(/\{([^{}]+)\}/g, (fullMatch, inner) => {
                return inner.trim().length > 0 ? '_' : fullMatch;
            });
            if (answers.length === 0) {
                answers = braceAnswers;
            }
            if (!answer) {
                answer = answers.join('; ');
            }
        }
    }

    if (type === 'fill' && !answer && answers.length > 0) {
        answer = answers.join('; ');
    }

    // If an 'open', 'open_double' or 'fill' card contains a complex formula as the answer, convert to 'anki'
    if ((type === 'open' || type === 'open_double') && (containsComplexFormula(answer) || containsComplexFormula(answer2))) {
        type = 'anki';
    } else if (type === 'fill' && answers.some(containsComplexFormula)) {
        type = 'anki';
    }

    // For typed answer cards ('open', 'open_double', 'fill'), strip any accidental markdown formatting
    if (type === 'open' || type === 'open_double' || type === 'fill') {
        answer = stripMarkdownFromTypedAnswer(answer);
        if (answer2) answer2 = stripMarkdownFromTypedAnswer(answer2);
        if (answers && answers.length > 0) {
            answers = answers.map(stripMarkdownFromTypedAnswer);
            answer = answers.join('; ');
        }
    }

    if (type === 'image_arrows') {
        const hasArrows = Array.isArray(raw.imageArrows) && raw.imageArrows.length > 0;
        if (!hasArrows && (!raw.image && !raw.qImage)) return null;
        if (!answer && hasArrows) {
            answer = raw.imageArrows.map(a => a.label || '').filter(Boolean).join('; ');
        }
    } else if (type === 'multiple_choice') {
        if (options.length < 2) return null;
        if (!answer) answer = options[0];
        else if (!options.includes(answer)) options.unshift(answer);
    } else if (type === 'open_double') {
        if (!answer && !answer2) return null;
    } else if (type === 'fill') {
        if (!answer && answers.length === 0) return null;
    } else {
        if (!answer && !raw.image && !raw.answerImage) return null;
    }

    const card = {
        type,
        description,
        answer
    };
    if (type === 'open_double') {
        card.answer2 = answer2;
        card.placeholder1 = raw.placeholder1 || "Resposta 1";
        card.placeholder2 = raw.placeholder2 || "Resposta 2";
    }
    if (type === 'fill') {
        card.answers = answers;
    }
    if (type === 'multiple_choice') {
        card.options = options;
    }
    if (raw.explanation) card.explanation = raw.explanation;
    if (raw.image) card.image = raw.image;
    if (raw.answerImage) card.answerImage = raw.answerImage;
    if (raw.imageCrop) card.imageCrop = raw.imageCrop;
    if (Array.isArray(raw.imageArrows)) card.imageArrows = raw.imageArrows;
    if (raw.answerImageCrop) card.answerImageCrop = raw.answerImageCrop;
    if (Array.isArray(raw.answerImageArrows)) card.answerImageArrows = raw.answerImageArrows;
    if (Array.isArray(raw.tags)) card.tags = raw.tags;

    // Pure system metadata (stats, categorization, subject/topic tracking)
    const topic = (raw.topic || raw.aiTopic || '').toString().trim();
    if (topic) {
        card.topic = topic;
        card.aiTopic = topic;
    }
    const subject = (raw.subject || raw.aiSubject || '').toString().trim();
    if (subject) {
        card.subject = subject;
        card.aiSubject = subject;
    }

    return card;
}

// Scans text for complete balanced JSON objects, respecting string quoting and escapes
function extractBalancedJsonObjects(text) {
    const results = [];
    if (!text) return results;

    let scanText = text;
    const wrapperMatch = text.match(/["'](?:cards|flashcards|questoes|perguntas|deck|items)["']\s*:\s*\[/i);
    if (wrapperMatch) {
        const arrStart = wrapperMatch.index + wrapperMatch[0].length;
        scanText = text.substring(arrStart);
    }

    let depth = 0;
    let inString = false;
    let escape = false;
    let start = -1;

    for (let i = 0; i < scanText.length; i++) {
        const c = scanText[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (c === '\\' && inString) {
            escape = true;
            continue;
        }
        if (c === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (c === '{') {
                if (depth === 0) {
                    start = i;
                }
                depth++;
            } else if (c === '}') {
                depth--;
                if (depth === 0 && start !== -1) {
                    const block = scanText.substring(start, i + 1);
                    try {
                        const parsed = JSON.parse(block);
                        if (parsed && typeof parsed === 'object') {
                            const arr = parsed.cards || parsed.flashcards || parsed.questoes || parsed.perguntas;
                            if (Array.isArray(arr)) {
                                for (const item of arr) {
                                    const n = normalizeCard(item);
                                    if (n) results.push(n);
                                }
                            } else {
                                const n = normalizeCard(parsed);
                                if (n) results.push(n);
                            }
                        }
                    } catch (_) {}
                    start = -1;
                } else if (depth < 0) {
                    depth = 0;
                    start = -1;
                }
            }
        }
    }
    return results;
}

// Safe multi-stage JSON parser with truncation repair that never throws unhandled syntax errors
function parseJsonCardsSafely(fullText) {
    if (!fullText || !fullText.trim()) return [];

    let clean = fullText.trim();
    // Strip markdown code fences
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Strategy 1: Direct JSON parse
    try {
        const direct = JSON.parse(clean);
        if (Array.isArray(direct)) {
            const cards = direct.map(normalizeCard).filter(Boolean);
            if (cards.length > 0) return cards;
        }
        if (direct && typeof direct === 'object') {
            const arr = direct.cards || direct.flashcards || direct.questoes || direct.perguntas || direct.items;
            if (Array.isArray(arr)) {
                const cards = arr.map(normalizeCard).filter(Boolean);
                if (cards.length > 0) return cards;
            }
            const single = normalizeCard(direct);
            if (single) return [single];
        }
    } catch (_) {}

    // Strategy 2: Array substring parse
    const firstBracket = clean.indexOf('[');
    if (firstBracket !== -1) {
        const sub = clean.substring(firstBracket);
        const lastBracket = sub.lastIndexOf(']');
        if (lastBracket !== -1) {
            try {
                const arr = JSON.parse(sub.substring(0, lastBracket + 1));
                if (Array.isArray(arr)) {
                    const cards = arr.map(normalizeCard).filter(Boolean);
                    if (cards.length > 0) return cards;
                }
            } catch (_) {}
        }
        // Strategy 3: Truncation recovery - find last complete '}' and close with ']'
        const lastBrace = sub.lastIndexOf('}');
        if (lastBrace !== -1) {
            try {
                const repaired = sub.substring(0, lastBrace + 1) + ']';
                const arr = JSON.parse(repaired);
                if (Array.isArray(arr)) {
                    const cards = arr.map(normalizeCard).filter(Boolean);
                    if (cards.length > 0) return cards;
                }
            } catch (_) {}
        }
    }

    // Strategy 4: Balanced objects extraction
    const extracted = extractBalancedJsonObjects(clean);
    if (extracted.length > 0) return extracted;

    return [];
}

function updateGeneratingStatus(message) {
    const statusText = document.getElementById('generation-status-text');
    if (statusText) statusText.textContent = message;
}

function addAiChatGeneratingBubble(text) {
    removeAiChatGeneratingBubble();
    const bubble = document.createElement('div');
    bubble.id = 'ai-chat-generating-bubble';
    bubble.className = "self-start bg-gradient-to-b from-purple-50/90 to-purple-100/60 border border-purple-200/80 p-3.5 rounded-2xl rounded-tl-sm text-xs text-purple-900 flex items-center gap-3 shadow-[0_2px_8px_rgba(109,40,217,0.05),inset_0_1px_0_rgba(255,255,255,0.8)]";
    const safeText = escapeHtml(text || '');
    bubble.innerHTML = `
        <div class="relative flex-shrink-0 w-2.5 h-2.5 flex items-center justify-center">
            <span class="relative inline-flex rounded-full h-2 w-2 bg-purple-600 animate-pulse shadow-[0_0_6px_rgba(147,51,234,0.5)]"></span>
        </div>
        <span class="font-medium">${safeText}</span>
    `;
    chatHistory.appendChild(bubble);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function removeAiChatGeneratingBubble() {
    const bubble = document.getElementById('ai-chat-generating-bubble');
    if (bubble) bubble.remove();
}

function showChatTypingIndicator() {
    hideChatTypingIndicator();
    const indicator = document.createElement('div');
    indicator.id = 'chat-typing-indicator';
    indicator.className = 'typing-indicator my-1';
    indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatHistory.appendChild(indicator);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function hideChatTypingIndicator() {
    const indicator = document.getElementById('chat-typing-indicator');
    if (indicator) indicator.remove();
}

async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    const ext = getFileExtension(file.name);
    let mime = file.type;
    if (!mime || mime === 'application/octet-stream') {
        const mimeMap = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp',
            'gif': 'image/gif',
            'txt': 'text/plain'
        };
        mime = mimeMap[ext] || mime || 'application/octet-stream';
    }
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: mime },
    };
}

async function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// Robust text extractor supporting .txt, .docx (with mammoth), and .doc
async function extractTextFromFile(file) {
    const ext = getFileExtension(file.name);
    if (ext === 'txt') {
        return await readTextFile(file);
    } else if (ext === 'docx') {
        if (typeof mammoth !== 'undefined') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value || '';
        } else {
            throw new Error("Biblioteca Mammoth não disponível para ler arquivo .docx.");
        }
    } else if (ext === 'doc') {
        try {
            if (typeof mammoth !== 'undefined') {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                if (result.value && result.value.trim().length > 0) return result.value;
            }
        } catch (e) {
            // Mammoth is for docx, doc may throw
        }
        // Binary .doc fallback: string extraction
        const arrayBuffer = await file.arrayBuffer();
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const raw = decoder.decode(arrayBuffer);
        const matches = raw.match(/[\x20-\x7E\xC0-\xFF\n\r]{4,}/g);
        return matches ? matches.join('\n') : raw;
    } else {
        return await readTextFile(file);
    }
}

// PPTX text extractor using JSZip
async function extractTextFromPPTX(file) {
    if (typeof JSZip !== 'undefined') {
        try {
            const zip = await JSZip.loadAsync(file);
            const slideTexts = [];
            const slidePaths = Object.keys(zip.files)
                .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
                .sort((a, b) => {
                    const numA = parseInt((a.match(/\d+/) || [0])[0]);
                    const numB = parseInt((b.match(/\d+/) || [0])[0]);
                    return numA - numB;
                });

            for (const path of slidePaths) {
                const xml = await zip.files[path].async('text');
                const matches = xml.match(/<a:t[^>]*>(.*?)<\/a:t>/g);
                if (matches) {
                    const slideStr = matches.map(m => stripHtml(m)).join(' ');
                    if (slideStr.trim()) slideTexts.push(slideStr.trim());
                }
            }
            if (slideTexts.length > 0) {
                return `Conteúdo do slide (${file.name}):\n` + slideTexts.join('\n---\n');
            }
        } catch (e) {
            console.warn("Erro ao extrair slides PPTX:", e);
        }
    }
    return null;
}

// --- DOCUMENT PARSING (TRADITIONAL & ANKI) ---
function convertDocumentToCards(text, mode = 'open') {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const cards = [];

    for (let line of lines) {
        if (line.startsWith('#')) {
            const noteText = line.replace(/^#+\s*/, '').trim();
            if (noteText) {
                cards.push({
                    type: "divisor",
                    text: noteText,
                    description: noteText,
                    answer: ""
                });
            }
            continue;
        }

        const openDoubleMatch = line.match(/^[\(\[]\s*(?:open[_-]?double|duplo)\s*[\)\]]:?\s*(.*)$/i);
        const fillMatch = line.match(/^[\(\[]\s*(?:fill|preencher|lacunas?|cloze)\s*[\)\]]:?\s*(.*)$/i);
        const mcMatch = line.match(/^[\(\[]\s*(?:multiple[_-]?choice|multipla[_-]?escolha|mc)\s*[\)\]]:?\s*(.*)$/i);
        const ankiMatch = line.match(/^[\(\[]\s*(?:anki[_-]?like|anki)\s*[\)\]]:?\s*(.*)$/i);
        const openMatch = line.match(/^[\(\[]\s*(?:open|tradicional|aberta?)\s*[\)\]]:?\s*(.*)$/i);

        if (fillMatch) {
            const content = fillMatch[1].trim();

            // 1. New braces syntax: (fill) frase de pergunta {com} espaços e {respostas} indicadas por "{}"
            const braceRegex = /\{([^{}]+)\}/g;
            const braceAnswers = [];
            let bMatch;
            while ((bMatch = braceRegex.exec(content)) !== null) {
                const trimmed = bMatch[1].trim();
                if (trimmed.length > 0) {
                    braceAnswers.push(trimmed);
                }
            }

            if (braceAnswers.length > 0) {
                const description = content.replace(/\{([^{}]+)\}/g, (fullMatch, inner) => {
                    return inner.trim().length > 0 ? '_' : fullMatch;
                });
                cards.push({
                    type: "fill",
                    description: description.trim(),
                    answers: braceAnswers,
                    answer: braceAnswers.join('; ')
                });
            } else {
                // 2. Backward-compatible fallback: colon/semicolon format (e.g. (fill) resp1; resp2: frase com _ e _)
                const colonIndex = content.indexOf(':');
                if (colonIndex !== -1) {
                    const part1 = content.substring(0, colonIndex).trim();
                    const part2 = content.substring(colonIndex + 1).trim();

                    let answersPart = part1;
                    let description = part2;

                    const blankRegex = /(?:\[\s*_{1,}\s*\]|(?<![a-zA-Z0-9\u00C0-\u017F])_{1,}(?![a-zA-Z0-9\u00C0-\u017F]))/;
                    if (blankRegex.test(part1) && !blankRegex.test(part2)) {
                        description = part1;
                        answersPart = part2;
                    }

                    const answers = answersPart.split(';').map(a => a.trim()).filter(Boolean);
                    cards.push({
                        type: "fill",
                        description: description,
                        answers: answers,
                        answer: answers.join('; ')
                    });
                } else {
                    cards.push({
                        type: "fill",
                        description: content,
                        answers: [],
                        answer: ""
                    });
                }
            }
        } else if (openDoubleMatch) {
            const content = openDoubleMatch[1].trim();
            const colonIndex = content.indexOf(':');
            if (colonIndex !== -1) {
                const answersPart = content.substring(0, colonIndex).trim();
                const description = content.substring(colonIndex + 1).trim();
                const [ans1, ans2] = answersPart.split(';');
                cards.push({
                    type: "open_double",
                    description: description,
                    answer: ans1 ? ans1.trim() : "",
                    answer2: ans2 ? ans2.trim() : "",
                    placeholder1: "Resposta 1",
                    placeholder2: "Resposta 2"
                });
            }
        } else if (mcMatch) {
            const content = mcMatch[1].trim();
            const colonIndex = content.indexOf(':');
            if (colonIndex !== -1) {
                const answer = content.substring(0, colonIndex).trim();
                const description = content.substring(colonIndex + 1).trim();
                cards.push({
                    type: "multiple_choice",
                    description: description,
                    answer: answer,
                    options: ["Opção 1", "Opção 2", answer, "Opção 4"]
                });
            }
        } else if (ankiMatch) {
            const content = ankiMatch[1].trim();
            const colonIndex = content.indexOf(':');
            if (colonIndex !== -1) {
                const front = content.substring(0, colonIndex).trim();
                const back = content.substring(colonIndex + 1).trim();
                if (front && back) {
                    cards.push({
                        type: 'anki',
                        description: front,
                        answer: back
                    });
                }
            }
        } else if (openMatch) {
            const content = openMatch[1].trim();
            const colonIndex = content.indexOf(':');
            if (colonIndex !== -1) {
                const answer = content.substring(0, colonIndex).trim();
                const description = content.substring(colonIndex + 1).trim();
                if (answer && description) {
                    cards.push({
                        type: "open",
                        description: description,
                        answer: answer
                    });
                }
            }
        } else if (mode === 'anki') {
            // In Anki-like: line is Frente (description) : Verso (answer)
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                const front = line.substring(0, colonIndex).trim();
                const back = line.substring(colonIndex + 1).trim();
                if (front && back) {
                    cards.push({
                        type: 'anki',
                        description: front,
                        answer: back
                    });
                }
            } else if (cards.length > 0 && cards[cards.length - 1].type !== 'divisor') {
                const lastCard = cards[cards.length - 1];
                if (lastCard.type === 'anki') {
                    lastCard.answer += ' ' + line;
                } else if (lastCard.type === 'fill') {
                    lastCard.description += '\n' + line;
                } else {
                    lastCard.description += ' ' + line;
                }
            }
        } else {
            // Traditional mode (open): before ':' is Answer, after ':' is Question (description)
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                const answer = line.substring(0, colonIndex).trim();
                const description = line.substring(colonIndex + 1).trim();
                if (answer && description) {
                    cards.push({
                        type: "open",
                        description: description,
                        answer: answer
                    });
                }
            } else if (cards.length > 0 && cards[cards.length - 1].type !== 'divisor') {
                const lastCard = cards[cards.length - 1];
                if (lastCard.type === 'anki') {
                    lastCard.answer += ' ' + line;
                } else if (lastCard.type === 'fill') {
                    lastCard.description += '\n' + line;
                } else {
                    lastCard.description += ' ' + line;
                }
            }
        }
    }
    return cards;
}

function parseTxtToJSONWithPlaceholders(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    const cards = [];

    for (let line of lines) {
        line = line.trim();
        let card = null;

        if (line.startsWith('#')) {
            const noteText = line.replace(/^#+\s*/, '').trim();
            if (noteText) {
                cards.push({
                    type: "divisor",
                    text: noteText,
                    description: noteText,
                    answer: ""
                });
            }
            continue;
        }

        const openDoubleMatch = line.match(/^[\(\[]\s*(?:open[_-]?double|duplo)\s*[\)\]]:?\s*(.*)$/i);
        const fillMatch = line.match(/^[\(\[]\s*(?:fill|preencher|lacunas?|cloze)\s*[\)\]]:?\s*(.*)$/i);
        const mcMatch = line.match(/^[\(\[]\s*(?:multiple[_-]?choice|multipla[_-]?escolha|mc)\s*[\)\]]:?\s*(.*)$/i);
        const ankiMatch = line.match(/^[\(\[]\s*(?:anki[_-]?like|anki)\s*[\)\]]:?\s*(.*)$/i);

        if (fillMatch) {
            const content = fillMatch[1].trim();

            // 1. New braces syntax: (fill) frase de pergunta {com} espaços e {respostas} indicadas por "{}"
            const braceRegex = /\{([^{}]+)\}/g;
            const braceAnswers = [];
            let bMatch;
            while ((bMatch = braceRegex.exec(content)) !== null) {
                const trimmed = bMatch[1].trim();
                if (trimmed.length > 0) {
                    braceAnswers.push(trimmed);
                }
            }

            if (braceAnswers.length > 0) {
                const description = content.replace(/\{([^{}]+)\}/g, (fullMatch, inner) => {
                    return inner.trim().length > 0 ? '_' : fullMatch;
                });
                card = {
                    type: "fill",
                    description: description.trim(),
                    answers: braceAnswers,
                    answer: braceAnswers.join('; ')
                };
            } else {
                // 2. Backward-compatible fallback: colon/semicolon format
                const colonIndex = content.indexOf(':');
                if (colonIndex !== -1) {
                    const part1 = content.substring(0, colonIndex).trim();
                    const part2 = content.substring(colonIndex + 1).trim();

                    let answersPart = part1;
                    let description = part2;

                    const blankRegex = /(?:\[\s*_{1,}\s*\]|(?<![a-zA-Z0-9\u00C0-\u017F])_{1,}(?![a-zA-Z0-9\u00C0-\u017F]))/;
                    if (blankRegex.test(part1) && !blankRegex.test(part2)) {
                        description = part1;
                        answersPart = part2;
                    }

                    const answers = answersPart.split(';').map(a => a.trim()).filter(Boolean);
                    card = {
                        type: "fill",
                        description: description,
                        answers: answers,
                        answer: answers.join('; ')
                    };
                } else {
                    card = {
                        type: "fill",
                        description: content,
                        answers: ["[GEMINI]"],
                        answer: "[GEMINI]"
                    };
                }
            }
        } else if (openDoubleMatch) {
            const content = openDoubleMatch[1].trim();
            const colonIndex = content.indexOf(':');
            if (colonIndex !== -1) {
                const answersPart = content.substring(0, colonIndex).trim();
                const description = content.substring(colonIndex + 1).trim();
                const [ans1, ans2] = answersPart.split(';');
                card = {
                    type: "open_double",
                    description: description,
                    answer: ans1 ? ans1.trim() : "",
                    answer2: ans2 ? ans2.trim() : "",
                    placeholder1: "[GEMINI]",
                    placeholder2: "[GEMINI]"
                };
            }
        } else if (mcMatch) {
            const content = mcMatch[1].trim();
            const colonIndex = content.indexOf(':');
            if (colonIndex !== -1) {
                const answer = content.substring(0, colonIndex).trim();
                const description = content.substring(colonIndex + 1).trim();
                card = {
                    type: "multiple_choice",
                    description: description,
                    answer: answer,
                    options: ["[GEMINI]", "[GEMINI]", answer, "[GEMINI]"]
                };
            }
        } else if (ankiMatch) {
            const content = ankiMatch[1].trim();
            const colonIndex = content.indexOf(':');
            if (colonIndex !== -1) {
                const front = content.substring(0, colonIndex).trim();
                const back = content.substring(colonIndex + 1).trim();
                if (front && back) {
                    card = {
                        type: "anki",
                        description: front,
                        answer: back
                    };
                }
            }
        } else {
            const colonIndex = line.indexOf(':');
            if (colonIndex !== -1) {
                const answer = line.substring(0, colonIndex).trim();
                const description = line.substring(colonIndex + 1).trim();
                if (answer && description) {
                    card = {
                        type: "open",
                        description: description,
                        answer: answer
                    };
                }
            } else if (cards.length > 0 && cards[cards.length - 1].type !== 'divisor') {
                const lastCard = cards[cards.length - 1];
                if (lastCard.type === 'anki') {
                    lastCard.answer += ' ' + line;
                } else if (lastCard.type === 'fill') {
                    lastCard.description += '\n' + line;
                } else {
                    lastCard.description += ' ' + line;
                }
            }
        }

        if (card) {
            cards.push(card);
        }
    }
    return cards;
}

// Transition from Dashboard to Editor (M3 Fade Through Motion)
function openEditorView(initialTab = 'creator') {
    const updateDOM = () => {
        dashboardView.classList.add('hidden');
        dashboardView.classList.remove('m3-fade-through-enter');
        editorView.classList.remove('hidden');
        editorView.classList.add('flex', 'm3-fade-through-enter');

        switchSidebarTab(initialTab, true);
        renderCardsList(true);
    };

    if (typeof document.startViewTransition === 'function') {
        try {
            const vt = document.startViewTransition(updateDOM);
            if (vt) {
                if (vt.ready) vt.ready.catch(() => {});
                if (vt.finished) vt.finished.catch(() => {});
                if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
            }
        } catch (e) {
            updateDOM();
        }
    } else {
        updateDOM();
    }
}

// Sidebar Tab Switching (Material Design 3 Shared Axis X Motion)
let currentSidebarTab = 'creator';

function switchSidebarTab(tab, force = false) {
    if (!force && tab === currentSidebarTab && (!cardCreatorPanel.classList.contains('hidden') || !aiEditorChatPanel.classList.contains('hidden'))) {
        return;
    }

    const direction = tab === 'ai' ? 'forward' : 'backward';

    const updateDOM = () => {
        const tabAiChatIcon = tabAiChatBtn ? tabAiChatBtn.querySelector('img') : null;
        cardCreatorPanel.classList.remove('m3-tab-panel-enter-forward', 'm3-tab-panel-enter-backward');
        aiEditorChatPanel.classList.remove('m3-tab-panel-enter-forward', 'm3-tab-panel-enter-backward');

        if (tab === 'creator') {
            tabCreatorBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition bg-blue-600 text-white shadow-sm";
            tabAiChatBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition text-gray-600 hover:bg-gray-200";
            tabCreatorBtn.setAttribute('aria-selected', 'true');
            tabAiChatBtn.setAttribute('aria-selected', 'false');
            if (tabAiChatIcon) {
                tabAiChatIcon.classList.add('light-invert');
            }
            cardCreatorPanel.classList.remove('hidden');
            cardCreatorPanel.classList.add(direction === 'forward' ? 'm3-tab-panel-enter-forward' : 'm3-tab-panel-enter-backward');
            aiEditorChatPanel.classList.add('hidden');
        } else {
            tabAiChatBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition bg-purple-600 text-white shadow-sm";
            tabCreatorBtn.className = "flex-1 py-2 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition text-gray-600 hover:bg-gray-200";
            tabAiChatBtn.setAttribute('aria-selected', 'true');
            tabCreatorBtn.setAttribute('aria-selected', 'false');
            if (tabAiChatIcon) {
                tabAiChatIcon.classList.remove('light-invert');
            }
            cardCreatorPanel.classList.add('hidden');
            aiEditorChatPanel.classList.remove('hidden');
            aiEditorChatPanel.classList.add(direction === 'forward' ? 'm3-tab-panel-enter-forward' : 'm3-tab-panel-enter-backward');
        }
        currentSidebarTab = tab;
    };

    if (document.startViewTransition) {
        document.startViewTransition({
            update: updateDOM,
            types: [direction]
        });
    } else {
        updateDOM();
    }
}

tabCreatorBtn.addEventListener('click', () => switchSidebarTab('creator'));
tabAiChatBtn.addEventListener('click', () => {
    if (!isUserPro()) {
        openProModal();
        return;
    }
    switchSidebarTab('ai');
});

export function hasUsedFreeAiDeck() {
    return localStorage.getItem('spaiq_free_ai_deck_used') === 'true';
}

export function markFreeAiDeckUsed() {
    localStorage.setItem('spaiq_free_ai_deck_used', 'true');
    window.currentDeckIsFreeAiTrial = true;
}

export function canGenerateWithAi() {
    if (isUserPro()) return true;
    if (!hasUsedFreeAiDeck()) return true;
    const status = getUserProStatus();
    const localExtra = Number(localStorage.getItem('spaiq_extra_generations') || 0);
    return Boolean((status && status.extraGenerations > 0) || localExtra > 0);
}

function updateProPaywalledUI() {
    initExploreModal();
    const isPro = isUserPro();
    const usedTrial = hasUsedFreeAiDeck();
    const userStatus = getUserProStatus();
    const localExtra = Number(localStorage.getItem('spaiq_extra_generations') || 0);
    const extraGens = Number(userStatus?.extraGenerations || 0) + localExtra;
    const hasExtra = extraGens > 0;

    [cardMode21, cardMode22].forEach(card => {
        if (!card) return;
        const existingBadge = card.querySelector('.paywall-badge-pill');
        if (!isPro) {
            if (usedTrial && !hasExtra) {
                card.classList.add('is-paywalled');
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.className = 'paywall-badge-pill';
                    badge.innerHTML = `<img src="../assets/img/PRO.svg" alt="Pro"><span>PRO / R$ 1,49</span>`;
                    card.appendChild(badge);
                } else {
                    existingBadge.className = 'paywall-badge-pill';
                    existingBadge.innerHTML = `<img src="../assets/img/PRO.svg" alt="Pro"><span>PRO / R$ 1,49</span>`;
                }
            } else if (usedTrial && hasExtra) {
                card.classList.remove('is-paywalled');
                const badgeLabel = `${extraGens} ${extraGens === 1 ? t('available_singular') : t('available_plural')}`;
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.className = 'paywall-badge-pill trial-badge-pill';
                    badge.innerHTML = `<img src="../assets/img/ai.svg" alt="IA"><span>${badgeLabel}</span>`;
                    card.appendChild(badge);
                } else {
                    existingBadge.className = 'paywall-badge-pill trial-badge-pill';
                    existingBadge.innerHTML = `<img src="../assets/img/ai.svg" alt="IA"><span>${badgeLabel}</span>`;
                }
            } else {
                card.classList.remove('is-paywalled');
                if (!existingBadge) {
                    const badge = document.createElement('div');
                    badge.className = 'paywall-badge-pill trial-badge-pill';
                    badge.innerHTML = `<img src="../assets/img/PRO.svg" alt="Trial"><span>${t('one_free_badge')}</span>`;
                    card.appendChild(badge);
                } else {
                    existingBadge.className = 'paywall-badge-pill trial-badge-pill';
                    existingBadge.innerHTML = `<img src="../assets/img/PRO.svg" alt="Trial"><span>${t('one_free_badge')}</span>`;
                }
            }
        } else {
            card.classList.remove('is-paywalled');
            existingBadge?.remove();
        }
    });

    const modal21Badge = document.getElementById('modal-2-1-badge-container');
    const modal22Badge = document.getElementById('modal-2-2-badge-container');
    if (!isPro && !usedTrial) {
        if (modal21Badge) {
            modal21Badge.className = 'p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between';
            modal21Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="../assets/img/PRO.svg" class="w-5 h-5 flex-shrink-0" alt="Pro">
                    <div>
                        <span class="text-xs font-bold text-blue-900 block">${t('free_trial_title')}</span>
                        <span class="text-[11px] text-blue-700">${t('free_trial_desc_generate')}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                    ${t('one_free_badge')}
                </span>
            `;
        }
        if (modal22Badge) {
            modal22Badge.className = 'p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between';
            modal22Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="../assets/img/PRO.svg" class="w-5 h-5 flex-shrink-0" alt="Pro">
                    <div>
                        <span class="text-xs font-bold text-blue-900 block">${t('free_trial_title')}</span>
                        <span class="text-[11px] text-blue-700">${t('free_trial_desc_enhance')}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                    ${t('one_free_badge')}
                </span>
            `;
        }
    } else if (!isPro && usedTrial && hasExtra) {
        const extraLabel = `${extraGens} ${extraGens === 1 ? t('credit_singular') : t('credits_plural')}`;
        if (modal21Badge) {
            modal21Badge.className = 'p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between';
            modal21Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="../assets/img/ai.svg" class="w-5 h-5 flex-shrink-0" alt="IA">
                    <div>
                        <span class="text-xs font-bold text-blue-900 block">${t('single_ai_generation_title')}</span>
                        <span class="text-[11px] text-blue-700">${t('single_ai_generation_desc', { count: extraGens })}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                    ${extraLabel}
                </span>
            `;
        }
        if (modal22Badge) {
            modal22Badge.className = 'p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between';
            modal22Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="../assets/img/ai.svg" class="w-5 h-5 flex-shrink-0" alt="IA">
                    <div>
                        <span class="text-xs font-bold text-blue-900 block">${t('single_ai_generation_title')}</span>
                        <span class="text-[11px] text-blue-700">${t('single_ai_generation_desc', { count: extraGens })}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                    ${extraLabel}
                </span>
            `;
        }
    } else if (isPro) {
        if (modal21Badge) {
            modal21Badge.className = 'p-3.5 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between';
            modal21Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="../assets/img/PRO.svg" class="w-5 h-5 flex-shrink-0" alt="Pro">
                    <div>
                        <span class="text-xs font-bold text-purple-900 block">${t('pro_feature_title')}</span>
                        <span class="text-[11px] text-purple-700">${t('pro_feature_generate_desc')}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                    <span class="material-symbols-rounded text-xs">check_circle</span> ${t('active_status')}
                </span>
            `;
        }
        if (modal22Badge) {
            modal22Badge.className = 'p-3.5 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between';
            modal22Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <img src="../assets/img/PRO.svg" class="w-5 h-5 flex-shrink-0" alt="Pro">
                    <div>
                        <span class="text-xs font-bold text-purple-900 block">${t('pro_feature_title')}</span>
                        <span class="text-[11px] text-purple-700">${t('pro_feature_enhance_desc')}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                    <span class="material-symbols-rounded text-xs">check_circle</span> ${t('active_status')}
                </span>
            `;
        }
    } else if (!isPro && usedTrial && !hasExtra) {
        if (modal21Badge) {
            modal21Badge.className = 'p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between';
            modal21Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <span class="material-symbols-rounded text-[#3b82f7] text-xl">auto_awesome</span>
                    <div>
                        <span class="text-xs font-bold text-blue-900 block">${t('single_deck_price_title')}</span>
                        <span class="text-[11px] text-blue-700">${t('single_deck_pay_on_generate')}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-[#3b82f7] bg-blue-100 px-2.5 py-1 rounded-full border border-blue-200">
                    R$ 1,49
                </span>
            `;
        }
        if (modal22Badge) {
            modal22Badge.className = 'p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between';
            modal22Badge.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <span class="material-symbols-rounded text-[#3b82f7] text-xl">auto_awesome</span>
                    <div>
                        <span class="text-xs font-bold text-blue-900 block">${t('single_deck_price_title')}</span>
                        <span class="text-[11px] text-blue-700">${t('single_deck_pay_on_generate')}</span>
                    </div>
                </div>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-[#3b82f7] bg-blue-100 px-2.5 py-1 rounded-full border border-blue-200">
                    R$ 1,49
                </span>
            `;
        }
    }

    if (tabAiChatBtn) {
        const tabBadge = tabAiChatBtn.querySelector('.paywall-tab-icon');
        if (!isPro) {
            tabAiChatBtn.classList.add('opacity-75');
            if (!tabBadge) {
                const icon = document.createElement('img');
                icon.src = '../assets/img/PRO.svg';
                icon.className = 'w-3.5 h-3.5 paywall-tab-icon ml-1.5 inline opacity-80';
                icon.alt = 'Pro';
                tabAiChatBtn.appendChild(icon);
            }
        } else {
            tabAiChatBtn.classList.remove('opacity-75');
            tabBadge?.remove();
        }
    }
}

// Listen to auth changes and initialize UI
onAuthChange(() => updateProPaywalledUI());
setTimeout(updateProPaywalledUI, 100);

// --- DASHBOARD CARD HANDLERS ---

// Mode Selection Cards: Interactive mouse-following blur hover effect
function setupModeCardsGlowFollow() {
    const cards = [cardMode11, cardMode12, cardMode21, cardMode22].filter(Boolean);
    cards.forEach(card => {
        let rafId = null;
        let latestEvent = null;

        const updatePosition = () => {
            if (!latestEvent) return;
            const rect = card.getBoundingClientRect();
            const x = latestEvent.clientX - rect.left;
            const y = latestEvent.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
            rafId = null;
        };

        card.addEventListener('pointerenter', (e) => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
            card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
        });

        card.addEventListener('pointermove', (e) => {
            latestEvent = e;
            if (!rafId) {
                rafId = requestAnimationFrame(updatePosition);
            }
        });

        card.addEventListener('pointerleave', () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            latestEvent = null;
        });
    });
}
setupModeCardsGlowFollow();

// 1.1 Crie agora — Escreva cada cartão direto no aplicativo
cardMode11.addEventListener('click', () => {
    deckCards = [];
    deckTitleDisplay.value = t('new_deck_default_title');
    openEditorView('creator');
});

// Modal 1.2 Interactive Sandbox Constants & Functions
const MODAL_1_2_DEFAULT_TEXT_PT = `# Módulo 1: Fundamentos de Biologia
Mitocôndria : Qual organela celular é responsável pela síntese aeróbica de ATP?
(anki_like) Efeito Bohr : Redução da afinidade da hemoglobina por O2 em ambiente ácido
(fill) Os osmorreceptores hipotalâmicos regulam a secreção de {ADH} para controlar a retenção de {água}.
(open_double) Cefaleia em salvas;Oxigênio 100% : Homem jovem com dor periorbitária em facada e lacrimejamento. Diagnóstico e conduta:
(multiple_choice) Brasil : Qual é o maior país da América do Sul em área territorial?`;

const MODAL_1_2_DEFAULT_TEXT_EN = `# Module 1: Biology Fundamentals
Mitochondria : Which cellular organelle is responsible for aerobic ATP synthesis?
(anki_like) Bohr Effect : Shift in hemoglobin oxygen affinity under acidosis
(fill) Hypothalamic osmoreceptors regulate {ADH} secretion to govern {water} retention.
(open_double) Cluster headache;100% Oxygen : Young patient with severe unilateral periorbital pain. Diagnosis and acute therapy:
(multiple_choice) Brazil : What is the largest country in South America by land area?`;

function getModal12DefaultText() {
    return getCurrentLanguage() === 'en-US' ? MODAL_1_2_DEFAULT_TEXT_EN : MODAL_1_2_DEFAULT_TEXT_PT;
}

function renderModal12LivePreview(cards) {
    if (!modal12PreviewCards) return;
    modal12PreviewCards.innerHTML = '';
    
    if (modal12PreviewCount) {
        const playableCount = cards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note').length;
        const totalCount = cards.length;
        modal12PreviewCount.textContent = `${playableCount} ${playableCount === 1 ? 'card' : 'cards'}${totalCount > playableCount ? ` (+${totalCount - playableCount} div)` : ''}`;
    }

    if (!cards || cards.length === 0) {
        modal12PreviewCards.innerHTML = `
            <div class="p-6 text-center text-xs text-gray-400 bg-white border border-dashed border-gray-200 rounded-xl font-sans">
                ${t('sandbox_empty_state')}
            </div>
        `;
        return;
    }

    cards.forEach((c) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'p-3 bg-white border rounded-xl shadow-2xs space-y-1.5 transition';

        if (c.type === 'divisor' || c.type === 'divider') {
            cardEl.className = 'p-2.5 bg-gray-100/90 border border-gray-200 rounded-xl flex items-center gap-2';
            cardEl.innerHTML = `
                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-200 text-gray-700 font-sans"># Divisor</span>
                <span class="font-bold text-xs text-gray-800 font-sans">${escapeHtml(c.text || c.description || '')}</span>
            `;
        } else if (c.type === 'anki') {
            cardEl.className += ' border-indigo-100';
            cardEl.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 font-sans">(anki_like) Anki-like</span>
                    <span class="text-[11px] text-gray-400 font-sans">Virar &amp; avaliar</span>
                </div>
                <div class="text-xs text-gray-900 leading-relaxed font-sans">
                    <span class="font-bold text-gray-500">Frente:</span> ${escapeHtml(c.description || '')}
                </div>
                <div class="text-xs text-indigo-900 bg-indigo-50/70 border border-indigo-100 p-2 rounded-lg font-sans">
                    <span class="font-bold text-indigo-950">Verso:</span> ${escapeHtml(c.answer || '')}
                </div>
            `;
        } else if (c.type === 'fill') {
            cardEl.className += ' border-emerald-100';
            const answersBadges = (c.answers || []).map(a => `<span class="px-2 py-0.5 bg-white border border-emerald-200 rounded font-bold text-[11px] text-emerald-900">${escapeHtml(a)}</span>`).join(' ');
            cardEl.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 font-sans">(fill) Preenchimento</span>
                    <span class="text-[11px] text-gray-400 font-sans">${(c.answers || []).length} lacuna(s)</span>
                </div>
                <div class="text-xs text-gray-900 leading-relaxed font-sans">
                    <span class="font-bold text-gray-500">Frase:</span> ${escapeHtml(c.description || '')}
                </div>
                <div class="text-xs text-emerald-900 bg-emerald-50/70 border border-emerald-100 p-2 rounded-lg font-sans flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-emerald-950">Lacunas:</span> ${answersBadges || escapeHtml(c.answer || '')}
                </div>
            `;
        } else if (c.type === 'open_double') {
            cardEl.className += ' border-teal-100';
            cardEl.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-100 text-teal-800 font-sans">(open_double) Resposta Dupla</span>
                    <span class="text-[11px] text-gray-400 font-sans">2 respostas</span>
                </div>
                <div class="text-xs text-gray-900 leading-relaxed font-sans">
                    <span class="font-bold text-gray-500">Pergunta:</span> ${escapeHtml(c.description || '')}
                </div>
                <div class="text-xs text-teal-900 bg-teal-50/70 border border-teal-100 p-2 rounded-lg font-sans grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><span class="font-bold text-teal-950">Resp 1:</span> ${escapeHtml(c.answer || '')}</div>
                    <div><span class="font-bold text-teal-950">Resp 2:</span> ${escapeHtml(c.answer2 || '')}</div>
                </div>
            `;
        } else if (c.type === 'multiple_choice') {
            cardEl.className += ' border-purple-100';
            cardEl.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 font-sans">(multiple_choice) Múltipla Escolha</span>
                    <span class="text-[11px] text-gray-400 font-sans">Gabarito</span>
                </div>
                <div class="text-xs text-gray-900 leading-relaxed font-sans">
                    <span class="font-bold text-gray-500">Pergunta:</span> ${escapeHtml(c.description || '')}
                </div>
                <div class="text-xs text-purple-900 bg-purple-50/70 border border-purple-100 p-2 rounded-lg font-sans">
                    <span class="font-bold text-purple-950">Gabarito correto:</span> ${escapeHtml(c.answer || '')}
                </div>
            `;
        } else {
            // Default: open
            cardEl.className += ' border-blue-100';
            cardEl.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-[#3b82f7] font-sans">Aberta (Padrão)</span>
                    <span class="text-[11px] text-gray-400 font-sans">Você digita</span>
                </div>
                <div class="text-xs text-gray-900 leading-relaxed font-sans">
                    <span class="font-bold text-gray-500">Pergunta:</span> ${escapeHtml(c.description || '')}
                </div>
                <div class="text-xs text-emerald-800 bg-emerald-50/70 border border-emerald-100 p-2 rounded-lg font-sans">
                    <span class="font-bold text-emerald-900">Resposta:</span> ${escapeHtml(c.answer || '')}
                </div>
            `;
        }

        modal12PreviewCards.appendChild(cardEl);
    });
}

function updateModal12SandboxLivePreview() {
    if (!modal12SandboxInput || !modal12PreviewCards) return;
    const text = modal12SandboxInput.value || '';
    const cards = convertDocumentToCards(text, 'open');
    renderModal12LivePreview(cards);
}

// 1.2 Converta um doc — Importe um txt ou word já feito
cardMode12.addEventListener('click', () => {
    modal12Error.textContent = '';
    modal12File.value = '';
    modal12FileName.textContent = t('drop_file_here');
    if (modal12SandboxInput && !modal12SandboxInput.value.trim()) {
        modal12SandboxInput.value = getModal12DefaultText();
    }
    updateModal12SandboxLivePreview();
    modal12.classList.remove('hidden');
});

closeModal12Btn.addEventListener('click', () => modal12.classList.add('hidden'));
cancelModal12Btn.addEventListener('click', () => modal12.classList.add('hidden'));

modal12File.addEventListener('change', () => {
    if (modal12File.files.length > 0) {
        modal12FileName.textContent = modal12File.files[0].name;
    }
});

modal12SandboxInput?.addEventListener('input', () => {
    updateModal12SandboxLivePreview();
});

modal12ResetSandboxBtn?.addEventListener('click', () => {
    if (modal12SandboxInput) {
        modal12SandboxInput.value = getModal12DefaultText();
        updateModal12SandboxLivePreview();
    }
});

modal12UseSandboxBtn?.addEventListener('click', () => {
    modal12Error.textContent = '';
    const text = modal12SandboxInput?.value || '';
    const cards = convertDocumentToCards(text, 'open');
    const playableCards = cards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note');
    if (playableCards.length === 0) {
        modal12Error.textContent = t('no_valid_cards_colon_error');
        return;
    }

    deckCards = cards;
    deckTitleDisplay.value = t('sandbox_deck_title');
    modal12.classList.add('hidden');
    openEditorView('creator');
});

submitModal12Btn.addEventListener('click', async () => {
    modal12Error.textContent = '';
    if (!modal12File.files || modal12File.files.length === 0) {
        modal12Error.textContent = t('select_txt_doc_error');
        return;
    }

    const file = modal12File.files[0];
    const selectedMode = 'open';

    try {
        const text = await extractTextFromFile(file);
        const cards = convertDocumentToCards(text, selectedMode);

        const playableCards = cards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note');
        if (playableCards.length === 0) {
            modal12Error.textContent = t('no_valid_cards_colon_error');
            return;
        }

        deckCards = cards;
        deckTitleDisplay.value = file.name.replace(/\.[^/.]+$/, "");
        modal12.classList.add('hidden');
        openEditorView('creator');
    } catch (err) {
        modal12Error.textContent = t('error_reading_doc', { error: err.message });
    }
});

// 2.1 Crie de materiais — Transforme slides, pdf, fotos... em cards
cardMode21.addEventListener('click', () => {
    modal21Error.textContent = '';
    modal21Files.value = '';
    modal21FilesCount.textContent = t('no_file_selected');
    modal21FilesText.classList.remove('hidden');
    renderFileIcons([], modal21IconsContainer, FILES_DEFAULT_SVG);
    updateModal21LanguageUI();
    resetModal21LanguageSelection();
    modal21.classList.remove('hidden');
});

closeModal21Btn.addEventListener('click', () => modal21.classList.add('hidden'));
cancelModal21Btn.addEventListener('click', () => modal21.classList.add('hidden'));

modal21Files.addEventListener('change', () => {
    modal21Error.textContent = '';
    const files = Array.from(modal21Files.files);

    if (files.length > 10) {
        modal21Error.textContent = t('file_limit_10_error');
        modal21Files.value = '';
        modal21FilesCount.textContent = t('no_file_selected');
        renderFileIcons([], modal21IconsContainer, FILES_DEFAULT_SVG);
        return;
    }

    for (let f of files) {
        if (f.size > MAX_FILE_SIZE) {
            modal21Error.textContent = t('file_exceeds_100mb', { name: f.name });
            modal21Files.value = '';
            modal21FilesCount.textContent = t('no_file_selected');
            renderFileIcons([], modal21IconsContainer, FILES_DEFAULT_SVG);
            return;
        }
    }

    if (files.length > 0) {
        modal21FilesCount.textContent = t('files_selected_count', { count: files.length });
        modal21FilesText.classList.add('hidden');
    } else {
        modal21FilesCount.textContent = t('no_file_selected');
        modal21FilesText.classList.remove('hidden');
    }
    renderFileIcons(files, modal21IconsContainer, FILES_DEFAULT_SVG);
});

/**
 * Executes AI generation from materials (Mode 2.1)
 * @param {File[]} files
 * @param {string} [customInstructions='']
 * @param {string} [selectedLanguage='Inglês']
 * @param {string} [customLanguage='']
 */
async function executeAiGenerationFromMaterials(files, customInstructions = '', selectedLanguage = 'Inglês', customLanguage = '') {
    if (!files || files.length === 0) return;

    modal21.classList.add('hidden');
    openEditorView('ai');

    deckCards = [];
    deckTitleDisplay.value = files[0].name.replace(/\.[^/.]+$/, "");

    showGeneratingAnimation(t('processing_uploaded_materials'));
    addAiChatGeneratingBubble(t('gemini_analyzing_materials_bubble'));

    submitModal21Btn.disabled = true;
    modal21Spinner.classList.remove('hidden');
    modal21LoadingMsg.classList.remove('hidden');

    try {
        let userTaskPrompt = `Com base nos arquivos enviados, o objetivo é processar todo o conteúdo e gerar uma lista extensa de termos técnicos para revisão, incluindo nomes de moléculas, estruturas, etapas de processos e quaisquer conceitos com nomes específicos. Em seguida, usar das informações que classificou na primeira etapa para gerar um arquivo .json baseado em todo o conteúdo que juntou na primeira etapa. A sua resposta vai ser apenas o JSON com os flashcards, a primeira etapa serve apenas para você planejar os flashcards.
Gere aproximadamente 100 flashcards completos e aprofundados cobrindo todo o material enviado (se necessário para cobrir todo o conteúdo essencial, pode ultrapassar esse valor).
Atribua obrigatoriamente a matéria de alto nível ('subject') e o assunto específico agrupador ('topic') em cada flashcard para indexação taxonômica.
Ao final revise se os flashcards criados realmente abordam por extenso tudo que foi enviado.
Retorne EXCLUSIVAMENTE o array JSON ([]) contendo os flashcards estruturados conforme as diretrizes do sistema.`;

        const customText = (customInstructions || '').trim();
        if (customText) {
            userTaskPrompt += `\n\nDemandas adicionais do usuário (prioridade máxima sobre os padrões quando conflitarem):\n${customText}`;
        }

        if (getCurrentLanguage() !== 'pt-BR') {
            let targetDeckLanguage = selectedLanguage || 'Inglês';
            if (targetDeckLanguage === 'custom') {
                targetDeckLanguage = (customLanguage || '').trim() || 'Inglês';
            }
            userTaskPrompt += `\n\nGere em ${targetDeckLanguage}`;
        }

        const parts = [{ text: userTaskPrompt }];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            updateGeneratingStatus(t('processing_file_progress', { current: i + 1, total: files.length, name: file.name }));
            const ext = getFileExtension(file.name);
            if (ext === 'pptx') {
                const pptxText = await extractTextFromPPTX(file);
                if (pptxText) {
                    parts.push({ text: pptxText });
                    continue;
                }
            } else if (ext === 'docx' || ext === 'doc' || ext === 'txt') {
                try {
                    const text = await extractTextFromFile(file);
                    if (text) {
                        parts.push({ text });
                        continue;
                    }
                } catch (e) {
                    console.warn("Falha ao extrair texto de " + file.name + ":", e);
                }
            } else if (file.type === 'application/pdf' && file.size > 5 * 1024 * 1024) {
                try {
                    const compressed = await compressPDFWithWorker(file);
                    const compFile = new File([compressed], file.name, { type: 'application/pdf' });
                    const part = await fileToGenerativePart(compFile);
                    parts.push(part);
                    continue;
                } catch (e) {
                    console.warn("Falha ao comprimir PDF:", e);
                }
            }
            const part = await fileToGenerativePart(file);
            parts.push(part);
        }

        updateGeneratingStatus(t('connecting_gemini_generating'));

        let fullText = "";
        const seenSignatures = new Set();

        const token = await getCurrentUserToken().catch(() => null);
        const isTrial = !isUserPro() && !hasUsedFreeAiDeck();
        const localExtra = Number(localStorage.getItem('spaiq_extra_generations') || 0);

        if (isTrial) {
            window.currentDeckIsFreeAiTrial = true;
        } else if (!isUserPro() && hasUsedFreeAiDeck() && localExtra <= 0) {
            openExtraDeckModal();
            return;
        }

        const reqHeaders = { 'Content-Type': 'application/json' };
        if (token) {
            reqHeaders['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${BACKEND_URL}/api/ai/generate`, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify({
                model: currentEditorModel || "gemini-flash-latest",
                contents: [{ role: 'user', parts }],
                systemInstruction: { parts: [{ text: generationSystemInstruction }] },
                generationConfig: {
                    thinkingConfig: {
                        thinkingLevel: "HIGH"
                    },
                    responseMimeType: "application/json"
                },
                stream: true,
                isNewDeck: true
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'quota_exceeded') {
                const promptMsg = isUserPro() ? t('alert_pro_monthly_limit') : t('alert_non_pro_limit');
                if (confirm(promptMsg)) {
                    if (typeof window.flashcardsOpenExtraDeckModal === 'function') {
                        window.flashcardsOpenExtraDeckModal();
                    }
                }
            }
            throw new Error(errData.message || `Erro no servidor (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6).trim();
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (chunkText) {
                            fullText += chunkText;
                            const streamObjects = extractBalancedJsonObjects(fullText);
                            for (const rawObj of streamObjects) {
                                const card = normalizeCard(rawObj);
                                if (card) {
                                    const sig = `${card.type}::${card.description}::${card.answer}`;
                                    if (!seenSignatures.has(sig)) {
                                        seenSignatures.add(sig);
                                        deckCards.push(card);
                                        updateGeneratingProgress(deckCards.length);
                                        renderCardsList();
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        // Stream completed. If no cards were extracted or some were missed, run safe fallback parser
        if (deckCards.length === 0 && fullText.trim()) {
            const fallbackCards = parseJsonCardsSafely(fullText);
            for (const card of fallbackCards) {
                const sig = `${card.type}::${card.description}::${card.answer}`;
                if (!seenSignatures.has(sig)) {
                    seenSignatures.add(sig);
                    deckCards.push(card);
                }
            }
            if (deckCards.length > 0) {
                renderCardsList(true);
            }
        }

        if (deckCards.length > 0) {
            if (window.currentDeckIsFreeAiTrial) {
                markFreeAiDeckUsed();
                deckCards.forEach(c => { if (c && typeof c === 'object') c.isFreeAiTrial = true; });
                localStorage.setItem('editing_deck_is_free_trial', 'true');
            } else if (!isUserPro() && hasUsedFreeAiDeck()) {
                const updatedExtra = Number(localStorage.getItem('spaiq_extra_generations') || 0);
                if (updatedExtra > 0) {
                    localStorage.setItem('spaiq_extra_generations', String(Math.max(0, updatedExtra - 1)));
                }
            }
            refreshUserProStatus().then(() => updateProPaywalledUI());
            finishGeneratingAnimation(true, deckCards.length);
            removeAiChatGeneratingBubble();
            addChatMessage('model', t('deck_generated_chat_msg', { count: deckCards.length }));
        } else {
            finishGeneratingAnimation(false, 0);
            removeAiChatGeneratingBubble();
            addChatMessage('model', t('deck_generation_empty_chat_msg'));
            renderCardsList(true);
        }

        // Initialize chat session for subsequent agentic edits in the sidebar
        geminiChatSession = { _history: [] };

    } catch (err) {
        console.error("Erro na geração 2.1:", err);
        finishGeneratingAnimation(false, 0);
        removeAiChatGeneratingBubble();
        addChatMessage('error', t('generation_error_chat_msg', { error: err.message }));
        showGeminiDownModal(err.message, 'files');
    } finally {
        submitModal21Btn.disabled = false;
        modal21Spinner.classList.add('hidden');
        modal21LoadingMsg.classList.add('hidden');
    }
}

submitModal21Btn.addEventListener('click', async () => {
    modal21Error.textContent = '';
    const files = Array.from(modal21Files.files);
    if (files.length === 0) {
        modal21Error.textContent = t('select_at_least_one_file');
        return;
    }
    if (files.length > 10) {
        modal21Error.textContent = t('file_limit_10_error');
        return;
    }

    if (!canGenerateWithAi()) {
        await savePendingGeneration({
            mode: '2.1',
            files,
            prompt: modal21Prompt.value.trim(),
            language: modal21SelectedLanguage || 'Inglês',
            customLanguage: modal21CustomLangInput?.value.trim() || ''
        });
        openExtraDeckModal();
        return;
    }

    await executeAiGenerationFromMaterials(
        files,
        modal21Prompt.value.trim(),
        modal21SelectedLanguage,
        modal21CustomLangInput?.value.trim()
    );
});

// 2.2 Aprimore um doc — A partir de um txt ou word, aprimore cartões
cardMode22.addEventListener('click', () => {
    modal22Error.textContent = '';
    modal22File.value = '';
    modal22FileName.textContent = t('click_or_drag_txt_word');
    modal22.classList.remove('hidden');
});

closeModal22Btn.addEventListener('click', () => modal22.classList.add('hidden'));
cancelModal22Btn.addEventListener('click', () => modal22.classList.add('hidden'));

modal22File.addEventListener('change', () => {
    if (modal22File.files.length > 0) {
        modal22FileName.textContent = modal22File.files[0].name;
    }
});

/**
 * Executes AI enhancement from txt/docx document (Mode 2.2)
 * @param {File} file
 */
async function executeAiEnhanceFromDoc(file) {
    if (!file) return;

    modal22.classList.add('hidden');
    submitModal22Btn.disabled = true;
    modal22Spinner.classList.remove('hidden');
    modal22LoadingMsg.classList.remove('hidden');

    let localCards = [];
    try {
        const textContent = await extractTextFromFile(file);
        localCards = parseTxtToJSONWithPlaceholders(textContent);

        const playableCards = localCards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note');
        if (playableCards.length === 0) {
            modal22Error.textContent = t('no_valid_cards_syntax_error');
            return;
        }

        openEditorView('ai');

        deckTitleDisplay.value = file.name.replace(/\.[^/.]+$/, "");
        deckCards = localCards;
        renderCardsList(true);

        const hasPlaceholders = JSON.stringify(localCards).includes("[GEMINI]");

        if (!hasPlaceholders) {
            geminiChatSession = { _history: [] };
            addChatMessage('model', t('doc_imported_chat_msg', { count: deckCards.length }));
            return;
        }

        // Fill placeholders with Gemini
        showGeneratingAnimation(t('enhancing_flashcards_status'));
        addAiChatGeneratingBubble(t('gemini_enhancing_bubble'));

        const fillPrompt = `Aqui está uma lista de flashcards que precisam que você preencha os campos '[GEMINI]'.
As perguntas ('description') de todos os tipos de cartões podem usar formatação Markdown e fórmulas LaTeX livremente.
Para 'open_double', preencha 'placeholder1' e 'placeholder2' com rótulos descritivos curtos para as respostas. Respostas digitadas devem ser texto puro sem Markdown e sem fórmulas.
Para 'multiple_choice', complete o array 'options' com alternativas incorretas porém plausíveis (distratores), mantendo a resposta correta informada. Pode usar Markdown e LaTeX livremente.
Para 'fill', se 'answers' contiver '[GEMINI]' ou estiver vazio, identifique as respostas corretas para cada lacuna '_' na frase de 'description' e preencha o array 'answers' com as respostas em ordem. As respostas das lacunas DEVEM SER ESTRITAMENTE TEXTO PURO (sem negrito **, sem itálico *, sem código \` e sem fórmulas LaTeX). Se 'answers' já estiver preenchido, mantenha-o intacto.
Para 'anki', mantenha o type 'anki' intacto, preservando exatamente 'description' (frente/pergunta) e 'answer' (verso/resposta detalhada, que suporta Markdown e LaTeX livremente).
Para 'open', mantenha o type 'open' intacto com 'description' (que pode usar Markdown e LaTeX livremente) e 'answer' (estritamente texto puro, sem Markdown e sem fórmulas).
Mantenha quaisquer itens com type 'divisor', 'anki', 'fill' e 'open' intactos e em suas respectivas posições entre os cartões.
Ao terminar, chame 'adicionar_varios_cards' para enviar o baralho finalizado.

JSON:
${JSON.stringify(localCards, null, 2)}`;

        const token = await getCurrentUserToken().catch(() => null);
        const isTrial = !isUserPro() && !hasUsedFreeAiDeck();
        const localExtra = Number(localStorage.getItem('spaiq_extra_generations') || 0);

        if (isTrial) {
            window.currentDeckIsFreeAiTrial = true;
        } else if (!isUserPro() && hasUsedFreeAiDeck() && localExtra <= 0) {
            openExtraDeckModal();
            return;
        }

        const reqHeaders = { 'Content-Type': 'application/json' };
        if (token) {
            reqHeaders['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${BACKEND_URL}/api/ai/generate`, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify({
                model: "gemini-flash-latest",
                contents: [{ role: 'user', parts: [{ text: fillPrompt }] }],
                tools: deckTools,
                systemInstruction: { parts: [{ text: systemInstruction + "\nPreencha os placeholders '[GEMINI]' no JSON de flashcards e retorne-os usando a ferramenta 'adicionar_varios_cards'. Preserve cards com type 'anki' (frente e verso), 'fill' (lacunas), 'open' e 'divisor' exatamente como foram fornecidos. REGRA MANDATÓRIA: As perguntas ('description') de todos os cartões podem e devem usar Markdown e LaTeX livremente. Apenas respostas digitadas na gameplay ('open', 'open_double', 'fill') NUNCA devem usar Markdown nem fórmulas matemáticas." }] },
                generationConfig: { temperature: 0.7, responseMimeType: "text/plain" },
                stream: false,
                isNewDeck: true
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (errData.error === 'quota_exceeded') {
                const promptMsg = isUserPro() ? t('alert_pro_monthly_limit') : t('alert_non_pro_limit');
                if (confirm(promptMsg)) {
                    if (typeof window.flashcardsOpenExtraDeckModal === 'function') {
                        window.flashcardsOpenExtraDeckModal();
                    }
                }
            }
            throw new Error(errData.message || `Erro no servidor (${res.status})`);
        }

        const fillData = await res.json();
        deckCards = [];
        renderCardsList(true);

        const candidate = fillData.candidates?.[0];
        const calls = candidate?.content?.parts?.filter(p => !!p.functionCall) || [];
        for (const call of calls) {
            if (call.functionCall.name === 'adicionar_varios_cards') {
                const args = call.functionCall.args;
                executeAddMultipleCards(args.cards || args);
            }
        }
        geminiChatSession = { _history: [] };
        if (window.currentDeckIsFreeAiTrial) {
            markFreeAiDeckUsed();
            deckCards.forEach(c => { if (c && typeof c === 'object') c.isFreeAiTrial = true; });
            localStorage.setItem('editing_deck_is_free_trial', 'true');
        } else if (!isUserPro() && hasUsedFreeAiDeck()) {
            const updatedExtra = Number(localStorage.getItem('spaiq_extra_generations') || 0);
            if (updatedExtra > 0) {
                localStorage.setItem('spaiq_extra_generations', String(Math.max(0, updatedExtra - 1)));
            }
        }
        refreshUserProStatus().then(() => updateProPaywalledUI());
        finishGeneratingAnimation(true, deckCards.length);
        removeAiChatGeneratingBubble();
        addChatMessage('model', t('doc_enhanced_chat_msg', { count: deckCards.length }));

    } catch (err) {
        console.error("Erro na aprimoração 2.2:", err);
        finishGeneratingAnimation(false, 0);
        removeAiChatGeneratingBubble();
        addChatMessage('error', t('enhance_error_chat_msg', { error: err.message }));
        showGeminiDownModal(err.message, 'txt', localCards);
    } finally {
        submitModal22Btn.disabled = false;
        modal22Spinner.classList.add('hidden');
        modal22LoadingMsg.classList.add('hidden');
    }
}

submitModal22Btn.addEventListener('click', async () => {
    modal22Error.textContent = '';
    if (!modal22File.files || modal22File.files.length === 0) {
        modal22Error.textContent = t('select_txt_word_error');
        return;
    }

    const file = modal22File.files[0];

    if (!canGenerateWithAi()) {
        await savePendingGeneration({
            mode: '2.2',
            files: [file]
        });
        openExtraDeckModal();
        return;
    }

    await executeAiEnhanceFromDoc(file);
});

// Hook for Stripe Checkout: persists draft before redirect
if (typeof window !== 'undefined') {
    window.__saveCurrentGenerationDraft = async () => {
        try {
            // Mode 2.1
            if (modal21Files && modal21Files.files && modal21Files.files.length > 0) {
                await savePendingGeneration({
                    mode: '2.1',
                    files: Array.from(modal21Files.files),
                    prompt: modal21Prompt ? modal21Prompt.value.trim() : '',
                    language: modal21SelectedLanguage || 'Inglês',
                    customLanguage: modal21CustomLangInput ? modal21CustomLangInput.value.trim() : ''
                });
                return;
            }
            // Mode 2.2
            if (modal22File && modal22File.files && modal22File.files.length > 0) {
                await savePendingGeneration({
                    mode: '2.2',
                    files: Array.from(modal22File.files)
                });
                return;
            }
        } catch (e) {
            console.warn('[DraftSave] Erro ao salvar rascunho de geração:', e);
        }
    };
}

// Automated post-payment generation & modal opening handler
let postPaymentHandled = false;
async function handlePostPaymentGeneration() {
    if (postPaymentHandled) return;
    postPaymentHandled = true;

    try {
        const pending = await getPendingGeneration();
        if (pending && pending.files && pending.files.length > 0) {
            await clearPendingGeneration();
            if (pending.mode === '2.2') {
                await executeAiEnhanceFromDoc(pending.files[0]);
            } else {
                await executeAiGenerationFromMaterials(
                    pending.files,
                    pending.prompt,
                    pending.language,
                    pending.customLanguage
                );
            }
            return;
        }

        // If no draft files were provided beforehand, automatically open the generation modal
        if (modal21) {
            modal21Error.textContent = '';
            modal21Files.value = '';
            modal21FilesCount.textContent = t('no_file_selected');
            if (modal21IconsContainer) modal21IconsContainer.innerHTML = FILES_DEFAULT_SVG;
            updateProPaywalledUI();
            modal21.classList.remove('hidden');
        }
    } catch (err) {
        console.error('[PostPayment] Erro ao retomar geração pós-pagamento:', err);
    }
}

// Listen for extra deck payment confirmation event
window.addEventListener('flashcards:extra-deck-paid', () => {
    handlePostPaymentGeneration();
});

// Check if payment was confirmed before this module finished loading
if (typeof window !== 'undefined' && window.__extraDeckJustPaid) {
    handlePostPaymentGeneration();
}

openProBtn?.addEventListener('click', openProModal);

// Gemini Down Modal Listeners
function showGeminiDownModal(errorMsg, sourceType, localCards = null) {
    lastFailedSourceType = sourceType;
    lastFailedLocalCards = localCards;
    if (geminiDownModal) geminiDownModal.classList.remove('hidden');
}
function closeGeminiDownModal() {
    if (geminiDownModal) geminiDownModal.classList.add('hidden');
}
closeGeminiDownModalBtn.addEventListener('click', closeGeminiDownModal);
if (useTraditionalTxtBtn) {
    useTraditionalTxtBtn.addEventListener('click', () => {
        closeGeminiDownModal();
        if (lastFailedLocalCards) {
            deckCards = lastFailedLocalCards.map(c => {
                const copy = { ...c };
                if (copy.type === 'multiple_choice' && Array.isArray(copy.options)) {
                    copy.options = copy.options.map((o, i) => o === '[GEMINI]' ? `Opção ${i + 1}` : o);
                }
                if (copy.type === 'fill' && Array.isArray(copy.answers)) {
                    copy.answers = copy.answers.filter(a => a !== '[GEMINI]');
                    if (copy.answer === '[GEMINI]') copy.answer = copy.answers.join('; ');
                }
                return copy;
            });
            openEditorView('creator');
            renderCardsList(true);
        }
    });
}
if (retryGeminiBtn) {
    retryGeminiBtn.addEventListener('click', () => {
        closeGeminiDownModal();
        if (lastFailedSourceType === 'files') {
            updateModal21LanguageUI();
            modal21.classList.remove('hidden');
        } else if (lastFailedSourceType === 'txt') {
            modal22.classList.remove('hidden');
        }
    });
}

// Close modals on backdrop click
[modal12, modal21, modal22, geminiDownModal, inlineEditModal].forEach(modal => {
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal === inlineEditModal) {
                    closeInlineEditModal();
                } else {
                    modal.classList.add('hidden');
                }
            }
        });
    }
});

// Close open modals on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modals = [modal12, modal21, modal22, geminiDownModal, inlineEditModal];
        const openModal = modals.find(m => m && !m.classList.contains('hidden'));
        if (openModal) {
            if (openModal === inlineEditModal) {
                closeInlineEditModal();
            } else {
                openModal.classList.add('hidden');
            }
        }
    }
});

// --- CARD CREATOR UI LOGIC (LEFT SIDEBAR) ---
function getTypeHint(type) {
    const key = `type_hint_${type}`;
    return t(key) || '';
}

// --- M3 CUSTOM CARD TYPE SELECT CONTROLLER ---
function selectCardType(type, triggerChange = true) {
    if (type === 'voice' && !isUserPro()) {
        openProModal();
        return;
    }
    const input = document.getElementById('creator-card-type');
    if (!input) return;
    input.value = type;

    const items = document.querySelectorAll('.m3-select-item');
    let matchedItem = null;
    items.forEach(item => {
        const isMatch = item.dataset.value === type;
        if (isMatch) matchedItem = item;
        item.classList.toggle('m3-select-item-selected', isMatch);
        item.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    if (matchedItem) {
        const labelEl = document.getElementById('creator-type-selected-label');
        const iconEl = document.getElementById('creator-type-selected-icon');
        if (labelEl) labelEl.textContent = matchedItem.dataset.label;
        if (iconEl) {
            iconEl.src = sanitizeImageUrl(matchedItem.dataset.icon || '');
            iconEl.alt = matchedItem.dataset.label;
        }
    }

    if (triggerChange) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function toggleCardTypeDropdown(open) {
    const dropdown = document.getElementById('creator-card-type-dropdown');
    const btn = document.getElementById('creator-card-type-btn');
    if (!dropdown || !btn) return;

    const isOpen = open !== undefined ? open : dropdown.classList.contains('hidden');
    if (isOpen) {
        dropdown.classList.remove('hidden', 'm3-dropdown-close');
        dropdown.classList.add('m3-dropdown-open');
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('active');
    } else {
        dropdown.classList.remove('m3-dropdown-open');
        dropdown.classList.add('m3-dropdown-close');
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('active');
        setTimeout(() => {
            if (btn.getAttribute('aria-expanded') === 'false') {
                dropdown.classList.add('hidden');
                dropdown.classList.remove('m3-dropdown-close');
            }
        }, 150);
    }
}

function initCardTypeSelect() {
    const btn = document.getElementById('creator-card-type-btn');
    const wrapper = document.getElementById('creator-card-type-wrapper');
    const items = document.querySelectorAll('.m3-select-item');

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dropdown = document.getElementById('creator-card-type-dropdown');
            const isCurrentlyOpen = dropdown && !dropdown.classList.contains('hidden') && !dropdown.classList.contains('m3-dropdown-close');
            toggleCardTypeDropdown(!isCurrentlyOpen);
        });

        btn.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleCardTypeDropdown(true);
                const selected = document.querySelector('.m3-select-item-selected');
                if (selected) selected.focus();
            }
        });
    }

    items.forEach((item, index) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const val = item.dataset.value;
            selectCardType(val);
            toggleCardTypeDropdown(false);
            btn?.focus();
        });

        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const val = item.dataset.value;
                selectCardType(val);
                toggleCardTypeDropdown(false);
                btn?.focus();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = items[index + 1] || items[0];
                next?.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = items[index - 1] || items[items.length - 1];
                prev?.focus();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                toggleCardTypeDropdown(false);
                btn?.focus();
            }
        });
    });

    document.addEventListener('click', (e) => {
        if (wrapper && !wrapper.contains(e.target)) {
            toggleCardTypeDropdown(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toggleCardTypeDropdown(false);
        }
    });
}

// Initialize custom select controller
initCardTypeSelect();

creatorCardType.addEventListener('change', () => {
    const tVal = creatorCardType.value;
    creatorTypeHint.textContent = getTypeHint(tVal);

    // Adjust visibility
    creatorGroupOpen.classList.toggle('hidden', tVal !== 'open');
    creatorGroupOpenDouble.classList.toggle('hidden', tVal !== 'open_double');
    if (creatorGroupFill) creatorGroupFill.classList.toggle('hidden', tVal !== 'fill');
    creatorGroupAnki.classList.toggle('hidden', tVal !== 'anki');
    creatorGroupMc.classList.toggle('hidden', tVal !== 'multiple_choice');
    if (creatorGroupImageArrows) creatorGroupImageArrows.classList.toggle('hidden', tVal !== 'image_arrows');
    if (creatorGroupVoice) {
        creatorGroupVoice.classList.toggle('hidden', tVal !== 'voice');
        if (tVal === 'voice') updateVoiceLimitBadge();
    }

    const qImgContainer = creatorQImgUrl?.parentElement?.parentElement;
    if (qImgContainer) {
        qImgContainer.classList.toggle('hidden', tVal === 'divisor');
    }

    if (tVal === 'divisor') {
        creatorQuestionLabel.textContent = t('comment_text_label');
        creatorQuestion.placeholder = t('comment_text_ph');
    } else if (tVal === 'fill') {
        creatorQuestionLabel.textContent = t('fill_sentence_label');
        creatorQuestion.placeholder = t('fill_blank_example_ph');
    } else if (tVal === 'anki') {
        creatorQuestionLabel.textContent = t('short_question_concept_label');
        creatorQuestion.placeholder = t('question_placeholder');
    } else if (tVal === 'image_arrows') {
        creatorQuestionLabel.textContent = t('question_concept_label');
        creatorQuestion.placeholder = t('name_the_structures');
    } else if (tVal === 'voice') {
        creatorQuestionLabel.textContent = t('question_concept_label');
        creatorQuestion.placeholder = 'Ex: Explique o conceito de...';
    } else {
        creatorQuestionLabel.textContent = t('question_desc_label');
        creatorQuestion.placeholder = t('question_placeholder');
    }

    if (tVal === 'multiple_choice' && creatorMcOptionsList.children.length === 0) {
        renderCreatorMcOptions(["", "", "", ""], 0);
    }
    if (tVal === 'image_arrows') {
        renderCreatorArrowsInputs(pendingCreatorQImageArrows);
        updateCreatorQImagePreview();
    }
});

// Creator Image Arrows Handlers
function renderCreatorArrowsInputs(arrows = []) {
    if (!creatorArrowsInputsList) return;
    creatorArrowsInputsList.innerHTML = '';
    const count = Array.isArray(arrows) ? arrows.length : 0;
    if (creatorArrowsCountBadge) creatorArrowsCountBadge.textContent = String(count);

    if (count === 0) {
        if (creatorArrowsEmptyMsg) creatorArrowsEmptyMsg.classList.remove('hidden');
        return;
    }
    if (creatorArrowsEmptyMsg) creatorArrowsEmptyMsg.classList.add('hidden');

    arrows.forEach((arrow, i) => {
        const theme = getArrowColorTheme(arrow.color);
        const row = document.createElement('div');
        row.className = "flex items-center gap-2 p-2 rounded-xl transition border shadow-2xs";
        row.style.backgroundColor = theme.bg;
        row.style.borderColor = theme.border;
        row.id = `creator-arrow-row-${i}`;

        // Number Badge at arrow start
        const badge = document.createElement('div');
        badge.className = "w-6 h-6 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 shadow-xs select-none";
        badge.style.backgroundColor = theme.badgeBg;
        badge.style.color = theme.badgeText;
        badge.textContent = String(i + 1);

        // Text input for structure name
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `creator-arrow-input-${i}`;
        input.className = 'creator-arrow-val flex-1 px-3 py-1.5 bg-white/95 border rounded-lg text-sm font-medium outline-none transition focus:ring-2';
        input.style.borderColor = theme.border;
        input.style.color = '#1e293b';
        input.placeholder = t('structure_placeholder', { num: i + 1 }) || `Nome da estrutura ${i + 1}...`;
        input.value = arrow.label || '';
        input.dataset.arrowIdx = String(i);

        input.addEventListener('input', (e) => {
            arrow.label = e.target.value;
        });

        row.appendChild(badge);
        row.appendChild(input);
        creatorArrowsInputsList.appendChild(row);
    });
}

function focusCreatorArrowInput(idx) {
    const input = document.getElementById(`creator-arrow-input-${idx}`);
    if (input) {
        input.focus();
        input.select();
        const row = document.getElementById(`creator-arrow-row-${idx}`);
        if (row) {
            row.classList.add('ring-2', 'ring-blue-400');
            setTimeout(() => row.classList.remove('ring-2', 'ring-blue-400'), 1200);
        }
    }
}

// Creator MCQ Options (between 2 and 6 options)
function renderCreatorMcOptions(options = ["", "", "", ""], selectedIdx = 0) {
    creatorMcOptionsList.innerHTML = '';
    options.forEach((optText, i) => {
        const row = document.createElement('div');
        row.className = "flex items-center gap-2";

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'creator-mc-correct';
        radio.value = String(i);
        if (i === selectedIdx) radio.checked = true;
        radio.className = 'w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer';
        radio.title = t('mark_as_correct_option');

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'creator-mc-opt-val flex-1 p-2 bg-gray-50 border border-gray-300 rounded-lg text-sm';
        textInput.placeholder = t('option_numbered_ph', { num: i + 1 });
        textInput.value = optText || '';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'creator-mc-remove-opt-btn p-1 text-gray-400 hover:text-red-500 transition';
        removeBtn.title = t('remove_option_tooltip');
        removeBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';

        removeBtn.addEventListener('click', () => {
            const currentVals = Array.from(document.querySelectorAll('.creator-mc-opt-val')).map(inp => inp.value);
            if (currentVals.length <= 2) {
                alert(t('alert_mc_min_options'));
                return;
            }
            currentVals.splice(i, 1);
            let nextSelected = 0;
            const checkedRadio = document.querySelector('input[name="creator-mc-correct"]:checked');
            if (checkedRadio) {
                const oldCheckedIdx = parseInt(checkedRadio.value, 10);
                if (oldCheckedIdx === i) nextSelected = 0;
                else if (oldCheckedIdx > i) nextSelected = oldCheckedIdx - 1;
                else nextSelected = oldCheckedIdx;
            }
            renderCreatorMcOptions(currentVals, nextSelected);
        });

        row.append(radio, textInput, removeBtn);
        creatorMcOptionsList.appendChild(row);
    });

    creatorAddMcOptBtn.classList.toggle('hidden', options.length >= 6);
}

creatorAddMcOptBtn.addEventListener('click', () => {
    const currentVals = Array.from(document.querySelectorAll('.creator-mc-opt-val')).map(inp => inp.value);
    if (currentVals.length >= 6) return;
    const checkedRadio = document.querySelector('input[name="creator-mc-correct"]:checked');
    const checkedIdx = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;
    currentVals.push("");
    renderCreatorMcOptions(currentVals, checkedIdx);
});

// Creator Image Handling
function updateCreatorQImagePreview() {
    const isImageArrows = creatorCardType && creatorCardType.value === 'image_arrows';
    if (pendingCreatorQImage) {
        renderAnnotatedImage({
            container: creatorQImgPreviewContainer,
            imgElem: creatorQImgPreview,
            imageUrl: pendingCreatorQImage,
            crop: pendingCreatorQImageCrop,
            arrows: pendingCreatorQImageArrows,
            showNumbers: isImageArrows,
            isImageArrows,
            onArrowClick: isImageArrows ? (idx) => focusCreatorArrowInput(idx) : null,
            maxHClass: 'max-h-28'
        });
        creatorQImgPreviewContainer.classList.remove('hidden');
        creatorRemoveQImg.classList.remove('hidden');
        if (creatorEditQImg) creatorEditQImg.classList.remove('hidden');
    } else {
        creatorQImgPreview.src = '';
        creatorQImgPreviewContainer.classList.add('hidden');
        creatorRemoveQImg.classList.add('hidden');
        if (creatorEditQImg) creatorEditQImg.classList.add('hidden');
        const oldWrap = creatorQImgPreviewContainer.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
        const oldNotFound = creatorQImgPreviewContainer.querySelector('.image-not-found-placeholder');
        if (oldNotFound) oldNotFound.remove();
    }
    if (isImageArrows) {
        renderCreatorArrowsInputs(pendingCreatorQImageArrows);
    }
}

function updateCreatorAnsImagePreview() {
    if (pendingCreatorAnsImage) {
        renderAnnotatedImage({
            container: creatorAnsImgPreviewContainer,
            imgElem: creatorAnsImgPreview,
            imageUrl: pendingCreatorAnsImage,
            crop: pendingCreatorAnsImageCrop,
            arrows: pendingCreatorAnsImageArrows,
            maxHClass: 'max-h-28'
        });
        creatorAnsImgPreviewContainer.classList.remove('hidden');
        creatorRemoveAnsImg.classList.remove('hidden');
        if (creatorEditAnsImg) creatorEditAnsImg.classList.remove('hidden');
    } else {
        creatorAnsImgPreview.src = '';
        creatorAnsImgPreviewContainer.classList.add('hidden');
        creatorRemoveAnsImg.classList.add('hidden');
        if (creatorEditAnsImg) creatorEditAnsImg.classList.add('hidden');
        const oldWrap = creatorAnsImgPreviewContainer.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
    }
}

creatorQImgUrl.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const cleanUrl = sanitizeImageUrl(url);
    if (cleanUrl !== pendingCreatorQImage) {
        pendingCreatorQImageCrop = null;
        pendingCreatorQImageArrows = [];
    }
    pendingCreatorQImage = cleanUrl;
    updateCreatorQImagePreview();
});

creatorRemoveQImg.addEventListener('click', () => {
    pendingCreatorQImage = '';
    pendingCreatorQImageCrop = null;
    pendingCreatorQImageArrows = [];
    creatorQImgUrl.value = '';
    updateCreatorQImagePreview();
});

if (creatorEditQImg) {
    creatorEditQImg.addEventListener('click', () => {
        if (!pendingCreatorQImage) return;
        const isImageArrows = creatorCardType && creatorCardType.value === 'image_arrows';
        openImageEditorModal({
            imageUrl: pendingCreatorQImage,
            crop: pendingCreatorQImageCrop,
            arrows: pendingCreatorQImageArrows,
            defaultTool: isImageArrows ? 'arrow' : 'crop',
            onSave: ({ crop, arrows }) => {
                pendingCreatorQImageCrop = crop;
                // Preserve existing structure labels for arrows
                pendingCreatorQImageArrows = arrows.map((a, idx) => ({
                    ...a,
                    label: a.label || pendingCreatorQImageArrows[idx]?.label || ''
                }));
                updateCreatorQImagePreview();
                if (isImageArrows) {
                    renderCreatorArrowsInputs(pendingCreatorQImageArrows);
                }
            }
        });
    });
}

creatorAnsImgUrl.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const cleanUrl = sanitizeImageUrl(url);
    if (cleanUrl !== pendingCreatorAnsImage) {
        pendingCreatorAnsImageCrop = null;
        pendingCreatorAnsImageArrows = [];
    }
    pendingCreatorAnsImage = cleanUrl;
    updateCreatorAnsImagePreview();
});

creatorRemoveAnsImg.addEventListener('click', () => {
    pendingCreatorAnsImage = '';
    pendingCreatorAnsImageCrop = null;
    pendingCreatorAnsImageArrows = [];
    creatorAnsImgUrl.value = '';
    updateCreatorAnsImagePreview();
});

if (creatorEditAnsImg) {
    creatorEditAnsImg.addEventListener('click', () => {
        if (!pendingCreatorAnsImage) return;
        openImageEditorModal({
            imageUrl: pendingCreatorAnsImage,
            crop: pendingCreatorAnsImageCrop,
            arrows: pendingCreatorAnsImageArrows,
            onSave: ({ crop, arrows }) => {
                pendingCreatorAnsImageCrop = crop;
                pendingCreatorAnsImageArrows = arrows;
                updateCreatorAnsImagePreview();
            }
        });
    });
}

// Submit New Card
creatorSubmitCardBtn.addEventListener('click', () => {
    creatorFeedback.classList.add('hidden');
    const type = creatorCardType.value;
    const desc = creatorQuestion.value.trim();

    if (type === 'divisor') {
        if (!desc) {
            alert(t('alert_comment_empty'));
            creatorQuestion.focus();
            return;
        }
        appendNewCardWithElasticCollision({
            type: 'divisor',
            text: desc,
            description: desc,
            answer: ''
        });
        creatorQuestion.value = '';
        return;
    }

    if (!desc && !pendingCreatorQImage) {
        alert(t('alert_question_empty'));
        creatorQuestion.focus();
        return;
    }

    const newCard = {
        type,
        description: desc
    };

    if (pendingCreatorQImage) {
        newCard.image = pendingCreatorQImage;
        if (pendingCreatorQImageCrop) newCard.imageCrop = pendingCreatorQImageCrop;
        if (pendingCreatorQImageArrows && pendingCreatorQImageArrows.length > 0) newCard.imageArrows = pendingCreatorQImageArrows;
    }

    if (type === 'open') {
        const ans = creatorAnsOpen.value.trim();
        if (!ans) {
            alert(t('alert_main_ans_empty'));
            creatorAnsOpen.focus();
            return;
        }
        newCard.answer = ans;
    } else if (type === 'open_double') {
        const a1 = creatorAnsDouble1.value.trim();
        const a2 = creatorAnsDouble2.value.trim();
        if (!a1 || !a2) {
            alert(t('alert_both_ans_empty'));
            return;
        }
        newCard.answer = a1;
        newCard.answer2 = a2;
        newCard.placeholder1 = t('answer_1_label');
        newCard.placeholder2 = t('answer_2_label');
    } else if (type === 'anki') {
        const ans = creatorAnsAnki.value.trim();
        if (!ans && !pendingCreatorAnsImage) {
            alert(t('alert_anki_ans_empty'));
            creatorAnsAnki.focus();
            return;
        }
        newCard.answer = ans;
        if (pendingCreatorAnsImage) {
            newCard.answerImage = pendingCreatorAnsImage;
            if (pendingCreatorAnsImageCrop) newCard.answerImageCrop = pendingCreatorAnsImageCrop;
            if (pendingCreatorAnsImageArrows && pendingCreatorAnsImageArrows.length > 0) newCard.answerImageArrows = pendingCreatorAnsImageArrows;
        }
    } else if (type === 'multiple_choice') {
        const optInputs = Array.from(document.querySelectorAll('.creator-mc-opt-val'));
        const options = optInputs.map(inp => inp.value.trim()).filter(Boolean);
        if (options.length < 2 || options.length > 6) {
            alert(t('alert_mc_valid_range'));
            return;
        }
        const checkedRadio = document.querySelector('input[name="creator-mc-correct"]:checked');
        const correctIdx = checkedRadio ? parseInt(checkedRadio.value) : 0;
        const correctText = optInputs[correctIdx]?.value.trim();
        if (!correctText) {
            alert(t('alert_mc_correct_empty'));
            return;
        }
        newCard.answer = correctText;
        newCard.options = options;
    } else if (type === 'image_arrows') {
        if (!pendingCreatorQImage) {
            alert(t('alert_image_arrows_need_image'));
            creatorQImgUrl.focus();
            return;
        }
        if (!pendingCreatorQImageArrows || pendingCreatorQImageArrows.length === 0) {
            alert(t('alert_image_arrows_need_arrows'));
            if (creatorEditQImg) creatorEditQImg.click();
            return;
        }
        const arrowInputs = Array.from(document.querySelectorAll('.creator-arrow-val'));
        arrowInputs.forEach((inp, idx) => {
            if (pendingCreatorQImageArrows[idx]) {
                pendingCreatorQImageArrows[idx].label = inp.value.trim();
            }
        });
        const hasAtLeastOneLabel = pendingCreatorQImageArrows.some(a => (a.label || '').trim());
        if (!hasAtLeastOneLabel) {
            alert(t('alert_image_arrows_need_labels'));
            arrowInputs[0]?.focus();
            return;
        }
        newCard.description = desc || t('name_the_structures');
        newCard.imageArrows = JSON.parse(JSON.stringify(pendingCreatorQImageArrows));
        newCard.answer = pendingCreatorQImageArrows.map(a => a.label || '').filter(Boolean).join('; ');
    } else if (type === 'fill') {
        const braceRegex = /\{([^{}]+)\}/g;
        const braceAnswers = [];
        let bMatch;
        while ((bMatch = braceRegex.exec(desc)) !== null) {
            const trimmed = bMatch[1].trim();
            if (trimmed.length > 0) braceAnswers.push(trimmed);
        }

        if (braceAnswers.length > 0) {
            newCard.description = desc.replace(/\{([^{}]+)\}/g, (fullMatch, inner) => {
                return inner.trim().length > 0 ? '_' : fullMatch;
            });
            newCard.answers = braceAnswers;
            newCard.answer = braceAnswers.join('; ');
        } else {
            const blankRegex = /(?:\[\s*_{1,}\s*\]|(?<![a-zA-Z0-9\u00C0-\u017F])_{1,}(?![a-zA-Z0-9\u00C0-\u017F]))/g;
            const blanksCount = (desc.match(blankRegex) || []).length;
            if (blanksCount === 0) {
                alert(t('alert_fill_missing_blank'));
                creatorQuestion.focus();
                return;
            }
            const ansRaw = creatorAnsFill ? creatorAnsFill.value.trim() : '';
            const answers = ansRaw.split(';').map(a => a.trim()).filter(Boolean);
            if (answers.length === 0) {
                alert(t('alert_fill_missing_answers'));
                if (creatorAnsFill) creatorAnsFill.focus();
                return;
            }
            newCard.answers = answers;
            newCard.answer = answers.join('; ');
        }
    } else if (type === 'voice') {
        if (!isUserPro()) {
            openProModal();
            return;
        }
        const currentVoiceCards = deckCards.filter(c => c && c.type === 'voice').length;
        if (currentVoiceCards >= 5) {
            alert(t('alert_voice_limit_reached') || 'Limite de 5 cards de "Explicar em voz alta" por baralho atingido para economizar gastos de IA.');
            return;
        }
        const ans = creatorAnsVoice ? creatorAnsVoice.value.trim() : '';
        if (!ans) {
            alert(t('alert_voice_desc_empty') || 'Preencha a explicação de referência para o Gemini avaliar.');
            creatorAnsVoice?.focus();
            return;
        }
        newCard.answer = ans;
    }

    appendNewCardWithElasticCollision(newCard);

    // Reset Form Fields
    creatorQuestion.value = '';
    creatorAnsOpen.value = '';
    creatorAnsDouble1.value = '';
    creatorAnsDouble2.value = '';
    creatorAnsAnki.value = '';
    if (creatorAnsVoice) creatorAnsVoice.value = '';
    if (creatorAnsFill) creatorAnsFill.value = '';
    creatorRemoveQImg.click();
    creatorRemoveAnsImg.click();

    if (type === 'image_arrows') {
        renderCreatorArrowsInputs([]);
    } else if (type === 'multiple_choice') {
        renderCreatorMcOptions(["", "", "", ""], 0);
    }

    creatorFeedback.textContent = t('card_added_success');
    creatorFeedback.classList.remove('hidden');
    setTimeout(() => creatorFeedback.classList.add('hidden'), 2000);
});

// Initialize default creator MCQ options
renderCreatorMcOptions(["", "", "", ""], 0);

// --- AI FLASHCARD GENERATION ANIMATION & PROGRESS ---
let isGeneratingCards = false;
function getGenerationStatusPhrases() {
    return [
        t('gen_phrase_1'),
        t('gen_phrase_2'),
        t('gen_phrase_3'),
        t('gen_phrase_4'),
        t('gen_phrase_5')
    ];
}
let generationStatusInterval = null;

function showGeneratingAnimation(initialMessage = null) {
    isGeneratingCards = true;
    const bannerContainer = document.getElementById('generation-banner-container');
    const statusText = document.getElementById('generation-status-text');
    const counterNum = document.getElementById('generation-counter-num');
    const badgeStatus = document.getElementById('generation-badge-status');
    const titleText = document.getElementById('generation-title-text');
    const progressBar = document.getElementById('generation-progress-bar-container');

    if (bannerContainer) {
        bannerContainer.classList.remove('hidden', 'opacity-0', 'scale-95');
    }
    if (statusText) statusText.textContent = initialMessage || t('gen_phrase_1');
    if (counterNum) counterNum.textContent = '0';
    if (badgeStatus) {
        badgeStatus.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-b from-purple-50 to-purple-100 text-purple-700 border border-purple-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]";
        badgeStatus.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></span> ${t('live_badge')}`;
    }
    if (titleText) titleText.textContent = t('gemini_generating_deck_title');
    if (progressBar) progressBar.classList.remove('hidden');

    deckSizeBadge.classList.add('badge-generating-pulse');

    // Cycle status phrases periodically while waiting for cards
    let phraseIdx = 0;
    if (generationStatusInterval) clearInterval(generationStatusInterval);
    generationStatusInterval = setInterval(() => {
        if (!isGeneratingCards) {
            clearInterval(generationStatusInterval);
            return;
        }
        if (deckCards.length === 0 && statusText) {
            const phrases = getGenerationStatusPhrases();
            phraseIdx = (phraseIdx + 1) % phrases.length;
            statusText.textContent = phrases[phraseIdx];
        }
    }, 3200);

    renderCardsList(true);
}

function updateGeneratingProgress(count) {
    const counterNum = document.getElementById('generation-counter-num');
    const statusText = document.getElementById('generation-status-text');
    if (counterNum) counterNum.textContent = count;
    if (statusText) {
        if (count < 10) {
            statusText.textContent = t('identifying_key_concepts_status', { count });
        } else if (count < 25) {
            statusText.textContent = t('gemini_deepening_status', { count });
        } else if (count < 50) {
            statusText.textContent = t('building_questions_options_status', { count });
        } else {
            statusText.textContent = t('gemini_finalizing_status', { count });
        }
    }
}

function finishGeneratingAnimation(success = true, count = 0) {
    isGeneratingCards = false;
    if (generationStatusInterval) {
        clearInterval(generationStatusInterval);
        generationStatusInterval = null;
    }
    deckSizeBadge.classList.remove('badge-generating-pulse');

    if (success && count > 0) {
        syncCurrentDeckToSlotAndCloud();
    }

    const bannerContainer = document.getElementById('generation-banner-container');
    const titleText = document.getElementById('generation-title-text');
    const statusText = document.getElementById('generation-status-text');
    const badgeStatus = document.getElementById('generation-badge-status');
    const counterBadge = document.getElementById('generation-counter-badge');
    const progressBar = document.getElementById('generation-progress-bar-container');

    if (progressBar) progressBar.classList.add('hidden');

    if (success && count > 0) {
        if (titleText) titleText.textContent = t('flashcards_generated_success');
        if (statusText) statusText.textContent = t('cards_ready_status', { count });
        if (badgeStatus) {
            badgeStatus.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-b from-green-50 to-green-100/90 text-green-700 border border-green-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]";
            badgeStatus.innerHTML = `✓ ${t('done')}`;
        }
        if (counterBadge) {
            counterBadge.className = "text-xs font-semibold text-green-700 bg-gradient-to-b from-green-50 to-green-100/80 px-3 py-1 rounded-full border border-green-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]";
            counterBadge.textContent = `${count} ${count === 1 ? t('card_unit_singular') : t('cards_unit')}`;
        }

        setTimeout(() => {
            if (bannerContainer && !isGeneratingCards) {
                bannerContainer.classList.add('opacity-0', 'scale-95');
                setTimeout(() => {
                    bannerContainer.classList.add('hidden');
                    bannerContainer.classList.remove('opacity-0', 'scale-95');
                }, 400);
            }
        }, 4000);
    } else {
        if (titleText) titleText.textContent = t('generation_incomplete_title');
        if (statusText) statusText.textContent = t('generation_failed_desc');
        if (badgeStatus) {
            badgeStatus.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-b from-red-50 to-red-100/90 text-red-700 border border-red-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]";
            badgeStatus.innerHTML = `<span class="material-symbols-rounded text-xs align-middle">warning</span> ${t('attention_tag')}`;
        }
    }
}

// --- DYNAMIC BORDER RADIUS FOR CARDS LIST (M3 CONNECTED DECK) ---
// Configures first, mid, last, or single shapes based on contiguous card groups
function updateCardsBorderRadius() {
    if (!cardsList) return;
    const children = Array.from(cardsList.children);
    let currentGroup = [];

    function applyGroupRadii(group) {
        if (group.length === 0) return;
        if (group.length === 1) {
            group[0].classList.remove('m3-card-shape-first', 'm3-card-shape-mid', 'm3-card-shape-last');
            group[0].classList.add('m3-card-shape-single');
        } else {
            group.forEach((cardEl, idx) => {
                cardEl.classList.remove('m3-card-shape-single', 'm3-card-shape-first', 'm3-card-shape-mid', 'm3-card-shape-last');
                if (idx === 0) {
                    cardEl.classList.add('m3-card-shape-first');
                } else if (idx === group.length - 1) {
                    cardEl.classList.add('m3-card-shape-last');
                } else {
                    cardEl.classList.add('m3-card-shape-mid');
                }
            });
        }
    }

    children.forEach(child => {
        if (child.classList && child.classList.contains('flashcard-item')) {
            currentGroup.push(child);
        } else if (child.classList && child.classList.contains('deck-divisor-item')) {
            applyGroupRadii(currentGroup);
            currentGroup = [];
        }
    });
    applyGroupRadii(currentGroup);
}

function updateVoiceLimitBadge() {
    const badge = document.getElementById('voice-deck-limit-badge');
    if (!badge) return;
    const voiceCount = deckCards.filter(c => c && c.type === 'voice').length;
    const label = t('voice_limit_badge') || 'Máx. 5 por baralho';
    badge.textContent = `${label} (${voiceCount}/5)`;
    if (voiceCount >= 5) {
        badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300';
    } else {
        badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200';
    }
}

// --- APPEND NEW CARD WITH PHYSICAL ELASTIC COLLISION & AUTO-SCROLL ---
// Card enters from below, strikes previous card with elastic shock and damping, view scrolls down
function appendNewCardWithElasticCollision(cardItem) {
    deckCards.push(cardItem);
    const playableCount = deckCards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note').length;
    deckSizeBadge.textContent = playableCount;
    updateVoiceLimitBadge();

    // Clean up skeleton or empty state if present
    const skeleton = document.getElementById('cards-skeleton-loader');
    if (skeleton) skeleton.remove();
    const emptyState = cardsList.querySelector('.text-center');
    if (emptyState) emptyState.remove();

    // Identify previous last card element before appending
    const prevLastEl = cardsList.lastElementChild;

    const newIndex = deckCards.length - 1;
    let newEl;
    if (cardItem.type === 'divisor' || cardItem.type === 'divider' || cardItem.type === 'note') {
        newEl = createDivisorElement(cardItem, newIndex);
    } else {
        newEl = createCardElement(cardItem, newIndex);
    }

    // Set entrance animation class (entering from bottom with overshoot)
    newEl.classList.remove('card-enter-anim');
    newEl.classList.add('m3-card-elastic-in');
    newEl.addEventListener('animationend', () => {
        newEl.classList.remove('m3-card-elastic-in');
    }, { once: true });

    cardsList.appendChild(newEl);

    // If there was an existing card directly above, deliver elastic collision shock!
    if (prevLastEl) {
        prevLastEl.classList.remove('m3-card-elastic-collision-hit', 'm3-card-elastic-in');
        void prevLastEl.offsetWidth; // Force reflow to guarantee CSS keyframe plays
        prevLastEl.classList.add('m3-card-elastic-collision-hit');
        prevLastEl.addEventListener('animationend', () => {
            prevLastEl.classList.remove('m3-card-elastic-collision-hit');
        }, { once: true });
    }

    // Recalculate dynamic border radius so first, mid, and last shapes morph seamlessly
    updateCardsBorderRadius();
    syncCurrentDeckToSlotAndCloud();

    // Smoothly scroll down so the user clearly sees the physical collision and damping unfold
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    requestAnimationFrame(() => {
        cardsList.scrollTo({
            top: cardsList.scrollHeight,
            behavior: scrollBehavior
        });
        newEl.scrollIntoView({
            behavior: scrollBehavior,
            block: 'nearest'
        });
    });

    return newEl;
}

// --- RENDER CARDS LIST IN EDITOR VIEW ---
function renderCardsList(fullReRender = false, preserveScroll = true) {
    const playableCount = deckCards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note').length;
    deckSizeBadge.textContent = playableCount;
    updateVoiceLimitBadge();

    if (deckCards.length === 0) {
        if (isGeneratingCards) {
            cardsList.innerHTML = `
                <div id="cards-skeleton-loader" class="flex flex-col gap-3">
                    <div class="bg-white border border-gray-200/80 p-4 rounded-xl shadow-sm relative overflow-hidden flex flex-col gap-3 animate-pulse">
                        <div class="flex justify-between items-center">
                            <div class="h-3 w-20 bg-gray-200 rounded-md"></div>
                            <div class="h-4 w-16 bg-purple-100 rounded"></div>
                        </div>
                        <div class="space-y-2">
                            <div class="h-4 bg-gray-200 rounded-md w-5/6"></div>
                            <div class="h-4 bg-gray-100 rounded-md w-3/5"></div>
                        </div>
                        <div class="h-4 bg-green-100 rounded-md w-2/5 mt-1"></div>
                    </div>
                    <div class="bg-white border border-gray-200/80 p-4 rounded-xl shadow-sm relative overflow-hidden flex flex-col gap-3 animate-pulse opacity-75">
                        <div class="flex justify-between items-center">
                            <div class="h-3 w-20 bg-gray-200 rounded-md"></div>
                            <div class="h-4 w-24 bg-blue-100 rounded"></div>
                        </div>
                        <div class="space-y-2">
                            <div class="h-4 bg-gray-200 rounded-md w-11/12"></div>
                            <div class="h-4 bg-gray-100 rounded-md w-2/3"></div>
                        </div>
                        <div class="h-4 bg-green-100 rounded-md w-1/3 mt-1"></div>
                    </div>
                    <div class="bg-white border border-gray-200/80 p-4 rounded-xl shadow-sm relative overflow-hidden flex flex-col gap-3 animate-pulse opacity-50">
                        <div class="flex justify-between items-center">
                            <div class="h-3 w-20 bg-gray-200 rounded-md"></div>
                            <div class="h-4 w-20 bg-indigo-100 rounded"></div>
                        </div>
                        <div class="space-y-2">
                            <div class="h-4 bg-gray-200 rounded-md w-4/5"></div>
                            <div class="h-4 bg-gray-100 rounded-md w-1/2"></div>
                        </div>
                        <div class="h-4 bg-green-100 rounded-md w-1/4 mt-1"></div>
                    </div>
                </div>
            `;
            return;
        } else {
            cardsList.innerHTML = `
                <div class="text-center py-12 text-gray-400">
                    <svg class="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    <p class="font-medium text-sm">${t('no_cards_in_deck_yet')}</p>
                    <p class="text-xs mt-1">${t('create_card_or_ask_ai_hint')}</p>
                </div>
            `;
            return;
        }
    }

    // Clean up skeleton or empty state if present
    const skeleton = document.getElementById('cards-skeleton-loader');
    if (skeleton) skeleton.remove();
    const emptyState = cardsList.querySelector('.text-center');
    if (emptyState) emptyState.remove();

    // Capture current scroll positions before DOM changes
    const prevScrollTop = cardsList ? cardsList.scrollTop : 0;
    const prevWindowY = window.scrollY || document.documentElement.scrollTop || 0;

    if (fullReRender) {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < deckCards.length; i++) {
            const item = deckCards[i];
            let el;
            if (item.type === 'divisor' || item.type === 'divider' || item.type === 'note') {
                el = createDivisorElement(item, i, false);
            } else {
                el = createCardElement(item, i, false);
            }
            fragment.appendChild(el);
        }
        if (typeof cardsList.replaceChildren === 'function') {
            cardsList.replaceChildren(fragment);
        } else {
            cardsList.innerHTML = '';
            cardsList.appendChild(fragment);
        }
    } else {
        const currentCount = cardsList.children.length;
        for (let i = currentCount; i < deckCards.length; i++) {
            const item = deckCards[i];
            let el;
            if (item.type === 'divisor' || item.type === 'divider' || item.type === 'note') {
                el = createDivisorElement(item, i, true);
            } else {
                el = createCardElement(item, i, true);
            }
            cardsList.appendChild(el);
        }
    }

    updateCardsBorderRadius();

    if (preserveScroll && fullReRender) {
        if (cardsList) cardsList.scrollTop = prevScrollTop;
        window.scrollTo({ top: prevWindowY, behavior: 'instant' });
        requestAnimationFrame(() => {
            if (cardsList) cardsList.scrollTop = prevScrollTop;
            window.scrollTo({ top: prevWindowY, behavior: 'instant' });
        });
    }
}

function createDivisorElement(divisor, index, withAnimation = true) {
    const divisorEl = document.createElement('div');
    const animClass = withAnimation ? ' card-enter-anim' : '';
    divisorEl.className = "py-2 px-1 flex items-center gap-3 relative group transition select-none deck-divisor-item" + animClass;
    divisorEl.dataset.index = index;

    const leftLine = document.createElement('div');
    leftLine.className = "h-px bg-gray-300 flex-grow";

    const textSpan = document.createElement('div');
    textSpan.className = "flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-lg border border-gray-200 text-xs sm:text-sm font-semibold text-gray-600 shadow-sm max-w-[85%]";

    const hashTag = document.createElement('span');
    hashTag.className = "text-blue-500 font-mono font-bold text-xs select-none";
    hashTag.textContent = "#";

    const labelSpan = document.createElement('span');
    labelSpan.className = "truncate";
    labelSpan.textContent = divisor.text || divisor.description || t('comment_divisor_default');
    labelSpan.title = divisor.text || divisor.description || '';

    textSpan.appendChild(hashTag);
    textSpan.appendChild(labelSpan);

    const rightLine = document.createElement('div');
    rightLine.className = "h-px bg-gray-300 flex-grow";

    // Action buttons on hover (edit & delete)
    const actionsDiv = document.createElement('div');
    actionsDiv.className = "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0";

    const editBtn = document.createElement('button');
    editBtn.type = "button";
    editBtn.className = "p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition";
    editBtn.title = t('edit_comment_title');
    editBtn.innerHTML = `<img src="../assets/img/edit.svg" class="w-3.5 h-3.5" alt="${t('edit')}">`;
    editBtn.onclick = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const currentScroll = cardsList ? cardsList.scrollTop : 0;
        const currentWindowY = window.scrollY || document.documentElement.scrollTop || 0;
        const currentText = divisor.text || divisor.description || '';
        const newText = prompt(t('edit_comment_prompt'), currentText);
        if (newText !== null && newText.trim() !== '') {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            divisor.text = newText.trim();
            divisor.description = newText.trim();
            renderCardsList(true);
            syncCurrentDeckToSlotAndCloud();
            if (cardsList) cardsList.scrollTop = currentScroll;
            window.scrollTo({ top: currentWindowY, behavior: 'instant' });
            requestAnimationFrame(() => {
                if (cardsList) cardsList.scrollTop = currentScroll;
                window.scrollTo({ top: currentWindowY, behavior: 'instant' });
            });
        }
    };

    const delBtn = document.createElement('button');
    delBtn.type = "button";
    delBtn.className = "p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition";
    delBtn.title = t('delete_comment_title');
    delBtn.innerHTML = `<img src="../assets/img/delete.svg" class="w-3.5 h-3.5" alt="${t('delete')}">`;
    delBtn.onclick = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const currentScroll = cardsList ? cardsList.scrollTop : 0;
        const currentWindowY = window.scrollY || document.documentElement.scrollTop || 0;
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        deckCards.splice(index, 1);
        renderCardsList(true);
        syncCurrentDeckToSlotAndCloud();
        if (cardsList) cardsList.scrollTop = currentScroll;
        window.scrollTo({ top: currentWindowY, behavior: 'instant' });
        requestAnimationFrame(() => {
            if (cardsList) cardsList.scrollTop = currentScroll;
            window.scrollTo({ top: currentWindowY, behavior: 'instant' });
        });
    };

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);

    divisorEl.appendChild(leftLine);
    divisorEl.appendChild(textSpan);
    divisorEl.appendChild(rightLine);
    divisorEl.appendChild(actionsDiv);

    return divisorEl;
}

function createCardElement(card, index, withAnimation = true) {
    const cardEl = document.createElement('div');
    const animClass = withAnimation ? ' card-enter-anim' : '';
    cardEl.className = "bg-white border border-gray-200 p-4 relative group shadow-sm flex flex-col gap-2 transition flashcard-item" + animClass;
    cardEl.dataset.index = index;

    const typeBadge = document.createElement('span');
    typeBadge.className = "absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded";

    if (card.type === 'anki') {
        typeBadge.className += " bg-indigo-100 text-indigo-800";
        typeBadge.textContent = t('card_type_anki');
    } else if (card.type === 'multiple_choice') {
        typeBadge.className += " bg-purple-100 text-purple-800";
        typeBadge.textContent = t('card_type_mc');
    } else if (card.type === 'open_double') {
        typeBadge.className += " bg-amber-100 text-amber-800";
        typeBadge.textContent = t('card_type_open_double');
    } else if (card.type === 'fill') {
        typeBadge.className += " bg-teal-100 text-teal-800";
        const count = Array.isArray(card.answers) && card.answers.length > 0 ? card.answers.length : (card.answer ? card.answer.split(';').length : 1);
        typeBadge.textContent = `${t('card_type_fill')} (${count})`;
    } else if (card.type === 'image_arrows') {
        typeBadge.className += " bg-blue-100 text-blue-800";
        const count = Array.isArray(card.imageArrows) ? card.imageArrows.length : 0;
        typeBadge.textContent = `${t('card_type_image_arrows')} (${count})`;
    } else if (card.type === 'voice') {
        typeBadge.className += " bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1";
        typeBadge.innerHTML = `<span class="material-symbols-rounded text-xs text-[#3b82f7]">record_voice_over</span> <span>${t('card_type_voice')}</span>`;
    } else {
        typeBadge.className += " bg-gray-100 text-gray-700";
        typeBadge.textContent = t('card_type_open');
    }
    cardEl.appendChild(typeBadge);

    const descLabel = card.type === 'anki' ? `${t('front_label')}:` : (card.type === 'fill' ? `${t('phrase_label')}:` : (card.type === 'voice' ? `${t('question_concept_label')}:` : `${t('question_label')}:`));
    let descContent = card.description || t('no_text_placeholder');
    if (card.type === 'anki') {
        descContent = `<div class="anki-markdown-content text-gray-800 mt-0.5">${renderMathAndMarkdown(descContent)}</div>`;
    } else if (card.type === 'fill') {
        const blankRegex = /(?:\[\s*_{1,}\s*\]|(?<![a-zA-Z0-9\u00C0-\u017F])_{1,}(?![a-zA-Z0-9\u00C0-\u017F]))/g;
        let blankIndex = 0;
        const escaped = escapeHtml(descContent);
        const highlighted = escaped.replace(blankRegex, () => {
            blankIndex++;
            return `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-mono text-xs font-bold border border-teal-300">[${blankIndex}]</span>`;
        });
        descContent = `<span class="text-gray-800">${highlighted}</span>`;
    } else {
        descContent = `<span class="text-gray-800">${renderMathAndMarkdown(descContent)}</span>`;
    }
    const descStr = `<strong>${descLabel}</strong> ${descContent}`;
    let ansStr = `<strong>${t('answer_label')}:</strong> <span class="text-green-600">${escapeHtml(card.answer || '')}</span>`;

    if (card.type === 'open_double') {
        ansStr += `<br><strong>${t('second_answer_label')}:</strong> <span class="text-green-600">${escapeHtml(card.answer2 || '')}</span>`;
    } else if (card.type === 'multiple_choice') {
        const optsList = (card.options || []).map(opt => {
            const isCorrect = opt === card.answer;
            return isCorrect ? `<strong class="text-green-600">✓ ${escapeHtml(opt)}</strong>` : escapeHtml(opt);
        }).join(' | ');
        ansStr = `<span class="text-xs text-gray-500">${t('options_label')}: ${optsList}</span>`;
    } else if (card.type === 'anki') {
        const renderedAns = renderMathAndMarkdown(card.answer || '');
        ansStr = `<strong>${t('back_label')}:</strong> <div class="anki-markdown-content text-indigo-600 mt-1">${renderedAns}</div>`;
    } else if (card.type === 'voice') {
        const renderedAns = renderMathAndMarkdown(card.answer || '');
        ansStr = `<strong>${t('voice_reference_answer')}:</strong> <div class="text-blue-900 bg-blue-50/70 p-2.5 rounded-xl border border-blue-100 text-xs mt-1 leading-relaxed">${renderedAns}</div>`;
    } else if (card.type === 'fill') {
        const answers = Array.isArray(card.answers) && card.answers.length > 0 
            ? card.answers 
            : (card.answer ? card.answer.split(';').map(a => a.trim()).filter(Boolean) : []);
        if (answers.length > 0) {
            const badges = answers.map((a, i) => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-700 text-xs font-semibold"><span class="text-teal-500 font-mono text-[10px]">${i + 1}:</span> ${escapeHtml(a)}</span>`).join(' ');
            ansStr = `<strong>${t('blanks_label')}:</strong> <div class="inline-flex flex-wrap gap-1 mt-1">${badges}</div>`;
        } else {
            ansStr = `<strong>${t('blanks_label')}:</strong> <span class="text-yellow-600 text-xs">${t('no_answer_defined')}</span>`;
        }
    } else if (card.type === 'image_arrows') {
        const arrows = Array.isArray(card.imageArrows) ? card.imageArrows : [];
        if (arrows.length > 0) {
            const badges = arrows.map((a, i) => {
                const theme = getArrowColorTheme(a.color || '#3b82f7');
                return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold" style="background-color: ${theme.bg}; border: 1px solid ${theme.border}; color: ${theme.textColor};"><span class="w-4 h-4 rounded-full flex items-center justify-center font-black text-[10px]" style="background-color: ${theme.badgeBg}; color: ${theme.badgeText};">${i + 1}</span> ${escapeHtml(a.label || t('no_answer_defined'))}</span>`;
            }).join(' ');
            ansStr = `<strong>${t('image_arrows_labels_title')}:</strong> <div class="inline-flex flex-wrap gap-1.5 mt-1">${badges}</div>`;
        } else {
            ansStr = `<strong>${t('image_arrows_labels_title')}:</strong> <span class="text-yellow-600 text-xs">${t('no_answer_defined')}</span>`;
        }
    }

    const textCont = document.createElement('div');
    textCont.innerHTML = `<div class="mb-2 text-sm mt-3 pr-20">${descStr}</div><div class="text-sm">${ansStr}</div>`;
    cardEl.appendChild(textCont);

    // Question Image
    const safeCardImg = sanitizeImageUrl(card.image);
    if (safeCardImg) {
        const imgDiv = document.createElement('div');
        imgDiv.className = "w-full max-h-32 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center p-1 mt-1";
        renderAnnotatedImage({
            container: imgDiv,
            imageUrl: safeCardImg,
            crop: card.imageCrop,
            arrows: card.imageArrows,
            showNumbers: card.type === 'image_arrows',
            alt: t('card_image') || 'Imagem',
            maxHClass: 'max-h-28'
        });
        cardEl.appendChild(imgDiv);
    }

    // Answer Image (Anki)
    const safeAnsImg = sanitizeImageUrl(card.answerImage);
    if (safeAnsImg) {
        const ansImgDiv = document.createElement('div');
        ansImgDiv.className = "w-full max-h-32 overflow-hidden rounded-lg border border-indigo-200 bg-indigo-50/50 flex items-center justify-center p-1 mt-1";
        renderAnnotatedImage({
            container: ansImgDiv,
            imageUrl: safeAnsImg,
            crop: card.answerImageCrop,
            arrows: card.answerImageArrows,
            alt: t('answer_image') || 'Imagem Resposta',
            maxHClass: 'max-h-28'
        });
        cardEl.appendChild(ansImgDiv);
    }

    // Action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = "absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity";

    const editBtn = document.createElement('button');
    editBtn.type = "button";
    editBtn.className = "p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg";
    editBtn.innerHTML = `<img src="../assets/img/edit.svg" class="w-4 h-4" alt="${t('edit')}">`;
    editBtn.onclick = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        openInlineEditModal(index);
    };

    const delBtn = document.createElement('button');
    delBtn.type = "button";
    delBtn.className = "p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg";
    delBtn.innerHTML = `<img src="../assets/img/delete.svg" class="w-4 h-4" alt="${t('delete')}">`;
    delBtn.onclick = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const currentScroll = cardsList ? cardsList.scrollTop : 0;
        const currentWindowY = window.scrollY || document.documentElement.scrollTop || 0;
        if (confirm(t('confirm_delete_card'))) {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            deckCards.splice(index, 1);
            renderCardsList(true);
            syncCurrentDeckToSlotAndCloud();
            if (cardsList) cardsList.scrollTop = currentScroll;
            window.scrollTo({ top: currentWindowY, behavior: 'instant' });
            requestAnimationFrame(() => {
                if (cardsList) cardsList.scrollTop = currentScroll;
                window.scrollTo({ top: currentWindowY, behavior: 'instant' });
            });
        }
    };

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);
    cardEl.appendChild(actionsDiv);

    return cardEl;
}

addCardBtn.addEventListener('click', () => {
    switchSidebarTab('creator');
    creatorQuestion.focus();
});

// --- INLINE EDIT MODAL (FOR ALL TYPES) ---
function openInlineEditModal(index) {
    const card = deckCards[index];
    if (!card) return;

    // Save scroll state before opening modal
    inlineEditSavedScrollTop = cardsList ? cardsList.scrollTop : 0;
    inlineEditSavedWindowY = window.scrollY || document.documentElement.scrollTop || 0;

    editCardIndex.value = index;
    editCardType.value = card.type || 'open';
    editCardDesc.value = card.description || '';

    // Show/hide groups based on type
    const cardType = card.type || 'open';
    editCardAns1Group.classList.toggle('hidden', cardType === 'anki' || cardType === 'multiple_choice' || cardType === 'fill' || cardType === 'image_arrows' || cardType === 'voice');
    editCardAns2Group.classList.toggle('hidden', cardType !== 'open_double');
    if (editCardFillGroup) editCardFillGroup.classList.toggle('hidden', cardType !== 'fill');
    editCardAnkiGroup.classList.toggle('hidden', cardType !== 'anki');
    if (editCardVoiceGroup) editCardVoiceGroup.classList.toggle('hidden', cardType !== 'voice');
    editCardMcGroup.classList.toggle('hidden', cardType !== 'multiple_choice');
    inlineEditAnsImageGroup.classList.toggle('hidden', cardType !== 'anki');
    if (inlineEditImageArrowsGroup) inlineEditImageArrowsGroup.classList.toggle('hidden', cardType !== 'image_arrows');

    if (cardType === 'open') {
        editCardAns1Label.textContent = t('main_answer_label');
        editCardAns1.value = card.answer || '';
    } else if (cardType === 'open_double') {
        editCardAns1Label.textContent = t('answer_1_label');
        editCardAns1.value = card.answer || '';
        editCardAns2.value = card.answer2 || '';
    } else if (cardType === 'anki') {
        editCardAnkiAnswer.value = card.answer || '';
    } else if (cardType === 'voice') {
        if (editCardVoiceAnswer) editCardVoiceAnswer.value = card.answer || '';
    } else if (cardType === 'multiple_choice') {
        renderInlineEditMcOptions(card.options || ["", "", "", ""], card.answer);
    } else if (cardType === 'fill') {
        if (editCardFillAnswer) {
            const answers = Array.isArray(card.answers) && card.answers.length > 0 
                ? card.answers.join('; ') 
                : (card.answer || '');
            editCardFillAnswer.value = answers;
        }
    } else if (cardType === 'image_arrows') {
        renderInlineEditArrowsInputs(card.imageArrows || []);
    }

    pendingInlineEditQImage = sanitizeImageUrl(card.image || '');
    pendingInlineEditQImageCrop = card.imageCrop ? { ...card.imageCrop } : null;
    pendingInlineEditQImageArrows = Array.isArray(card.imageArrows) ? JSON.parse(JSON.stringify(card.imageArrows)) : [];
    inlineEditImageUrl.value = pendingInlineEditQImage;
    updateInlineEditQImagePreviewUI();

    pendingInlineEditAnsImage = sanitizeImageUrl(card.answerImage || '');
    pendingInlineEditAnsImageCrop = card.answerImageCrop ? { ...card.answerImageCrop } : null;
    pendingInlineEditAnsImageArrows = Array.isArray(card.answerImageArrows) ? JSON.parse(JSON.stringify(card.answerImageArrows)) : [];
    inlineEditAnsImageUrl.value = pendingInlineEditAnsImage;
    updateInlineEditAnsImagePreviewUI();

    inlineEditModal.classList.remove('hidden');
}

function renderInlineEditMcOptions(options, correctAnswer) {
    editCardMcList.innerHTML = '';
    options.forEach((optText, i) => {
        const isCorrect = optText === correctAnswer;
        const row = document.createElement('div');
        row.className = "flex items-center gap-2";

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'inline-edit-mc-correct';
        radio.value = String(i);
        if (isCorrect) radio.checked = true;
        radio.className = 'w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'inline-edit-mc-opt-val flex-1 p-2 bg-gray-50 border border-gray-300 rounded-lg text-sm';
        textInput.value = optText || '';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'inline-edit-remove-opt-btn p-1 text-gray-400 hover:text-red-500 transition';
        removeBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';

        removeBtn.addEventListener('click', () => {
            const currentVals = Array.from(document.querySelectorAll('.inline-edit-mc-opt-val')).map(inp => inp.value);
            if (currentVals.length <= 2) {
                alert(t('alert_mc_min_options'));
                return;
            }
            currentVals.splice(i, 1);
            renderInlineEditMcOptions(currentVals, correctAnswer);
        });

        row.append(radio, textInput, removeBtn);
        editCardMcList.appendChild(row);
    });

    editCardAddMcOptBtn.classList.toggle('hidden', options.length >= 6);
}

editCardAddMcOptBtn.addEventListener('click', () => {
    const currentVals = Array.from(document.querySelectorAll('.inline-edit-mc-opt-val')).map(inp => inp.value);
    if (currentVals.length >= 6) return;
    const checkedRadio = document.querySelector('input[name="inline-edit-mc-correct"]:checked');
    const correctIdx = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;
    const curCorrect = currentVals[correctIdx] || "";
    renderInlineEditMcOptions(currentVals, curCorrect);
});

// Inline Edit Image Arrows Handlers
function renderInlineEditArrowsInputs(arrows = []) {
    if (!inlineEditArrowsInputsList) return;
    inlineEditArrowsInputsList.innerHTML = '';
    const count = Array.isArray(arrows) ? arrows.length : 0;
    if (inlineEditArrowsCountBadge) inlineEditArrowsCountBadge.textContent = String(count);

    if (count === 0) {
        if (inlineEditArrowsEmptyMsg) inlineEditArrowsEmptyMsg.classList.remove('hidden');
        return;
    }
    if (inlineEditArrowsEmptyMsg) inlineEditArrowsEmptyMsg.classList.add('hidden');

    arrows.forEach((arrow, i) => {
        const theme = getArrowColorTheme(arrow.color);
        const row = document.createElement('div');
        row.className = "flex items-center gap-2 p-2 rounded-xl transition border shadow-2xs";
        row.style.backgroundColor = theme.bg;
        row.style.borderColor = theme.border;
        row.id = `inline-edit-arrow-row-${i}`;

        const badge = document.createElement('div');
        badge.className = "w-6 h-6 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 shadow-xs select-none";
        badge.style.backgroundColor = theme.badgeBg;
        badge.style.color = theme.badgeText;
        badge.textContent = String(i + 1);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `inline-edit-arrow-input-${i}`;
        input.className = 'inline-edit-arrow-val flex-1 px-3 py-1.5 bg-white/95 border rounded-lg text-sm font-medium outline-none transition focus:ring-2';
        input.style.borderColor = theme.border;
        input.style.color = '#1e293b';
        input.placeholder = t('structure_placeholder', { num: i + 1 }) || `Nome da estrutura ${i + 1}...`;
        input.value = arrow.label || '';
        input.dataset.arrowIdx = String(i);

        input.addEventListener('input', (e) => {
            arrow.label = e.target.value;
        });

        row.appendChild(badge);
        row.appendChild(input);
        inlineEditArrowsInputsList.appendChild(row);
    });
}

function focusInlineEditArrowInput(idx) {
    const input = document.getElementById(`inline-edit-arrow-input-${idx}`);
    if (input) {
        input.focus();
        input.select();
        const row = document.getElementById(`inline-edit-arrow-row-${idx}`);
        if (row) {
            row.classList.add('ring-2', 'ring-blue-400');
            setTimeout(() => row.classList.remove('ring-2', 'ring-blue-400'), 1200);
        }
    }
}

// Inline Edit Image Listeners & Previews
function updateInlineEditQImagePreviewUI() {
    const isImageArrows = editCardType && editCardType.value === 'image_arrows';
    if (pendingInlineEditQImage) {
        renderAnnotatedImage({
            container: inlineEditImagePreviewContainer,
            imgElem: inlineEditImagePreview,
            imageUrl: pendingInlineEditQImage,
            crop: pendingInlineEditQImageCrop,
            arrows: pendingInlineEditQImageArrows,
            showNumbers: isImageArrows,
            isImageArrows,
            onArrowClick: isImageArrows ? (idx) => focusInlineEditArrowInput(idx) : null,
            maxHClass: 'max-h-36'
        });
        inlineEditImagePreviewContainer.classList.remove('hidden');
    } else {
        inlineEditImagePreview.src = '';
        inlineEditImagePreviewContainer.classList.add('hidden');
        const oldWrap = inlineEditImagePreviewContainer.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
        const oldNotFound = inlineEditImagePreviewContainer.querySelector('.image-not-found-placeholder');
        if (oldNotFound) oldNotFound.remove();
    }
    if (isImageArrows) {
        renderInlineEditArrowsInputs(pendingInlineEditQImageArrows);
    }
}

function updateInlineEditAnsImagePreviewUI() {
    if (pendingInlineEditAnsImage) {
        renderAnnotatedImage({
            container: inlineEditAnsImagePreviewContainer,
            imgElem: inlineEditAnsImagePreview,
            imageUrl: pendingInlineEditAnsImage,
            crop: pendingInlineEditAnsImageCrop,
            arrows: pendingInlineEditAnsImageArrows,
            maxHClass: 'max-h-36'
        });
        inlineEditAnsImagePreviewContainer.classList.remove('hidden');
    } else {
        inlineEditAnsImagePreview.src = '';
        inlineEditAnsImagePreviewContainer.classList.add('hidden');
        const oldWrap = inlineEditAnsImagePreviewContainer.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
    }
}

inlineEditImageUrl.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const cleanUrl = sanitizeImageUrl(url);
    if (cleanUrl !== pendingInlineEditQImage) {
        pendingInlineEditQImageCrop = null;
        pendingInlineEditQImageArrows = [];
    }
    pendingInlineEditQImage = cleanUrl;
    updateInlineEditQImagePreviewUI();
});

inlineEditRemoveImageBtn.addEventListener('click', () => {
    pendingInlineEditQImage = '';
    pendingInlineEditQImageCrop = null;
    pendingInlineEditQImageArrows = [];
    inlineEditImageUrl.value = '';
    updateInlineEditQImagePreviewUI();
});

if (inlineEditCropImageBtn) {
    inlineEditCropImageBtn.addEventListener('click', () => {
        if (!pendingInlineEditQImage) return;
        const isImageArrows = editCardType && editCardType.value === 'image_arrows';
        openImageEditorModal({
            imageUrl: pendingInlineEditQImage,
            crop: pendingInlineEditQImageCrop,
            arrows: pendingInlineEditQImageArrows,
            defaultTool: isImageArrows ? 'arrow' : 'crop',
            onSave: ({ crop, arrows }) => {
                pendingInlineEditQImageCrop = crop;
                pendingInlineEditQImageArrows = arrows.map((a, idx) => ({
                    ...a,
                    label: a.label || pendingInlineEditQImageArrows[idx]?.label || ''
                }));
                updateInlineEditQImagePreviewUI();
                if (isImageArrows) {
                    renderInlineEditArrowsInputs(pendingInlineEditQImageArrows);
                }
            }
        });
    });
}

inlineEditAnsImageUrl.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    const cleanUrl = sanitizeImageUrl(url);
    if (cleanUrl !== pendingInlineEditAnsImage) {
        pendingInlineEditAnsImageCrop = null;
        pendingInlineEditAnsImageArrows = [];
    }
    pendingInlineEditAnsImage = cleanUrl;
    updateInlineEditAnsImagePreviewUI();
});

inlineEditRemoveAnsImageBtn.addEventListener('click', () => {
    pendingInlineEditAnsImage = '';
    pendingInlineEditAnsImageCrop = null;
    pendingInlineEditAnsImageArrows = [];
    inlineEditAnsImageUrl.value = '';
    updateInlineEditAnsImagePreviewUI();
});

if (inlineEditCropAnsImageBtn) {
    inlineEditCropAnsImageBtn.addEventListener('click', () => {
        if (!pendingInlineEditAnsImage) return;
        openImageEditorModal({
            imageUrl: pendingInlineEditAnsImage,
            crop: pendingInlineEditAnsImageCrop,
            arrows: pendingInlineEditAnsImageArrows,
            onSave: ({ crop, arrows }) => {
                pendingInlineEditAnsImageCrop = crop;
                pendingInlineEditAnsImageArrows = arrows;
                updateInlineEditAnsImagePreviewUI();
            }
        });
    });
}

closeInlineEditBtn.addEventListener('click', closeInlineEditModal);
cancelInlineEditBtn.addEventListener('click', closeInlineEditModal);

saveInlineEditBtn.addEventListener('click', (e) => {
    if (e) e.preventDefault();
    const idx = parseInt(editCardIndex.value);
    if (idx < 0 || !deckCards[idx]) return;

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    const card = deckCards[idx];
    card.description = editCardDesc.value.trim();

    if (pendingInlineEditQImage) {
        card.image = pendingInlineEditQImage;
        if (pendingInlineEditQImageCrop) card.imageCrop = pendingInlineEditQImageCrop;
        else delete card.imageCrop;
        if (pendingInlineEditQImageArrows && pendingInlineEditQImageArrows.length > 0) card.imageArrows = pendingInlineEditQImageArrows;
        else delete card.imageArrows;
    } else {
        delete card.image;
        delete card.imageCrop;
        delete card.imageArrows;
    }

    if (card.type === 'open') {
        card.answer = editCardAns1.value.trim();
    } else if (card.type === 'open_double') {
        card.answer = editCardAns1.value.trim();
        card.answer2 = editCardAns2.value.trim();
    } else if (card.type === 'anki') {
        card.answer = editCardAnkiAnswer.value.trim();
        if (pendingInlineEditAnsImage) {
            card.answerImage = pendingInlineEditAnsImage;
            if (pendingInlineEditAnsImageCrop) card.answerImageCrop = pendingInlineEditAnsImageCrop;
            else delete card.answerImageCrop;
            if (pendingInlineEditAnsImageArrows && pendingInlineEditAnsImageArrows.length > 0) card.answerImageArrows = pendingInlineEditAnsImageArrows;
            else delete card.answerImageArrows;
        } else {
            delete card.answerImage;
            delete card.answerImageCrop;
            delete card.answerImageArrows;
        }
    } else if (card.type === 'voice') {
        card.answer = editCardVoiceAnswer ? editCardVoiceAnswer.value.trim() : '';
    } else if (card.type === 'multiple_choice') {
        const optInputs = Array.from(document.querySelectorAll('.inline-edit-mc-opt-val'));
        const options = optInputs.map(inp => inp.value.trim()).filter(Boolean);
        const checkedRadio = document.querySelector('input[name="inline-edit-mc-correct"]:checked');
        const correctIdx = checkedRadio ? parseInt(checkedRadio.value) : 0;
        card.options = options;
        card.answer = optInputs[correctIdx]?.value.trim() || options[0];
    } else if (card.type === 'fill') {
        const rawAns = editCardFillAnswer ? editCardFillAnswer.value.trim() : '';
        const answers = rawAns.split(';').map(a => a.trim()).filter(Boolean);
        card.answers = answers;
        card.answer = answers.join('; ');
    } else if (card.type === 'image_arrows') {
        const arrowInputs = Array.from(document.querySelectorAll('.inline-edit-arrow-val'));
        arrowInputs.forEach((inp, idx) => {
            if (pendingInlineEditQImageArrows[idx]) {
                pendingInlineEditQImageArrows[idx].label = inp.value.trim();
            }
        });
        card.imageArrows = JSON.parse(JSON.stringify(pendingInlineEditQImageArrows));
        card.answer = pendingInlineEditQImageArrows.map(a => a.label || '').filter(Boolean).join('; ');
    }

    inlineEditModal.classList.add('hidden');
    renderCardsList(true);
    syncCurrentDeckToSlotAndCloud();

    if (cardsList) cardsList.scrollTop = inlineEditSavedScrollTop;
    window.scrollTo({ top: inlineEditSavedWindowY, behavior: 'instant' });
    requestAnimationFrame(() => {
        if (cardsList) cardsList.scrollTop = inlineEditSavedScrollTop;
        window.scrollTo({ top: inlineEditSavedWindowY, behavior: 'instant' });
    });
});

// --- AI CHAT INTEGRATION ---
function addChatMessage(role, text) {
    const msg = document.createElement('div');
    const safeText = String(text || '');
    if (role === 'user') {
        msg.className = 'py-2 px-4 rounded-xl max-w-[85%] text-sm self-end bg-purple-600 text-white rounded-tr-sm break-words';
        msg.textContent = safeText;
    } else if (role === 'error') {
        msg.className = 'py-2.5 px-4 rounded-xl max-w-[88%] text-sm self-start bg-red-100 text-red-800 rounded-tl-sm break-words shadow-sm';
        msg.textContent = safeText;
    } else {
        msg.className = 'py-2.5 px-4 rounded-xl max-w-[88%] text-sm self-start bg-gray-200 text-gray-800 rounded-tl-sm chat-markdown-content break-words shadow-sm';
        try {
            msg.innerHTML = renderMathAndMarkdown(safeText);
        } catch (err) {
            console.error('Error rendering markdown in chat message:', err);
            msg.textContent = safeText;
        }
    }
    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// --- AI CHAT QUEUE & AGENT ROUTING ---

function renderPromptQueue() {
    if (!chatPromptQueue) return;
    if (promptQueue.length === 0) {
        chatPromptQueue.innerHTML = '';
        chatPromptQueue.classList.add('hidden');
        return;
    }

    chatPromptQueue.classList.remove('hidden');
    chatPromptQueue.innerHTML = `
        <div class="flex items-center justify-between text-[11px] font-semibold text-gray-500 select-none px-1 mb-0.5">
            <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                ${t('prompt_queue_label', { count: promptQueue.length })}
            </span>
        </div>
        <div class="flex flex-col gap-1.5">
            ${promptQueue.map(item => {
                const isExecuting = item.status === 'executing';
                return `
                    <div class="flex items-center justify-between gap-2.5 px-3 py-1.5 rounded-xl bg-white border ${isExecuting ? 'border-purple-300 shadow-xs ring-1 ring-purple-100' : 'border-gray-200'} text-xs text-gray-700 transition">
                        <span class="truncate flex-1 font-medium text-gray-800" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
                        <div class="flex items-center justify-center w-5 h-5 flex-shrink-0" title="${isExecuting ? t('executing_status') : t('waiting_in_queue_status')}">
                            ${isExecuting 
                                ? '<md-circular-progress four-color indeterminate style="--md-circular-progress-size: 16px; width: 16px; height: 16px;"></md-circular-progress>' 
                                : '<span class="w-3 h-3 rounded-full bg-gray-400 inline-block flex-shrink-0"></span>'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    if (chatHistory) {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

const triageSystemInstruction = "Você é o analisador de capacidade do agente de flashcards. Sua missão é decidir se você (modelo leve gemini-flash-lite-latest) é plenamente capaz de executar o comando do usuário ou se deve transferi-lo para o modelo avançado (gemini-flash-latest) através da ferramenta 'handoff_to_gemini_flash'.\n\n" +
    "- Se a tarefa for comum ou direta (adicionar cartões normais, editar enunciados ou respostas, remover cartões, reordenar, dúvidas conceituais, formatações simples): Você É CAPAZ. NÃO chame a ferramenta de handoff e responda apenas 'CAPABLE'.\n" +
    "- Se a tarefa exigir raciocínio avançado, reestruturação profunda de grande escala do baralho ou elaboração pedagógica densa e complexa: Chame 'handoff_to_gemini_flash' com o motivo detalhado.\n\n" +
    "Sempre priorize economizar tokens do modelo avançado quando você for capaz.";

async function analyzePromptCapability(userPrompt) {
    console.log('[AI Agent Analysis] Iniciando análise de capacidade com modelo padrão (gemini-flash-lite-latest)...');
    console.log('[AI Agent Analysis] Prompt sob análise:', userPrompt);
    try {
        const deckBrief = `Baralho atual: ${deckCards.length} cartões.`;

        const token = await getCurrentUserToken().catch(() => null);
        if (!token) return { handoff: false };

        const res = await fetch(`${BACKEND_URL}/api/ai/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: "gemini-flash-lite-latest",
                systemInstruction: { parts: [{ text: triageSystemInstruction }] },
                contents: [{ role: 'user', parts: [{ text: `${deckBrief}\nComando do usuário: "${userPrompt}"` }] }],
                tools: handoffTools,
                stream: false,
                isNewDeck: false
            })
        });
        if (!res.ok) return { handoff: false };
        const data = await res.json();
        const candidate = data.candidates?.[0];

        const calls = candidate?.content?.parts?.filter(p => !!p.functionCall) || [];
        const handoffCall = calls.find(c => c.functionCall.name === 'handoff_to_gemini_flash');

        if (handoffCall) {
            const reason = handoffCall.functionCall.args?.reason || 'Complexidade avaliada como superior à capacidade do modelo leve.';
            console.log('[AI Agent Analysis] Tool call disparada: handoff_to_gemini_flash');
            console.log('[AI Agent Analysis] Motivo do handoff:', reason);
            console.log('[AI Agent Analysis] Decisão: Encaminhar execução para gemini-flash-latest');
            return { handoff: true, reason };
        }

        console.log('[AI Agent Analysis] Decisão: gemini-flash-lite-latest é capaz do trabalho. Execução direta com modelo padrão.');
        return { handoff: false };
    } catch (err) {
        console.warn('[AI Agent Analysis] Falha na análise prévia de capacidade (fallback para gemini-flash-lite-latest):', err);
        return { handoff: false };
    }
}

async function executeAgentChatTurn(modelName, userPrompt, forceLite = false) {
    let history = [];
    if (geminiChatSession && geminiChatSession._history) {
        try {
            history = JSON.parse(JSON.stringify(geminiChatSession._history));
        } catch (_) {
            history = [];
        }
    }
    sanitizeChatHistory(history);
    const historyBeforeTurn = JSON.parse(JSON.stringify(history));

    const toolsForModel = (!forceLite && modelName === "gemini-flash-lite-latest")
        ? deckToolsWithHandoff
        : deckTools;

    const contextLines = deckCards.map((c, i) => {
        if (c.type === 'divisor' || c.type === 'divider' || c.type === 'note') {
            return `[${i}] (divisor) # ${c.text || c.description || ''}`;
        }
        return `[${i}] (${c.type}) ${(c.description || '').substring(0, 60)}... | R: ${c.answer || ''}`;
    }).join('\n');
    const enrichedPrompt = `ATENÇÃO: O estado atual do baralho é:\n${contextLines}\n\nComando do Usuário: ${userPrompt}`;

    const token = await getCurrentUserToken().catch(() => null);
    if (!token) throw new Error("Usuário não autenticado.");

    currentEditorModel = modelName;
    history.push({ role: 'user', parts: [{ text: enrichedPrompt }] });

    try {
        let res = await fetch(`${BACKEND_URL}/api/ai/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: modelName,
                systemInstruction: { parts: [{ text: systemInstruction }] },
                tools: toolsForModel,
                contents: history,
                stream: false,
                isNewDeck: false
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Erro no assistente (${res.status})`);
        }

        let data = await res.json();
        let candidate = data.candidates?.[0];

        for (let i = 0; i < 5; i++) {
            const calls = candidate?.content?.parts?.filter(p => !!p.functionCall) || [];
            if (calls.length === 0) break;

            const midHandoff = calls.find(c => c.functionCall.name === 'handoff_to_gemini_flash');
            if (midHandoff && modelName === "gemini-flash-lite-latest" && !forceLite) {
                const reason = midHandoff.functionCall.args?.reason || 'Handoff solicitado durante turn';
                console.log('[AI Agent Execution] Lite model acionou handoff_to_gemini_flash durante a execução. Motivo:', reason);
                console.log('[AI Agent Execution] Transferindo execução para gemini-flash-latest...');
                if (geminiChatSession) geminiChatSession._history = historyBeforeTurn;
                return await executeAgentChatTurn("gemini-flash-latest", userPrompt, false);
            }

            if (candidate?.content) {
                history.push(candidate.content);
            }

            const functionResponses = calls.map(call => {
                const { name, args } = call.functionCall;
                console.log(`[AI Agent] [Tool Call] Invocando ferramenta '${name}':`, args);
                const output = toolFunctions[name] ? toolFunctions[name](args) : { error: "Função não encontrada" };
                return {
                    functionResponse: { name, response: output }
                };
            });

            history.push({ role: 'user', parts: functionResponses });

            res = await fetch(`${BACKEND_URL}/api/ai/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    model: modelName,
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    tools: toolsForModel,
                    contents: history,
                    stream: false,
                    isNewDeck: false
                })
            });

            if (!res.ok) break;
            data = await res.json();
            candidate = data.candidates?.[0];
        }

        if (candidate?.content) {
            history.push(candidate.content);
        }
        if (!geminiChatSession) geminiChatSession = {};
        geminiChatSession._history = history;

        const textPart = candidate?.content?.parts?.find(p => p.text)?.text || '';
        return textPart || t('action_completed_success');
    } catch (turnErr) {
        if (geminiChatSession) {
            geminiChatSession._history = historyBeforeTurn;
        }
        throw turnErr;
    }
}

async function executePromptWithAnalysisAndFallback(userPrompt) {
    const analysis = await analyzePromptCapability(userPrompt);

    if (analysis.handoff) {
        console.log('[AI Agent Execution] Executando comando com modelo avançado: gemini-flash-latest');
        try {
            const output = await executeAgentChatTurn("gemini-flash-latest", userPrompt, false);
            console.log('[AI Agent Execution] gemini-flash-latest completou a tarefa com sucesso.');
            return output;
        } catch (flashErr) {
            console.warn('[AI Agent Fallback] gemini-flash-latest falhou com erro:', flashErr?.message || flashErr);
            console.log('[AI Agent Fallback] Retornando e forçando gemini-flash-lite-latest a executar o trabalho como puder...');
            const fallbackOutput = await executeAgentChatTurn("gemini-flash-lite-latest", userPrompt, true /* forceLite */);
            console.log('[AI Agent Fallback] gemini-flash-lite-latest concluiu com sucesso a execução forçada.');
            return fallbackOutput;
        }
    } else {
        console.log('[AI Agent Execution] Executando comando com modelo padrão: gemini-flash-lite-latest');
        const output = await executeAgentChatTurn("gemini-flash-lite-latest", userPrompt, false);
        console.log('[AI Agent Execution] gemini-flash-lite-latest completou a tarefa com sucesso.');
        return output;
    }
}

async function processPromptQueue() {
    if (isProcessingPromptQueue) return;
    if (promptQueue.length === 0) return;

    isProcessingPromptQueue = true;

    while (promptQueue.length > 0) {
        const item = promptQueue[0];
        item.status = 'executing';
        renderPromptQueue();

        console.log('[AI Agent Queue] Iniciando execução do prompt na fila:', item.text);
        showChatTypingIndicator();

        if (!isUserPro()) {
            hideChatTypingIndicator();
            addChatMessage('model', t('subscribe_pro_to_use_assistant'));
            openProModal();
            promptQueue.shift();
            renderPromptQueue();
            break;
        }

        try {
            const responseText = await executePromptWithAnalysisAndFallback(item.text);
            hideChatTypingIndicator();
            // Log on chat the prompt and agent's response
            addChatMessage('user', item.text);
            addChatMessage('model', responseText || t('action_completed_success'));
        } catch (err) {
            console.error('[AI Agent Queue] Erro ao processar prompt:', err);
            hideChatTypingIndicator();
            // Log on chat the prompt and error response
            addChatMessage('user', item.text);
            addChatMessage('error', t('error_processing_prompt', { error: err.message || err }));
        }

        promptQueue.shift();
        renderPromptQueue();
    }

    isProcessingPromptQueue = false;
    hideChatTypingIndicator();
}

chatSendBtn.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text) return;

    if (!isUserPro()) {
        addChatMessage('model', t('ai_assistant_pro_exclusive'));
        openProModal();
        return;
    }

    chatInput.value = '';
    console.log('[AI Agent Queue] Prompt recebido e enfileirado:', text);
    promptQueue.push({
        id: generateSecureId('p'),
        text: text,
        status: 'queued'
    });
    renderPromptQueue();

    processPromptQueue();
});

chatInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') chatSendBtn.click();
});

// --- SAVE & PLAY DECK ---
deckTitleDisplay.addEventListener('input', () => {
    document.title = `${deckTitleDisplay.value.trim() || 'Flashcards'} | Editor`;
    syncCurrentDeckToSlotAndCloud();
});

if (shareDeckBtn) {
    shareDeckBtn.addEventListener('click', async () => {
        if (deckCards.length === 0) {
            alert(t('alert_add_card_before_play'));
            return;
        }
        syncCurrentDeckToSlotAndCloud();
        const title = deckTitleDisplay.value.trim() || t('my_deck');
        const playableCards = deckCards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note');
        const gameState = {
            questionsPool: playableCards,
            allQuestions: deckCards,
            score: 0,
            deckTitle: title,
            isFreeAiTrial: Boolean(window.currentDeckIsFreeAiTrial || localStorage.getItem('editing_deck_is_free_trial') === 'true'),
            updatedAt: Date.now()
        };
        try {
            const { shareUrl, slotIndex: allocatedSlotIndex } = await shareDeckToCloud(gameState, title, currentEditingSlotIndex);
            if (allocatedSlotIndex !== undefined && allocatedSlotIndex !== null) {
                currentEditingSlotIndex = allocatedSlotIndex;
            }
            showShareSuccessDialog({ shareUrl, title, isNotebook: false });
        } catch (err) {
            if (err.name === 'AbortError') {
                return; // User cancelled the slot replacement dialog cleanly
            }
            console.error('[Share] Erro ao compartilhar baralho:', err);
            alert(t('error_sharing_deck'));
        }
    });
}

downloadDeckBtn.addEventListener('click', () => {
    if (deckCards.length === 0) return;
    const isFreeTrial = Boolean(
        window.currentDeckIsFreeAiTrial || 
        deckCards.some(c => c && c.isFreeAiTrial) || 
        localStorage.getItem('editing_deck_is_free_trial') === 'true'
    );
    if (!isUserPro() && isFreeTrial) {
        alert(t('alert_free_trial_no_export'));
        openProModal();
        return;
    }
    syncCurrentDeckToSlotAndCloud();
    const jsonStr = JSON.stringify(deckCards, null, 4);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = encodeURI(url);
    const safeTitle = deckTitleDisplay.value.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${safeTitle || 'flashcards'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

playDeckBtn.addEventListener('click', async () => {
    const playableCards = deckCards.filter(c => c.type !== 'divisor' && c.type !== 'divider' && c.type !== 'note');
    if (playableCards.length === 0) {
        alert(t('alert_add_card_before_play'));
        return;
    }

    const sanitizeCard = (card) => {
        if (!card || typeof card !== 'object') return card;
        const copy = { ...card };
        delete copy.isBeingCorrected;
        delete copy._lastUserAnswer;
        return copy;
    };

    const isFreeTrial = Boolean(
        window.currentDeckIsFreeAiTrial || 
        deckCards.some(c => c && c.isFreeAiTrial) || 
        localStorage.getItem('editing_deck_is_free_trial') === 'true'
    );

    const title = deckTitleDisplay.value.trim() || (currentEditingMode === 'exam' ? 'Semana de Provas' : 'Meu Baralho');
    const now = Date.now();
    const gameState = {
        questionsPool: playableCards.map(sanitizeCard),
        allQuestions: deckCards.map(c => {
            const sc = sanitizeCard(c);
            if (isFreeTrial && sc && typeof sc === 'object') {
                sc.isFreeAiTrial = true;
            }
            return sc;
        }),
        score: 0,
        deckTitle: title,
        isFreeAiTrial: isFreeTrial,
        updatedAt: now
    };

    try {
        if (title === "Caderno") {
            localStorage.setItem(NOTEBOOK_STORAGE_KEY, encodeStoragePayload(gameState));
            localStorage.setItem('flashcardsActiveMode', 'notebook');
            syncSlotsToCloud();
        } else if (currentEditingMode === 'exam') {
            let existingExam = currentEditingExamData;
            if (!existingExam) {
                try { existingExam = JSON.parse(localStorage.getItem('flashcardsExam') || '{}'); } catch(e){}
            }
            gameState.decks = existingExam?.decks || [];
            gameState.deckId = existingExam?.deckId || `exam_${now}`;
            gameState.isExam = true;
            gameState.mode = 'exam';
            const res = await openDeckInSlots(gameState, title, 'exam', currentEditingSlotIndex);
            if (res === null) return;
            localStorage.setItem('flashcardsExam', encodeStoragePayload(gameState));
            localStorage.setItem('flashcardsActiveMode', 'exam');
            syncSlotsToCloud();
        } else {
            const res = await openDeckInSlots(gameState, title, 'normal', currentEditingSlotIndex);
            if (res === null) return;
            localStorage.setItem('flashcardsSave', encodeStoragePayload(gameState));
            localStorage.setItem('flashcardsActiveMode', 'normal');
            syncSlotsToCloud();
        }
        window.location.href = 'game.html';
    } catch (err) {
        if (err.name === 'QuotaExceededError') {
            alert(t('alert_storage_quota_exceeded'));
        } else {
            alert(t('exam_error_start', { message: err.message }));
        }
    }
});

// --- INITIALIZATION ---
window.addEventListener('flashcards:pro-updated', () => {
    updateProPaywalledUI();
});

window.addEventListener('DOMContentLoaded', async () => {
    updateAiConfigStatusUI();

    // Check if loading an existing deck for editing
    const savedDeck = localStorage.getItem('editing_deck');
    const savedTitle = localStorage.getItem('editing_deck_title');
    const savedMode = localStorage.getItem('editing_deck_mode');
    const savedSlotIndex = localStorage.getItem('editing_deck_slot_index');
    const savedExamData = localStorage.getItem('editing_deck_exam_data');

    if (savedDeck) {
        try {
            deckCards = JSON.parse(savedDeck);
            currentEditingMode = (savedMode === 'exam') ? 'exam' : 'normal';
            if (savedSlotIndex !== null && savedSlotIndex !== undefined && savedSlotIndex !== '') {
                currentEditingSlotIndex = parseInt(savedSlotIndex, 10);
            } else {
                try {
                    const slots = getLocalSlots();
                    if (currentEditingMode === 'exam') {
                        const examSlotIdx = slots.findIndex(s => s.isCurrent && (s.isExam || s.mode === 'exam'));
                        currentEditingSlotIndex = examSlotIdx !== -1 ? examSlotIdx : slots.findIndex(s => s.isExam || s.mode === 'exam');
                    } else {
                        const normalSlotIdx = slots.findIndex(s => s.isCurrent && !s.isExam);
                        currentEditingSlotIndex = normalSlotIdx !== -1 ? normalSlotIdx : slots.findIndex(s => !s.isExam && s.title === savedTitle);
                    }
                    if (currentEditingSlotIndex === -1) currentEditingSlotIndex = null;
                } catch (e) {}
            }

            if (savedExamData) {
                try { currentEditingExamData = JSON.parse(savedExamData); } catch (e) {}
            } else if (currentEditingMode === 'exam') {
                try { currentEditingExamData = JSON.parse(localStorage.getItem('flashcardsExam') || '{}'); } catch (e) {}
            }

            const isSavedTrial = localStorage.getItem('editing_deck_is_free_trial') === 'true';
            if (isSavedTrial || deckCards.some(c => c && c.isFreeAiTrial)) {
                window.currentDeckIsFreeAiTrial = true;
            }
            const displayTitle = savedTitle || (currentEditingMode === 'exam' ? "Semana de Provas" : "Flashcards");
            deckTitleDisplay.value = displayTitle;
            document.title = `${displayTitle} | Editor`;

            openEditorView('creator');

            localStorage.removeItem('editing_deck');
            localStorage.removeItem('editing_deck_title');
            localStorage.removeItem('editing_deck_mode');
            localStorage.removeItem('editing_deck_slot_index');
            localStorage.removeItem('editing_deck_exam_data');
        } catch (e) {
            console.error("Erro ao carregar deck salvo:", e);
        }
    }

    // Post-payment checks: URL query parameter ?open_ai_modal=true
    const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search) : null;
    if (urlParams && urlParams.get('open_ai_modal') === 'true') {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('open_ai_modal');
        window.history.replaceState({}, document.title, cleanUrl.toString());
        handlePostPaymentGeneration();
    }
});
