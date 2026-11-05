import { normalizeString, calculateSimilarity, shuffleArray, checkAndResetModelFallback, ROUTES, renderMathAndMarkdown, sanitizeHtml, generateSecureId, stripHtml, escapeHtml, sanitizeImageUrl, NOTEBOOK_STORAGE_KEY, encodeStoragePayload } from './utils.js';
import { isPlayableCard, calculateThinkingGap, selectNextCard, isLeechCard, shouldGraduateCard, formatTimeDisplay, getCardTopic } from './engine/scheduler.js';
import { getDailyStreak, recordDailyCardAnswered, inferNotebookQuality, calculateNotebookNextSchedule, selectNextNotebookCard, getNotebookDueCounts, isDifficultCard, getTodayDateString, recordNotebookGoalBeaten, getNotebookDailyGoal } from './engine/notebook-scheduler.js';
import {
    initEffects, createBall, clearBalls, setBallColor, launchCelebrationParticles,
    playCompletionShockwave, cleanShockwaveContainer, resizeCanvas, animate,
    triggerHaptic, isHapticEnabled, setHapticEnabled, updateHapticUI,
    isSoundEnabled, setSoundEnabled, playFeedbackSound, updateSoundUI,
    isAnimationsEnabled, setAnimationsEnabled, applyAnimationsPreference, updateAnimationsUI, updateAccessibilityUI
} from './engine/effects.js';
import { initInputController, startGamepadLoop, stopGamepadLoop } from './engine/input-controller.js';
import { isTutorEnabled, disableTutor, initTutor, updateTutorUI, setLastUserAnswerForChat, getLastUserAnswerForChat, resetTutorChatSession, getHasChatInteraction, setHasChatInteraction, evaluateAnswerSemantic, addMsg, showTyping, hideTyping, sendTutorChatMessage, getTermDefinition, logDefinitionToChat } from './engine/tutor.js';
import { initPomodoro, isPomodoroEnabled, setPomodoroEnabled, updatePomodoroUI, getPomodoroStatus } from './engine/pomodoro.js';
import {
    getNotificationSettings, saveNotificationSettings, requestNotificationPermission,
    hasNotificationSupport, sendDailyNotification, startNotificationScheduler,
    updateNotificationsUI, checkAndTriggerScheduledNotifications
} from './engine/notifications.js';
import { isDeckCategorized, callGeminiFlashLiteCategorization, getStoredAiCategories, getCardSignature } from './stats-ai.js';
import { initTransfer } from './transfer.js';
import { initStatsSession, recordStatsAnswer, recordStatsAiCorrection, archiveCurrentSession, completeCurrentSession, getCurrentSessionMetrics } from './stats-tracker.js';
import { initExploreModal, openExploreModal, openProModal, isUserPro } from './explore-modal.js';
import { openAccountModal } from './account-modal.js';
import { getUserApiKey, generateUserApiKey, revokeUserApiKey, testStatsApi, getUserWebhook, saveUserWebhook, testUserWebhook, triggerDailyGoalWebhook, BACKEND_URL } from './backend-api.js';
import { onAuthChange, auth, getCurrentUserToken } from './firebase-client.js';
import { getApiKey } from './key-manager.js';
import { checkAndLoadSharedDeck, checkAndUpdateSharedSlots, subscribeToAllSharedSlots, shareDeckToCloud, showShareSuccessDialog } from './share-manager.js';
import { debouncedSyncSlotsToCloud, syncSlotsToCloud, syncActiveSlotState, initRealtimeCloudSync, openDeckInSlots, getLocalSlots, saveLocalSlots } from './slot-manager.js';
import { initPwaInstallBanner } from './engine/pwa-install.js';
import { t, initI18n, getCurrentLanguage, setLanguage, getLanguagePreference, applyTranslations } from './i18n.js';
import { openImageEditorModal, renderAnnotatedImage, isImageAnnotated, getArrowColorTheme } from './image-editor-modal.js';

// --- DOM ELEMENTS ---
const deckTitle = document.getElementById('deck-title');
const deckSelectTrigger = document.getElementById('deck-select-trigger');
const deckSelectDropdown = document.getElementById('deck-select-dropdown');
const deckSelectArrow = document.getElementById('deck-select-arrow');
const deckItemExplore = document.getElementById('deck-item-explore');
const menuAccountBtn = document.getElementById('menu-account-btn');
const deckItemNormal = document.getElementById('deck-item-normal');
const deckItemNormalName = document.getElementById('deck-item-normal-name');
const deckItemNotebook = document.getElementById('deck-item-notebook');
const notebookStreakBadge = document.getElementById('notebook-streak-badge');
const notebookStreakFire = document.getElementById('notebook-streak-fire');
const notebookStreakCount = document.getElementById('notebook-streak-count');
const counterLeftWrapper = document.getElementById('counter-left-wrapper');
const counterLeftLabel = document.getElementById('counter-left-label');
const scoreLabel = document.getElementById('score-label');
const clearNotebookBtn = document.getElementById('clear-notebook-btn');
const cardDifficultTag = document.getElementById('card-difficult-tag');
const notebookStageTag = cardDifficultTag;
const deckItemExam = document.getElementById('deck-item-exam');
const deckItemExamSub = document.getElementById('deck-item-exam-sub');
const dropdownExamDecksSection = document.getElementById('dropdown-exam-decks-section');
const dropdownExamDecksCount = document.getElementById('dropdown-exam-decks-count');
const dropdownExamDecksList = document.getElementById('dropdown-exam-decks-list');
const dropdownAddDeckBtn = document.getElementById('dropdown-add-deck-btn');
const dropdownAddDeckInput = document.getElementById('dropdown-add-deck-input');
const bookmarkCardBtn = document.getElementById('bookmark-card-btn');
const bookmarkCardIcon = document.getElementById('bookmark-card-icon');

// Header Stats Customization DOM Elements
const headerStatsComponent = document.getElementById('header-stats-component');
const headerStatsTrigger = document.getElementById('header-stats-trigger');
const headerPinnedStatsContainer = document.getElementById('header-pinned-stats-container');
const headerStatsChevron = document.getElementById('header-stats-chevron');
const headerStatsDropdown = document.getElementById('header-stats-dropdown');
const headerStatsOptionsList = document.getElementById('header-stats-options-list');
const pinnedStatsCounter = document.getElementById('pinned-stats-counter');

const hamburgerBtn = document.getElementById('hamburger-btn');
const hamburgerMenu = document.getElementById('hamburger-menu');
const hamburgerBackdrop = document.getElementById('hamburger-backdrop');
const statsBtn = document.getElementById('stats-btn');
const receiveSessionBtn = document.getElementById('receive-session-btn');
const transferSessionBtn = document.getElementById('transfer-session-btn');
const menuAiIcon = document.getElementById('menu-ai-icon');
const menuAiStatusBadge = document.getElementById('menu-ai-status-badge');
const menuAiTitle = document.getElementById('menu-ai-title');
const menuAiSubtitle = document.getElementById('menu-ai-subtitle');
const aiSettingRow = document.getElementById('ai-setting-row');
const aiSwitch = document.getElementById('ai-switch');

const resetBtn = document.getElementById('reset-btn');
const restartGameBtn = document.getElementById('restart-game-btn');
const exportBtn = document.getElementById('export-btn');
const menuShareDeckBtn = document.getElementById('menu-share-deck-btn');
const gameContainer = document.getElementById('game-container');
const goToEditorBtn = document.getElementById('go-to-editor-btn');

const questionText = document.getElementById('question-text');
const questionSourceTag = document.getElementById('question-source-tag');
const questionBodyText = document.getElementById('question-body-text');
const questionFeedbackText = document.getElementById('question-feedback-text');

function ensureQuestionStructure() {
    if (!questionText) return;
    if (!document.getElementById('question-body-text')) {
        questionText.innerHTML = `
            <span id="question-source-tag" class="hidden text-xs uppercase tracking-wider text-blue-500 font-bold mb-1.5 block select-none"></span>
            <span id="question-body-text"></span>
            <span id="question-feedback-text" class="hidden mt-2 block"></span>
        `;
    }
}
const textHighlightPopup = document.getElementById('text-highlight-popup');
const hlActionsBar = document.getElementById('hl-actions-bar');
const hlTriggerBtn = document.getElementById('hl-trigger-btn');
const hlPalette = document.getElementById('hl-palette');
const hlAiBtn = document.getElementById('hl-ai-btn');
const hlAiCard = document.getElementById('hl-ai-card');
const hlAiTermTitle = document.getElementById('hl-ai-term-title');
const hlAiOpenChatBtn = document.getElementById('hl-ai-open-chat-btn');
const hlAiLoading = document.getElementById('hl-ai-loading');
const hlAiContent = document.getElementById('hl-ai-content');
let isHandoffAnimating = false;
const scoreDisplay = document.getElementById('score');
const questionsLeftDisplay = document.getElementById('questions-left');
const questionCard = document.getElementById('question-card');
const deleteCardBtn = document.getElementById('delete-card-btn');
const questionImageContainer = document.getElementById('question-image-container');
const questionImagePlaceholder = document.getElementById('question-image-placeholder');
const questionImageError = document.getElementById('question-image-error');
const questionImage = document.getElementById('question-image');

const deckCompletionView = document.getElementById('deck-completion-view');
const deckCompletionSubtitle = document.getElementById('deck-completion-subtitle');
const completionStatCards = document.getElementById('completion-stat-cards');
const completionStatAcc = document.getElementById('completion-stat-acc');
const completionStatTime = document.getElementById('completion-stat-time');
const completionStatStreak = document.getElementById('completion-stat-streak');
const completionStatsBtn = document.getElementById('completion-stats-btn');
const completionRestartBtn = document.getElementById('completion-restart-btn');
const shockwaveContainer = document.getElementById('shockwave-container');
const actionButtonsArea = document.getElementById('action-buttons-area');

const correctionOptions = document.getElementById('correction-options');
const editBtn = document.getElementById('edit-btn');
const deleteCorrectionBtn = document.getElementById('delete-correction-btn');

const streakPill = document.getElementById('streak-pill');
const streakBgColor = document.getElementById('streak-bg-color');
const streakShimmerSweep = document.getElementById('streak-shimmer-sweep');
const streakFireIcon = document.getElementById('streak-fire-icon');
const streakCount = document.getElementById('streak-count');

let currentStreak = 0;
let lastStreakBeforeWrong = 0;

const editModal = document.getElementById('edit-modal');
const editQuestionInput = document.getElementById('edit-question-input');
const editAnswerInput = document.getElementById('edit-answer-input');
const editAnswer2Group = document.getElementById('edit-answer-2-group');
const editAnswer2Input = document.getElementById('edit-answer-2-input');
const editImagePreviewContainer = document.getElementById('edit-image-preview-container');
const editImagePreview = document.getElementById('edit-image-preview');
const editRemoveImageBtn = document.getElementById('edit-remove-image-btn');
const editCropImageBtn = document.getElementById('edit-crop-image-btn');
const editImageUrlInput = document.getElementById('edit-image-url-input');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const saveEditBtn = document.getElementById('save-edit-btn');

const imageZoomModal = document.getElementById('image-zoom-modal');
const zoomedImage = document.getElementById('zoomed-image');
const closeImageZoomBtn = document.getElementById('close-image-zoom-btn');

const openAnswerArea = document.getElementById('open-answer-area');
const flashcardAnswerForm = document.getElementById('flashcard-answer-form');
const answerInput = document.getElementById('answer-input');
const openDoubleAnswerArea = document.getElementById('open-double-answer-area');
const answerInput1 = document.getElementById('answer-input-1');
const answerInput2 = document.getElementById('answer-input-2');
const mcAnswerArea = document.getElementById('mc-answer-area');
let mcOptionBtns = document.querySelectorAll('.mc-option-btn');

const imageArrowsAnswerArea = document.getElementById('image-arrows-answer-area');
const imageArrowsProgressBadge = document.getElementById('image-arrows-progress-badge');
const imageArrowsInputsList = document.getElementById('image-arrows-inputs-list');

// Anki DOM Elements
const ankiAnswerContainer = document.getElementById('anki-answer-container');
const ankiAnswerText = document.getElementById('anki-answer-text');
const ankiAnswerImageContainer = document.getElementById('anki-answer-image-container');
const ankiAnswerImagePlaceholder = document.getElementById('anki-answer-image-placeholder');
const ankiAnswerImageError = document.getElementById('anki-answer-image-error');
const ankiAnswerImage = document.getElementById('anki-answer-image');

const ankiControlsArea = document.getElementById('anki-controls-area');
const ankiUnflippedControls = document.getElementById('anki-unflipped-controls');
const ankiFlippedControls = document.getElementById('anki-flipped-controls');
const ankiFlipBtn = document.getElementById('anki-flip-btn');
const ankiBtnAgain = document.getElementById('anki-btn-again');
const ankiBtnHard = document.getElementById('anki-btn-hard');
const ankiBtnGood = document.getElementById('anki-btn-good');
const ankiBtnEasy = document.getElementById('anki-btn-easy');

// Voice "Explicar em voz alta" DOM Elements
const voiceAnswerContainer = document.getElementById('voice-answer-container');
const voiceUserTranscriptDisplay = document.getElementById('voice-user-transcript-display');
const voiceReferenceTextDisplay = document.getElementById('voice-reference-text-display');
const voiceAiFeedbackText = document.getElementById('voice-ai-feedback-text');
const voiceEvaluationRatingBadge = document.getElementById('voice-evaluation-rating-badge');
const voiceKeyPointsContainer = document.getElementById('voice-key-points-container');
const voicePointsCoveredRow = document.getElementById('voice-points-covered-row');
const voicePointsCoveredChips = document.getElementById('voice-points-covered-chips');
const voicePointsMissedRow = document.getElementById('voice-points-missed-row');
const voicePointsMissedChips = document.getElementById('voice-points-missed-chips');

const voiceControlsArea = document.getElementById('voice-controls-area');
const voiceMicContainer = document.getElementById('voice-mic-container');
const voiceWavyBlur = document.getElementById('voice-wavy-blur');
const voiceThinkingOrb = document.getElementById('voice-thinking-orb');
const voiceMicBtn = document.getElementById('voice-mic-btn');
const voiceMicIcon = document.getElementById('voice-mic-icon');
const voiceThinkingMsg = document.getElementById('voice-thinking-msg');
const voiceCantSpeakBtn = document.getElementById('voice-cant-speak-btn');

const voiceEvaluatedControls = document.getElementById('voice-evaluated-controls');
const voiceBtnAgain = document.getElementById('voice-btn-again');
const voiceBtnHard = document.getElementById('voice-btn-hard');
const voiceBtnGood = document.getElementById('voice-btn-good');
const voiceBtnEasy = document.getElementById('voice-btn-easy');
const voiceContinueBtn = document.getElementById('voice-continue-btn');

// Hamburger Menu Speech Switch
const speechCardsSwitch = document.getElementById('speech-cards-switch');
const speechCardsSubtitle = document.getElementById('speech-cards-subtitle');

// Edit Modal Voice Fields
const editVoiceAnswerGroup = document.getElementById('edit-voice-answer-group');
const editVoiceAnswerInput = document.getElementById('edit-voice-answer-input');

// Voice State Variables (Multimodal Audio Recording & Live Reactive Wave Visualizer)
let isVoiceCardsMutedThisSession = false;
let mediaRecorder = null;
let mediaStream = null;
let audioCtx = null;
let audioAnalyser = null;
let audioAnimFrame = null;
let recordedAudioChunks = [];
let recordedMimeType = 'audio/webm';
let isVoiceRecording = false;
let isVoiceSubmitting = false;
let lastVoiceRating = 'good';

// Edit Modal Additional Fields
const editAnswer1Group = document.getElementById('edit-answer-1-group');
const editAnswer1Label = document.getElementById('edit-answer-1-label');
const editAnkiAnswerGroup = document.getElementById('edit-anki-answer-group');
const editAnkiAnswerInput = document.getElementById('edit-anki-answer-input');
const editMcOptionsGroup = document.getElementById('edit-mc-options-group');
const editMcOptionsList = document.getElementById('edit-mc-options-list');
const editAddMcOptBtn = document.getElementById('edit-add-mc-opt-btn');
const editAnsImageGroup = document.getElementById('edit-ans-image-group');
const editAnsImagePreviewContainer = document.getElementById('edit-ans-image-preview-container');
const editAnsImagePreview = document.getElementById('edit-ans-image-preview');
const editRemoveAnsImageBtn = document.getElementById('edit-remove-ans-image-btn');
const editCropAnsImageBtn = document.getElementById('edit-crop-ans-image-btn');
const editAnsImageUrlInput = document.getElementById('edit-ans-image-url-input');
const editFillAnswerGroup = document.getElementById('edit-fill-answer-group');
const editFillAnswerInput = document.getElementById('edit-fill-answer-input');

const editImageArrowsGroup = document.getElementById('edit-image-arrows-group');
const editArrowsCountBadge = document.getElementById('edit-arrows-count-badge');
const editArrowsEmptyMsg = document.getElementById('edit-arrows-empty-msg');
const editArrowsInputsList = document.getElementById('edit-arrows-inputs-list');

const submitBtn = document.getElementById('submit-btn');
const nextQuestionBtn = document.getElementById('next-question-btn');

const aiToggleBtn = document.getElementById('ai-toggle-btn');
const aiIconOff = document.getElementById('ai-icon-off');
const aiIconOn = document.getElementById('ai-icon-on');

const askAiBtn = document.getElementById('ask-ai-btn');
const aiChatContainer = document.getElementById('ai-chat-container');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

const canvas = document.getElementById('background-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// Inicializa subsistema de efeitos
initEffects({ canvas, shockwaveContainer, questionCard });

// --- GAME STATE ---
let activeMode = 'normal'; // 'normal' or 'notebook'
let allQuestions = [];
let questionsPool = [];
let score = 0;
let notebookReviewsCount = 0;
let currentQuestion = {};
let currentQuestionIndexInPool = -1;
let isFirstQuestion = true;
let isAnimating = false;
let currentStep = 0;
let consecutiveDueCardsCount = 0;
let consecutiveNewCardsCount = 0;
let lastCardTopic = '';
let isAnkiFlipped = false;
let questionStartTime = Date.now();

// --- UI UTILITIES ---
const imageLoadSeqMap = new WeakMap();

function setupCardImageWithPlaceholder(srcUrl, imgElem, containerElem, placeholderElem, crop = null, arrows = [], { showNumbers = false, onArrowClick = null, errorElem = null, isImageArrows = false } = {}) {
    if (!containerElem || !imgElem) return;

    const safeUrl = sanitizeImageUrl(srcUrl);
    const isArrowCard = Boolean(showNumbers || isImageArrows || currentQuestion?.type === 'image_arrows');

    if (!safeUrl) {
        if (isArrowCard) {
            containerElem.classList.remove('hidden');
            if (placeholderElem) placeholderElem.classList.add('hidden');
            imgElem.classList.add('hidden');
            imgElem.src = '';
            const oldWrap = containerElem.querySelector('.annotated-image-wrapper');
            if (oldWrap) oldWrap.remove();
            if (errorElem) {
                errorElem.classList.remove('hidden');
            }
            return;
        }
        containerElem.classList.add('hidden');
        if (placeholderElem) placeholderElem.classList.add('hidden');
        if (errorElem) errorElem.classList.add('hidden');
        imgElem.classList.add('hidden');
        imgElem.classList.remove('opacity-100');
        imgElem.classList.add('opacity-0');
        imgElem.src = '';
        const oldWrap = containerElem.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
        return;
    }

    const loadSeq = (imageLoadSeqMap.get(imgElem) || 0) + 1;
    imageLoadSeqMap.set(imgElem, loadSeq);

    // CRITICAL: Immediately clear src and hide previous card's image to prevent rendering the previous image
    imgElem.classList.add('hidden');
    imgElem.classList.remove('opacity-100');
    imgElem.classList.add('opacity-0');
    imgElem.src = '';
    const oldWrap = containerElem.querySelector('.annotated-image-wrapper');
    if (oldWrap) oldWrap.remove();
    if (errorElem) errorElem.classList.add('hidden');

    renderAnnotatedImage({
        container: containerElem,
        imgElem,
        placeholderElem,
        errorElem,
        imageUrl: safeUrl,
        crop,
        arrows,
        showNumbers,
        onArrowClick,
        isImageArrows: isArrowCard,
        alt: imgElem.alt || t('card_image') || 'Imagem do Flashcard',
        maxHClass: containerElem.id === 'anki-answer-image-container' ? 'max-h-48 sm:max-h-72' : 'max-h-36 xs:max-h-48 sm:max-h-64',
        zoomable: true,
        onClick: () => {
            openZoomForCard(safeUrl, crop, arrows, { showNumbers });
        }
    });
}

function openZoomForCard(url, crop = null, arrows = [], { showNumbers = false } = {}) {
    const safeUrl = sanitizeImageUrl(url);
    if (!safeUrl || !imageZoomModal) return;

    const zoomWrapper = document.getElementById('zoomed-image-wrapper') || imageZoomModal.querySelector('.relative');
    if (zoomWrapper && zoomedImage) {
        renderAnnotatedImage({
            container: zoomWrapper,
            imgElem: zoomedImage,
            imageUrl: safeUrl,
            crop,
            arrows,
            showNumbers,
            alt: t('zoomed_image') || 'Imagem Ampliada',
            maxHClass: 'max-h-[85vh]',
            zoomable: false
        });
    } else if (zoomedImage) {
        zoomedImage.src = safeUrl;
    }
    imageZoomModal.classList.remove('hidden');
}
function showNotificationPill(message, iconName, isWarning = false) {
    const existing = document.getElementById('notification-pill');
    if (existing) existing.remove();

    const pill = document.createElement('div');
    pill.id = 'notification-pill';
    // Samsung One UI style: pill-shaped, superior, blurred, centered
    pill.className = `fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-2.5 rounded-full shadow-2xl backdrop-blur-xl border border-white/20 transition-all duration-500 transform -translate-y-20 opacity-0 ${isWarning ? 'bg-yellow-100/90' : 'bg-white/90'}`;

    const iconImg = document.createElement('img');
    iconImg.src = `../assets/img/${encodeURIComponent(iconName)}`;
    iconImg.className = 'w-5 h-5';
    iconImg.alt = 'icon';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'text-[13px] font-medium text-gray-800 whitespace-nowrap';
    msgSpan.textContent = message;

    pill.append(iconImg, msgSpan);

    document.body.appendChild(pill);

    requestAnimationFrame(() => {
        pill.classList.remove('-translate-y-20', 'opacity-0');
        pill.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
        pill.classList.remove('translate-y-0', 'opacity-100');
        pill.classList.add('-translate-y-20', 'opacity-0');
        setTimeout(() => pill.remove(), 500);
    }, 4000);
}

// --- HAPTIC FEEDBACK (VIBRATION API) delegado para ./engine/effects.js ---

// --- CARD ANIMATION UTILITIES ---
function getHeaderScoreTarget() {
    const scoreVal = document.getElementById('score');
    const scoreContainer = document.getElementById('score-container');
    const scoreWrapper = document.getElementById('score-wrapper');
    const headerContainer = document.getElementById('header-pinned-stats-container') || document.getElementById('header-stats-trigger');

    if (scoreVal && scoreVal.offsetParent !== null) return scoreVal;
    if (scoreContainer && scoreContainer.offsetParent !== null) return scoreContainer;
    if (scoreWrapper && scoreWrapper.offsetParent !== null) return scoreWrapper;
    return headerContainer || scoreWrapper || scoreContainer || scoreVal || document.body;
}

function animateCardToBack(callback) {
    if (questionsPool.length === 0) {
        if (callback) callback();
        return;
    }
    if (!isAnimationsEnabled()) {
        if (callback) callback();
        return;
    }
    if (isAnimating) {
        if (callback) callback();
        return;
    }
    isAnimating = true;

    const rect = questionCard.getBoundingClientRect();
    const clone = questionCard.cloneNode(true);
    clone.id = 'anim-card-back-clone';
    clone.style.position = 'absolute';
    clone.style.top = `${questionCard.offsetTop}px`;
    clone.style.left = `${questionCard.offsetLeft}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '25';

    gameContainer.appendChild(clone);

    if (callback) callback();

    questionCard.style.opacity = '0.85';
    questionCard.style.transform = 'scale(0.96)';
    questionCard.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';

    clone.classList.add('anim-card-to-back');

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
        triggerHaptic('cardToBack');
    }

    setTimeout(() => {
        if (clone && clone.parentElement) {
            clone.style.zIndex = '5';
        }
    }, 200);

    requestAnimationFrame(() => {
        setTimeout(() => {
            questionCard.style.opacity = '1';
            questionCard.style.transform = 'scale(1)';
        }, 150);
    });

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        triggerHaptic('stop');
        clone.remove();
        questionCard.style.transition = '';
        questionCard.style.transform = '';
        questionCard.style.opacity = '';
        isAnimating = false;
    };

    clone.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 700);
}

function animateCardToHeader(callback) {
    if (questionsPool.length === 0) {
        if (callback) callback();
        return;
    }
    if (!isAnimationsEnabled()) {
        if (callback) callback();
        return;
    }
    if (isAnimating) {
        if (callback) callback();
        return;
    }
    isAnimating = true;

    const cardRect = questionCard.getBoundingClientRect();
    const targetEl = getHeaderScoreTarget();
    const targetRect = targetEl.getBoundingClientRect();

    const clone = questionCard.cloneNode(true);
    clone.id = 'flying-card-to-header';
    clone.style.position = 'fixed';
    clone.style.top = `${cardRect.top}px`;
    clone.style.left = `${cardRect.left}px`;
    clone.style.width = `${cardRect.width}px`;
    clone.style.height = `${cardRect.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '9999';
    clone.style.transformOrigin = 'center center';
    clone.classList.add('glow-correct');
    document.body.appendChild(clone);

    questionCard.style.opacity = '0';

    const deltaX = (targetRect.left + targetRect.width / 2) - (cardRect.left + cardRect.width / 2);
    const deltaY = (targetRect.top + targetRect.height / 2) - (cardRect.top + cardRect.height / 2);

    const anim = clone.animate([
        {
            transform: 'translate(0px, 0px) scale(1) rotate(0deg)',
            opacity: 1,
            filter: 'brightness(1)'
        },
        {
            transform: `translate(${deltaX * 0.35}px, ${deltaY * 0.45 - 25}px) scale(0.65) rotate(-6deg)`,
            opacity: 0.95,
            filter: 'brightness(1.1)',
            offset: 0.45
        },
        {
            transform: `translate(${deltaX * 0.85}px, ${deltaY * 0.9}px) scale(0.2) rotate(-10deg)`,
            opacity: 0.7,
            filter: 'brightness(1.2)',
            offset: 0.85
        },
        {
            transform: `translate(${deltaX}px, ${deltaY}px) scale(0.04) rotate(-12deg)`,
            opacity: 0,
            filter: 'brightness(1.4)',
            offset: 1
        }
    ], {
        duration: 650,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        fill: 'forwards'
    });

    let finished = false;
    const finishFlight = () => {
        if (finished) return;
        finished = true;
        clone.remove();
        triggerHaptic('scorePulse');

        const pulseTarget = document.getElementById('score') || targetEl;
        pulseTarget.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(1.4)', filter: 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.9))' },
            { transform: 'scale(0.95)' },
            { transform: 'scale(1)' }
        ], {
            duration: 350,
            easing: 'ease-out'
        });

        if (callback) callback();
        questionCard.style.opacity = '1';
        questionCard.animate([
            { opacity: 0, transform: 'scale(0.96)' },
            { opacity: 1, transform: 'scale(1)' }
        ], {
            duration: 250,
            easing: 'ease-out'
        });
        isAnimating = false;
    };

    anim.onfinish = finishFlight;
    setTimeout(finishFlight, 800);
}

function animateCardsFromHeaderToDeck(callback) {
    if (isAnimating) {
        if (callback) callback();
        return;
    }
    isAnimating = true;

    const cardRect = questionCard.getBoundingClientRect();
    const targetEl = getHeaderScoreTarget();
    const targetRect = targetEl.getBoundingClientRect();

    const deltaX = (targetRect.left + targetRect.width / 2) - (cardRect.left + cardRect.width / 2);
    const deltaY = (targetRect.top + targetRect.height / 2) - (cardRect.top + cardRect.height / 2);

    const pulseTarget = document.getElementById('score') || targetEl;
    pulseTarget.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.25)', filter: 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.8))' },
        { transform: 'scale(1)' }
    ], {
        duration: 300,
        easing: 'ease-out'
    });

    const cardCount = 3;
    let finishedCount = 0;

    for (let i = 0; i < cardCount; i++) {
        setTimeout(() => {
            const cardEl = document.createElement('div');
            cardEl.className = 'fixed rounded-lg shadow-xl border border-blue-200 bg-white flex items-center justify-center pointer-events-none';
            cardEl.style.width = `${cardRect.width}px`;
            cardEl.style.height = `${cardRect.height}px`;
            cardEl.style.top = `${cardRect.top}px`;
            cardEl.style.left = `${cardRect.left}px`;
            cardEl.style.zIndex = `${9990 + i}`;
            cardEl.style.transformOrigin = 'center center';
            cardEl.innerHTML = `
                <div class="flex flex-col items-center justify-center gap-2 text-blue-500 opacity-70">
                    <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                    </svg>
                </div>
            `;
            document.body.appendChild(cardEl);

            const rotation = i % 2 === 0 ? 4 : -4;
            const anim = cardEl.animate([
                {
                    transform: `translate(${deltaX}px, ${deltaY}px) scale(0.04) rotate(-12deg)`,
                    opacity: 0.3,
                    filter: 'brightness(1.3)'
                },
                {
                    transform: `translate(${deltaX * 0.4}px, ${deltaY * 0.35 - 20}px) scale(0.65) rotate(${rotation}deg)`,
                    opacity: 0.95,
                    filter: 'brightness(1.05)',
                    offset: 0.55
                },
                {
                    transform: 'translate(0px, 0px) scale(1) rotate(0deg)',
                    opacity: 1,
                    filter: 'brightness(1)',
                    offset: 1
                }
            ], {
                duration: 550,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                fill: 'forwards'
            });

            anim.onfinish = () => {
                cardEl.remove();
                finishedCount++;
                if (finishedCount === cardCount) {
                    questionCard.animate([
                        { transform: 'scale(1)' },
                        { transform: 'scale(1.02)' },
                        { transform: 'scale(1)' }
                    ], {
                        duration: 200,
                        easing: 'ease-out'
                    });
                    if (callback) callback();
                    isAnimating = false;
                }
            };
        }, i * 90);
    }
}

// --- CANVAS ANIMATION & VISUAL EFFECTS delegado para ./engine/effects.js ---


// --- HELPER: RENDER FILL-IN-THE-BLANKS QUESTION WITH INTERACTIVE INPUTS ---
function renderFillBlanksQuestion(text) {
    if (!text) return '';
    // 1. Temporarily extract block and inline LaTeX math to protect math underscores
    const mathBlocks = [];
    let placeholderText = text.replace(/\\\[([\s\S]*?)\\\]/g, (match) => {
        mathBlocks.push(match);
        return `%%MATH_${mathBlocks.length - 1}%%`;
    });
    placeholderText = placeholderText.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
        mathBlocks.push(match);
        return `%%MATH_${mathBlocks.length - 1}%%`;
    });
    placeholderText = placeholderText.replace(/\\\(([\s\S]*?)\\\)/g, (match) => {
        mathBlocks.push(match);
        return `%%MATH_${mathBlocks.length - 1}%%`;
    });
    placeholderText = placeholderText.replace(/\$(?!\s)((?:\\\$|[^\$])+?)(?<!\s)\$/g, (match) => {
        mathBlocks.push(match);
        return `%%MATH_${mathBlocks.length - 1}%%`;
    });

    // 2. Identify blank spots: e.g. '_', '___', '[_]', '[___]'
    const blankRegex = /(?:\[\s*_{1,}\s*\]|(?<![a-zA-Z0-9\u00C0-\u017F])_{1,}(?![a-zA-Z0-9\u00C0-\u017F]))/g;
    let spotIndex = 0;
    placeholderText = placeholderText.replace(blankRegex, () => {
        const spotMarker = `%%FILL_SPOT_${spotIndex}%%`;
        spotIndex++;
        return spotMarker;
    });

    // 3. Restore math blocks before markdown parsing
    placeholderText = placeholderText.replace(/%%MATH_(\d+)%%/g, (_, idx) => mathBlocks[parseInt(idx, 10)] || '');

    // 4. Render Markdown and KaTeX math
    let renderedHtml = renderMathAndMarkdown(placeholderText);

    // 5. Replace each spot token with an interactive inline <input>
    const totalSpots = spotIndex;
    for (let i = 0; i < totalSpots; i++) {
        const enterHint = i < totalSpots - 1 ? 'next' : 'done';
        const inputHtml = `<input type="search" name="search" class="fill-blank-input game-answer-input" data-blank-index="${i}" enterkeyhint="${enterHint}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-autocomplete="none" data-form-type="other" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">`;
        renderedHtml = renderedHtml.split(`%%FILL_SPOT_${i}%%`).join(inputHtml);
    }

    return sanitizeHtml(renderedHtml, {
        ADD_TAGS: ['input'],
        ADD_ATTR: ['type', 'name', 'class', 'data-blank-index', 'enterkeyhint', 'autocomplete', 'autocorrect', 'autocapitalize', 'spellcheck', 'aria-autocomplete', 'data-form-type', 'data-lpignore', 'data-1p-ignore', 'data-bwignore']
    });
}

function initFillBlankInputs() {
    const inputs = Array.from(questionCard.querySelectorAll('.fill-blank-input'));
    if (inputs.length === 0) return;

    inputs.forEach((input, index) => {
        const updateWidth = () => {
            const len = input.value.length;
            input.style.width = Math.max(64, Math.min(240, (len + 2) * 11)) + 'px';
        };
        input.addEventListener('input', updateWidth);

        input.addEventListener('focus', () => {
            document.body.classList.add('keyboard-open');
            setTimeout(keepCardInFocus, 100);
            setTimeout(keepCardInFocus, 300);
        });

        input.addEventListener('blur', () => {
            document.body.classList.remove('keyboard-open');
        });

        input.addEventListener('keydown', (e) => {
            if (e.isComposing) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                if (index < inputs.length - 1) {
                    inputs[index + 1].focus();
                    inputs[index + 1].select();
                } else {
                    handleOpenSubmit();
                }
            }
        });
    });

    setTimeout(() => {
        inputs[0]?.focus();
    }, 50);
}

function initImageArrowsInputs() {
    if (!imageArrowsInputsList) return;
    imageArrowsInputsList.innerHTML = '';

    const arrows = Array.isArray(currentQuestion?.imageArrows) ? currentQuestion.imageArrows : [];
    if (imageArrowsProgressBadge) {
        imageArrowsProgressBadge.textContent = `0/${arrows.length}`;
    }

    arrows.forEach((arrow, i) => {
        const theme = getArrowColorTheme(arrow.color);
        const row = document.createElement('div');
        row.className = "flex items-center gap-2.5 p-2 sm:p-2.5 rounded-2xl border transition shadow-2xs";
        row.id = `game-arrow-row-${i}`;
        row.style.backgroundColor = theme.bg;
        row.style.borderColor = theme.border;

        // Circular number badge at arrow start
        const badge = document.createElement('div');
        badge.className = "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-xs sm:text-sm flex-shrink-0 shadow-xs select-none";
        badge.style.backgroundColor = theme.badgeBg;
        badge.style.color = theme.badgeText;
        badge.textContent = String(i + 1);

        // Input and feedback container
        const inputWrap = document.createElement('div');
        inputWrap.className = "flex-1 min-w-0";

        const input = document.createElement('input');
        input.type = 'search';
        input.id = `game-arrow-input-${i}`;
        input.className = "game-answer-input game-arrow-input w-full px-3 py-2 sm:px-3.5 sm:py-2.5 text-sm sm:text-base font-semibold bg-white/95 rounded-xl border outline-none transition focus:ring-2 focus:ring-blue-500 text-[var(--md-sys-color-on-surface,#1e293b)] shadow-2xs";
        input.style.borderColor = theme.border;
        input.placeholder = t('structure_placeholder', { num: i + 1 }) || `Estrutura ${i + 1}...`;
        input.autocomplete = "off";
        input.autocorrect = "off";
        input.autocapitalize = "off";
        input.spellcheck = false;
        input.enterKeyHint = i === arrows.length - 1 ? 'done' : 'next';
        input.dataset.arrowIdx = String(i);

        const feedbackDiv = document.createElement('div');
        feedbackDiv.id = `game-arrow-feedback-${i}`;
        feedbackDiv.className = "hidden text-xs font-bold mt-1 text-green-700 flex items-center gap-1";

        input.addEventListener('keydown', (e) => {
            if (e.isComposing) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                if (i < arrows.length - 1) {
                    const nextInp = document.getElementById(`game-arrow-input-${i + 1}`);
                    if (nextInp) {
                        nextInp.focus();
                        nextInp.select();
                    }
                } else {
                    handleOpenSubmit();
                }
            }
        });

        input.addEventListener('input', () => {
            updateImageArrowsProgress();
        });

        inputWrap.appendChild(input);
        inputWrap.appendChild(feedbackDiv);
        row.appendChild(badge);
        row.appendChild(inputWrap);
        imageArrowsInputsList.appendChild(row);
    });

    setTimeout(() => {
        const firstInp = document.getElementById('game-arrow-input-0');
        firstInp?.focus();
    }, 60);
}

function updateImageArrowsProgress() {
    if (!imageArrowsProgressBadge) return;
    const inputs = Array.from(document.querySelectorAll('.game-arrow-input'));
    const filled = inputs.filter(inp => inp.value.trim().length > 0).length;
    imageArrowsProgressBadge.textContent = `${filled}/${inputs.length}`;
}

function focusGameArrowInput(idx) {
    const input = document.getElementById(`game-arrow-input-${idx}`);
    if (input && !input.disabled) {
        input.focus();
        input.select();
        const row = document.getElementById(`game-arrow-row-${idx}`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            row.classList.add('ring-2', 'ring-blue-400');
            setTimeout(() => row.classList.remove('ring-2', 'ring-blue-400'), 1200);
        }
    }
}

// --- STREAK COUNTER LOGIC & ANIMATIONS ---
function getStreakColorConfig(streak) {
    if (streak < 3) {
        return {
            active: false,
            gradient: '',
            border: '',
            glow: '',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(255, 255, 255, 0.8) 50%, transparent 100%)'
        };
    }
    if (streak === 3) {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #eab308, #ca8a04)',
            border: '#eab308',
            glow: '0 0 10px rgba(234, 179, 8, 0.45)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(254, 240, 138, 0.9) 50%, transparent 100%)'
        };
    } else if (streak === 4) {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: '#f59e0b',
            glow: '0 0 12px rgba(245, 158, 11, 0.5)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(253, 230, 138, 0.9) 50%, transparent 100%)'
        };
    } else if (streak === 5) {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #f97316, #ea580c)',
            border: '#f97316',
            glow: '0 0 14px rgba(249, 115, 22, 0.55)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(254, 215, 170, 0.9) 50%, transparent 100%)'
        };
    } else if (streak === 6) {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #fb923c, #dc2626)',
            border: '#ea580c',
            glow: '0 0 16px rgba(234, 88, 12, 0.6)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(254, 205, 211, 0.9) 50%, transparent 100%)'
        };
    } else if (streak === 7) {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #f87171, #ef4444)',
            border: '#ef4444',
            glow: '0 0 18px rgba(239, 68, 68, 0.65)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(254, 202, 202, 0.9) 50%, transparent 100%)'
        };
    } else if (streak === 8) {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: '#dc2626',
            glow: '0 0 20px rgba(220, 38, 38, 0.7)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(255, 255, 255, 0.9) 50%, transparent 100%)'
        };
    } else if (streak === 9) {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            border: '#b91c1c',
            glow: '0 0 22px rgba(185, 28, 28, 0.75)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(255, 255, 255, 0.95) 50%, transparent 100%)'
        };
    } else {
        return {
            active: true,
            gradient: 'linear-gradient(135deg, #e11d48, #991b1b)',
            border: '#e11d48',
            glow: '0 0 25px rgba(225, 29, 72, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
            shimmerGradient: 'linear-gradient(0deg, transparent 0%, rgba(255, 255, 255, 1) 50%, transparent 100%)'
        };
    }
}

function updateStreakUI(animate = false) {
    if (!streakPill || !streakCount) return;
    const config = getStreakColorConfig(currentStreak);

    streakCount.textContent = currentStreak;

    if (config.active) {
        if (streakBgColor) {
            streakBgColor.style.background = config.gradient;
            streakBgColor.style.opacity = '1';
        }
        streakPill.style.borderColor = config.border;
        streakPill.style.boxShadow = config.glow;
        streakPill.style.color = '#ffffff';

        if (streakFireIcon) {
            streakFireIcon.style.filter = 'none';
            streakFireIcon.style.opacity = '1';
            streakFireIcon.style.transform = currentStreak >= 8 ? 'scale(1.25)' : 'scale(1.1)';
        }

        streakCount.className = 'relative z-10 font-black tracking-tight text-xs text-white drop-shadow-sm';

        if (animate && streakShimmerSweep) {
            streakShimmerSweep.style.background = config.shimmerGradient;
            streakShimmerSweep.classList.remove('anim-streak-up', 'anim-streak-down');
            void streakShimmerSweep.offsetWidth;
            streakShimmerSweep.classList.add('anim-streak-up');

            streakPill.classList.remove('anim-streak-pop');
            void streakPill.offsetWidth;
            streakPill.classList.add('anim-streak-pop');
        }
    } else {
        if (streakBgColor) {
            streakBgColor.style.opacity = '0';
        }
        streakPill.style.borderColor = '';
        streakPill.style.boxShadow = '';
        streakPill.style.color = '';

        if (streakFireIcon) {
            streakFireIcon.style.filter = 'grayscale(1)';
            streakFireIcon.style.opacity = '0.6';
            streakFireIcon.style.transform = 'scale(0.95)';
        }

        streakCount.className = 'relative z-10 font-black tracking-tight text-xs text-gray-600';
    }
}

function incrementStreak() {
    currentStreak++;
    saveGameState();
    const shouldShimmer = currentStreak >= 3;
    updateStreakUI(shouldShimmer);
    if (shouldShimmer) {
        triggerHaptic('streakUp');
        playHeaderShimmer('fire');
    }
}

function resetStreak() {
    lastStreakBeforeWrong = currentStreak;
    const hadStreak = currentStreak > 0;
    currentStreak = 0;
    saveGameState();

    if (hadStreak && streakShimmerSweep) {
        // Shimmer from top to bottom graying out the pill back to 0
        streakShimmerSweep.style.background = 'linear-gradient(180deg, rgba(156, 163, 175, 0.95) 0%, rgba(107, 114, 128, 0.9) 50%, rgba(75, 85, 99, 0.8) 100%)';
        streakShimmerSweep.classList.remove('anim-streak-up', 'anim-streak-down');
        void streakShimmerSweep.offsetWidth;
        streakShimmerSweep.classList.add('anim-streak-down');

        if (lastStreakBeforeWrong >= 3) {
            triggerHaptic('streakReset');
        }

        setTimeout(() => {
            updateStreakUI(false);
        }, 220);
    } else {
        updateStreakUI(false);
    }
}

function restoreStreakAfterAiCorrection() {
    currentStreak = lastStreakBeforeWrong + 1;
    saveGameState();
    updateStreakUI(currentStreak >= 3);
}

// --- DAILY STREAK MANAGEMENT ---
function updateDailyStreakUI() {
    if (!notebookStreakCount || !notebookStreakFire) return;
    const streakData = getDailyStreak();
    notebookStreakCount.textContent = streakData.streak;

    if (streakData.isTodayStudied) {
        notebookStreakFire.classList.remove('is-desaturated');
        notebookStreakCount.classList.remove('text-gray-500', 'text-gray-400');
        notebookStreakCount.classList.add('text-amber-600', 'font-black');
        if (notebookStreakBadge) {
            notebookStreakBadge.classList.remove('bg-gray-100', 'border-gray-200/80');
            notebookStreakBadge.classList.add('bg-amber-50', 'border-amber-200/90');
        }
    } else {
        notebookStreakFire.classList.add('is-desaturated');
        notebookStreakCount.classList.remove('text-amber-600', 'font-black');
        notebookStreakCount.classList.add('text-gray-500');
        if (notebookStreakBadge) {
            notebookStreakBadge.classList.add('bg-gray-100', 'border-gray-200/80');
            notebookStreakBadge.classList.remove('bg-amber-50', 'border-amber-200/90');
        }
    }
}

function handleDailyStreakOnCardAnswered() {
    const res = recordDailyCardAnswered();
    updateDailyStreakUI();
    if (res.isFirstCardToday) {
        playHeaderShimmer('fire');
        triggerHaptic('streakUp');
        if (res.streakProtectedByFreeze) {
            showNotificationPill(t('streak_protected_freeze', { count: res.streak }), 'fire.svg');
        } else if (res.freezeAwarded) {
            showNotificationPill(t('freeze_awarded_toast', { count: res.streak }), 'fire.svg');
        } else {
            showNotificationPill(t('daily_streak_toast', { count: res.streak, unit: res.streak === 1 ? t('day_unit_singular') : t('day_unit_plural') }), 'fire.svg');
        }
    }
}

// --- SPACED REPETITION & LEAN ALGORITHM HELPERS delegados para ./engine/scheduler.js & ./engine/notebook-scheduler.js ---
let precomputedNextCard = null;

/**
 * Precomputes candidate for the next step while the user is thinking on the current card.
 * Offloads algorithm execution from the animated "next card" transition.
 */
function precomputeNextCandidate() {
    if (!questionsPool || questionsPool.length === 0) {
        precomputedNextCard = null;
        return;
    }

    if (questionsPool.length === 1) {
        precomputedNextCard = questionsPool[0];
        console.log("[Algorithm] Apenas 1 card no pool. Próximo selecionado:", (precomputedNextCard.description || '').slice(0, 30));
        return;
    }

    const nextStep = currentStep + 1;
    const candidates = questionsPool.filter(c => c !== currentQuestion);
    const poolToUse = candidates.length > 0 ? candidates : questionsPool;

    if (activeMode === 'notebook') {
        precomputedNextCard = selectNextNotebookCard({
            pool: poolToUse,
            currentStep: nextStep,
            lastCardTopic,
            lastSourceDeck: currentQuestion?.sourceDeck || '',
            currentQuestion
        });
    } else {
        precomputedNextCard = selectNextCard(poolToUse, nextStep, consecutiveDueCardsCount, lastCardTopic, currentQuestion, consecutiveNewCardsCount);
    }
}

function schedulePrecomputeNextCard() {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => precomputeNextCandidate(), { timeout: 100 });
    } else {
        setTimeout(precomputeNextCandidate, 0);
    }
}

export function getDeckCompletionAdviceForHour(hour = new Date().getHours()) {
    // 05:00 - 11:59: De manhã -> Alongamento
    if (hour >= 5 && hour < 12) {
        return {
            icon: 'self_improvement',
            text: t('advice_stretch')
        };
    }
    // 12:00 - 13:59: De meio-dia -> Almoçar
    if (hour >= 12 && hour < 14) {
        return {
            icon: 'restaurant',
            text: t('advice_lunch')
        };
    }
    // 14:00 - 17:59: De tarde -> Exercício físico
    if (hour >= 14 && hour < 18) {
        return {
            icon: 'directions_run',
            text: t('advice_exercise')
        };
    }
    // 18:00 - 20:59: Final de tarde -> Ler ou relaxar
    if (hour >= 18 && hour < 21) {
        return {
            icon: 'auto_stories',
            text: t('advice_afternoon')
        };
    }
    // 21:00 - 04:59: De noite -> Dormir (Sono REM)
    return {
        icon: 'bedtime',
        text: t('advice_sleep')
    };
}

function updateDeckCompletionTip() {
    const tipIcon = document.getElementById('deck-completion-tip-icon');
    const tipText = document.getElementById('deck-completion-tip-text');
    if (!tipIcon && !tipText) return;

    const advice = getDeckCompletionAdviceForHour();
    if (tipIcon) tipIcon.textContent = advice.icon;
    if (tipText) tipText.textContent = advice.text;
}

function showDeckCompletionScreen() {
    try {
        clearBalls();
        isAnimating = false;
        document.getElementById('flying-card-to-header')?.remove();
        document.getElementById('anim-card-back-clone')?.remove();
        if (questionCard) {
            questionCard.style.opacity = '1';
            questionCard.style.transform = '';
            questionCard.classList.remove('glow-correct', 'glow-incorrect', 'card-shake');
        }
        precomputedNextCard = null;
        const completedSession = completeCurrentSession();
        showNotificationPill(t('session_completed_toast'), "stats.svg");

        // Silky-smooth translucent gradient shockwave (GPU-composited)
        playCompletionShockwave();

        // Lightweight victory confetti with small delay to keep framerates locked at 60fps
        setTimeout(() => {
            launchCelebrationParticles(45);
        }, 420);

        // Hide normal card UI elements
        deleteCardBtn?.classList.add('hidden');
        bookmarkCardBtn?.classList.add('hidden');
        questionImageContainer?.classList.add('hidden');
        if (questionImage) questionImage.src = '';
        questionText?.classList.add('hidden');
        ankiAnswerContainer?.classList.add('hidden');
        ankiControlsArea?.classList.add('hidden');
        actionButtonsArea?.classList.add('hidden');
        openAnswerArea?.classList.add('hidden');
        openDoubleAnswerArea?.classList.add('hidden');
        mcAnswerArea?.classList.add('hidden');
        flashcardAnswerForm?.classList.add('hidden');
        correctionOptions?.classList.add('hidden');

        // Populate completion stats
        const total = completedSession?.cardsAnswered || (allQuestions ? allQuestions.filter(isPlayableCard).length : 0);
        if (completionStatCards) {
            completionStatCards.textContent = total;
        }
        if (completionStatAcc) {
            const acc = completedSession?.accuracy !== undefined ? completedSession.accuracy :
                (total > 0 && completedSession?.correctCount !== undefined ? Math.round((completedSession.correctCount / total) * 100) : 100);
            completionStatAcc.textContent = `${acc}%`;
        }
        if (completionStatTime) {
            completionStatTime.textContent = formatTimeDisplay(completedSession?.durationSeconds || 0);
        }
        if (completionStatStreak) {
            const streakVal = completedSession?.bestStreak || completedSession?.maxStreak || currentStreak || 0;
            completionStatStreak.textContent = streakVal;
        }
        if (deckCompletionSubtitle) {
            const dTitle = (deckTitle?.textContent || '').trim() || 'deste baralho';
            deckCompletionSubtitle.textContent = t('all_cards_completed_subtitle', { title: dTitle });
        }

        // Dynamically update time-of-day health and neuro-consolidation advice
        updateDeckCompletionTip();

        // Ensure remaining counter reflects 0 on full deck completion
        if (questionsLeftDisplay) {
            questionsLeftDisplay.textContent = '0';
        }

        // Unhide completion card holder view
        if (deckCompletionView) {
            deckCompletionView.classList.remove('hidden');
        }
        questionCard?.classList.remove('hidden');
    } catch (err) {
        console.error("[Game] Erro em showDeckCompletionScreen:", err);
        // Fallback: guarantee view is shown no matter what
        deckCompletionView?.classList.remove('hidden');
        questionCard?.classList.remove('hidden');
    }
}

function hideDeckCompletionScreen() {
    if (deckCompletionView) {
        deckCompletionView.classList.add('hidden');
    }
    if (questionText) {
        questionText.classList.remove('hidden');
    }
    if (flashcardAnswerForm) {
        flashcardAnswerForm.classList.remove('hidden');
    }
}

function restartDeckSession() {
    clearBalls();
    cleanShockwaveContainer();
    score = 0;
    currentStreak = 0;
    consecutiveDueCardsCount = 0;
    consecutiveNewCardsCount = 0;
    lastCardTopic = '';
    updateStreakUI(false);
    scoreDisplay.textContent = '0';
    if (allQuestions && allQuestions.length > 0) {
        allQuestions.forEach(q => {
            delete q.dueStep;
            delete q.correctStreak;
            delete q.wrongCount;
            delete q.isBeingCorrected;
        });
    }
    if (activeMode === 'exam') {
        let examData = {};
        try { examData = JSON.parse(localStorage.getItem('flashcardsExam')) || {}; } catch (e) {}
        const enabledDeckIds = new Set((examData.decks || []).filter(d => d.enabled !== false).map(d => d.id));
        const playable = allQuestions.filter(q => isPlayableCard(q) && (!q.deckId || enabledDeckIds.has(q.deckId)));
        questionsPool = shuffleArray(playable);
    } else {
        questionsPool = shuffleArray(allQuestions.filter(isPlayableCard));
    }
    currentStep = 0;
    precomputedNextCard = null;
    saveGameState(true);
    updateScoreDisplay();
    initStatsSession(deckTitle?.textContent || 'Flashcards', activeMode, questionsPool.length, 0, true);
    hideDeckCompletionScreen();
    loadQuestion();
    showNotificationPill(t('deck_restarted_toast'), "reset.svg");
    console.log("[Game] Baralho reiniciado com sucesso. Nova sessão de estatísticas iniciada.");
}

// Expose completion testing helpers globally
window.testDeckCompletion = showDeckCompletionScreen;
window.restartDeckSession = restartDeckSession;

// --- CORE GAME LOGIC ---
function loadQuestion() {
    questionsPool = questionsPool.filter(isPlayableCard);
    if (questionsPool.length === 0) {
        if (activeMode === 'notebook') {
            clearBalls();
            resetUI();
            bookmarkCardBtn?.classList.add('hidden');
            questionCard?.classList.remove('glow-correct', 'glow-incorrect', 'card-shake');
            updateScoreDisplay();

            const sourceTagElem = document.getElementById('question-source-tag');
            const bodyElem = document.getElementById('question-body-text');
            if (sourceTagElem) sourceTagElem.classList.add('hidden');
            if (notebookStageTag) notebookStageTag.classList.add('hidden');

            const emptyHtml = `
                <div class="py-6 flex flex-col items-center justify-center text-center gap-3 select-none">
                    <div class="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                        <img src="../assets/img/bookmark_check.svg" class="w-7 h-7" alt="Caderno">
                    </div>
                    <h3 class="text-lg font-bold text-gray-800">${t('notebook_empty_title')}</h3>
                    <p class="text-xs sm:text-sm text-gray-500 max-w-sm leading-relaxed">
                        ${t('notebook_empty_desc')}
                    </p>
                    <button id="notebook-empty-back-btn" class="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs sm:text-sm transition shadow-sm">
                        ${t('notebook_empty_btn')}
                    </button>
                </div>
            `;
            if (bodyElem) {
                bodyElem.innerHTML = emptyHtml;
            } else if (questionText) {
                questionText.innerHTML = emptyHtml;
            }
            const backBtn = document.getElementById('notebook-empty-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => switchActiveMode('normal'));
            }
            submitBtn?.classList.add('hidden');
            nextQuestionBtn?.classList.add('hidden');
            correctionOptions?.classList.add('hidden');
            ankiControls?.classList.add('hidden');
            mcAnswerArea?.classList.add('hidden');
            openAnswerArea?.classList.add('hidden');
            return;
        }

        showDeckCompletionScreen();
        return;
    }

    currentStep++;
    resetUI();
    questionStartTime = Date.now();
    bookmarkCardBtn.classList.remove('hidden');

    if (activeMode === 'notebook') {
        currentQuestion = selectNextNotebookCard({
            pool: questionsPool,
            currentStep,
            lastCardTopic,
            lastSourceDeck: currentQuestion?.sourceDeck || '',
            currentQuestion
        }) || questionsPool[0];
        currentQuestionIndexInPool = questionsPool.indexOf(currentQuestion);
    } else {
        // Fast-path: use precomputed next card if valid and still in pool
        if (precomputedNextCard && questionsPool.includes(precomputedNextCard)) {
            currentQuestion = precomputedNextCard;
            currentQuestionIndexInPool = questionsPool.indexOf(precomputedNextCard);
        } else {
            // Fallback / Initial pick: use selectNextCard with interleaving
            currentQuestion = selectNextCard(questionsPool, currentStep, consecutiveDueCardsCount, lastCardTopic, currentQuestion, consecutiveNewCardsCount);
            currentQuestionIndexInPool = questionsPool.indexOf(currentQuestion);
        }
    }

    updateScoreDisplay();

    // Update lastCardTopic for subsequent interleaved selections
    if (currentQuestion) {
        lastCardTopic = getCardTopic(currentQuestion);
        delete currentQuestion.isBeingCorrected;
    }
    isBeingCorrected = false;

    // Update consecutive due & new counters
    if (currentQuestion && currentQuestion.dueStep !== undefined && currentQuestion.dueStep <= currentStep) {
        consecutiveDueCardsCount++;
        consecutiveNewCardsCount = 0;
    } else {
        consecutiveDueCardsCount = 0;
        consecutiveNewCardsCount++;
    }

    if (isVoiceCardsMutedThisSession && currentQuestion && currentQuestion.type === 'voice') {
        const nextPlayable = questionsPool.find(q => q.type !== 'voice');
        if (nextPlayable) {
            currentQuestion = nextPlayable;
            currentQuestionIndexInPool = questionsPool.indexOf(nextPlayable);
            lastCardTopic = getCardTopic(currentQuestion);
        } else {
            console.log("[Voice] Apenas cards de voz restam nesta sessão (mutados). Concluindo.");
            showDeckCompletionScreen();
            return;
        }
    }

    console.log("[Game] Card carregado:", {
        step: currentStep,
        type: currentQuestion?.type,
        dueStep: currentQuestion?.dueStep,
        poolLeft: questionsPool.length,
        desc: (currentQuestion?.description || '').slice(0, 40)
    });

    // Clear precomputed slot and immediately queue precomputation for subsequent card in background
    precomputedNextCard = null;
    schedulePrecomputeNextCard();

    renderBookmarkIcon();
    hideHighlightPopup();

    ensureQuestionStructure();
    const sourceTagElem = document.getElementById('question-source-tag');
    const bodyElem = document.getElementById('question-body-text');
    const feedbackElem = document.getElementById('question-feedback-text');

    if (feedbackElem) {
        feedbackElem.innerHTML = '';
        feedbackElem.classList.add('hidden');
    }

    const formatQuestionText = (card) => {
        if (!card) return '';
        if (card.type === 'fill') {
            return renderFillBlanksQuestion(card.description || '');
        }
        return renderMathAndMarkdown(card.description || '');
    };

    if ((activeMode === 'notebook' || activeMode === 'exam') && currentQuestion.sourceDeck) {
        if (sourceTagElem) {
            sourceTagElem.textContent = currentQuestion.sourceDeck;
            sourceTagElem.classList.remove('hidden');
        }
        if (bodyElem) {
            bodyElem.innerHTML = formatQuestionText(currentQuestion);
        } else {
            const desc = formatQuestionText(currentQuestion);
            questionText.innerHTML = `<span class="text-xs uppercase tracking-wider text-blue-500 font-bold mb-1.5 block">${escapeHtml(currentQuestion.sourceDeck)}</span>${desc}`;
        }
    } else {
        if (sourceTagElem) {
            sourceTagElem.classList.add('hidden');
        }
        if (bodyElem) {
            bodyElem.innerHTML = formatQuestionText(currentQuestion);
        } else {
            questionText.innerHTML = formatQuestionText(currentQuestion);
        }
    }

    // Chip vermelho pastel para cartões geralmente respondidos incorretamente
    if (cardDifficultTag) {
        if (currentQuestion && isDifficultCard(currentQuestion)) {
            cardDifficultTag.classList.remove('hidden');
        } else {
            cardDifficultTag.classList.add('hidden');
        }
    }

    const isImageArrows = currentQuestion?.type === 'image_arrows';
    setupCardImageWithPlaceholder(
        currentQuestion.image,
        questionImage,
        questionImageContainer,
        questionImagePlaceholder,
        currentQuestion.imageCrop,
        currentQuestion.imageArrows,
        {
            showNumbers: isImageArrows,
            onArrowClick: isImageArrows ? (idx) => focusGameArrowInput(idx) : null,
            errorElem: questionImageError,
            isImageArrows
        }
    );

    openAnswerArea.classList.add('hidden');
    openDoubleAnswerArea.classList.add('hidden');
    mcAnswerArea.classList.add('hidden');
    if (ankiAnswerContainer) ankiAnswerContainer.classList.add('hidden');
    if (ankiControlsArea) ankiControlsArea.classList.add('hidden');
    if (voiceControlsArea) voiceControlsArea.classList.add('hidden');
    if (voiceAnswerContainer) voiceAnswerContainer.classList.add('hidden');
    if (voiceEvaluatedControls) voiceEvaluatedControls.classList.add('hidden');
    resetVoiceUIState();
    if (imageArrowsAnswerArea) imageArrowsAnswerArea.classList.add('hidden');

    if (actionButtonsArea) actionButtonsArea.classList.remove('hidden');
    deleteCardBtn.classList.remove('hidden');

    if (currentQuestion.type === 'anki') {
        if (actionButtonsArea) actionButtonsArea.classList.add('hidden');
        if (ankiControlsArea) {
            ankiControlsArea.classList.remove('hidden');
            ankiUnflippedControls.classList.remove('hidden');
            ankiFlippedControls.classList.add('hidden');
        }
        isAnkiFlipped = false;
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    } else if (currentQuestion.type === 'voice') {
        if (actionButtonsArea) actionButtonsArea.classList.add('hidden');
        if (voiceControlsArea) {
            voiceControlsArea.classList.remove('hidden');
            setupVoiceCardUI();
        }
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    } else if (currentQuestion.type === 'image_arrows') {
        if (imageArrowsAnswerArea) imageArrowsAnswerArea.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
        initImageArrowsInputs();
    } else if (currentQuestion.type === 'multiple_choice' && currentQuestion.options) {
        mcAnswerArea.classList.remove('hidden');
        submitBtn.classList.add('hidden'); // MCQ submits on click
        renderDynamicMcOptions(currentQuestion.options);
    } else if (currentQuestion.type === 'open_double') {
        openDoubleAnswerArea.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
        answerInput1.placeholder = currentQuestion.placeholder1 || 'Resposta 1';
        answerInput2.placeholder = currentQuestion.placeholder2 || 'Resposta 2';
        answerInput1.focus();
    } else if (currentQuestion.type === 'fill') {
        submitBtn.classList.remove('hidden');
        initFillBlankInputs();
    } else {
        openAnswerArea.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
        answerInput.focus();
    }
    resetTutorChatSession();

    if (isFirstQuestion) {
        chatMessages.innerHTML = ''; // Limpa o placeholder inicial do HTML
        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = 'chat-message-ai';
        welcomeMsg.textContent = t('tutor_welcome_msg');
        chatMessages.appendChild(welcomeMsg);
        isFirstQuestion = false;
    } else if (getHasChatInteraction()) {
        // Adiciona o separador ondulado apenas se houve interação na questão anterior
        const separator = document.createElement('div');
        separator.className = 'chat-separator';
        separator.innerHTML = `
            <img src="../assets/img/wavy.svg" alt="">
            <span class="chat-question-label">${t('new_question_divider')}</span>
        `;
        chatMessages.appendChild(separator);

        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = 'chat-message-ai';
        welcomeMsg.textContent = t('tutor_welcome_msg');
        chatMessages.appendChild(welcomeMsg);

        // Garantir que o scroll vá para o final para mostrar a nova mensagem
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);

        setHasChatInteraction(false);
    }
}

function renderDynamicMcOptions(rawOptions) {
    mcAnswerArea.innerHTML = '';
    const options = [...rawOptions].filter(Boolean);
    shuffleArray(options);

    // Responsive grid classes for 2 to 6 options
    if (options.length === 2) {
        mcAnswerArea.className = "grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10";
    } else if (options.length === 3) {
        mcAnswerArea.className = "grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10";
    } else if (options.length === 4) {
        mcAnswerArea.className = "grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10";
    } else {
        mcAnswerArea.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 relative z-10";
    }

    options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = "mc-option-btn w-full";
        btn.dataset.optionText = optText;

        const textSpan = document.createElement('span');
        textSpan.className = "mc-option-label";
        textSpan.textContent = optText;
        btn.appendChild(textSpan);

        const keyBadge = document.createElement('span');
        keyBadge.className = "mc-key-badge";
        keyBadge.textContent = String(index + 1);
        keyBadge.title = t('key_shortcut_title', { key: index + 1 });
        btn.appendChild(keyBadge);

        btn.onclick = () => handleMCSubmit(btn);
        mcAnswerArea.appendChild(btn);
    });
}

function formatMultiParagraphText(text) {
    if (!text) return '';
    if (/<(p|br|div|mark)[\s>]/i.test(text)) {
        return text;
    }
    const paragraphs = text.split(/\r?\n\r?\n/);
    if (paragraphs.length > 1) {
        return paragraphs.map(p => `<p class="mb-2 last:mb-0">${p.trim()}</p>`).join('');
    }
    return text;
}

function flipAnkiCard() {
    if (currentQuestion.type !== 'anki' || isAnkiFlipped) return;
    isAnkiFlipped = true;

    triggerHaptic('cardFlip');
    playFeedbackSound('flip');

    if (ankiAnswerContainer) {
        ankiAnswerText.innerHTML = renderMathAndMarkdown(currentQuestion.answer || '');
        setupCardImageWithPlaceholder(
            currentQuestion.answerImage,
            ankiAnswerImage,
            ankiAnswerImageContainer,
            ankiAnswerImagePlaceholder,
            currentQuestion.answerImageCrop,
            currentQuestion.answerImageArrows,
            {
                errorElem: ankiAnswerImageError
            }
        );
        ankiAnswerContainer.classList.remove('hidden');
    }

    if (ankiUnflippedControls) ankiUnflippedControls.classList.add('hidden');
    if (ankiFlippedControls) ankiFlippedControls.classList.remove('hidden');
}

function handleAnkiRating(rating) {
    if (currentQuestion.type !== 'anki' || !isAnkiFlipped) return;
    if (isAnimating) {
        console.warn("[Anki] Avaliação ignorada: animação em andamento.");
        return;
    }

    handleDailyStreakOnCardAnswered();

    const elapsedSeconds = (Date.now() - questionStartTime) / 1000;
    console.log("[Anki] Avaliando card:", { rating, elapsedSeconds: Math.round(elapsedSeconds * 10) / 10 + 's' });

    try {
        recordStatsAnswer({
            card: currentQuestion,
            isCorrect: (rating === 'good' || rating === 'easy'),
            rating: rating,
            timeSpentSeconds: elapsedSeconds
        });
    } catch (e) {
        console.error("[Anki] Erro ao gravar stats anki:", e);
    }

    if (activeMode === 'notebook') {
        const schedule = calculateNotebookNextSchedule({
            card: currentQuestion,
            quality: rating,
            currentStep,
            poolSize: questionsPool.length
        });
        Object.assign(currentQuestion, schedule);
        notebookReviewsCount++;

        const cardInAll = allQuestions.find(q => q === currentQuestion || (q.description && stripHtml(q.description) === stripHtml(currentQuestion.description)));
        if (cardInAll) {
            Object.assign(cardInAll, schedule);
        }

        saveGameState();
        updateScoreDisplay();
        checkAndCelebrateNotebookDailyGoal(true);

        if (rating === 'easy' || rating === 'good') {
            createBall(true);
            triggerHaptic('correct');
            playFeedbackSound('correct');
            setTimeout(() => {
                animateCardToBack(() => {
                    loadQuestion();
                });
            }, isAnimationsEnabled() ? 300 : 0);
        } else if (rating === 'hard') {
            createBall(false);
            playFeedbackSound('wrong');
            setTimeout(() => {
                animateCardToBack(() => {
                    loadQuestion();
                });
            }, isAnimationsEnabled() ? 300 : 0);
        } else if (rating === 'again') {
            createBall(false);
            playFeedbackSound('wrong');
            questionCard.classList.remove('card-shake');
            void questionCard.offsetWidth;
            questionCard.classList.add('card-shake');
            triggerHaptic('shake');
            setTimeout(() => questionCard.classList.remove('card-shake'), isAnimationsEnabled() ? 450 : 0);
            setTimeout(() => {
                animateCardToBack(() => {
                    loadQuestion();
                });
            }, isAnimationsEnabled() ? 400 : 0);
        }
        return;
    }

    if (rating === 'easy') {
        const isLastCard = questionsPool.length === 1 && questionsPool.includes(currentQuestion);
        if (!isLastCard) {
            createBall(true);
            questionCard.classList.add('glow-correct');
        }
        triggerHaptic('correct');
        playFeedbackSound('correct');

        currentQuestion.correctStreak = (currentQuestion.correctStreak || 0) + 1;
        const elapsedSec = (Date.now() - questionStartTime) / 1000;
        const totalWrongs = currentQuestion.wrongCount || 0;
        const shouldRemove = shouldGraduateCard(currentQuestion, elapsedSec);

        if (shouldRemove) {
            score++;
            const idx = questionsPool.indexOf(currentQuestion);
            if (idx !== -1) {
                questionsPool.splice(idx, 1);
            } else if (currentQuestionIndexInPool >= 0 && currentQuestionIndexInPool < questionsPool.length) {
                questionsPool.splice(currentQuestionIndexInPool, 1);
            }
            saveGameState();
            console.log("[Anki] Card removido do deck (acerto fácil/graduado). Restam:", questionsPool.length);

            // On the last card of deck, skip normal animations and play end game directly!
            if (questionsPool.length === 0) {
                clearBalls();
                questionCard.classList.remove('glow-correct', 'glow-incorrect', 'card-shake');
                updateScoreDisplay();
                showDeckCompletionScreen();
                return;
            }

            setTimeout(() => {
                animateCardToHeader(() => {
                    updateScoreDisplay();
                    loadQuestion();
                });
            }, 300);
        } else {
            // Card mantido para consolidação neural
            const ankiReinforcGap = Math.max(7, Math.min(12, Math.round(questionsPool.length * 0.5)));
            currentQuestion.dueStep = currentStep + ankiReinforcGap;
            saveGameState();
            console.log("[Anki] Card mantido para consolidação. dueStep:", currentQuestion.dueStep);
            setTimeout(() => {
                animateCardToBack(() => {
                    loadQuestion();
                });
            }, 300);
        }
    } else if (rating === 'good') {
        createBall(true);
        triggerHaptic('correct');
        playFeedbackSound('correct');
        currentQuestion.correctStreak = (currentQuestion.correctStreak || 0) + 1;
        currentQuestion.dueStep = currentStep + 10;
        saveGameState();
        console.log("[Anki] Card marcado como bom. Próximo dueStep:", currentQuestion.dueStep);
        animateCardToBack(() => {
            loadQuestion();
        });
    } else if (rating === 'hard') {
        createBall(false);
        playFeedbackSound('wrong');
        const elapsedSec = (Date.now() - questionStartTime) / 1000;
        const gap = calculateThinkingGap(elapsedSec, currentQuestion, questionsPool.length);
        currentQuestion.dueStep = currentStep + gap;
        saveGameState();
        console.log("[Anki] Card marcado como difícil. Próximo dueStep:", currentQuestion.dueStep);
        animateCardToBack(() => {
            loadQuestion();
        });
    } else if (rating === 'again') {
        createBall(false);
        playFeedbackSound('wrong');
        questionCard.classList.remove('card-shake');
        void questionCard.offsetWidth;
        questionCard.classList.add('card-shake');
        triggerHaptic('shake');
        setTimeout(() => questionCard.classList.remove('card-shake'), 450);

        currentQuestion.wrongCount = (currentQuestion.wrongCount || 0) + 1;
        currentQuestion.correctStreak = 0;
        const elapsedSec = (Date.now() - questionStartTime) / 1000;
        const gap = calculateThinkingGap(elapsedSec, currentQuestion, questionsPool.length);
        currentQuestion.dueStep = currentStep + gap;
        saveGameState();
        console.log("[Anki] Card marcado como erro (again). Próximo dueStep:", currentQuestion.dueStep, "gap:", gap);
        setTimeout(() => {
            animateCardToBack(() => {
                loadQuestion();
            });
        }, 400);
    }
}

// --- "EXPLICAR EM VOZ ALTA" (VOICE CARD) LOGIC ---

function resetVoiceUIState() {
    isVoiceRecording = false;
    isVoiceSubmitting = false;
    if (audioAnimFrame) {
        cancelAnimationFrame(audioAnimFrame);
        audioAnimFrame = null;
    }
    if (audioCtx) {
        try { audioCtx.close(); } catch (e) {}
        audioCtx = null;
        audioAnalyser = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch {}
    }
    mediaRecorder = null;
    if (mediaStream) {
        try { mediaStream.getTracks().forEach(t => t.stop()); } catch {}
        mediaStream = null;
    }
    recordedAudioChunks = [];

    if (voiceMicBtn) {
        voiceMicBtn.classList.remove('voice-button-collapsing', 'hidden');
        voiceMicBtn.disabled = false;
        voiceMicBtn.setAttribute('title', 'Gravar Explicação');
        voiceMicBtn.setAttribute('aria-label', 'Gravar Explicação');
    }
    if (voiceMicIcon) voiceMicIcon.textContent = 'mic';
    if (voiceWavyBlur) {
        voiceWavyBlur.classList.add('hidden');
        voiceWavyBlur.classList.remove('voice-blur-collapsing');
        const topArc = voiceWavyBlur.querySelector('.voice-wave-arc-top');
        if (topArc) topArc.style.transform = '';
        const midArc = voiceWavyBlur.querySelector('.voice-wave-arc-mid');
        if (midArc) midArc.style.transform = '';
        const botArc = voiceWavyBlur.querySelector('.voice-wave-arc-bot');
        if (botArc) botArc.style.transform = '';
        const prismRim = voiceWavyBlur.querySelector('.voice-wave-prism-rim');
        if (prismRim) {
            prismRim.style.filter = '';
            prismRim.style.boxShadow = '';
        }
        const bloom = voiceWavyBlur.querySelector('.voice-wave-bloom');
        if (bloom) {
            bloom.style.opacity = '';
            bloom.style.transform = '';
        }
    }
    if (voiceThinkingOrb) voiceThinkingOrb.classList.add('hidden');
    if (voiceThinkingMsg) voiceThinkingMsg.classList.add('hidden');
    if (voiceCantSpeakBtn) voiceCantSpeakBtn.classList.remove('hidden');
    if (voiceAnswerContainer) voiceAnswerContainer.classList.add('hidden');
    if (voiceEvaluatedControls) voiceEvaluatedControls.classList.add('hidden');
    if (questionCard) questionCard.classList.remove('voice-border-pulse');
}

function setupVoiceCardUI() {
    resetVoiceUIState();
    if (!isUserPro()) {
        if (voiceMicBtn) {
            voiceMicBtn.classList.add('opacity-75');
            voiceMicBtn.setAttribute('title', t('voice_pro_required_desc'));
        }
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result || '';
            const base64 = String(dataUrl).split(',')[1] || '';
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function startVoiceRecording() {
    if (!isUserPro()) {
        openProModal();
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        alert(t('voice_not_supported') || 'Gravação de voz não suportada neste navegador.');
        return;
    }

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        recordedMimeType = 'audio/webm';
        if (typeof MediaRecorder !== 'undefined') {
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                recordedMimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                recordedMimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                recordedMimeType = 'audio/mp4';
            }
        }

        recordedAudioChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream, { mimeType: recordedMimeType });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedAudioChunks.push(e.data);
            }
        };

        mediaRecorder.start(200);
        isVoiceRecording = true;

        if (voiceMicIcon) voiceMicIcon.textContent = 'check';
        if (voiceMicBtn) {
            voiceMicBtn.setAttribute('title', t('click_to_finish') || 'Concluir e Enviar');
            voiceMicBtn.setAttribute('aria-label', t('click_to_finish') || 'Concluir e Enviar');
        }
        if (voiceWavyBlur) voiceWavyBlur.classList.remove('hidden', 'voice-blur-collapsing');
        triggerHaptic('medium');

        // Start Live Voice Wave Visual Reaction
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
                const source = audioCtx.createMediaStreamSource(mediaStream);
                audioAnalyser = audioCtx.createAnalyser();
                audioAnalyser.fftSize = 128;
                audioAnalyser.smoothingTimeConstant = 0.5;
                source.connect(audioAnalyser);

                const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);

                const updateAudioWaves = () => {
                    if (!isVoiceRecording || !audioAnalyser) return;
                    audioAnalyser.getByteFrequencyData(dataArray);

                    // Focus on human vocal frequencies (approx bins 1 to 28 in 128-FFT)
                    const voiceBinCount = Math.min(28, dataArray.length);
                    let sum = 0;
                    let maxVal = 0;
                    for (let i = 1; i < voiceBinCount; i++) {
                        const val = dataArray[i];
                        sum += val;
                        if (val > maxVal) maxVal = val;
                    }
                    const avg = sum / (voiceBinCount - 1);

                    // Blend average with peak voice intensity for rapid response to plosives & syllables
                    const voiceIntensity = (avg * 0.65) + (maxVal * 0.35);

                    // Ambient room noise gate (~4)
                    const cleanIntensity = Math.max(0, voiceIntensity - 4);

                    // Non-linear power curve: makes subtle whispers & voice modulations strongly visible
                    const normalized = Math.min(1, cleanIntensity / 36);
                    const level = Math.pow(normalized, 0.58);

                    if (voiceWavyBlur) {
                        const topLift = level * 42; // Up to 42px wave crest rise
                        const topScale = 1 + level * 0.32; // Expands width and crest height
                        const midLift = level * 26;
                        const midScale = 1 + level * 0.22;
                        const botLift = level * 12;
                        const botScale = 1 + level * 0.14;

                        // Dynamic organic sway based on vocal intensity
                        const organicSway = Math.sin(Date.now() / 160) * (level * 2.2);

                        const topArc = voiceWavyBlur.querySelector('.voice-wave-arc-top');
                        if (topArc) {
                            topArc.style.transform = `translateX(-50%) translateY(-${topLift}px) rotate(${organicSway}deg) scale(${topScale})`;
                        }

                        const prismRim = voiceWavyBlur.querySelector('.voice-wave-prism-rim');
                        if (prismRim) {
                            prismRim.style.filter = `blur(${Math.max(1, 2 - level * 0.8)}px) brightness(${1 + level * 0.85}) contrast(${1.3 + level * 0.5})`;
                            prismRim.style.boxShadow = `0 0 ${16 + level * 28}px rgba(245, 158, 11, 0.95), 0 0 ${28 + level * 40}px rgba(6, 182, 212, 0.95)`;
                        }

                        const midArc = voiceWavyBlur.querySelector('.voice-wave-arc-mid');
                        if (midArc) {
                            midArc.style.transform = `translateX(-50%) translateY(-${midLift}px) rotate(${-organicSway * 0.6}deg) scale(${midScale})`;
                        }

                        const botArc = voiceWavyBlur.querySelector('.voice-wave-arc-bot');
                        if (botArc) {
                            botArc.style.transform = `translateX(-50%) translateY(-${botLift}px) scale(${botScale})`;
                        }

                        const bloom = voiceWavyBlur.querySelector('.voice-wave-bloom');
                        if (bloom) {
                            bloom.style.opacity = `${0.85 + level * 0.15}`;
                            bloom.style.transform = `translateX(-50%) scale(${1 + level * 0.2})`;
                        }
                    }

                    audioAnimFrame = requestAnimationFrame(updateAudioWaves);
                };
                audioAnimFrame = requestAnimationFrame(updateAudioWaves);
            }
        } catch (e) {
            console.warn('[Voice] AudioContext visualizer fallback:', e);
        }

    } catch (err) {
        console.error('[Voice] Falha ao acessar microfone:', err);
        alert(t('voice_mic_permission_denied') || 'Permissão do microfone negada.');
        resetVoiceUIState();
    }
}

function stopVoiceRecording(cleanup = true) {
    isVoiceRecording = false;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch {}
    }
    mediaRecorder = null;
    if (mediaStream) {
        try { mediaStream.getTracks().forEach(t => t.stop()); } catch {}
        mediaStream = null;
    }
    if (cleanup) {
        resetVoiceUIState();
    }
}

async function finishVoiceRecordingAndSend() {
    if (isVoiceSubmitting) return;
    isVoiceSubmitting = true;
    isVoiceRecording = false;

    triggerHaptic('medium');

    // Collect audio recording
    let audioBlob = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        audioBlob = await new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                const cleanType = (recordedMimeType || 'audio/webm').split(';')[0];
                const blob = new Blob(recordedAudioChunks, { type: cleanType });
                resolve(blob);
            };
            try {
                mediaRecorder.stop();
            } catch (e) {
                const cleanType = (recordedMimeType || 'audio/webm').split(';')[0];
                resolve(new Blob(recordedAudioChunks, { type: cleanType }));
            }
        });
    } else if (recordedAudioChunks.length > 0) {
        const cleanType = (recordedMimeType || 'audio/webm').split(';')[0];
        audioBlob = new Blob(recordedAudioChunks, { type: cleanType });
    }

    if (audioAnimFrame) {
        cancelAnimationFrame(audioAnimFrame);
        audioAnimFrame = null;
    }
    if (audioCtx) {
        try { audioCtx.close(); } catch (e) {}
        audioCtx = null;
        audioAnalyser = null;
    }

    if (mediaStream) {
        try {
            mediaStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
        mediaStream = null;
    }

    // MOCKUP ANIMATION STEP 1 & 2:
    // (blue and purple wavy blur around button (click done) -> button collapses away and blur collapses to a circle)
    if (voiceMicBtn) voiceMicBtn.classList.add('voice-button-collapsing');
    if (voiceWavyBlur) voiceWavyBlur.classList.add('voice-blur-collapsing');
    if (voiceCantSpeakBtn) voiceCantSpeakBtn.classList.add('hidden');

    // Collapse transition duration
    await new Promise(r => setTimeout(r, 450));

    // MOCKUP ANIMATION STEP 3:
    // (circle rises, gets Google's 3D fluid-mixing colors, pulsates)
    if (voiceWavyBlur) voiceWavyBlur.classList.add('hidden');
    if (voiceMicBtn) voiceMicBtn.classList.add('hidden');
    if (voiceThinkingOrb) voiceThinkingOrb.classList.remove('hidden');
    if (voiceThinkingMsg) voiceThinkingMsg.classList.remove('hidden');

    try {
        let base64Audio = '';
        if (audioBlob && audioBlob.size > 0) {
            base64Audio = await blobToBase64(audioBlob);
        }

        const evaluation = await evaluateVoiceAudioWithGemini({
            question: currentQuestion.description || '',
            reference: currentQuestion.answer || '',
            audioBase64: base64Audio,
            mimeType: (recordedMimeType || 'audio/webm').split(';')[0]
        });

        // MOCKUP ANIMATION STEP 4:
        // (gemini is done thinking) -> answer is rendered, border pulsates light blue once
        if (voiceThinkingOrb) voiceThinkingOrb.classList.add('hidden');
        if (voiceThinkingMsg) voiceThinkingMsg.classList.add('hidden');

        renderVoiceAnswerAndEvaluation(evaluation, evaluation.user_transcript || '');

        // Border pulsates light blue once
        if (questionCard) {
            questionCard.classList.remove('voice-border-pulse');
            void questionCard.offsetWidth; // Reflow
            questionCard.classList.add('voice-border-pulse');
            setTimeout(() => questionCard?.classList.remove('voice-border-pulse'), 1300);
        }

        // Apply classification via function-call
        const rating = evaluation.rating || 'good';
        applyVoiceCardSchedule(rating);

    } catch (err) {
        console.error('[Voice] Erro durante avaliação do áudio:', err);
        if (voiceThinkingOrb) voiceThinkingOrb.classList.add('hidden');
        if (voiceThinkingMsg) voiceThinkingMsg.classList.add('hidden');

        renderVoiceAnswerAndEvaluation({
            rating: 'good',
            feedback: 'A conexão com a IA oscilou, mas você pode conferir a explicação de referência abaixo e avaliar seu aprendizado.',
            user_transcript: '(Áudio gravado)',
            key_points_covered: [],
            key_points_missed: []
        }, '(Áudio gravado)');

        if (questionCard) {
            questionCard.classList.remove('voice-border-pulse');
            void questionCard.offsetWidth;
            questionCard.classList.add('voice-border-pulse');
            setTimeout(() => questionCard?.classList.remove('voice-border-pulse'), 1300);
        }
        applyVoiceCardSchedule('good');
    } finally {
        isVoiceSubmitting = false;
    }
}

async function evaluateVoiceAudioWithGemini({ question, reference, audioBase64, mimeType }) {
    const promptInstructions = `
Você é o avaliador pedagógico de flashcards de alto nível universitário.
Sua missão é ouvir e avaliar a resposta falada pelo aluno no arquivo de áudio anexado em comparação com a explicação de referência do conceito.

PERGUNTA / CONCEITO:
${question}

EXPLICAÇÃO CONCEITUAL DE REFERÊNCIA:
${reference}

DIRETRIZES DE AVALIAÇÃO:
1. Ouça com atenção o arquivo de áudio do estudante.
2. Forneça no campo 'user_transcript' uma transcrição concisa do que o aluno explicou no áudio. Se o áudio estiver inaudível, vazio ou contiver apenas ruído, registre isso claramente no 'user_transcript'.
3. Avalie a compreensão substantiva e técnica. Não exija palavras idênticas, mas sim a precisão da ideia, mecanismos e termos fundamentais.
4. Seja construtivo e pedagógico no feedback (2 a 3 frases em português) no campo 'feedback'. Destaque o que o estudante acertou e o que faltou ou pode ser refinado.
5. Classifique o desempenho seguindo as opções dos cards Anki:
   - "again": Errou conceitos fundamentais, disse algo incoerente, não explicou o conceito pedido ou o áudio estava vazio/inaudível.
   - "hard": Lembrou de parte do conceito, mas com hesitações graves, definições imprecisas ou faltou elemento essencial.
   - "good": Boa explicação, cobriu os pilares essenciais do conceito com clareza.
   - "easy": Explicação completa, precisa, com excelente articulação e domínio técnico.
6. Chame OBRIGATORIAMENTE a ferramenta 'classify_voice_response' com os campos 'rating', 'feedback', 'user_transcript', 'key_points_covered' e 'key_points_missed'.
`;

    const classifyVoiceTool = {
        functionDeclarations: [
            {
                name: "classify_voice_response",
                description: "Avalia a explicação oral no áudio comparando-a com o texto de referência do conceito, fornecendo feedback e classificação Anki (again, hard, good, easy).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        rating: {
                            type: "STRING",
                            enum: ["again", "hard", "good", "easy"],
                            description: "Classificação do desempenho: again (errei), hard (difícil), good (médio), easy (fácil)."
                        },
                        feedback: {
                            type: "STRING",
                            description: "Feedback pedagógico claro e construtivo em português."
                        },
                        user_transcript: {
                            type: "STRING",
                            description: "Transcrição resumida do que o aluno explicou no áudio."
                        },
                        key_points_covered: {
                            type: "ARRAY",
                            items: { type: "STRING" },
                            description: "Tópicos ou pontos que o aluno acertou."
                        },
                        key_points_missed: {
                            type: "ARRAY",
                            items: { type: "STRING" },
                            description: "Tópicos ou pontos que o aluno errou ou omitiu."
                        }
                    },
                    required: ["rating", "feedback"]
                }
            }
        ]
    };

    const parts = [];
    if (audioBase64) {
        parts.push({
            inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: audioBase64
            }
        });
    }
    parts.push({ text: promptInstructions });

    const token = await getCurrentUserToken().catch(() => null);
    const localApiKey = await getApiKey().catch(() => '');

    let res;
    if (token) {
        res = await fetch(`${BACKEND_URL}/api/ai/tutor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: 'gemini-flash-lite-latest',
                contents: [{ role: 'user', parts }],
                tools: [classifyVoiceTool],
                toolConfig: {
                    functionCallingConfig: {
                        mode: 'ANY',
                        allowedFunctionNames: ['classify_voice_response']
                    }
                }
            })
        });
    } else if (localApiKey) {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${localApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                tools: [classifyVoiceTool],
                toolConfig: {
                    functionCallingConfig: {
                        mode: 'ANY',
                        allowedFunctionNames: ['classify_voice_response']
                    }
                }
            })
        });
    } else {
        throw new Error('Sem autenticação ou chave API para consultar o Gemini.');
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Erro na API Gemini (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const functionCall = candidate?.content?.parts?.find(p => p.functionCall)?.functionCall;

    if (functionCall && functionCall.name === 'classify_voice_response') {
        const args = functionCall.args || {};
        return {
            rating: args.rating || 'good',
            feedback: args.feedback || 'Avaliação concluída.',
            user_transcript: args.user_transcript || '',
            key_points_covered: Array.isArray(args.key_points_covered) ? args.key_points_covered : [],
            key_points_missed: Array.isArray(args.key_points_missed) ? args.key_points_missed : []
        };
    }

    // Text JSON fallback
    const textPart = candidate?.content?.parts?.[0]?.text;
    if (textPart) {
        try {
            const parsed = JSON.parse(textPart);
            return {
                rating: parsed.rating || 'good',
                feedback: parsed.feedback || textPart,
                user_transcript: parsed.user_transcript || '',
                key_points_covered: parsed.key_points_covered || [],
                key_points_missed: parsed.key_points_missed || []
            };
        } catch {}
    }

    return {
        rating: 'good',
        feedback: textPart || 'Conceito revisado com sucesso.',
        user_transcript: '',
        key_points_covered: [],
        key_points_missed: []
    };
}

function renderVoiceAnswerAndEvaluation(evaluation, userSpokenText) {
    if (voiceUserTranscriptDisplay) {
        voiceUserTranscriptDisplay.textContent = userSpokenText || '(Nenhuma transcrição detectada)';
    }
    if (voiceReferenceTextDisplay) {
        voiceReferenceTextDisplay.innerHTML = renderMathAndMarkdown(currentQuestion.answer || '');
    }
    if (voiceAiFeedbackText) {
        voiceAiFeedbackText.textContent = evaluation.feedback || '';
    }

    // Setup Rating Badge
    if (voiceEvaluationRatingBadge) {
        const rating = evaluation.rating || 'good';
        const ratingMap = {
            again: { label: t('anki_again') || 'Errei', class: 'bg-red-100 text-red-800 border-red-300' },
            hard: { label: t('anki_hard') || 'Difícil', class: 'bg-orange-100 text-orange-800 border-orange-300' },
            good: { label: t('anki_good') || 'Médio', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
            easy: { label: t('anki_easy') || 'Fácil', class: 'bg-blue-100 text-blue-800 border-blue-300' }
        };
        const rInfo = ratingMap[rating] || ratingMap.good;
        voiceEvaluationRatingBadge.className = `text-xs font-black px-2.5 py-0.5 rounded-full border shadow-2xs ${rInfo.class}`;
        voiceEvaluationRatingBadge.textContent = `${t('voice_classification_label') || 'Classificação da IA:'} ${rInfo.label}`;
    }

    // Setup Covered & Missed Points Chips
    const covered = evaluation.key_points_covered || [];
    const missed = evaluation.key_points_missed || [];
    if (voiceKeyPointsContainer) {
        if (covered.length > 0 || missed.length > 0) {
            voiceKeyPointsContainer.classList.remove('hidden');

            if (voicePointsCoveredRow && voicePointsCoveredChips) {
                if (covered.length > 0) {
                    voicePointsCoveredRow.classList.remove('hidden');
                    voicePointsCoveredChips.innerHTML = covered.map(p => 
                        `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">${escapeHtml(p)}</span>`
                    ).join('');
                } else {
                    voicePointsCoveredRow.classList.add('hidden');
                }
            }

            if (voicePointsMissedRow && voicePointsMissedChips) {
                if (missed.length > 0) {
                    voicePointsMissedRow.classList.remove('hidden');
                    voicePointsMissedChips.innerHTML = missed.map(p => 
                        `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">${escapeHtml(p)}</span>`
                    ).join('');
                } else {
                    voicePointsMissedRow.classList.add('hidden');
                }
            }
        } else {
            voiceKeyPointsContainer.classList.add('hidden');
        }
    }

    // Highlight selected rating button in evaluated controls
    highlightVoiceRatingButton(evaluation.rating || 'good');

    if (voiceAnswerContainer) voiceAnswerContainer.classList.remove('hidden');
    if (voiceEvaluatedControls) voiceEvaluatedControls.classList.remove('hidden');
}

function highlightVoiceRatingButton(rating) {
    [
        { el: voiceBtnAgain, val: 'again' },
        { el: voiceBtnHard, val: 'hard' },
        { el: voiceBtnGood, val: 'good' },
        { el: voiceBtnEasy, val: 'easy' }
    ].forEach(({ el, val }) => {
        if (!el) return;
        if (val === rating) {
            el.classList.add('ring-2', 'ring-offset-2', 'ring-blue-500', 'scale-105');
        } else {
            el.classList.remove('ring-2', 'ring-offset-2', 'ring-blue-500', 'scale-105');
        }
    });
}

function applyVoiceCardSchedule(rating) {
    if (!currentQuestion || currentQuestion.type !== 'voice') return;
    lastVoiceRating = rating;

    handleDailyStreakOnCardAnswered();

    const elapsedSeconds = (Date.now() - questionStartTime) / 1000;
    try {
        recordStatsAnswer({
            card: currentQuestion,
            isCorrect: (rating === 'good' || rating === 'easy'),
            rating: rating,
            timeSpentSeconds: elapsedSeconds
        });
    } catch (e) {
        console.error("[Voice] Erro ao gravar estatísticas:", e);
    }

    if (activeMode === 'notebook') {
        const schedule = calculateNotebookNextSchedule({
            card: currentQuestion,
            quality: rating,
            currentStep,
            poolSize: questionsPool.length
        });
        Object.assign(currentQuestion, schedule);
        notebookReviewsCount++;

        const cardInAll = allQuestions.find(q => q === currentQuestion || (q.description && stripHtml(q.description) === stripHtml(currentQuestion.description)));
        if (cardInAll) {
            Object.assign(cardInAll, schedule);
        }

        saveGameState();
        updateScoreDisplay();
        checkAndCelebrateNotebookDailyGoal(true);
        return;
    }

    if (rating === 'easy') {
        currentQuestion.correctStreak = (currentQuestion.correctStreak || 0) + 1;
        const shouldRemove = shouldGraduateCard(currentQuestion, elapsedSeconds);

        if (shouldRemove) {
            score++;
            const idx = questionsPool.indexOf(currentQuestion);
            if (idx !== -1) questionsPool.splice(idx, 1);
            else if (currentQuestionIndexInPool >= 0 && currentQuestionIndexInPool < questionsPool.length) {
                questionsPool.splice(currentQuestionIndexInPool, 1);
            }
            saveGameState();
            console.log("[Voice] Card graduado e removido do pool. Restam:", questionsPool.length);
        } else {
            const ankiReinforcGap = Math.max(7, Math.min(12, Math.round(questionsPool.length * 0.5)));
            currentQuestion.dueStep = currentStep + ankiReinforcGap;
            saveGameState();
            console.log("[Voice] Card mantido para consolidação. dueStep:", currentQuestion.dueStep);
        }
    } else if (rating === 'good') {
        currentQuestion.correctStreak = (currentQuestion.correctStreak || 0) + 1;
        currentQuestion.dueStep = currentStep + 10;
        saveGameState();
    } else if (rating === 'hard') {
        const gap = calculateThinkingGap(elapsedSeconds, currentQuestion, questionsPool.length);
        currentQuestion.dueStep = currentStep + gap;
        currentQuestion.wrongCount = (currentQuestion.wrongCount || 0) + 1;
        saveGameState();
    } else if (rating === 'again') {
        const gap = Math.max(3, Math.min(6, Math.round(questionsPool.length * 0.35)));
        currentQuestion.dueStep = currentStep + gap;
        currentQuestion.wrongCount = (currentQuestion.wrongCount || 0) + 1;
        saveGameState();
    }
}

function handleVoiceRating(rating, autoAdvance = true) {
    if (!currentQuestion || currentQuestion.type !== 'voice') return;
    highlightVoiceRatingButton(rating);
    applyVoiceCardSchedule(rating);
    if (autoAdvance) {
        advanceFromVoiceCard();
    }
}

function advanceFromVoiceCard() {
    if (isAnimating) return;
    if (questionsPool.length === 0) {
        clearBalls();
        updateScoreDisplay();
        showDeckCompletionScreen();
        return;
    }

    if (lastVoiceRating === 'easy' || lastVoiceRating === 'good') {
        createBall(true);
        triggerHaptic('correct');
        playFeedbackSound('correct');
        setTimeout(() => {
            animateCardToBack(() => {
                loadQuestion();
            });
        }, isAnimationsEnabled() ? 300 : 0);
    } else {
        createBall(false);
        triggerHaptic('shake');
        playFeedbackSound('wrong');
        setTimeout(() => {
            animateCardToBack(() => {
                loadQuestion();
            });
        }, isAnimationsEnabled() ? 350 : 0);
    }
}

function skipCurrentVoiceCard() {
    isVoiceCardsMutedThisSession = true;
    if (speechCardsSwitch) speechCardsSwitch.selected = false;
    if (speechCardsSubtitle) speechCardsSubtitle.textContent = t('speech_cards_disabled_desc');

    showNotificationPill(t('speech_cards_muted_toast'), 'voice_explain.svg');

    console.log("[Voice] 'Não posso falar agora' acionado. Pulando cards de fala nesta sessão.");
    animateCardToBack(() => {
        loadQuestion();
    });
}

let isOpenSubmitting = false;
let isBeingCorrected = false;

function resetUI() {
    isOpenSubmitting = false;
    isAnimating = false;
    isBeingCorrected = false;
    hideHighlightPopup();
    hideDeckCompletionScreen();
    [answerInput, answerInput1, answerInput2].forEach(inp => {
        inp.value = ''; inp.disabled = false;
        inp.classList.remove('animate-pulse', 'border-red-500');
    });
    answerInput.placeholder = t('type_answer_placeholder');

    const fillInputs = questionCard.querySelectorAll('.fill-blank-input');
    fillInputs.forEach(inp => {
        inp.disabled = false;
        inp.readOnly = false;
        inp.classList.remove('animate-pulse', 'border-red-500', 'border-green-500', 'border-amber-400', 'bg-amber-50', 'bg-green-50', 'bg-red-50', 'text-amber-800', 'fill-box-shake', 'fill-box-pop', 'fill-box-pop-yellow');
    });

    if (currentQuestion) {
        delete currentQuestion.isBeingCorrected;
    }
    isAnkiFlipped = false;
    if (ankiAnswerContainer) ankiAnswerContainer.classList.add('hidden');
    if (ankiAnswerImageContainer) ankiAnswerImageContainer.classList.add('hidden');
    if (ankiAnswerImagePlaceholder) ankiAnswerImagePlaceholder.classList.add('hidden');
    if (ankiAnswerImageError) ankiAnswerImageError.classList.add('hidden');
    if (questionImageError) questionImageError.classList.add('hidden');
    if (ankiAnswerImage) {
        ankiAnswerImage.classList.add('hidden');
        ankiAnswerImage.classList.remove('opacity-100');
        ankiAnswerImage.classList.add('opacity-0');
        ankiAnswerImage.src = '';
    }
    if (ankiControlsArea) ankiControlsArea.classList.add('hidden');
    if (voiceControlsArea) voiceControlsArea.classList.add('hidden');
    if (voiceAnswerContainer) voiceAnswerContainer.classList.add('hidden');
    if (voiceEvaluatedControls) voiceEvaluatedControls.classList.add('hidden');
    resetVoiceUIState();

    submitBtn.disabled = false;
    submitBtn.classList.remove('hidden');
    nextQuestionBtn.classList.add('hidden');
    correctionOptions.classList.add('hidden');
    correctionOptions.classList.remove('flex');
    questionCard.classList.remove('glow-correct', 'glow-incorrect', 'card-shake');
    questionText.classList.remove('text-red-500', 'text-green-500');

    const feedbackElem = document.getElementById('question-feedback-text');
    if (feedbackElem) {
        feedbackElem.innerHTML = '';
        feedbackElem.classList.add('hidden');
    }

    const dynamicMcBtns = mcAnswerArea.querySelectorAll('.mc-option-btn');
    dynamicMcBtns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('bg-green-500', 'bg-red-500', 'text-white');
        btn.classList.add('bg-gray-200');
    });

    console.log("[Game] resetUI executado: campos limpos e botões reativados.");
}

function handleFillSubmit() {
    // Auto-heal: se o botão de verificar está ativo/habilitado e visível, não estamos em estado de correção
    if (submitBtn && !submitBtn.disabled && !submitBtn.classList.contains('hidden')) {
        isBeingCorrected = false;
        if (currentQuestion) delete currentQuestion.isBeingCorrected;
    }

    console.log("[Game] handleFillSubmit chamado.", {
        isOpenSubmitting,
        btnDisabled: submitBtn?.disabled,
        isBeingCorrected: isBeingCorrected || currentQuestion?.isBeingCorrected,
        isAnimating
    });

    if (isOpenSubmitting || submitBtn.disabled || isBeingCorrected || currentQuestion?.isBeingCorrected || isAnimating) {
        console.warn("[Game] Submissão fill bloqueada por flag:", {
            isOpenSubmitting,
            btnDisabled: submitBtn?.disabled,
            isBeingCorrected: isBeingCorrected || currentQuestion?.isBeingCorrected,
            isAnimating
        });
        return;
    }
    const inputs = Array.from(questionCard.querySelectorAll('.fill-blank-input'));
    if (inputs.length === 0) {
        console.warn("[Game] Nenhuma lacuna .fill-blank-input encontrada no card.");
        return;
    }

    const userAnswers = inputs.map(inp => inp.value.trim());
    if (userAnswers.every(ans => !ans)) {
        console.warn("[Game] Submissão fill ignorada: todas as lacunas estão vazias.");
        inputs[0].classList.add('animate-pulse', 'border-red-500');
        setTimeout(() => inputs[0].classList.remove('animate-pulse', 'border-red-500'), 800);
        inputs[0].focus();
        return;
    }

    isOpenSubmitting = true;

    try {
        const rawExpected = currentQuestion.answers && currentQuestion.answers.length > 0
            ? currentQuestion.answers
            : String(currentQuestion.answer || '').split(';').map(s => s.trim());

        let allCorrect = true;
        const blankResults = inputs.map((input, i) => {
            const userVal = userAnswers[i] || '';
            const expectedVal = rawExpected[i] || '';
            const synonyms = expectedVal.split('/').map(s => s.trim()).filter(Boolean);

            const maxSim = synonyms.length > 0
                ? Math.max(...synonyms.map(syn => calculateSimilarity(normalizeString(userVal), normalizeString(syn))))
                : 0;
            const isCorrect = maxSim >= 0.8;

            if (!isCorrect) allCorrect = false;

            return { input, userVal, expectedVal, synonyms, isCorrect, maxSim };
        });

        console.log("[Game] Lacunas avaliadas:", {
            allCorrect,
            results: blankResults.map(r => ({
                user: r.userVal,
                expected: r.expectedVal,
                similarity: Math.round(r.maxSim * 100) + '%',
                isCorrect: r.isCorrect
            }))
        });

        currentQuestion._lastUserAnswer = userAnswers.join(' ; ');

        if (allCorrect) {
            inputs.forEach(input => {
                input.readOnly = true;
                input.blur();
                input.classList.remove('border-dashed', 'border-blue-400');
                input.classList.add('border-solid', 'border-green-500', 'bg-green-50', 'text-green-600');
            });
            showFeedback(true);
        } else {
            isAnimating = true;

            // Phase 1: Correct boxes turn green immediately; wrong boxes turn red and shake side-to-side for ~500ms
            blankResults.forEach(({ input, isCorrect }) => {
                input.readOnly = true;
                input.blur();
                input.classList.remove('border-dashed', 'border-blue-400', 'border-green-500', 'border-red-500', 'border-amber-400', 'bg-green-50', 'bg-red-50', 'bg-amber-50', 'text-green-600', 'text-red-600', 'text-amber-800', 'fill-box-shake', 'fill-box-pop', 'fill-box-pop-yellow');

                if (isCorrect) {
                    input.classList.add('border-solid', 'border-green-500', 'bg-green-50', 'text-green-600');
                } else {
                    input.classList.add('border-solid', 'border-red-500', 'bg-red-50', 'text-red-600', 'fill-box-shake');
                }
            });

            triggerHaptic('shake');
            showFeedback(false);

            // Phase 2: At ~550ms, wrong boxes pop yellow with the right answer so user knows where to focus (total duration ~1.2s)
            setTimeout(() => {
                let anyPopped = false;
                blankResults.forEach(({ input, synonyms, expectedVal, isCorrect }) => {
                    if (!isCorrect) {
                        anyPopped = true;
                        const primaryExpected = synonyms[0] || expectedVal;
                        input.classList.remove('border-red-500', 'bg-red-50', 'text-red-600', 'fill-box-shake');
                        input.classList.add('border-solid', 'border-amber-400', 'bg-amber-50', 'text-amber-800', 'fill-box-pop-yellow');
                        input.value = primaryExpected;
                        if (synonyms.length > 1) {
                            input.title = synonyms.join(' / ');
                        }

                        // Dynamically adjust box width to fit the correct answer comfortably
                        const len = primaryExpected.length;
                        input.style.width = Math.max(64, Math.min(240, (len + 2) * 11)) + 'px';
                    }
                });

                if (anyPopped) {
                    triggerHaptic('fillPop');
                }

                // Unlock next navigation once the 1.2s correction animation completes
                setTimeout(() => {
                    isAnimating = false;
                }, 650);
            }, 550);
        }
    } catch (err) {
        console.error("[Game] Erro durante handleFillSubmit:", err);
        isOpenSubmitting = false;
        isAnimating = false;
    }
}

function handleImageArrowsSubmit() {
    const arrows = Array.isArray(currentQuestion?.imageArrows) ? currentQuestion.imageArrows : [];
    if (arrows.length === 0) {
        showFeedback(true);
        return;
    }

    const inputs = Array.from(document.querySelectorAll('.game-arrow-input'));
    const userAnswers = inputs.map(inp => inp.value.trim());

    // Check if at least one input has content
    const hasAnyInput = userAnswers.some(ans => ans.length > 0);
    if (!hasAnyInput) {
        inputs[0]?.classList.add('animate-pulse', 'border-red-500');
        setTimeout(() => inputs[0]?.classList.remove('animate-pulse', 'border-red-500'), 800);
        inputs[0]?.focus();
        return;
    }

    isOpenSubmitting = true;

    try {
        let allCorrect = true;
        const arrowResults = arrows.map((arrow, idx) => {
            const input = inputs[idx];
            const userVal = normalizeString(input ? input.value : '');
            const expectedRaw = arrow.label || '';
            const synonyms = String(expectedRaw).split('/').map(s => s.trim()).filter(Boolean);
            const maxSim = synonyms.length > 0
                ? Math.max(...synonyms.map(syn => calculateSimilarity(userVal, normalizeString(syn))))
                : (userVal === normalizeString(expectedRaw) ? 1.0 : 0.0);
            const isCorrect = maxSim >= 0.8 || (userVal.length > 0 && synonyms.some(syn => normalizeString(syn) === userVal));
            if (!isCorrect) allCorrect = false;
            return {
                idx,
                input,
                userVal,
                expectedRaw,
                synonyms,
                maxSim,
                isCorrect
            };
        });

        console.log("[Game] Image arrows avaliadas:", {
            allCorrect,
            results: arrowResults.map(r => ({
                idx: r.idx + 1,
                user: r.userVal,
                expected: r.expectedRaw,
                similarity: Math.round(r.maxSim * 100) + '%',
                isCorrect: r.isCorrect
            }))
        });

        currentQuestion._lastUserAnswer = userAnswers.map((u, i) => `${i + 1}. ${u}`).join(' ; ');

        if (allCorrect) {
            arrowResults.forEach(({ input }) => {
                if (input) {
                    input.readOnly = true;
                    input.blur();
                    input.classList.remove('border-red-500', 'bg-red-50', 'text-red-700');
                    input.classList.add('border-green-500', 'bg-green-50', 'text-green-700');
                }
            });
            showFeedback(true);
        } else {
            isAnimating = true;
            arrowResults.forEach(({ input, expectedRaw, synonyms, isCorrect, idx }) => {
                if (!input) return;
                input.readOnly = true;
                input.blur();
                input.classList.remove('border-green-500', 'border-red-500', 'bg-green-50', 'bg-red-50', 'text-green-700', 'text-red-700', 'card-shake');

                if (isCorrect) {
                    input.classList.add('border-green-500', 'bg-green-50', 'text-green-700');
                } else {
                    input.classList.add('border-red-500', 'bg-red-50', 'text-red-700', 'card-shake');
                    const feedbackDiv = document.getElementById(`game-arrow-feedback-${idx}`);
                    if (feedbackDiv) {
                        const primaryExpected = synonyms[0] || expectedRaw;
                        feedbackDiv.innerHTML = `<span class="material-symbols-rounded text-sm text-green-600">check_circle</span> <span class="text-gray-500 text-[11px] font-normal">${t('correct_structure_is')}</span> <span class="text-green-700 font-bold">${escapeHtml(primaryExpected)}</span>`;
                        feedbackDiv.classList.remove('hidden');
                    }
                }
            });

            triggerHaptic('shake');
            showFeedback(false);

            setTimeout(() => {
                isAnimating = false;
            }, 500);
        }
    } catch (err) {
        console.error("[Game] Erro durante handleImageArrowsSubmit:", err);
        isOpenSubmitting = false;
        isAnimating = false;
    }
}

function handleOpenSubmit() {
    // Auto-heal: se o botão de verificar está ativo/habilitado e visível, não estamos em estado de correção
    if (submitBtn && !submitBtn.disabled && !submitBtn.classList.contains('hidden')) {
        isBeingCorrected = false;
        if (currentQuestion) delete currentQuestion.isBeingCorrected;
    }

    console.log("[Game] handleOpenSubmit acionado.", {
        type: currentQuestion?.type,
        isOpenSubmitting,
        btnDisabled: submitBtn?.disabled,
        isBeingCorrected: isBeingCorrected || currentQuestion?.isBeingCorrected
    });

    if (isOpenSubmitting || submitBtn.disabled || isBeingCorrected || currentQuestion?.isBeingCorrected) {
        console.warn("[Game] handleOpenSubmit bloqueado por flag:", {
            isOpenSubmitting,
            btnDisabled: submitBtn?.disabled,
            isBeingCorrected: isBeingCorrected || currentQuestion?.isBeingCorrected
        });
        return;
    }
    const type = currentQuestion?.type;

    if (type === 'fill') {
        handleFillSubmit();
        return;
    }
    if (type === 'image_arrows') {
        handleImageArrowsSubmit();
        return;
    }

    const ans1 = normalizeString(answerInput.value);
    const ans1_d = normalizeString(answerInput1.value);
    const ans2_d = normalizeString(answerInput2.value);

    if (type === 'open_double') {
        if (!ans1_d || !ans2_d) {
            console.warn("[Game] Submissão open_double ignorada: campos incompletos.", { ans1_d, ans2_d });
            if (!ans1_d) {
                answerInput1.classList.add('animate-pulse', 'border-red-500');
                setTimeout(() => answerInput1.classList.remove('animate-pulse', 'border-red-500'), 800);
                answerInput1.focus();
            } else {
                answerInput2.classList.add('animate-pulse', 'border-red-500');
                setTimeout(() => answerInput2.classList.remove('animate-pulse', 'border-red-500'), 800);
                answerInput2.focus();
            }
            return;
        }
    } else {
        if (!ans1) {
            console.warn("[Game] Submissão ignorada: campo de resposta vazio.");
            answerInput.classList.add('animate-pulse', 'border-red-500');
            setTimeout(() => answerInput.classList.remove('animate-pulse', 'border-red-500'), 800);
            answerInput.focus();
            return;
        }
    }

    isOpenSubmitting = true;

    try {
        const correct1 = String(currentQuestion?.answer || "").split('/').map(s => s.trim()).filter(Boolean);
        const correct2 = String(currentQuestion?.answer2 || "").split('/').map(s => s.trim()).filter(Boolean);

        const sim1 = type === 'open_double'
            ? (correct1.length > 0 ? Math.max(...correct1.map(c => calculateSimilarity(ans1_d, normalizeString(c)))) : 0)
            : (correct1.length > 0 ? Math.max(...correct1.map(c => calculateSimilarity(ans1, normalizeString(c)))) : 0);

        const sim2 = type === 'open_double'
            ? (correct2.length > 0 ? Math.max(...correct2.map(c => calculateSimilarity(ans2_d, normalizeString(c)))) : 0)
            : 1.0;

        const isCorrect1 = sim1 >= 0.8;
        const isCorrect2 = sim2 >= 0.8;
        const isCorrect = isCorrect1 && isCorrect2;

        console.log("[Game] Resposta do usuário avaliada:", {
            type,
            userAnswer: type === 'open_double' ? `${ans1_d} | ${ans2_d}` : ans1,
            expected: type === 'open_double' ? `${currentQuestion.answer} | ${currentQuestion.answer2}` : currentQuestion.answer,
            sim1: Math.round(sim1 * 100) + '%',
            sim2: Math.round(sim2 * 100) + '%',
            isCorrect
        });

        showFeedback(isCorrect);
    } catch (err) {
        console.error("[Game] Erro durante handleOpenSubmit:", err);
        isOpenSubmitting = false;
    }
}

function handleMCSubmit(btn) {
    if (btn.disabled) return;
    const chosenText = btn.dataset.optionText || btn.querySelector('.mc-option-label')?.textContent || btn.textContent;
    const isCorrect = normalizeString(chosenText) === normalizeString(currentQuestion.answer);
    console.log("[Game] Opção múltipla escolha clicada:", {
        chosen: chosenText,
        expected: currentQuestion.answer,
        isCorrect
    });
    showFeedback(isCorrect, btn);
}

function showFeedback(isCorrect, element) {
    try {
        console.log("[Game] showFeedback executado:", {
            isCorrect,
            cardType: currentQuestion?.type,
            step: currentStep,
            score
        });

        // Capturar a resposta do usuário para o contexto do chat de IA
        let userAnswer = "";
        if (currentQuestion.type === 'open_double') {
            userAnswer = `${answerInput1.value} ; ${answerInput2.value}`;
        } else if (currentQuestion.type === 'multiple_choice') {
            userAnswer = element ? (element.dataset.optionText || element.querySelector('.mc-option-label')?.textContent || element.textContent) : "";
        } else if (currentQuestion.type === 'fill') {
            const fillInputs = Array.from(questionCard.querySelectorAll('.fill-blank-input'));
            userAnswer = currentQuestion._lastUserAnswer || fillInputs.map(inp => inp.value.trim()).join(' ; ');
        } else if (currentQuestion.type === 'image_arrows') {
            const arrowInputs = Array.from(document.querySelectorAll('.game-arrow-input'));
            userAnswer = currentQuestion._lastUserAnswer || arrowInputs.map((inp, i) => `${i + 1}. ${inp.value.trim()}`).join(' ; ');
        } else {
            userAnswer = answerInput.value;
        }
        setLastUserAnswerForChat(userAnswer);

        const elapsedSeconds = (Date.now() - questionStartTime) / 1000;
        try {
            recordStatsAnswer({
                card: currentQuestion,
                isCorrect: isCorrect,
                rating: isCorrect ? 'correct' : 'incorrect',
                timeSpentSeconds: elapsedSeconds,
                userAnswer: userAnswer
            });
        } catch (statErr) {
            console.error("[Game] Erro ao registrar estatística (não bloqueante):", statErr);
        }

        handleDailyStreakOnCardAnswered();

        const isLastCard = isCorrect && (questionsPool.length === 1 && questionsPool.includes(currentQuestion));
        const ballIdx = !isLastCard ? createBall(isCorrect) : null;
        if (!isLastCard) {
            questionCard.classList.add(isCorrect ? 'glow-correct' : 'glow-incorrect');
        }

        if (isCorrect) {
            triggerHaptic('correct');
            playFeedbackSound('correct');
        } else {
            playFeedbackSound('wrong');
        }

        // Update streak counter (Anki cards are handled separately and do NOT touch streak)
        if (currentQuestion && currentQuestion.type !== 'anki') {
            if (isCorrect) {
                incrementStreak();
            } else {
                resetStreak();
            }
        }

        if (!isCorrect) {
            askAiBtn.classList.remove('hidden');
            if (isUserPro()) {
                askAiBtn.classList.remove('is-paywalled');
                askAiBtn.querySelector('.paywall-tab-icon')?.remove();
                if (userAnswer && isTutorEnabled()) {
                    checkAnswerWithAi(currentQuestion, userAnswer, ballIdx);
                }
            } else {
                askAiBtn.classList.add('is-paywalled');
                if (!askAiBtn.querySelector('.paywall-tab-icon')) {
                    const icon = document.createElement('img');
                    icon.src = '../assets/img/paywall.svg';
                    icon.className = 'w-4 h-4 paywall-tab-icon ml-2 inline align-middle';
                    icon.alt = 'Pro';
                    askAiBtn.appendChild(icon);
                }
            }
        } else {
            askAiBtn.classList.add('hidden');
        }

        if (element) {
            const dynamicMcBtns = mcAnswerArea.querySelectorAll('.mc-option-btn');
            dynamicMcBtns.forEach(b => b.disabled = true);
            element.classList.add(isCorrect ? 'mc-correct' : 'mc-incorrect');
            if (!isCorrect) {
                dynamicMcBtns.forEach(b => {
                    const bText = b.dataset.optionText || b.querySelector('.mc-option-label')?.textContent || b.textContent;
                    if (normalizeString(bText) === normalizeString(currentQuestion.answer)) b.classList.add('mc-correct');
                });
            }
        }

        if (!isCorrect) {
            if (currentQuestion.type !== 'fill') {
                // Card shakes on wrong guess and waits for user to skip/ask/edit/delete
                questionCard.classList.remove('card-shake');
                void questionCard.offsetWidth; // Force reflow
                questionCard.classList.add('card-shake');
                triggerHaptic('shake');
                setTimeout(() => questionCard.classList.remove('card-shake'), 450);
            }

            isBeingCorrected = true;
            currentQuestion.isBeingCorrected = true;
            isOpenSubmitting = false;

            if (activeMode === 'notebook') {
                const schedule = calculateNotebookNextSchedule({
                    card: currentQuestion,
                    quality: 'again',
                    currentStep,
                    poolSize: questionsPool.length
                });
                Object.assign(currentQuestion, schedule);
                currentQuestion.wrongCount = (currentQuestion.wrongCount || 0) + 1;
                currentQuestion.correctStreak = 0;

                const cardInAll = allQuestions.find(q => q === currentQuestion || (q.description && stripHtml(q.description) === stripHtml(currentQuestion.description)));
                if (cardInAll) {
                    Object.assign(cardInAll, schedule);
                    cardInAll.wrongCount = currentQuestion.wrongCount;
                    cardInAll.correctStreak = 0;
                }
                saveGameState();
                updateScoreDisplay();
                precomputeNextCandidate();
            } else {
                // Spaced repetition & leech tracking
                currentQuestion.wrongCount = (currentQuestion.wrongCount || 0) + 1;
                currentQuestion.correctStreak = 0;
                const gap = calculateThinkingGap(elapsedSeconds, currentQuestion, questionsPool.length);
                currentQuestion.dueStep = currentStep + gap;
                console.log("[Algorithm] Card incorreto reagendado:", {
                    tempoPensamento: Math.round(elapsedSeconds * 10) / 10 + 's',
                    gap,
                    currentStep,
                    dueStep: currentQuestion.dueStep,
                    totalErros: currentQuestion.wrongCount
                });
                saveGameState();
                precomputeNextCandidate();
            }

            if (!element) {
                updateFeedbackText();
                submitBtn.classList.add('hidden');
                submitBtn.disabled = true;
                [answerInput, answerInput1, answerInput2].forEach(inp => {
                    if (inp) inp.disabled = true;
                });
                if (currentQuestion.type !== 'fill') {
                    const fillInputs = questionCard.querySelectorAll('.fill-blank-input');
                    fillInputs.forEach(inp => inp.disabled = true);
                }
                const arrowInputs = document.querySelectorAll('.game-arrow-input');
                arrowInputs.forEach(inp => inp.disabled = true);
            }
            nextQuestionBtn.classList.remove('hidden');
            correctionOptions.classList.add('flex');
            correctionOptions.classList.remove('hidden');
        } else {
            isBeingCorrected = false;
            delete currentQuestion.isBeingCorrected;

            if (activeMode === 'notebook') {
                const quality = inferNotebookQuality({
                    card: currentQuestion,
                    isCorrect: true,
                    elapsedSeconds
                });
                const schedule = calculateNotebookNextSchedule({
                    card: currentQuestion,
                    quality,
                    currentStep,
                    poolSize: questionsPool.length
                });
                Object.assign(currentQuestion, schedule);
                currentQuestion.correctStreak = (currentQuestion.correctStreak || 0) + 1;
                notebookReviewsCount++;

                const cardInAll = allQuestions.find(q => q === currentQuestion || (q.description && stripHtml(q.description) === stripHtml(currentQuestion.description)));
                if (cardInAll) {
                    Object.assign(cardInAll, schedule);
                    cardInAll.correctStreak = currentQuestion.correctStreak;
                }

                saveGameState();
                updateScoreDisplay();
                checkAndCelebrateNotebookDailyGoal(true);

                setTimeout(() => {
                    animateCardToBack(() => {
                        loadQuestion();
                    });
                }, 400);
                return;
            }

            currentQuestion.correctStreak = (currentQuestion.correctStreak || 0) + 1;
            const totalWrongs = currentQuestion.wrongCount || 0;
            const isLeech = isLeechCard(currentQuestion);
            const shouldRemove = shouldGraduateCard(currentQuestion, elapsedSeconds);

            console.log("[Algorithm] Card correto avaliado:", {
                totalWrongs,
                correctStreak: currentQuestion.correctStreak,
                isLeech,
                shouldRemove,
                latencia: Math.round(elapsedSeconds * 10) / 10 + 's'
            });

            if (shouldRemove) {
                score++;
                const idx = questionsPool.indexOf(currentQuestion);
                if (idx !== -1) {
                    questionsPool.splice(idx, 1);
                } else if (currentQuestionIndexInPool >= 0 && currentQuestionIndexInPool < questionsPool.length) {
                    questionsPool.splice(currentQuestionIndexInPool, 1);
                }
                saveGameState();
                console.log("[Game] Card removido do pool ativo. Restam:", questionsPool.length);

                // On the last card of deck, skip normal animations and play end game directly!
                if (questionsPool.length === 0) {
                    clearBalls();
                    questionCard.classList.remove('glow-correct', 'glow-incorrect', 'card-shake');
                    updateScoreDisplay();
                    showDeckCompletionScreen();
                    return;
                }

                setTimeout(() => {
                    animateCardToHeader(() => {
                        updateScoreDisplay();
                        loadQuestion();
                    });
                }, 400);
            } else {
                // Card mantido para consolidação (leech ou esforço extremo de recuperação)
                const reinforcGap = Math.max(8, Math.min(14, Math.round(questionsPool.length * 0.6)));
                currentQuestion.dueStep = currentStep + reinforcGap;
                saveGameState();
                console.log("[Game] Card mantido no jogo para consolidação neural. dueStep:", currentQuestion.dueStep);
                setTimeout(() => {
                    animateCardToBack(() => {
                        loadQuestion();
                    });
                }, 400);
            }
        }
    } catch (err) {
        console.error("[Game] Erro fatal em showFeedback:", err);
        isOpenSubmitting = false;
    }
}

function updateFeedbackText() {
    ensureQuestionStructure();
    const bodyElem = document.getElementById('question-body-text');
    const feedbackElem = document.getElementById('question-feedback-text');

    if (currentQuestion && (isBeingCorrected || currentQuestion.isBeingCorrected)) {
        if (bodyElem && currentQuestion.type !== 'fill') {
            bodyElem.innerHTML = renderMathAndMarkdown(currentQuestion.description || '');
        }
        if (feedbackElem) {
            feedbackElem.replaceChildren();
            if (currentQuestion.type === 'open_double') {
                const label1 = currentQuestion.placeholder1 || t('answer_1_label');
                const label2 = currentQuestion.placeholder2 || t('answer_2_label');
                const a1 = (currentQuestion.answer || '').replace('/', ' / ');
                const a2 = (currentQuestion.answer2 || '').replace('/', ' / ');

                const span1 = document.createElement('span');
                span1.className = 'text-green-500 font-semibold mt-2 block';
                span1.textContent = `${label1}: ${a1}`;

                const span2 = document.createElement('span');
                span2.className = 'text-green-500 font-semibold mt-2 block';
                span2.textContent = `${label2}: ${a2}`;

                feedbackElem.append(span1, span2);
                feedbackElem.classList.remove('hidden');
            } else if (currentQuestion.type === 'fill' || currentQuestion.type === 'image_arrows') {
                feedbackElem.classList.add('hidden');
            } else if (currentQuestion.type === 'anki') {
                const span = document.createElement('span');
                span.className = 'text-indigo-500 font-semibold mt-2 block';
                span.textContent = `${t('answer_prefix')}: ${currentQuestion.answer || ''}`;
                feedbackElem.append(span);
                feedbackElem.classList.remove('hidden');
            } else {
                const a1 = (currentQuestion.answer || '').replace('/', ' / ');
                const span = document.createElement('span');
                span.className = 'text-green-500 font-semibold mt-2 block';
                span.textContent = `${t('answer_prefix')}: ${a1}`;
                feedbackElem.append(span);
                feedbackElem.classList.remove('hidden');
            }
        }
    } else {
        if (bodyElem && currentQuestion && currentQuestion.type !== 'fill') {
            bodyElem.innerHTML = renderMathAndMarkdown(currentQuestion.description || '');
        }
        if (feedbackElem) {
            feedbackElem.replaceChildren();
            feedbackElem.classList.add('hidden');
        }
    }
}

function sanitizeCardForStorage(card) {
    if (!card || typeof card !== 'object') return card;
    const sanitized = {};
    for (const [key, value] of Object.entries(card)) {
        if (value !== undefined && key !== 'isBeingCorrected' && key !== '_lastUserAnswer') {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

let saveStateTimeout = null;

function executeSaveGameState() {
    saveStateTimeout = null;
    try {
        const cleanPool = (questionsPool || []).map(sanitizeCardForStorage);
        const cleanAll = (allQuestions || []).map(sanitizeCardForStorage);
        const now = Date.now();

        if (activeMode === 'notebook') {
            localStorage.setItem(NOTEBOOK_STORAGE_KEY, encodeStoragePayload({
                questionsPool: cleanPool,
                allQuestions: cleanAll,
                score,
                notebookReviewsCount,
                currentStreak,
                currentStep,
                consecutiveDueCardsCount,
                consecutiveNewCardsCount,
                deckTitle: "Caderno",
                updatedAt: now
            }));
        } else if (activeMode === 'exam') {
            let examData = {};
            try {
                examData = JSON.parse(localStorage.getItem('flashcardsExam')) || {};
            } catch (err) {}
            localStorage.setItem('flashcardsExam', encodeStoragePayload({
                ...examData,
                questionsPool: cleanPool,
                allQuestions: cleanAll,
                score,
                currentStreak,
                currentStep,
                consecutiveDueCardsCount,
                consecutiveNewCardsCount,
                deckTitle: "Semana de Provas",
                updatedAt: now
            }));
        } else {
            localStorage.setItem('flashcardsSave', encodeStoragePayload({
                questionsPool: cleanPool,
                allQuestions: cleanAll,
                score,
                currentStreak,
                currentStep,
                consecutiveDueCardsCount,
                consecutiveNewCardsCount,
                deckTitle: deckTitle.textContent,
                updatedAt: now
            }));
        }

        // Auto-update active slot and sync shared link if deck is shared
        syncActiveSlotState();
        debouncedSyncSlotsToCloud(300);
    } catch (e) {
        console.error("Erro ao salvar estado do jogo no localStorage:", e);
    }
}

function saveGameState(immediate = false) {
    if (immediate) {
        if (saveStateTimeout) {
            clearTimeout(saveStateTimeout);
            saveStateTimeout = null;
        }
        executeSaveGameState();
        return;
    }

    if (!saveStateTimeout) {
        saveStateTimeout = setTimeout(() => {
            executeSaveGameState();
        }, 80);
    }
}

window.addEventListener('beforeunload', () => {
    if (saveStateTimeout) {
        clearTimeout(saveStateTimeout);
        executeSaveGameState();
    }
    syncSlotsToCloud();
});
window.addEventListener('pagehide', () => {
    if (saveStateTimeout) {
        clearTimeout(saveStateTimeout);
        executeSaveGameState();
    }
    syncSlotsToCloud();
});

// getNotebookDailyGoal is imported from ./engine/notebook-scheduler.js

function setNotebookDailyGoal(goal) {
    try {
        if (!goal || goal <= 0) {
            localStorage.removeItem('flashcards_notebook_daily_goal');
        } else {
            localStorage.setItem('flashcards_notebook_daily_goal', String(goal));
        }
        debouncedSyncSlotsToCloud();
    } catch (e) {
        console.error("Erro ao salvar meta diária:", e);
    }
}

// --- HEADER STATS CUSTOMIZATION MODULE ---
const HEADER_PINNED_DECK_STORAGE_KEY = 'flashcards_header_pinned_stats_deck';
const HEADER_PINNED_NOTEBOOK_STORAGE_KEY = 'flashcards_header_pinned_stats_notebook';
const LEGACY_HEADER_PINNED_STORAGE_KEY = 'flashcards_header_pinned_stats';
const DEFAULT_PINNED_STATS = ['remaining', 'score'];
const MAX_PINNED_STATS = 3;
const MIN_PINNED_STATS = 1;

const STAT_I18N_KEYS = {
    remaining: { title: 'stat_remaining_title', label: 'stat_remaining_label', notebookLabel: 'stat_remaining_notebook_label', desc: 'stat_remaining_desc' },
    score: { title: 'stat_score_title', label: 'stat_score_label', notebookLabel: 'stat_score_notebook_label', desc: 'stat_score_desc' },
    estRemainingTime: { title: 'stat_estRemainingTime_title', label: 'stat_estRemainingTime_label', notebookLabel: 'stat_estRemainingTime_notebook_label', desc: 'stat_estRemainingTime_desc' },
    pomodoro: { title: 'stat_pomodoro_title', label: 'stat_pomodoro_label', notebookLabel: 'stat_pomodoro_notebook_label', desc: 'stat_pomodoro_desc' },
    accuracy: { title: 'stat_accuracy_title', label: 'stat_accuracy_label', notebookLabel: 'stat_accuracy_notebook_label', desc: 'stat_accuracy_desc' },
    totalTime: { title: 'stat_totalTime_title', label: 'stat_totalTime_label', notebookLabel: 'stat_totalTime_notebook_label', desc: 'stat_totalTime_desc' },
    avgTimePerCard: { title: 'stat_avgTimePerCard_title', label: 'stat_avgTimePerCard_label', notebookLabel: 'stat_avgTime_notebook_label', desc: 'stat_avgTimePerCard_desc' },
};

function getStatI18n(statId) {
    const keys = STAT_I18N_KEYS[statId] || {};
    return {
        title: keys.title ? t(keys.title) : '',
        label: keys.label ? t(keys.label) : '',
        notebookLabel: keys.notebookLabel ? t(keys.notebookLabel) : '',
        desc: keys.desc ? t(keys.desc) : ''
    };
}

const AVAILABLE_HEADER_STATS = [
    {
        id: 'remaining',
        label: 'Restantes',
        notebookLabel: 'Para Hoje',
        title: 'Cartas Restantes',
        description: 'Cartas pendentes para responder nesta rodada',
        icon: 'filter_none',
        iconBg: 'bg-blue-50 text-blue-600',
        colorClass: 'text-blue-600',
        getValue: () => {
            if (activeMode === 'notebook') {
                const dueInfo = getNotebookDueCounts(allQuestions);
                const dailyGoal = getNotebookDailyGoal();
                const reviewedToday = dueInfo.reviewedToday || 0;
                return dailyGoal > 0 ? Math.max(0, dailyGoal - reviewedToday) : (dueInfo.dueToday || 0);
            }
            return questionsPool.length;
        },
        getSubtitle: () => {
            if (activeMode === 'notebook') {
                const dueInfo = getNotebookDueCounts(allQuestions);
                const dailyGoal = getNotebookDailyGoal();
                const reviewedToday = dueInfo.reviewedToday || 0;
                return dailyGoal > 0
                    ? t('header_stat_goal_sub', { reviewed: reviewedToday, goal: dailyGoal })
                    : t('header_stat_due_today_sub', { count: dueInfo.dueToday || 0 });
            }
            return t('stat_cards_remaining', { count: questionsPool.length });
        }
    },
    {
        id: 'score',
        label: 'Score',
        notebookLabel: 'Revisões',
        title: 'Score / Acertos',
        description: 'Total de revisões ou respostas corretas acumuladas',
        icon: 'star',
        iconBg: 'bg-amber-50 text-amber-600',
        colorClass: 'text-gray-900',
        getValue: () => {
            return activeMode === 'notebook' ? notebookReviewsCount : score;
        },
        getSubtitle: () => {
            return activeMode === 'notebook'
                ? t('header_stat_reviews_done', { count: notebookReviewsCount })
                : t('header_stat_correct_accum', { count: score });
        }
    },
    {
        id: 'estRemainingTime',
        label: 'Previsão',
        notebookLabel: 'Previsão',
        title: 'Previsão de Término',
        description: 'Tempo estimado para concluir o baralho atual',
        icon: 'hourglass_bottom',
        iconBg: 'bg-orange-50 text-orange-600',
        colorClass: 'text-amber-600',
        getValue: () => {
            let remCards = 0;
            if (activeMode === 'notebook') {
                const dueInfo = getNotebookDueCounts(allQuestions);
                const dailyGoal = getNotebookDailyGoal();
                const reviewedToday = dueInfo.reviewedToday || 0;
                remCards = dailyGoal > 0 ? Math.max(0, dailyGoal - reviewedToday) : (dueInfo.dueToday || 0);
            } else {
                remCards = questionsPool.length;
            }
            if (remCards <= 0) return '00:00';
            const metrics = getCurrentSessionMetrics();
            const avgSec = (metrics && metrics.avgTimePerCardSeconds > 0) ? metrics.avgTimePerCardSeconds : 15;
            const totalSec = Math.round(remCards * avgSec);
            return formatTimeDisplay(totalSec);
        },
        getSubtitle: () => {
            const metrics = getCurrentSessionMetrics();
            const avgSec = (metrics && metrics.avgTimePerCardSeconds > 0) ? Math.round(metrics.avgTimePerCardSeconds) : 15;
            return t('header_stat_est_time_sub', { sec: avgSec });
        }
    },
    {
        id: 'pomodoro',
        label: 'Pomodoro',
        notebookLabel: 'Pomodoro',
        title: 'Tempo no Pomodoro',
        description: 'Contagem regressiva de foco ou pausa do Pomodoro',
        icon: 'timer',
        iconBg: 'bg-rose-50 text-rose-600',
        colorClass: 'text-rose-600',
        getValue: () => {
            const status = getPomodoroStatus();
            if (!status || !status.enabled) return 'Off';
            return status.formattedTime || '25:00';
        },
        getSubtitle: () => {
            const status = getPomodoroStatus();
            if (!status || !status.enabled) return t('pomodoro_disabled');
            const modeNames = { study: t('pomodoro_cycle_focus'), shortBreak: t('pomodoro_short_break'), longBreak: t('pomodoro_long_break') };
            const statusName = status.isRunning ? t('active_status') : t('paused');
            return `${modeNames[status.currentMode] || t('pomodoro_cycle_focus')} • ${statusName}`;
        }
    },
    {
        id: 'accuracy',
        label: 'Precisão',
        notebookLabel: 'Precisão',
        title: 'Taxa de Precisão',
        description: 'Porcentagem de acertos na sessão atual',
        icon: 'track_changes',
        iconBg: 'bg-emerald-50 text-emerald-600',
        colorClass: 'text-emerald-600',
        getValue: () => {
            const metrics = getCurrentSessionMetrics();
            const acc = (metrics && typeof metrics.accuracy === 'number') ? Math.round(metrics.accuracy) : 100;
            return `${acc}%`;
        },
        getSubtitle: () => {
            const metrics = getCurrentSessionMetrics();
            return t('header_stat_accuracy_sub', { correct: metrics.correctCount || 0, total: metrics.cardsAnswered || 0 });
        }
    },
    {
        id: 'totalTime',
        label: 'Tempo Total',
        notebookLabel: 'Tempo Total',
        title: 'Tempo de Sessão',
        description: 'Tempo decorrido desde o início da rodada',
        icon: 'schedule',
        iconBg: 'bg-indigo-50 text-indigo-600',
        colorClass: 'text-indigo-600',
        getValue: () => {
            const metrics = getCurrentSessionMetrics();
            const elapsed = metrics.startTime ? Math.max(0, Math.floor((Date.now() - metrics.startTime) / 1000)) : 0;
            return formatTimeDisplay(elapsed);
        },
        getSubtitle: () => {
            return t('header_stat_active_study');
        }
    },
    {
        id: 'avgTimePerCard',
        label: 'Tempo / Card',
        notebookLabel: 'Tempo / Card',
        title: 'Média por Carta',
        description: 'Tempo médio de raciocínio e resposta por card',
        icon: 'speed',
        iconBg: 'bg-teal-50 text-teal-600',
        colorClass: 'text-teal-600',
        getValue: () => {
            const metrics = getCurrentSessionMetrics();
            if (!metrics || !metrics.avgTimePerCardSeconds || metrics.avgTimePerCardSeconds <= 0) {
                return '0s';
            }
            return metrics.avgTimePerCardSeconds < 10
                ? `${metrics.avgTimePerCardSeconds.toFixed(1)}s`
                : `${Math.round(metrics.avgTimePerCardSeconds)}s`;
        },
        getSubtitle: () => {
            const metrics = getCurrentSessionMetrics();
            const count = metrics.activeCardsCount || metrics.cardsAnswered || 0;
            return t('header_stat_avg_sub', { count });
        }
    }
];

function normalizeStatsMode(mode = activeMode) {
    return mode === 'notebook' ? 'notebook' : 'deck';
}

function getPinnedHeaderStats(mode = activeMode) {
    const targetMode = normalizeStatsMode(mode);
    const key = targetMode === 'notebook'
        ? HEADER_PINNED_NOTEBOOK_STORAGE_KEY
        : HEADER_PINNED_DECK_STORAGE_KEY;

    try {
        let saved = localStorage.getItem(key);
        if (!saved && targetMode === 'deck') {
            saved = localStorage.getItem(LEGACY_HEADER_PINNED_STORAGE_KEY);
        }
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length >= MIN_PINNED_STATS && parsed.length <= MAX_PINNED_STATS) {
                const validIds = AVAILABLE_HEADER_STATS.map(s => s.id);
                const filtered = parsed.filter(id => validIds.includes(id));
                if (filtered.length >= MIN_PINNED_STATS) {
                    return filtered;
                }
            }
        }
    } catch (e) {
        console.warn("[HeaderStats] Erro ao ler estatísticas fixadas:", e);
    }
    return [...DEFAULT_PINNED_STATS];
}

function savePinnedHeaderStats(pinnedList, mode = activeMode) {
    const targetMode = normalizeStatsMode(mode);
    const key = targetMode === 'notebook'
        ? HEADER_PINNED_NOTEBOOK_STORAGE_KEY
        : HEADER_PINNED_DECK_STORAGE_KEY;

    try {
        localStorage.setItem(key, encodeStoragePayload(pinnedList));
        if (targetMode === 'deck') {
            localStorage.setItem(LEGACY_HEADER_PINNED_STORAGE_KEY, encodeStoragePayload(pinnedList));
        }
        debouncedSyncSlotsToCloud();
    } catch (e) {
        console.warn("[HeaderStats] Erro ao salvar estatísticas fixadas:", e);
    }
}

export function playHeaderShimmer(variant = 'fire') {
    if (!isAnimationsEnabled()) return;
    const header = document.getElementById('global-header');
    if (!header) return;
    header.classList.remove('header-shimmer-active', 'header-shimmer-fire', 'header-shimmer-goal');
    void header.offsetWidth; // Force DOM reflow
    const variantClass = variant === 'goal' ? 'header-shimmer-goal' : 'header-shimmer-fire';
    header.classList.add('header-shimmer-active', variantClass);
    setTimeout(() => {
        header?.classList.remove('header-shimmer-active', 'header-shimmer-fire', 'header-shimmer-goal');
    }, 1400);
}

function checkAndCelebrateNotebookDailyGoal(isFromAnsweringCard = false) {
    if (activeMode !== 'notebook') return;
    const dailyGoal = getNotebookDailyGoal();
    if (dailyGoal <= 0) return;

    const dueInfo = getNotebookDueCounts(allQuestions || []);
    const reviewedToday = dueInfo.reviewedToday || 0;
    if (reviewedToday < dailyGoal) return;

    // Registra a meta como batida para o sistema de recompensas (7 metas = +1 streak freeze) e salva o dia
    const todayStr = getTodayDateString();
    const goalRes = recordNotebookGoalBeaten(todayStr);

    // Dispara webhook se configurado (exclusivo Pro)
    if (goalRes.newlyAchieved && isUserPro()) {
        triggerDailyGoalWebhook({
            date: todayStr,
            cardsReviewed: reviewedToday,
            dailyGoal
        });
    }

    // Apenas celebra visualmente se a stat "para hoje" (remaining) estiver pinada no cabeçalho do caderno
    const pinnedIds = getPinnedHeaderStats('notebook');
    const isParaHojePinned = pinnedIds.includes('remaining');
    if (!isParaHojePinned) return;

    const celebrationKey = `flashcards_daily_goal_celebrated_${todayStr}_${dailyGoal}`;
    if (localStorage.getItem(celebrationKey)) {
        return; // Já comemorou esta meta hoje
    }

    localStorage.setItem(celebrationKey, 'true');

    // Toque animação shimmer rosa, azul claro e verde neon 1x no header e desce confetes
    playHeaderShimmer('goal');
    launchCelebrationParticles(120);
    triggerHaptic('streakUp');
    playFeedbackSound('confirm');

    if (goalRes.freezeAwarded) {
        showNotificationPill(t('goal_freeze_awarded_toast'), 'collection.svg');
    } else {
        showNotificationPill(t('notebook_daily_goal_done_toast'), 'collection.svg');
    }
}

let currentRenderedStatsMode = null;

function renderHeaderPinnedStats(forceRerender = false) {
    if (!headerPinnedStatsContainer) return;
    const pinnedIds = getPinnedHeaderStats();

    const currentRenderedIds = Array.from(headerPinnedStatsContainer.querySelectorAll('[data-stat-id]'))
        .map(el => el.getAttribute('data-stat-id'));

    const needsFullRerender = forceRerender ||
        currentRenderedStatsMode !== activeMode ||
        currentRenderedIds.length !== pinnedIds.length ||
        !pinnedIds.every((id, idx) => id === currentRenderedIds[idx]);

    if (needsFullRerender) {
        currentRenderedStatsMode = activeMode;
        headerPinnedStatsContainer.innerHTML = '';
        pinnedIds.forEach((statId, index) => {
            const statDef = AVAILABLE_HEADER_STATS.find(s => s.id === statId);
            if (!statDef) return;

            if (index > 0) {
                const divider = document.createElement('div');
                divider.className = 'h-6 sm:h-7 w-[1px] bg-gray-200/80 mx-0.5 block flex-shrink-0';
                headerPinnedStatsContainer.appendChild(divider);
            }

            const statWrapper = document.createElement('div');
            statWrapper.setAttribute('data-stat-id', statId);
            const statI18n = getStatI18n(statId);
            const statLabel = activeMode === 'notebook'
                ? (statI18n.notebookLabel || statDef.notebookLabel)
                : (statI18n.label || statDef.label);
            const statTitle = statI18n.title || statDef.title;

            if (statId === 'remaining') {
                statWrapper.id = 'counter-left-wrapper';
                statWrapper.className = 'block select-none';
                statWrapper.title = statTitle;
                statWrapper.innerHTML = `
                    <p id="counter-left-label" class="text-[8px] sm:text-[10px] uppercase tracking-wider text-gray-400 font-bold leading-none text-center">
                        ${statLabel}
                    </p>
                    <p id="questions-left" class="text-xs sm:text-sm font-bold ${statDef.colorClass} text-center">
                        ${statDef.getValue()}
                    </p>
                `;
                statWrapper.addEventListener('click', (e) => {
                    if (activeMode === 'notebook') {
                        e.stopPropagation();
                        openDailyGoalModal();
                    }
                });
            } else if (statId === 'score') {
                statWrapper.id = 'score-wrapper';
                statWrapper.className = 'flex items-center min-w-[38px] justify-center select-none';
                statWrapper.title = statTitle;
                statWrapper.innerHTML = `
                    <div id="score-container" class="block">
                        <p id="score-label" class="text-[8px] sm:text-[10px] uppercase tracking-wider text-gray-400 font-bold leading-none text-center">
                            ${statLabel}
                        </p>
                        <p id="score" class="text-xs sm:text-sm font-bold ${statDef.colorClass} text-center">
                            ${statDef.getValue()}
                        </p>
                    </div>
                `;
            } else {
                statWrapper.className = 'block select-none min-w-[38px]';
                statWrapper.title = statTitle;
                statWrapper.innerHTML = `
                    <p id="stat-label-${escapeHtml(statDef.id)}" class="text-[8px] sm:text-[10px] uppercase tracking-wider text-gray-400 font-bold leading-none text-center">
                        ${statLabel}
                    </p>
                    <p id="stat-val-${escapeHtml(statDef.id)}" class="text-xs sm:text-sm font-bold ${statDef.colorClass} text-center">
                        ${statDef.getValue()}
                    </p>
                `;
            }

            headerPinnedStatsContainer.appendChild(statWrapper);
        });
    }

    updateHeaderPinnedStatsValues();
}

function updateHeaderPinnedStatsValues() {
    const pinnedIds = getPinnedHeaderStats();

    if (activeMode === 'notebook') {
        const dueInfo = getNotebookDueCounts(allQuestions);
        const dailyGoal = getNotebookDailyGoal();
        const reviewedToday = dueInfo.reviewedToday || 0;
        const qLeft = document.getElementById('questions-left');
        const cntWrapper = document.getElementById('counter-left-wrapper');
        const cntLabel = document.getElementById('counter-left-label');
        const scLabel = document.getElementById('score-label');
        const scWrapper = document.getElementById('score-wrapper');

        const remI18n = getStatI18n('remaining');
        const scI18n = getStatI18n('score');

        if (cntLabel) cntLabel.textContent = remI18n.notebookLabel || "Para Hoje";
        if (scLabel) scLabel.textContent = scI18n.notebookLabel || t('revisions_count_label');

        if (dailyGoal > 0) {
            const rem = Math.max(0, dailyGoal - reviewedToday);
            if (qLeft) {
                qLeft.textContent = rem;
                qLeft.title = t('notebook_goal_progress_tooltip', {
                    reviewed: reviewedToday,
                    goal: dailyGoal,
                    due: dueInfo.dueToday || 0
                });
            }
            if (cntWrapper) {
                cntWrapper.title = t('notebook_goal_wrapper_tooltip', {
                    goal: dailyGoal,
                    reviewed: reviewedToday
                });
                cntWrapper.classList.add('cursor-pointer', 'hover:opacity-80', 'transition');
            }
        } else {
            if (qLeft) {
                qLeft.textContent = dueInfo.dueToday || 0;
                qLeft.title = t('notebook_no_goal_due_tooltip', {
                    count: dueInfo.dueToday || 0
                });
            }
            if (cntWrapper) {
                cntWrapper.title = t('notebook_set_goal_tooltip');
                cntWrapper.classList.add('cursor-pointer', 'hover:opacity-80', 'transition');
            }
        }
        if (scWrapper) {
            scWrapper.title = scI18n.title || "";
        }
        const scVal = document.getElementById('score');
        if (scVal) scVal.textContent = notebookReviewsCount;
    } else {
        const cntLabel = document.getElementById('counter-left-label');
        const scLabel = document.getElementById('score-label');
        const qLeft = document.getElementById('questions-left');
        const scVal = document.getElementById('score');
        const cntWrapper = document.getElementById('counter-left-wrapper');
        const scWrapper = document.getElementById('score-wrapper');

        const remI18n = getStatI18n('remaining');
        const scI18n = getStatI18n('score');

        if (cntLabel) cntLabel.textContent = remI18n.label || "Restantes";
        if (scLabel) scLabel.textContent = scI18n.label || "Score";
        if (qLeft) {
            qLeft.textContent = questionsPool.length;
            qLeft.title = "";
        }
        if (scVal) scVal.textContent = score;
        if (cntWrapper) {
            cntWrapper.title = remI18n.title || "";
            cntWrapper.classList.remove('cursor-pointer', 'hover:opacity-80');
        }
        if (scWrapper) {
            scWrapper.title = scI18n.title || "";
        }
    }

    pinnedIds.forEach(statId => {
        if (statId === 'remaining' || statId === 'score') return;
        const statDef = AVAILABLE_HEADER_STATS.find(s => s.id === statId);
        if (!statDef) return;

        const statI18n = getStatI18n(statId);
        const valEl = document.getElementById(`stat-val-${statId}`);
        const lblEl = document.getElementById(`stat-label-${statId}`);
        const wrapEl = headerPinnedStatsContainer.querySelector(`[data-stat-id="${statId}"]`);
        if (lblEl) {
            lblEl.textContent = activeMode === 'notebook'
                ? (statI18n.notebookLabel || statDef.notebookLabel)
                : (statI18n.label || statDef.label);
        }
        if (valEl) {
            valEl.textContent = statDef.getValue();
        }
        if (wrapEl) {
            wrapEl.title = statI18n.title || statDef.title;
        }
    });

    const scoreContainer = document.getElementById('score-container');
    if (scoreContainer) scoreContainer.classList.remove('hidden');

    if (headerStatsDropdown && !headerStatsDropdown.classList.contains('hidden')) {
        renderHeaderStatsDropdown();
    }
}

function updateScoreDisplay() {
    renderHeaderPinnedStats();
}

function renderHeaderStatsDropdown() {
    if (!headerStatsOptionsList) return;
    const pinnedIds = getPinnedHeaderStats();

    if (pinnedStatsCounter) {
        pinnedStatsCounter.textContent = t('pinned_stats_count', { count: pinnedIds.length, max: MAX_PINNED_STATS });
        if (pinnedIds.length >= MAX_PINNED_STATS) {
            pinnedStatsCounter.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 flex-shrink-0';
        } else {
            pinnedStatsCounter.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 flex-shrink-0';
        }
    }

    headerStatsOptionsList.innerHTML = '';

    AVAILABLE_HEADER_STATS.forEach(stat => {
        const isPinned = pinnedIds.includes(stat.id);
        const liveVal = stat.getValue();
        const subtitle = stat.getSubtitle();
        const statI18n = getStatI18n(stat.id);
        const statTitle = statI18n.title || stat.title;
        const displayLabel = activeMode === 'notebook'
            ? (statI18n.notebookLabel || stat.notebookLabel)
            : (statI18n.label || stat.label);

        const itemRow = document.createElement('div');
        itemRow.className = `group/opt flex items-center justify-between p-2.5 rounded-xl border transition-all duration-150 cursor-pointer ${
            isPinned
                ? 'bg-blue-50/40 hover:bg-blue-50/70 border-blue-200/70'
                : 'bg-white hover:bg-gray-50 border-gray-100'
        }`;

        const safeSubtitle = escapeHtml(subtitle || '');

        itemRow.innerHTML = `
            <div class="flex items-center gap-3 min-w-0 flex-1 pr-2">
                <div class="w-8 h-8 rounded-xl ${stat.iconBg} flex items-center justify-center flex-shrink-0 shadow-xs">
                    <span class="material-symbols-rounded text-lg">${stat.icon}</span>
                </div>
                <div class="min-w-0 flex-1 text-left">
                    <div class="flex items-center gap-1.5">
                        <span class="text-xs font-semibold text-gray-800 truncate">${statTitle}</span>
                        <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono flex-shrink-0">${displayLabel}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[11px] font-bold ${stat.colorClass} truncate">${liveVal}</span>
                        <span class="text-gray-300">•</span>
                        <span class="text-[10px] text-gray-500 truncate" title="${safeSubtitle}">${safeSubtitle}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
                ${activeMode === 'notebook' && stat.id === 'remaining' ? `
                    <button type="button" class="set-goal-btn p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-medium transition-all" title="${escapeHtml(t('change_daily_goal_tooltip'))}">
                        ${t('goal_label')}
                    </button>
                ` : ''}
                <button type="button" class="pin-toggle-btn p-1.5 rounded-xl transition-all duration-150 ${
                    isPinned
                        ? 'bg-blue-100/70 hover:bg-blue-200/80 border border-blue-300/80 text-blue-700 shadow-xs'
                        : 'bg-gray-100 hover:bg-gray-200/80 border border-transparent text-gray-400 hover:text-gray-600'
                }" title="${isPinned ? t('unpin_from_header') : (pinnedIds.length >= MAX_PINNED_STATS ? t('pinned_stat_max_toast') : t('pin_to_header'))}">
                    <img src="${isPinned ? '../assets/img/pinned.svg' : '../assets/img/unpinned.svg'}"
                         class="w-5 h-5 flex-shrink-0 pointer-events-none transition-transform active:scale-90 ${isPinned ? '' : 'opacity-60'}"
                         alt="${isPinned ? t('pinned') : t('not_pinned')}">
                </button>
            </div>
        `;

        const goalBtn = itemRow.querySelector('.set-goal-btn');
        if (goalBtn) {
            goalBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeHeaderStatsDropdown();
                openDailyGoalModal();
            });
        }

        const pinBtn = itemRow.querySelector('.pin-toggle-btn');
        const handleToggle = (e) => {
            e.stopPropagation();
            togglePinStat(stat.id);
        };

        if (pinBtn) pinBtn.addEventListener('click', handleToggle);
        itemRow.addEventListener('click', (e) => {
            if (e.target.closest('.set-goal-btn')) return;
            handleToggle(e);
        });

        headerStatsOptionsList.appendChild(itemRow);
    });
}

function togglePinStat(statId) {
    const mode = normalizeStatsMode(activeMode);
    let pinnedIds = getPinnedHeaderStats(mode);
    const isPinned = pinnedIds.includes(statId);

    if (isPinned) {
        if (pinnedIds.length <= MIN_PINNED_STATS) {
            showNotificationPill(t('pinned_stat_min_toast'), 'pinned.svg', true);
            triggerHaptic('shake');
            return;
        }
        pinnedIds = pinnedIds.filter(id => id !== statId);
        triggerHaptic('light');
    } else {
        if (pinnedIds.length >= MAX_PINNED_STATS) {
            showNotificationPill(t('pinned_stat_max_toast'), 'pinned.svg', true);
            triggerHaptic('shake');
            return;
        }
        pinnedIds.push(statId);
        triggerHaptic('streakUp');
    }

    savePinnedHeaderStats(pinnedIds, mode);
    renderHeaderPinnedStats();
    renderHeaderStatsDropdown();
    renderSettingsPinnedStatsList(settingsCurrentStatsTab);
}

function openHeaderStatsDropdown() {
    if (!headerStatsDropdown) return;
    closeHamburgerMenu();
    closeDeckDropdown();
    renderHeaderStatsDropdown();
    headerStatsDropdown.classList.remove('hidden');
    headerStatsChevron?.classList.add('rotate-180');
    headerStatsTrigger?.setAttribute('aria-expanded', 'true');
}

function closeHeaderStatsDropdown() {
    if (!headerStatsDropdown) return;
    headerStatsDropdown.classList.add('hidden');
    headerStatsChevron?.classList.remove('rotate-180');
    headerStatsTrigger?.setAttribute('aria-expanded', 'false');
}

function toggleHeaderStatsDropdown(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!headerStatsDropdown) return;
    if (headerStatsDropdown.classList.contains('hidden')) {
        openHeaderStatsDropdown();
    } else {
        closeHeaderStatsDropdown();
    }
}

let headerStatsTickerInterval = null;
function startHeaderStatsTicker() {
    if (headerStatsTickerInterval) clearInterval(headerStatsTickerInterval);
    headerStatsTickerInterval = setInterval(() => {
        if (document.hidden) return;
        const pinnedIds = getPinnedHeaderStats();
        const hasLiveTimeStats = pinnedIds.some(id => id === 'pomodoro' || id === 'totalTime' || id === 'estRemainingTime');
        const isDropdownOpen = headerStatsDropdown && !headerStatsDropdown.classList.contains('hidden');
        if (hasLiveTimeStats || isDropdownOpen) {
            updateHeaderPinnedStatsValues();
        }
    }, 1000);
}

function initHeaderStats() {
    if (!headerStatsTrigger) return;

    headerStatsTrigger.addEventListener('click', (e) => {
        toggleHeaderStatsDropdown(e);
    });

    headerStatsTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleHeaderStatsDropdown(e);
        }
    });

    headerStatsDropdown?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    renderHeaderPinnedStats();
    startHeaderStatsTicker();
}

// --- AI LOGIC (delegada para ./engine/tutor.js) ---
function updateAiUI() {
    updateTutorUI({ menuAiIcon, menuAiStatusBadge, menuAiSubtitle, aiIconOff, aiIconOn, aiSwitch });
    if (hlAiBtn) {
        hlAiBtn.classList.remove('hidden');
        if (isUserPro()) {
            hlAiBtn.classList.remove('is-paywalled');
            hlAiBtn.innerHTML = `<img src="../assets/img/tutor.svg" class="w-4 h-4 pointer-events-none relative z-10" alt="${escapeHtml(t('ask_ai_tutor_help'))}">`;
            hlAiBtn.title = t('ask_ai_tutor_help');
        } else {
            hlAiBtn.classList.add('is-paywalled');
            hlAiBtn.innerHTML = '<img src="../assets/img/paywall.svg" class="w-4 h-4 pointer-events-none relative z-10" alt="Pro">';
            hlAiBtn.title = t('pro_feature_tooltip');
            if (hlAiCard) hlAiCard.classList.add('hidden');
            hlAiBtn.classList.remove('hl-ai-shimmering');
        }
    }
}

function initializeAi() {
    updateAiUI();
}

async function checkAnswerWithAi(questionObj, actualAnswer, ballIdx) {
    if (!isTutorEnabled()) return;
    try {
        const evalData = await evaluateAnswerSemantic({
            questionObj,
            actualAnswer,
            onSlowConnection: () => {
                showNotificationPill(t('slow_connection_toast'), "poor_wifi.svg", true);
            },
            onAiDisabledByErrors: () => {
                updateAiUI();
                showNotificationPill(t('ai_error_toast'), "cloud_alert.svg");
            }
        });

        if (evalData && evalData.correto) {
            console.log("Agente corrigiu a resposta (ACEITA):", evalData.justificativa);

            setBallColor(ballIdx, 'rgba(250, 204, 21, 0.8)'); // Amarelo/Dourado para correção IA
            restoreStreakAfterAiCorrection();

            // Reverte a penalização inicial e ajusta métricas do cartão
            questionObj.wrongCount = Math.max(0, (questionObj.wrongCount || 1) - 1);
            questionObj.correctStreak = (questionObj.correctStreak || 0) + 1;

            const totalWrongs = questionObj.wrongCount || 0;
            const isLeech = isLeechCard(questionObj);
            const shouldRemove = shouldGraduateCard(questionObj);

            // Registra correção da IA no subsistema de estatísticas
            recordStatsAiCorrection({
                card: questionObj,
                explanation: evalData.justificativa,
                currentStreak: currentStreak
            });

            if (shouldRemove) {
                score++;
                // Remove da pool se ainda for a mesma questão e salva
                const idx = questionsPool.findIndex(card => card.description === questionObj.description);
                if (idx > -1) {
                    questionsPool.splice(idx, 1);
                    saveGameState();
                }
            } else {
                // Se for leech card precisando de 2 acertos consecutivos, reagenda com gap
                questionObj.dueStep = currentStep + 5;
                saveGameState();
                console.log("[Algorithm] Card leech corrigido por IA mantido no deck para 2º acerto consecutivo.");
            }

            delete questionObj.isBeingCorrected;

            // Somente aplica feedback visual e carrega nova questão se o usuário ainda estiver na mesma questão
            if (questionObj === currentQuestion) {
                isBeingCorrected = false;
                if (correctionOptions) {
                    correctionOptions.classList.add('hidden');
                    correctionOptions.classList.remove('flex');
                }
                if (nextQuestionBtn) nextQuestionBtn.classList.add('hidden');

                triggerHaptic('correct');
                questionCard.classList.remove('glow-incorrect', 'card-shake');

                // On the last card of deck, skip normal animations and play end game directly!
                if (shouldRemove && questionsPool.length === 0) {
                    clearBalls();
                    questionCard.classList.remove('glow-correct', 'glow-incorrect', 'card-shake');
                    updateScoreDisplay();
                    showDeckCompletionScreen();
                    return;
                }

                questionCard.classList.add('glow-correct');
                setTimeout(() => {
                    if (shouldRemove) {
                        animateCardToHeader(() => {
                            updateScoreDisplay();
                            loadQuestion();
                        });
                    } else {
                        updateScoreDisplay();
                        loadQuestion();
                    }
                }, 400);
            } else {
                // Se o usuário já passou de fase, apenas atualizamos o contador visual
                updateScoreDisplay();
                questionsLeftDisplay.textContent = questionsPool.length;
                if (questionsPool.length === 0) {
                    clearBalls();
                    showDeckCompletionScreen();
                }
            }
        } else if (evalData) {
            console.log("Agente manteve a resposta como incorreta (REJEITADA):", evalData.justificativa);
        }
    } catch (e) {
        console.error("Erro na correção IA:", e);
    }
}

async function sendChatMessage() {
    await sendTutorChatMessage({
        currentQuestion,
        chatInput,
        chatMessages
    });
}

// --- EVENT LISTENERS ---
resetBtn.addEventListener('click', () => {
    if (confirm(t('confirm_exit_game'))) {
        localStorage.removeItem('flashcardsSave');
        localStorage.removeItem('flashcardsActiveMode');
        window.location.href = ROUTES.HOME;
    }
});
// --- HAMBURGER MENU LOGIC ---
function openHamburgerMenu() {
    if (!hamburgerMenu) return;
    closeDeckDropdown();
    closeHeaderStatsDropdown();
    updateHapticUI();
    updateHamburgerUserUI(auth.currentUser);
    hamburgerBackdrop?.classList.remove('hidden');
    hamburgerMenu.classList.remove('hidden');
    hamburgerBtn?.setAttribute('aria-expanded', 'true');
}

function closeHamburgerMenu() {
    if (!hamburgerMenu) return;
    hamburgerMenu.classList.add('hidden');
    hamburgerBackdrop?.classList.add('hidden');
    hamburgerBtn?.setAttribute('aria-expanded', 'false');
}

function toggleHamburgerMenu(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!hamburgerMenu) return;
    if (hamburgerMenu.classList.contains('hidden')) {
        openHamburgerMenu();
    } else {
        closeHamburgerMenu();
    }
}

// Expose functions globally for bulletproof execution
window.openHamburgerMenu = openHamburgerMenu;
window.closeHamburgerMenu = closeHamburgerMenu;
window.toggleHamburgerMenu = toggleHamburgerMenu;

hamburgerBtn?.addEventListener('click', toggleHamburgerMenu);

hamburgerBackdrop?.addEventListener('click', closeHamburgerMenu);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // 1. Image zoom modal (lightbox popup)
        if (imageZoomModal && !imageZoomModal.classList.contains('hidden')) {
            closeImageZoom();
            return;
        }

        // 2. Any active modal overlay in game
        const openModals = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden)'));
        if (openModals.length > 0) {
            const scanner = document.getElementById('scanner-modal');
            const closeScannerBtn = document.getElementById('close-scanner-modal');
            if (scanner && !scanner.classList.contains('hidden')) {
                if (closeScannerBtn) closeScannerBtn.click();
                else scanner.classList.add('hidden');
                return;
            }

            const transfer = document.getElementById('transfer-modal');
            const closeTransferBtn = document.getElementById('close-transfer-modal');
            if (transfer && !transfer.classList.contains('hidden')) {
                if (closeTransferBtn) closeTransferBtn.click();
                else transfer.classList.add('hidden');
                return;
            }

            if (editModal && !editModal.classList.contains('hidden')) {
                editModal.classList.add('hidden');
                return;
            }

            if (instructionsModal && !instructionsModal.classList.contains('hidden')) {
                instructionsModal.classList.add('hidden');
                return;
            }

            if (apiModal && !apiModal.classList.contains('hidden')) {
                apiModal.classList.add('hidden');
                return;
            }

            openModals.forEach(m => m.classList.add('hidden'));
            return;
        }

        // 3. Highlight popup or text selection
        if (textHighlightPopup && !textHighlightPopup.classList.contains('hidden')) {
            hideHighlightPopup();
            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            return;
        }

        // 4. Header stats dropdown
        if (headerStatsDropdown && !headerStatsDropdown.classList.contains('hidden')) {
            closeHeaderStatsDropdown();
            return;
        }

        // 5. Hamburger menu and AI chat drawer
        closeHamburgerMenu();
        if (aiChatContainer && aiChatContainer.classList.contains('open')) {
            aiChatContainer.classList.remove('open');
        }
    }
});

// Close hamburger menu when any action is selected
const menuFeedbackBtn = document.getElementById('menu-feedback-btn');
[exportBtn, goToEditorBtn, restartGameBtn, clearNotebookBtn, resetBtn, statsBtn, receiveSessionBtn, transferSessionBtn, aiToggleBtn, menuFeedbackBtn].forEach(el => {
    el?.addEventListener('click', () => {
        closeHamburgerMenu();
    });
});

// --- TEXT HIGHLIGHTER & PASTEL COLORS LOGIC ---
let activeHighlightRange = null;
let activeHighlightField = null; // 'description' or 'answer'
let isInteractingWithPopup = false;
let selectionDebounceTimer = null;

let lastAiDefinitionTerm = '';
let lastAiDefinitionText = '';
let isFetchingDefinition = false;
let hlPaletteCollapseTimer = null;

function openHighlightPalette() {
    if (!hlPalette || !hlTriggerBtn) return;
    clearTimeout(hlPaletteCollapseTimer);
    hlPaletteCollapseTimer = null;

    triggerHaptic('cardFlip');

    hlTriggerBtn.classList.remove('is-bouncing');
    void hlTriggerBtn.offsetWidth; // Force reflow to re-trigger M3 bounce animation
    hlTriggerBtn.classList.add('is-bouncing', 'is-active');

    hlPalette.classList.remove('hidden', 'is-collapsing');
    hlPalette.classList.add('flex', 'is-expanded');
    hlPalette.style.maxWidth = '';
    hlPalette.style.overflow = '';

    setTimeout(() => {
        if (hlTriggerBtn) hlTriggerBtn.classList.remove('is-bouncing');
    }, 450);
}

function closeHighlightPalette(instant = false) {
    if (!hlPalette || !hlTriggerBtn) return;
    clearTimeout(hlPaletteCollapseTimer);
    hlPaletteCollapseTimer = null;

    hlTriggerBtn.classList.remove('is-active', 'is-bouncing');

    if (instant) {
        hlPalette.classList.add('hidden');
        hlPalette.classList.remove('flex', 'is-expanded', 'is-collapsing');
        hlPalette.style.maxWidth = '';
        hlPalette.style.overflow = '';
        return;
    }

    if (hlPalette.classList.contains('hidden')) return;

    triggerHaptic('tap');
    hlPalette.classList.remove('is-expanded');
    hlPalette.classList.add('is-collapsing');

    hlPaletteCollapseTimer = setTimeout(() => {
        if (hlPalette && hlPalette.classList.contains('is-collapsing')) {
            hlPalette.classList.add('hidden');
            hlPalette.classList.remove('flex', 'is-collapsing');
            hlPalette.style.maxWidth = '';
            hlPalette.style.overflow = '';
        }
        hlPaletteCollapseTimer = null;
    }, 180);
}

function toggleHighlightPalette() {
    if (!hlPalette) return;
    const isVisible = !hlPalette.classList.contains('hidden') && !hlPalette.classList.contains('is-collapsing');
    if (isVisible) {
        closeHighlightPalette(false);
    } else {
        openHighlightPalette();
    }
}

function hideHighlightPopup() {
    isInteractingWithPopup = false;
    activeHighlightRange = null;
    activeHighlightField = null;
    lastAiDefinitionTerm = '';
    lastAiDefinitionText = '';
    if (!textHighlightPopup) return;

    delete textHighlightPopup.dataset.origLeft;
    delete textHighlightPopup.dataset.origTop;

    try {
        textHighlightPopup.getAnimations().forEach(a => a.cancel());
    } catch (e) {}
    textHighlightPopup.style.transform = '';

    if (hlActionsBar) {
        hlActionsBar.classList.remove('hidden');
    }
    if (hlAiCard) {
        hlAiCard.classList.remove('hl-card-collapse-circle');
        hlAiCard.classList.remove('hl-card-bounce');
        hlAiCard.classList.add('hidden');
    }
    if (hlAiBtn) {
        hlAiBtn.classList.remove('hl-ai-shimmering');
    }
    closeHighlightPalette(true);
    if (hlTriggerBtn) {
        hlTriggerBtn.classList.remove('is-marked');
        hlTriggerBtn.title = t('highlighter_shortcut_title');
    }
    textHighlightPopup.classList.add('hidden');
}

function showHighlightPopup(range, isMarked) {
    if (!textHighlightPopup || !range) return;

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    try {
        textHighlightPopup.getAnimations().forEach(a => a.cancel());
    } catch (e) {}
    textHighlightPopup.style.transform = '';

    if (hlActionsBar) {
        hlActionsBar.classList.remove('hidden');
    }

    closeHighlightPalette(true);

    if (hlAiCard) {
        hlAiCard.classList.remove('hl-card-collapse-circle');
        hlAiCard.classList.remove('hl-card-bounce');
        hlAiCard.classList.add('hidden');
    }
    if (hlAiBtn) {
        hlAiBtn.classList.remove('hl-ai-shimmering');
        hlAiBtn.classList.remove('hidden');
        if (isUserPro()) {
            hlAiBtn.classList.remove('is-paywalled');
            hlAiBtn.innerHTML = `<img src="../assets/img/tutor.svg" class="w-4 h-4 pointer-events-none relative z-10" alt="${escapeHtml(t('ask_ai_tutor_help'))}">`;
            hlAiBtn.title = t('ask_ai_tutor_help');
        } else {
            hlAiBtn.classList.add('is-paywalled');
            hlAiBtn.innerHTML = '<img src="../assets/img/paywall.svg" class="w-4 h-4 pointer-events-none relative z-10" alt="Pro">';
            hlAiBtn.title = t('pro_feature_tooltip');
        }
    }

    if (hlTriggerBtn) {
        if (isMarked) {
            hlTriggerBtn.classList.add('is-marked');
            hlTriggerBtn.title = t('remove_highlight_title');
        } else {
            hlTriggerBtn.classList.remove('is-marked');
            hlTriggerBtn.title = t('highlighter_shortcut_title');
        }
    }

    textHighlightPopup.classList.remove('hidden');

    const popupHeight = 44;
    // Account for potential open palette or action buttons width (~220px) so popup never cuts off on mobile edges
    const estimatedPopupWidth = 220;

    const isMobile = window.innerWidth < 768;
    let left = isMobile ? window.innerWidth / 2 : (rect.left + rect.width / 2);
    // Move both circle buttons (highlight and ai) to the bottom of the selected text
    let top = rect.bottom + 8;

    if (!isMobile) {
        // Keep within horizontal screen bounds accounting for full palette width
        const minLeft = estimatedPopupWidth / 2 + 10;
        const maxLeft = window.innerWidth - (estimatedPopupWidth / 2 + 10);
        if (maxLeft >= minLeft) {
            left = Math.max(minLeft, Math.min(maxLeft, left));
        } else {
            left = window.innerWidth / 2;
        }
    } else {
        left = window.innerWidth / 2;
    }

    // Ensure it doesn't overflow bottom of viewport
    if (top + popupHeight > window.innerHeight - 12) {
        top = Math.max(70, window.innerHeight - popupHeight - 12);
    }

    textHighlightPopup.style.top = `${top}px`;
    textHighlightPopup.style.left = isMobile ? '50%' : `${left}px`;
    textHighlightPopup.dataset.origLeft = isMobile ? '50%' : `${left}px`;
    textHighlightPopup.dataset.origTop = `${top}px`;
}

function isRangeMarked(range, container) {
    if (!range || !container) return false;

    let node = range.commonAncestorContainer;
    while (node && node !== container) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'MARK' && node.classList.contains('card-hl')) {
            return true;
        }
        node = node.parentNode;
    }

    const marks = container.querySelectorAll('mark.card-hl');
    for (const mark of marks) {
        try {
            if (range.intersectsNode(mark)) {
                return true;
            }
        } catch (e) {}
    }

    return false;
}

function getActiveTextSelection() {
    const questionBody = document.getElementById('question-body-text') || questionText;
    const ankiAnswer = ankiAnswerText;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0);
        const common = range.commonAncestorContainer;

        const isInside = (container) => {
            if (!container) return false;
            return container.contains(common) || (container.contains(range.startContainer) && container.contains(range.endContainer));
        };

        if (isInside(questionBody)) {
            return { range: range.cloneRange(), field: 'description', container: questionBody };
        }
        if (isInside(ankiAnswer) && !ankiAnswerContainer?.classList.contains('hidden')) {
            return { range: range.cloneRange(), field: 'answer', container: ankiAnswer };
        }
        if (isInside(voiceReferenceTextDisplay) && !voiceAnswerContainer?.classList.contains('hidden')) {
            return { range: range.cloneRange(), field: 'answer', container: voiceReferenceTextDisplay };
        }
    }

    if (activeHighlightRange && activeHighlightField && textHighlightPopup && !textHighlightPopup.classList.contains('hidden')) {
        const container = activeHighlightField === 'description' ? questionBody : ankiAnswer;
        if (container) {
            return { range: activeHighlightRange, field: activeHighlightField, container };
        }
    }

    return null;
}

function applyHighlight(color) {
    isInteractingWithPopup = false;
    clearTimeout(selectionDebounceTimer);
    if (!activeHighlightRange || !activeHighlightField) return;

    const container = activeHighlightField === 'description'
        ? (document.getElementById('question-body-text') || questionText)
        : ankiAnswerText;
    if (!container) return;

    const range = activeHighlightRange;
    const selectedText = range.toString().trim();
    if (!selectedText) return;

    // Check if modifying an already highlighted mark directly
    let targetMark = null;
    let node = range.commonAncestorContainer;
    while (node && node !== container) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'MARK' && node.classList.contains('card-hl')) {
            targetMark = node;
            break;
        }
        node = node.parentNode;
    }
    if (!targetMark && range.startContainer === range.endContainer && range.endOffset - range.startOffset === 1) {
        const child = range.startContainer.childNodes[range.startOffset];
        if (child && child.nodeType === Node.ELEMENT_NODE && child.tagName === 'MARK' && child.classList.contains('card-hl')) {
            targetMark = child;
        }
    }

    if (targetMark && targetMark.textContent.trim() === selectedText) {
        targetMark.className = `card-hl card-hl-${color}`;
        container.normalize();
        persistHighlightedContent(activeHighlightField);
        hideHighlightPopup();
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        return;
    }

    // Unmark any existing marks inside this range to avoid nested marks
    const existingMarks = container.querySelectorAll('mark.card-hl');
    existingMarks.forEach(mark => {
        try {
            if (range.intersectsNode(mark)) {
                mark.replaceWith(...mark.childNodes);
            }
        } catch (e) {}
    });

    const mark = document.createElement('mark');
    mark.className = `card-hl card-hl-${color}`;

    try {
        const extracted = range.extractContents();
        mark.appendChild(extracted);
        range.insertNode(mark);
    } catch (e) {
        const fallbackText = range.toString();
        if (fallbackText) {
            mark.textContent = fallbackText;
            range.deleteContents();
            range.insertNode(mark);
        }
    }

    container.normalize();
    persistHighlightedContent(activeHighlightField);
    hideHighlightPopup();

    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
}

function removeHighlight() {
    isInteractingWithPopup = false;
    if (!activeHighlightRange || !activeHighlightField) return;

    const container = activeHighlightField === 'description'
        ? (document.getElementById('question-body-text') || questionText)
        : ankiAnswerText;
    if (!container) return;

    const range = activeHighlightRange;
    let removedAny = false;

    // Check parent chain of common ancestor
    let node = range.commonAncestorContainer;
    while (node && node !== container) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'MARK' && node.classList.contains('card-hl')) {
            node.replaceWith(...node.childNodes);
            removedAny = true;
            break;
        }
        node = node.parentNode;
    }

    // Check intersecting marks
    const marks = container.querySelectorAll('mark.card-hl');
    marks.forEach(mark => {
        try {
            if (range.intersectsNode(mark)) {
                mark.replaceWith(...mark.childNodes);
                removedAny = true;
            }
        } catch (e) {}
    });

    if (removedAny) {
        container.normalize();
        persistHighlightedContent(activeHighlightField);
    }

    hideHighlightPopup();
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
}

function persistHighlightedContent(targetField) {
    if (!currentQuestion) return;

    if (targetField === 'description') {
        const bodyElem = document.getElementById('question-body-text');
        const descHtml = bodyElem ? bodyElem.innerHTML : questionText.innerHTML;
        currentQuestion.description = descHtml;
    } else if (targetField === 'answer' && ankiAnswerText) {
        currentQuestion.answer = ankiAnswerText.innerHTML;
    }

    // Update reference in allQuestions
    const cardInAll = allQuestions.find(q => q === currentQuestion || (q.description && stripHtml(q.description) === stripHtml(currentQuestion.description)));
    if (cardInAll) {
        cardInAll.description = currentQuestion.description;
        if (currentQuestion.answer) cardInAll.answer = currentQuestion.answer;
    }

    // If active mode is notebook, sync to normal deck in storage
    if (activeMode === 'notebook') {
        const normalData = JSON.parse(localStorage.getItem('flashcardsSave'));
        if (normalData) {
            const syncArray = (arr) => {
                if (!arr) return;
                arr.forEach(q => {
                    if (q.description && stripHtml(q.description) === stripHtml(currentQuestion.description)) {
                        q.description = currentQuestion.description;
                        if (currentQuestion.answer) q.answer = currentQuestion.answer;
                    }
                });
            };
            syncArray(normalData.allQuestions);
            syncArray(normalData.questionsPool);
            normalData.allQuestions = (normalData.allQuestions || []).map(sanitizeCardForStorage);
            normalData.questionsPool = (normalData.questionsPool || []).map(sanitizeCardForStorage);
            localStorage.setItem('flashcardsSave', encodeStoragePayload(normalData));
        }
    } else {
        // If normal mode, also sync to notebook if present
        const notebookData = JSON.parse(localStorage.getItem(NOTEBOOK_STORAGE_KEY));
        if (notebookData) {
            const syncArray = (arr) => {
                if (!arr) return;
                arr.forEach(q => {
                    if (q.description && stripHtml(q.description) === stripHtml(currentQuestion.description)) {
                        q.description = currentQuestion.description;
                        if (currentQuestion.answer) q.answer = currentQuestion.answer;
                    }
                });
            };
            syncArray(notebookData.allQuestions);
            syncArray(notebookData.questionsPool);
            notebookData.allQuestions = (notebookData.allQuestions || []).map(sanitizeCardForStorage);
            notebookData.questionsPool = (notebookData.questionsPool || []).map(sanitizeCardForStorage);
            notebookData.updatedAt = Date.now();
            localStorage.setItem(NOTEBOOK_STORAGE_KEY, encodeStoragePayload(notebookData));
        }
    }

    saveGameState(true);
    syncSlotsToCloud();
}

function handleTextSelection(e) {
    if (isInteractingWithPopup) return;

    // Ignore clicks inside the highlight popup itself
    if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('#text-highlight-popup')) {
        return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (!isInteractingWithPopup) {
            hideHighlightPopup();
        }
        return;
    }

    const text = sel.toString().trim();
    if (!text || text.length === 0) {
        if (!isInteractingWithPopup) {
            hideHighlightPopup();
        }
        return;
    }

    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer;

    const questionBody = document.getElementById('question-body-text') || questionText;
    const ankiAnswer = ankiAnswerText;

    let field = null;
    let container = null;

    const isInside = (c) => {
        if (!c) return false;
        return c.contains(common) || (c.contains(range.startContainer) && c.contains(range.endContainer));
    };

    if (isInside(questionBody)) {
        field = 'description';
        container = questionBody;
    } else if (isInside(ankiAnswer) && !ankiAnswerContainer?.classList.contains('hidden')) {
        field = 'answer';
        container = ankiAnswer;
    } else {
        if (!isInteractingWithPopup) {
            hideHighlightPopup();
        }
        return;
    }

    activeHighlightRange = range.cloneRange();
    activeHighlightField = field;

    if (chatInput && document.activeElement === chatInput) {
        chatInput.blur();
    }

    const isMarked = isRangeMarked(range, container);
    showHighlightPopup(range, isMarked);
}

if (hlTriggerBtn) {
    hlTriggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (hlAiCard) {
            hlAiCard.classList.add('hidden');
        }
        if (hlAiBtn) {
            hlAiBtn.classList.remove('hl-ai-shimmering');
        }
        const isMobile = window.innerWidth < 768;
        if (textHighlightPopup) {
            textHighlightPopup.style.left = isMobile ? '50%' : (textHighlightPopup.dataset.origLeft || '50%');
            if (textHighlightPopup.dataset.origTop) {
                textHighlightPopup.style.top = textHighlightPopup.dataset.origTop;
            }
        }

        if (hlTriggerBtn.classList.contains('is-marked')) {
            removeHighlight();
        } else {
            toggleHighlightPalette();
        }
    });
}

if (hlPalette) {
    hlPalette.addEventListener('animationend', (e) => {
        if (e.target === hlPalette && hlPalette.classList.contains('is-expanded')) {
            hlPalette.style.maxWidth = 'none';
            hlPalette.style.overflow = 'visible';
        }
    });
}

if (hlAiBtn) {
    hlAiBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (!isUserPro()) {
            openProModal();
            return;
        }

        // Close color palette if open
        closeHighlightPalette(true);

        const sel = window.getSelection();
        let selectedText = '';
        if (sel && !sel.isCollapsed && sel.toString().trim()) {
            selectedText = sel.toString().trim();
        } else if (activeHighlightRange && activeHighlightRange.toString().trim()) {
            selectedText = activeHighlightRange.toString().trim();
        }

        if (!selectedText) return;

        lastAiDefinitionTerm = selectedText;
        isInteractingWithPopup = true;

        if (chatInput && document.activeElement === chatInput) {
            chatInput.blur();
        }

        // Toggle off if already showing same term
        if (hlAiCard && !hlAiCard.classList.contains('hidden') && hlAiTermTitle?.dataset.term === selectedText) {
            hlAiCard.classList.add('hidden');
            hlAiBtn.classList.remove('hl-ai-shimmering');
            const isMobile = window.innerWidth < 768;
            if (textHighlightPopup) {
                textHighlightPopup.style.left = isMobile ? '50%' : (textHighlightPopup.dataset.origLeft || '50%');
                if (textHighlightPopup.dataset.origTop) {
                    textHighlightPopup.style.top = textHighlightPopup.dataset.origTop;
                }
            }
            return;
        }

        // Trigger light blue & purple shimmer animation on the button once
        hlAiBtn.classList.remove('hl-ai-shimmering');
        void hlAiBtn.offsetWidth; // force reflow
        hlAiBtn.classList.add('hl-ai-shimmering');

        // Pop up the small definition box
        if (hlAiCard) {
            hlAiCard.classList.remove('hidden');
            if (hlAiTermTitle) {
                hlAiTermTitle.dataset.term = selectedText;
                const displayTerm = selectedText.length > 25 ? `${selectedText.slice(0, 22)}...` : selectedText;
                hlAiTermTitle.textContent = t('help_term_prefix', { term: displayTerm });
            }
            if (hlAiLoading) hlAiLoading.classList.remove('hidden');
            if (hlAiContent) {
                hlAiContent.classList.add('hidden');
                hlAiContent.innerHTML = '';
            }

            const isMobile = window.innerWidth < 768;
            if (isMobile && textHighlightPopup) {
                textHighlightPopup.style.left = '50%';
            }

            // Adjust vertical position if card overflows screen bottom, keeping mobile centered in X axis
            requestAnimationFrame(() => {
                if (textHighlightPopup) {
                    const isMobileViewport = window.innerWidth < 768;
                    if (isMobileViewport) {
                        textHighlightPopup.style.left = '50%';
                    } else if (hlAiCard && !hlAiCard.classList.contains('hidden')) {
                        const popupRect = textHighlightPopup.getBoundingClientRect();
                        if (popupRect.left < 16) {
                            const curLeft = parseFloat(textHighlightPopup.style.left || 0);
                            textHighlightPopup.style.left = `${curLeft + (16 - popupRect.left)}px`;
                        } else if (popupRect.right > window.innerWidth - 16) {
                            const curLeft = parseFloat(textHighlightPopup.style.left || 0);
                            textHighlightPopup.style.left = `${curLeft - (popupRect.right - (window.innerWidth - 16))}px`;
                        }
                    }

                    const popupRect = textHighlightPopup.getBoundingClientRect();
                    if (popupRect.bottom > window.innerHeight - 12) {
                        const overflow = popupRect.bottom - (window.innerHeight - 12);
                        const curTop = parseFloat(textHighlightPopup.style.top || 0);
                        textHighlightPopup.style.top = `${Math.max(70, curTop - overflow)}px`;
                    }
                }
            });
        }

        if (isFetchingDefinition) return;
        isFetchingDefinition = true;

        try {
            const definition = await getTermDefinition({
                selectedText,
                currentQuestion
            });

            lastAiDefinitionText = definition || '';

            if (hlAiLoading) hlAiLoading.classList.add('hidden');
            if (hlAiContent) {
                hlAiContent.classList.remove('hidden');
                hlAiContent.innerHTML = renderMathAndMarkdown(definition || t('no_definition_found'));
            }
        } catch (err) {
            console.error("[Tutor] Erro ao buscar definição resumida:", err);
            if (hlAiLoading) hlAiLoading.classList.add('hidden');
            if (hlAiContent) {
                hlAiContent.classList.remove('hidden');
                hlAiContent.innerHTML = `<span class="text-red-500 font-medium">${t('ai_connection_error')}</span>`;
            }
        } finally {
            isFetchingDefinition = false;
            hlAiBtn.classList.remove('hl-ai-shimmering');
            // Adjust position again in case card content height changed
            requestAnimationFrame(() => {
                if (textHighlightPopup) {
                    const isMobileViewport = window.innerWidth < 768;
                    if (isMobileViewport) {
                        textHighlightPopup.style.left = '50%';
                    } else if (hlAiCard && !hlAiCard.classList.contains('hidden')) {
                        const popupRect = textHighlightPopup.getBoundingClientRect();
                        if (popupRect.left < 16) {
                            const curLeft = parseFloat(textHighlightPopup.style.left || 0);
                            textHighlightPopup.style.left = `${curLeft + (16 - popupRect.left)}px`;
                        } else if (popupRect.right > window.innerWidth - 16) {
                            const curLeft = parseFloat(textHighlightPopup.style.left || 0);
                            textHighlightPopup.style.left = `${curLeft - (popupRect.right - (window.innerWidth - 16))}px`;
                        }
                    }

                    const popupRect = textHighlightPopup.getBoundingClientRect();
                    if (popupRect.bottom > window.innerHeight - 12) {
                        const overflow = popupRect.bottom - (window.innerHeight - 12);
                        const curTop = parseFloat(textHighlightPopup.style.top || 0);
                        textHighlightPopup.style.top = `${Math.max(70, curTop - overflow)}px`;
                    }
                }
            });
        }
    });
}

if (hlAiOpenChatBtn) {
    hlAiOpenChatBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (!isUserPro()) {
            openProModal();
            return;
        }

        if (isHandoffAnimating) return;

        const term = lastAiDefinitionTerm || (activeHighlightRange ? activeHighlightRange.toString().trim() : '');
        const definition = lastAiDefinitionText || (hlAiContent ? hlAiContent.innerText.trim() : '');

        // Respect prefers-reduced-motion or missing popup elements
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion || !textHighlightPopup || !hlAiCard) {
            hideHighlightPopup();
            if (aiChatContainer) {
                aiChatContainer.classList.add('open');
            }
            if (term && definition) {
                await logDefinitionToChat({
                    term,
                    definition,
                    currentQuestion,
                    chatInput,
                    chatMessages: document.getElementById('chat-messages')
                });
            } else if (term) {
                await sendTutorChatMessage({
                    msg: `Defina ${term}`,
                    currentQuestion,
                    chatInput,
                    chatMessages: document.getElementById('chat-messages')
                });
            }
            if (chatInput) {
                chatInput.value = '';
                chatInput.focus();
            }
            return;
        }

        isHandoffAnimating = true;

        try {
            // 1. Hide the top action bar so only the AI definition card is visible
            if (hlActionsBar) {
                hlActionsBar.classList.add('hidden');
            }

            // Adjust vertical position so the 48px circle centers around the card's original center
            const initialHeight = hlAiCard.offsetHeight;
            const curTop = parseFloat(textHighlightPopup.style.top || 0);
            const targetCenterY = curTop + initialHeight / 2;
            textHighlightPopup.style.top = `${targetCenterY - 24}px`;

            // 2. Collapse into circle with bounce
            hlAiCard.classList.remove('hl-card-bounce');
            void hlAiCard.offsetWidth; // Force reflow
            hlAiCard.classList.add('hl-card-collapse-circle');
            hlAiCard.classList.add('hl-card-bounce');

            // Wait for collapse + bounce to settle (~260ms)
            await new Promise(r => setTimeout(r, 260));

            // 3. Compute throw trajectory coordinates towards chat bot UI
            const currentRect = textHighlightPopup.getBoundingClientRect();
            const startX = currentRect.left + currentRect.width / 2;
            const startY = currentRect.top + currentRect.height / 2;

            const isMobile = window.innerWidth < 768;
            // On desktop: chat container docks on the right edge (top ~25vh)
            // On mobile: chat container slides up from the bottom edge
            const targetX = isMobile ? window.innerWidth * 0.5 : window.innerWidth - 60;
            const targetY = isMobile ? window.innerHeight - 30 : Math.max(120, window.innerHeight * 0.35);

            const deltaX = targetX - startX;
            const deltaY = targetY - startY;

            // Arc peak offset (arcs upward before swooping down/across)
            const arcPeakY = isMobile ? -35 : (deltaY < 0 ? -25 : -65);

            // 4. Play throw animation with subtle, lighter pastel glow
            const throwAnim = textHighlightPopup.animate([
                {
                    transform: 'translate(-50%, 0) scale(1) rotate(0deg)',
                    opacity: 1,
                    filter: 'drop-shadow(0 3px 10px rgba(168, 85, 247, 0.22))',
                    offset: 0
                },
                {
                    transform: `translate(calc(-50% + ${deltaX * 0.45}px), ${deltaY * 0.35 + arcPeakY}px) scale(1.15) rotate(${deltaX >= 0 ? 18 : -18}deg)`,
                    opacity: 1,
                    filter: 'drop-shadow(0 5px 14px rgba(168, 85, 247, 0.3))',
                    offset: 0.45
                },
                {
                    transform: `translate(calc(-50% + ${deltaX * 0.82}px), ${deltaY * 0.82}px) scale(0.8) rotate(${deltaX >= 0 ? 32 : -32}deg)`,
                    opacity: 0.9,
                    offset: 0.82
                },
                {
                    transform: `translate(calc(-50% + ${deltaX}px), ${deltaY}px) scale(0.05) rotate(${deltaX >= 0 ? 45 : -45}deg)`,
                    opacity: 0,
                    filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))',
                    offset: 1
                }
            ], {
                duration: 360,
                easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)',
                fill: 'forwards'
            });

            // Trigger chat container opening animation as the thrown circle closes into the chat UI
            let chatTriggered = false;
            const triggerChatOpening = () => {
                if (chatTriggered) return;
                chatTriggered = true;
                if (aiChatContainer) {
                    aiChatContainer.classList.add('open');
                    aiChatContainer.classList.remove('hl-chat-pulse');
                    void aiChatContainer.offsetWidth; // Force reflow
                    aiChatContainer.classList.add('hl-chat-pulse');
                    if (chatInput) chatInput.focus();
                }
            };

            // Trigger opening right as the circle closes into the chat UI (~300ms into the 360ms throw)
            const chatTimer = setTimeout(triggerChatOpening, 300);

            await throwAnim.finished;
            clearTimeout(chatTimer);
            triggerChatOpening();

            hideHighlightPopup();

            if (term && definition) {
                await logDefinitionToChat({
                    term,
                    definition,
                    currentQuestion,
                    chatInput,
                    chatMessages: document.getElementById('chat-messages')
                });
            } else if (term) {
                await sendTutorChatMessage({
                    msg: `Defina ${term}`,
                    currentQuestion,
                    chatInput,
                    chatMessages: document.getElementById('chat-messages')
                });
            }

            if (chatInput) {
                chatInput.value = '';
                chatInput.focus();
            }
        } catch (err) {
            console.error("[Tutor] Erro na animação de handoff do chat:", err);
            hideHighlightPopup();
            if (aiChatContainer) {
                aiChatContainer.classList.add('open');
                if (chatInput) chatInput.focus();
            }
        } finally {
            isHandoffAnimating = false;
        }
    });
}

document.querySelectorAll('.hl-color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const color = btn.getAttribute('data-color');
        if (color) {
            applyHighlight(color);
        }
    });
});

function onSelectionChange() {
    if (isInteractingWithPopup) return;
    clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = setTimeout(() => {
        handleTextSelection();
    }, 120);
}

document.addEventListener('selectionchange', onSelectionChange);
document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('touchend', (e) => {
    if (e.target && typeof e.target.closest === 'function' && e.target.closest('#text-highlight-popup')) {
        return;
    }
    setTimeout(() => {
        handleTextSelection(e);
    }, 60);
});

if (textHighlightPopup) {
    const handlePopupTouch = () => {
        isInteractingWithPopup = true;
        if (chatInput && document.activeElement === chatInput) {
            chatInput.blur();
        }
    };
    textHighlightPopup.addEventListener('pointerdown', handlePopupTouch);
    textHighlightPopup.addEventListener('touchstart', handlePopupTouch, { passive: true });
    textHighlightPopup.addEventListener('mousedown', (e) => {
        isInteractingWithPopup = true;
        if (chatInput && document.activeElement === chatInput) {
            chatInput.blur();
        }
        // Allow text selection inside the definition content box for copying
        if (!e.target.closest('#hl-ai-content')) {
            e.preventDefault();
        }
    });
}

// Click listener to handle tapping existing highlighted marks directly & dismiss popup on click outside
document.addEventListener('click', (e) => {
    const mark = e.target.closest('mark.card-hl');
    if (mark) {
        e.stopPropagation();
        e.preventDefault();

        if (chatInput && document.activeElement === chatInput) {
            chatInput.blur();
        }

        const questionBody = document.getElementById('question-body-text') || questionText;
        const ankiAnswer = ankiAnswerText;
        const field = (ankiAnswer && ankiAnswer.contains(mark)) ? 'answer' : 'description';

        const range = document.createRange();
        range.selectNode(mark);
        activeHighlightRange = range.cloneRange();
        activeHighlightField = field;

        isInteractingWithPopup = true;
        showHighlightPopup(range, true);
        return;
    }

    if (e.target && typeof e.target.closest === 'function' && !e.target.closest('#text-highlight-popup')) {
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0;
        if (!hasSelection) {
            hideHighlightPopup();
        }
    }
});

// Dismiss popup when tapping outside on touchscreens
document.addEventListener('pointerdown', (e) => {
    if (!textHighlightPopup || textHighlightPopup.classList.contains('hidden')) return;
    if (e.target && typeof e.target.closest === 'function') {
        if (e.target.closest('#text-highlight-popup') || e.target.closest('mark.card-hl')) {
            return;
        }
    }
    isInteractingWithPopup = false;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        hideHighlightPopup();
    }
});

window.addEventListener('resize', hideHighlightPopup);
window.addEventListener('scroll', hideHighlightPopup, true);

if (restartGameBtn) {
    restartGameBtn.addEventListener('click', () => {
        if (isAnimating) return;

        const resetIcon = restartGameBtn.querySelector('img');
        if (resetIcon) {
            resetIcon.animate([
                { transform: 'rotate(0deg)' },
                { transform: 'rotate(-360deg)' }
            ], { duration: 500, easing: 'ease-in-out' });
        }

        animateCardsFromHeaderToDeck(() => {
            clearBalls();
            score = 0;
            currentStreak = 0;
            updateStreakUI(false);
            scoreDisplay.textContent = '0';
            if (activeMode === 'exam') {
                let examData = {};
                try { examData = JSON.parse(localStorage.getItem('flashcardsExam')) || {}; } catch (e) {}
                const enabledDeckIds = new Set((examData.decks || []).filter(d => d.enabled !== false).map(d => d.id));
                const playable = allQuestions.filter(q => isPlayableCard(q) && (!q.deckId || enabledDeckIds.has(q.deckId)));
                questionsPool = shuffleArray(playable);
            } else {
                questionsPool = shuffleArray(allQuestions.filter(isPlayableCard));
            }
            currentStep = 0;
            consecutiveDueCardsCount = 0;
            consecutiveNewCardsCount = 0;
            precomputedNextCard = null;
            saveGameState(true);
            updateScoreDisplay();
            archiveCurrentSession(false);
            initStatsSession(deckTitle.textContent, activeMode, questionsPool.length, 0, true);
            hideDeckCompletionScreen();
            loadQuestion();
            showNotificationPill(t('game_restarted_toast'), "reset.svg");
            console.log("[Game] Jogo reiniciado via header com sucesso.");
        });
    });
}

if (completionRestartBtn) {
    completionRestartBtn.addEventListener('click', (e) => {
        if (e) e.preventDefault();
        restartDeckSession();
    });
}
exportBtn.addEventListener('click', () => {
    let savedState = null;
    try { savedState = JSON.parse(localStorage.getItem('flashcardsSave') || '{}'); } catch (e) {}
    const isFreeTrial = Boolean(
        activeMode !== 'notebook' && (
            savedState?.isFreeAiTrial ||
            (allQuestions || []).some(q => q && q.isFreeAiTrial)
        )
    );

    if (!isUserPro() && isFreeTrial) {
        showNotificationPill(t('free_trial_no_export'), "PRO.svg", true);
        openProModal();
        return;
    }

    let exportData;
    let filename;
    if (activeMode === 'notebook') {
        exportData = {
            __flashcards_watermark__: "notebook_backup_v1",
            deckTitle: "Caderno",
            cards: allQuestions
        };
        filename = `caderno_backup.json`;
    } else if (activeMode === 'exam') {
        let examData = {};
        try { examData = JSON.parse(localStorage.getItem('flashcardsExam')) || {}; } catch (e) {}
        exportData = {
            __flashcards_watermark__: "exam_week_backup_v1",
            deckTitle: "Semana de Provas",
            decks: examData.decks || [],
            cards: allQuestions
        };
        filename = `semana_de_provas_backup.json`;
    } else {
        exportData = allQuestions;
        filename = `${deckTitle.textContent}.json`;
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = encodeURI(url); a.download = filename; a.click();
});

if (menuShareDeckBtn) {
    menuShareDeckBtn.addEventListener('click', async () => {
        closeHamburgerMenu();
        const title = (deckTitle && deckTitle.textContent ? deckTitle.textContent : (activeMode === 'notebook' ? 'Caderno' : 'Flashcards')).trim();
        const cards = (allQuestions || []).filter(isPlayableCard);
        if (cards.length === 0) return;

        const slots = getLocalSlots();
        let targetSlotIdx = null;
        if (activeMode === 'exam') {
            targetSlotIdx = slots.findIndex(s => s.isCurrent && (s.isExam || s.mode === 'exam'));
        } else if (activeMode === 'normal') {
            targetSlotIdx = slots.findIndex(s => s.isCurrent && !s.isExam);
        }

        const deckData = {
            questionsPool: questionsPool,
            allQuestions: allQuestions,
            score: score,
            deckTitle: title,
            updatedAt: Date.now()
        };

        try {
            const { shareUrl } = await shareDeckToCloud(deckData, title, targetSlotIdx !== -1 ? targetSlotIdx : null);
            showNotificationPill(t('deck_shared_copied'), "link.svg");
            showShareSuccessDialog({ shareUrl, title, isNotebook: activeMode === 'notebook' });
        } catch (err) {
            if (err.name === 'AbortError') {
                return; // User cancelled slot replacement dialog cleanly
            }
            console.error('[Share] Erro ao compartilhar baralho:', err);
            alert(t('error_sharing_deck'));
        }
    });
}
goToEditorBtn.addEventListener('click', () => {
    if (activeMode === 'notebook') {
        window.location.href = ROUTES.BULK_ADD;
        return;
    }
    const cleanCards = (allQuestions || []).map(sanitizeCardForStorage);
    localStorage.setItem('editing_deck', encodeStoragePayload(cleanCards));
    const title = (deckTitle && deckTitle.textContent) ? deckTitle.textContent : (activeMode === 'exam' ? 'Semana de Provas' : 'Baralho');
    localStorage.setItem('editing_deck_title', encodeStoragePayload(title));
    localStorage.setItem('editing_deck_mode', activeMode || 'normal');

    let savedState = null;
    const storageKey = activeMode === 'exam' ? 'flashcardsExam' : 'flashcardsSave';
    try { savedState = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (e) {}

    if (activeMode === 'exam') {
        localStorage.setItem('editing_deck_exam_data', encodeStoragePayload(localStorage.getItem('flashcardsExam') || '{}'));
    } else {
        localStorage.removeItem('editing_deck_exam_data');
    }

    try {
        const slots = getLocalSlots();
        let targetSlotIdx = -1;
        if (activeMode === 'exam') {
            targetSlotIdx = slots.findIndex(s => s.isCurrent && (s.isExam || s.mode === 'exam'));
            if (targetSlotIdx === -1) targetSlotIdx = slots.findIndex(s => s.isExam || s.mode === 'exam');
        } else {
            targetSlotIdx = slots.findIndex(s => s.isCurrent && !s.isExam);
            if (targetSlotIdx === -1) targetSlotIdx = slots.findIndex(s => !s.isExam && s.title === title);
        }
        if (targetSlotIdx !== -1) {
            localStorage.setItem('editing_deck_slot_index', String(targetSlotIdx));
        } else {
            localStorage.removeItem('editing_deck_slot_index');
        }
    } catch (e) {}

    if (savedState?.isFreeAiTrial || cleanCards.some(c => c && c.isFreeAiTrial)) {
        localStorage.setItem('editing_deck_is_free_trial', 'true');
    } else {
        localStorage.removeItem('editing_deck_is_free_trial');
    }
    window.location.href = ROUTES.GENERATE;
});

// --- CLEAR NOTEBOOK LISTENER ---
clearNotebookBtn?.addEventListener('click', () => {
    closeHamburgerMenu();
    const confirmed = confirm(t('confirm_clear_entire_notebook'));
    if (confirmed) {
        localStorage.removeItem(NOTEBOOK_STORAGE_KEY);
        allQuestions = [];
        questionsPool = [];
        notebookReviewsCount = 0;
        score = 0;
        currentStep = 0;
        precomputedNextCard = null;

        clearBalls();
        resetUI();
        updateScoreDisplay();
        loadQuestion();
        triggerHaptic('delete');
        showNotificationPill(t('notebook_cleared_toast'), "delete.svg");
    }
});

// --- DAILY GOAL MODAL (PARA HOJE) ---
const dailyGoalModal = document.getElementById('daily-goal-modal');
const dailyGoalInput = document.getElementById('daily-goal-input');
const dailyGoalProgressText = document.getElementById('daily-goal-progress-text');
const dailyGoalDueText = document.getElementById('daily-goal-due-text');
const closeDailyGoalModalBtn = document.getElementById('close-daily-goal-modal-btn');
const cancelDailyGoalBtn = document.getElementById('cancel-daily-goal-btn');
const saveDailyGoalBtn = document.getElementById('save-daily-goal-btn');
const dailyGoalPresetBtns = document.querySelectorAll('.daily-goal-preset-btn');

function openDailyGoalModal() {
    if (!dailyGoalModal) return;
    const currentGoal = getNotebookDailyGoal();
    const dueInfo = getNotebookDueCounts(allQuestions);
    const reviewedToday = dueInfo.reviewedToday || 0;

    if (dailyGoalInput) {
        dailyGoalInput.value = currentGoal > 0 ? currentGoal : '';
    }
    if (dailyGoalProgressText) {
        dailyGoalProgressText.textContent = t('reviewed_today_count', { count: reviewedToday, unit: reviewedToday === 1 ? t('card_unit_singular') : t('card_unit_plural') });
    }
    if (dailyGoalDueText) {
        dailyGoalDueText.textContent = t('due_count', { count: dueInfo.dueToday });
    }

    dailyGoalModal.classList.remove('hidden');
    setTimeout(() => dailyGoalInput?.focus(), 50);
}

function closeDailyGoalModal() {
    dailyGoalModal?.classList.add('hidden');
}

closeDailyGoalModalBtn?.addEventListener('click', closeDailyGoalModal);
cancelDailyGoalBtn?.addEventListener('click', closeDailyGoalModal);
dailyGoalModal?.addEventListener('click', (e) => {
    if (e.target === dailyGoalModal) closeDailyGoalModal();
});

dailyGoalPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (dailyGoalInput && val) {
            dailyGoalInput.value = val;
            triggerHaptic('tick');
        }
    });
});

saveDailyGoalBtn?.addEventListener('click', () => {
    const rawVal = dailyGoalInput ? dailyGoalInput.value.trim() : '';
    const num = parseInt(rawVal, 10);
    const goal = (!isNaN(num) && num > 0) ? num : 0;

    setNotebookDailyGoal(goal);
    updateScoreDisplay();
    closeDailyGoalModal();
    triggerHaptic('snap');

    if (goal > 0) {
        showNotificationPill(t('daily_goal_toast', { goal }), 'collection.svg');
    } else {
        showNotificationPill(t('studying_all_due_cards'), 'collection.svg');
    }
    checkAndCelebrateNotebookDailyGoal(false);
});

counterLeftWrapper?.addEventListener('click', (e) => {
    if (activeMode === 'notebook') {
        e.stopPropagation();
        openDailyGoalModal();
    }
});
if (aiToggleBtn) {
    aiToggleBtn.addEventListener('click', () => {
        closeHamburgerMenu();
        if (!isUserPro()) {
            openProModal();
            return;
        }
        const isAiOn = localStorage.getItem('flashcards_ai_enabled') === 'true';
        const nextState = !isAiOn;
        localStorage.setItem('flashcards_ai_enabled', String(nextState));
        if (nextState) {
            initializeAi();
            initBackgroundCategorization();
            showNotificationPill(t('ai_enabled_toast'), "enabled_ai.svg");
        } else {
            disableTutor();
            updateAiUI();
            showNotificationPill(t('ai_disabled_toast'), "config_ai.svg");
        }
    });
}

if (aiSwitch) {
    aiSwitch.addEventListener('change', () => {
        const nextState = Boolean(aiSwitch.selected);
        if (nextState) {
            if (isUserPro()) {
                localStorage.setItem('flashcards_ai_enabled', 'true');
                initializeAi();
                initBackgroundCategorization();
                showNotificationPill(t('ai_enabled_toast'), "enabled_ai.svg");
                debouncedSyncSlotsToCloud();
            } else {
                aiSwitch.selected = false;
                closeHamburgerMenu();
                openProModal();
                showNotificationPill(t('pro_exclusive_feature'), "paywall.svg");
            }
        } else {
            localStorage.setItem('flashcards_ai_enabled', 'false');
            disableTutor();
            updateAiUI();
            showNotificationPill(t('ai_disabled_toast'), "config_ai.svg");
            debouncedSyncSlotsToCloud();
        }
    });
}

if (aiSettingRow) {
    aiSettingRow.addEventListener('click', (e) => {
        if (e.target.closest('md-switch') || e.target.closest('#ai-toggle-btn')) return;
        if (aiToggleBtn) aiToggleBtn.click();
    });
}

// --- APP SETTINGS MODAL & ACCESSIBILITY CONTROLLER ---
const openSettingsModalBtn = document.getElementById('open-settings-modal-btn');
const appSettingsModal = document.getElementById('app-settings-modal');
const closeAppSettingsModalBtn = document.getElementById('close-app-settings-modal-btn');
const doneAppSettingsModalBtn = document.getElementById('done-app-settings-modal-btn');

// Language select in settings modal
const settingLanguageSelect = document.getElementById('setting-language-select');

// Accessibility switches & rows
const settingHapticRow = document.getElementById('setting-haptic-row');
const settingHapticSwitch = document.getElementById('setting-haptic-switch');
const settingSoundRow = document.getElementById('setting-sound-row');
const settingSoundSwitch = document.getElementById('setting-sound-switch');
const settingAnimationsRow = document.getElementById('setting-animations-row');
const settingAnimationsSwitch = document.getElementById('setting-animations-switch');

// Pomodoro controls in settings modal
const settingPomodoroRow = document.getElementById('setting-pomodoro-row');
const settingPomodoroSwitch = document.getElementById('setting-pomodoro-switch');

// AI controls in settings modal
const settingAiRow = document.getElementById('setting-ai-row');
const settingAiSwitch = document.getElementById('setting-ai-switch');

// Notebook goal & clear controls in settings modal
const settingNotebookGoalSelect = document.getElementById('setting-notebook-goal-select');
const settingNotebookGoalInfo = document.getElementById('setting-notebook-goal-info');
const settingClearNotebookBtn = document.getElementById('setting-clear-notebook-btn');

// Pinned header stats controls in settings modal
let settingsCurrentStatsTab = 'deck'; // 'deck' | 'notebook'
const settingStatsTabDeckBtn = document.getElementById('setting-stats-tab-deck');
const settingStatsTabNotebookBtn = document.getElementById('setting-stats-tab-notebook');
const settingStatsPinnedCount = document.getElementById('setting-stats-pinned-count');
const settingStatsListContainer = document.getElementById('setting-stats-list-container');

// Daily notifications controls in settings modal
const settingNotifMasterSwitch = document.getElementById('setting-notif-master-switch');
const settingNotifPeriodsContainer = document.getElementById('setting-notif-periods-container');
const settingNotifMorningSwitch = document.getElementById('setting-notif-morning-switch');
const settingNotifMorningTime = document.getElementById('setting-notif-morning-time');
const settingNotifNoonSwitch = document.getElementById('setting-notif-noon-switch');
const settingNotifNoonTime = document.getElementById('setting-notif-noon-time');
const settingNotifNightSwitch = document.getElementById('setting-notif-night-switch');
const settingNotifNightTime = document.getElementById('setting-notif-night-time');
const settingNotifTestBtn = document.getElementById('setting-notif-test-btn');

// Legacy elements (if present)
const hapticSwitch = document.getElementById('haptic-switch');
const hapticSettingRow = document.getElementById('haptic-setting-row');
const hapticToggleBtn = document.getElementById('haptic-toggle-btn');

async function updateSettingsModalState() {
    // 0. Language selection
    if (settingLanguageSelect) {
        settingLanguageSelect.value = getLanguagePreference();
    }

    // 1. Accessibility switches
    updateAccessibilityUI();

    // 2. Pomodoro state
    updatePomodoroUI();

    // 3. AI state
    const isAiOn = localStorage.getItem('flashcards_ai_enabled') === 'true';
    if (settingAiSwitch) {
        settingAiSwitch.selected = isAiOn;
    }
    const settingProStatus = document.getElementById('setting-pro-status');
    if (settingProStatus) {
        if (isUserPro()) {
            settingProStatus.textContent = t('pro_plan_active');
            settingProStatus.className = 'text-[11px] font-semibold text-emerald-600';
        } else {
            settingProStatus.textContent = t('pro_plan_available');
            settingProStatus.className = 'text-[11px] text-[var(--md-sys-color-on-surface-variant)]';
        }
    }

    // 4. Notebook goal & status
    const currentGoal = getNotebookDailyGoal();
    if (settingNotebookGoalSelect) {
        settingNotebookGoalSelect.value = String(currentGoal);
    }
    if (settingNotebookGoalInfo) {
        const dueInfo = getNotebookDueCounts(allQuestions || []);
        const reviewedToday = dueInfo.reviewedToday || 0;
        settingNotebookGoalInfo.textContent = t('goal_progress_today', { reviewed: reviewedToday, due: dueInfo.dueToday });
    }

    // 5. Header pinned stats tab & list
    switchSettingsStatsTab(normalizeStatsMode(activeMode));

    // 6. Daily notifications settings
    updateNotificationsUI();

    // 7. Statistics API settings
    updateApiSettingsUI();
}

let isApiSettingsLoading = false;
let currentLoadedApiKey = null;
let currentLoadedWebhookUrl = null;

async function updateApiSettingsUI() {
    const container = document.getElementById('settings-api-container');
    if (!container) return;

    if (!isUserPro()) {
        container.innerHTML = `
            <div class="p-3.5 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 rounded-xl border border-blue-200/70 space-y-3">
                <div class="flex items-start gap-2.5">
                    <span class="material-symbols-rounded text-xl text-[#3b82f7] flex-shrink-0 mt-0.5">lock</span>
                    <div>
                        <p class="text-xs font-bold text-[var(--md-sys-color-on-surface)]" data-i18n="settings_api_pro_exclusive">${escapeHtml(t('settings_api_pro_exclusive'))}</p>
                        <p class="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed mt-0.5" data-i18n="settings_api_pro_desc">${escapeHtml(t('settings_api_pro_desc'))}</p>
                    </div>
                </div>

                <div class="bg-white/90 rounded-xl p-2.5 border border-blue-100 max-w-full overflow-hidden space-y-1.5 select-all">
                    <span class="text-gray-400 block text-[9px] font-sans font-bold uppercase tracking-wider truncate" data-i18n="settings_api_json_example_label">${escapeHtml(t('settings_api_json_example_label'))}</span>
                    <pre class="bg-blue-50/40 rounded-lg p-2 border border-blue-100 font-mono text-[10px] text-gray-700 leading-relaxed overflow-x-auto whitespace-pre max-w-full"><code>{\n  "date": "2026-11-05",\n  "cards_reviewed": 142,\n  "retention_rate": 0.88,\n  "time_spent_seconds": 1840,\n  "streak_days": 18,\n  "past_14_days_time": "180;1250;950;0;1100;540;1400;360;0;600;1300;980;1600;1840",\n  "past_14_days_cards": "12;109;82;0;98;45;120;30;0;50;110;85;140;142"\n}</code></pre>
                </div>

                <button type="button" id="setting-api-upgrade-btn" class="m3-btn-expressive m3-btn-filled w-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm text-white cursor-pointer transition-all hover:opacity-95" style="background-color: #3b82f7;">
                    <span class="material-symbols-rounded text-base">stars</span>
                    <span data-i18n="settings_api_unlock_btn">${escapeHtml(t('settings_api_unlock_btn'))}</span>
                </button>
            </div>
        `;
        document.getElementById('setting-api-upgrade-btn')?.addEventListener('click', () => {
            openProModal();
        });
        return;
    }

    // User is Pro: fetch their existing API key and webhook
    if (!currentLoadedApiKey && !isApiSettingsLoading) {
        isApiSettingsLoading = true;
        container.innerHTML = `
            <div class="py-6 flex flex-col items-center justify-center gap-2 text-center">
                <span class="material-symbols-rounded text-2xl text-[#3b82f7] animate-spin">progress_activity</span>
                <span class="text-xs text-[var(--md-sys-color-on-surface-variant)]">${escapeHtml(t('loading'))}</span>
            </div>
        `;
        try {
            const [keyRes, hookRes] = await Promise.all([
                getUserApiKey().catch(() => null),
                getUserWebhook().catch(() => null)
            ]);
            currentLoadedApiKey = keyRes?.apiKey || null;
            currentLoadedWebhookUrl = hookRes?.webhookUrl || '';
        } catch (e) {
            console.warn('[Settings API] Erro ao carregar chave ou webhook:', e);
        } finally {
            isApiSettingsLoading = false;
        }
    }

    if (!currentLoadedApiKey) {
        // Pro, but no key generated yet
        container.innerHTML = `
            <div class="space-y-3">
                <p class="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed" data-i18n="settings_api_generate_desc">
                    ${escapeHtml(t('settings_api_generate_desc'))}
                </p>

                <div class="bg-gray-50 rounded-xl p-2.5 border border-gray-200/80 max-w-full overflow-hidden space-y-1.5">
                    <span class="text-gray-400 block text-[9px] font-sans font-bold uppercase tracking-wider truncate" data-i18n="settings_api_json_format_label">${escapeHtml(t('settings_api_json_format_label'))}</span>
                    <pre class="bg-white/90 rounded-lg p-2 border border-gray-200 font-mono text-[10px] text-gray-700 leading-relaxed overflow-x-auto whitespace-pre select-all max-w-full"><code>{\n  "date": "2026-11-05",\n  "cards_reviewed": 142,\n  "retention_rate": 0.88,\n  "time_spent_seconds": 1840,\n  "streak_days": 18,\n  "past_14_days_time": "180;1250;950;0;1100;540;1400;360;0;600;1300;980;1600;1840",\n  "past_14_days_cards": "12;109;82;0;98;45;120;30;0;50;110;85;140;142"\n}</code></pre>
                </div>

                <button type="button" id="setting-api-generate-btn" class="m3-btn-expressive m3-btn-filled w-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm text-white cursor-pointer transition-all hover:opacity-95" style="background-color: #3b82f7;">
                    <span class="material-symbols-rounded text-base">key</span>
                    <span data-i18n="settings_api_generate_btn">${escapeHtml(t('settings_api_generate_btn'))}</span>
                </button>
            </div>
        `;

        document.getElementById('setting-api-generate-btn')?.addEventListener('click', async () => {
            const btn = document.getElementById('setting-api-generate-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="material-symbols-rounded text-base animate-spin">progress_activity</span><span>${escapeHtml(t('loading'))}</span>`;
            }
            try {
                const res = await generateUserApiKey();
                currentLoadedApiKey = res?.apiKey || null;
                syncSlotsToCloud();
                showNotificationPill(t('settings_api_key_label') + ' gerada!', 'check');
            } catch (err) {
                showNotificationPill(err.message || 'Erro ao gerar chave', 'error');
            }
            updateApiSettingsUI();
        });
        return;
    }

    // User is Pro and has an active API key
    const endpointUrl = `${BACKEND_URL}/api/v1/stats`;
    const curlCommand = `curl -H "X-API-Key: ${currentLoadedApiKey}" "${endpointUrl}"`;

    container.innerHTML = `
        <div class="space-y-4">
            <div>
                <label class="block text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-1" data-i18n="settings_api_key_label">
                    ${escapeHtml(t('settings_api_key_label'))}
                </label>
                <div class="flex items-center gap-1.5">
                    <div class="flex-1 relative flex items-center">
                        <input type="password" id="setting-api-key-input" readonly value="${escapeHtml(currentLoadedApiKey)}"
                            class="w-full pl-3 pr-9 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] text-xs font-mono font-semibold outline-none select-all focus:ring-2 focus:ring-blue-500">
                        <button type="button" id="setting-api-key-toggle-vis" class="absolute right-2 text-gray-400 hover:text-gray-700 p-1 rounded-lg cursor-pointer transition" title="${escapeHtml(t('settings_api_toggle_visibility'))}">
                            <span class="material-symbols-rounded text-base">visibility</span>
                        </button>
                    </div>
                    <button type="button" id="setting-api-copy-btn" class="px-3.5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1 transition shadow-xs cursor-pointer flex-shrink-0 hover:opacity-95" style="background-color: #3b82f7;">
                        <span class="material-symbols-rounded text-sm">content_copy</span>
                        <span data-i18n="settings_api_copy_btn">${escapeHtml(t('settings_api_copy_btn'))}</span>
                    </button>
                </div>
            </div>

            <!-- Actions Row -->
            <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--md-sys-color-outline-variant)]/60">
                <button type="button" id="setting-api-test-btn" class="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-xs font-bold text-[#3b82f7] transition cursor-pointer flex items-center gap-1">
                    <span class="material-symbols-rounded text-sm">play_arrow</span>
                    <span data-i18n="settings_api_test_btn">${escapeHtml(t('settings_api_test_btn'))}</span>
                </button>
                <button type="button" id="setting-api-regen-btn" class="px-3 py-1.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] transition cursor-pointer flex items-center gap-1">
                    <span class="material-symbols-rounded text-sm">refresh</span>
                    <span data-i18n="settings_api_regenerate_btn">${escapeHtml(t('settings_api_regenerate_btn'))}</span>
                </button>
                <button type="button" id="setting-api-revoke-btn" class="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition cursor-pointer flex items-center gap-1 ml-auto">
                    <span class="material-symbols-rounded text-sm">delete</span>
                    <span data-i18n="settings_api_revoke_btn">${escapeHtml(t('settings_api_revoke_btn'))}</span>
                </button>
            </div>

            <!-- Test Result Box -->
            <div id="setting-api-test-box" class="hidden rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-1.5 transition-all">
                <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm text-emerald-600">check_circle</span>
                        <span data-i18n="settings_api_test_success">${escapeHtml(t('settings_api_test_success'))}</span>
                    </span>
                    <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-200/70 text-emerald-900">200 OK</span>
                </div>
                <pre id="setting-api-test-json" class="p-2.5 bg-slate-900 text-emerald-300 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed select-all"></pre>
            </div>

            <!-- Endpoint Documentation & Examples -->
            <div class="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500" data-i18n="settings_api_endpoint_label">Endpoint REST (GET)</span>
                    <span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">JSON</span>
                </div>
                <code class="block text-[11px] text-gray-900 font-mono break-all bg-white p-2 rounded-lg border border-gray-200 select-all font-semibold">
                    ${endpointUrl}
                </code>
                <p class="text-[10px] text-gray-600 leading-normal" data-i18n="settings_api_guide_desc">
                    ${escapeHtml(t('settings_api_guide_desc'))}
                </p>
                <div class="pt-1.5 border-t border-gray-200/80">
                    <span class="text-[9px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Exemplo cURL:</span>
                    <code class="block text-[10px] text-gray-700 font-mono break-all bg-gray-100 p-1.5 rounded border border-gray-200 select-all">
                        ${escapeHtml(curlCommand)}
                    </code>
                </div>
            </div>

            <!-- Webhook Section -->
            <div class="pt-3 border-t border-[var(--md-sys-color-outline-variant)]/60 space-y-2.5">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                        <span class="material-symbols-rounded text-lg text-[#3b82f7]">webhook</span>
                        <label class="block text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]" data-i18n="webhook_heading">
                            ${escapeHtml(t('webhook_heading'))}
                        </label>
                    </div>
                    <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">POST Event</span>
                </div>
                <p class="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-normal" data-i18n="webhook_desc">
                    ${escapeHtml(t('webhook_desc'))}
                </p>
                <div class="flex items-center gap-1.5">
                    <input type="url" id="setting-webhook-url-input" placeholder="${escapeHtml(t('webhook_url_placeholder'))}" value="${escapeHtml(currentLoadedWebhookUrl || '')}"
                        class="flex-1 px-3 py-2 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500">
                    <button type="button" id="setting-webhook-save-btn" class="px-3.5 py-2 rounded-xl text-white text-xs font-bold transition shadow-xs cursor-pointer flex-shrink-0 hover:opacity-95" style="background-color: #3b82f7;">
                        <span data-i18n="webhook_save_btn">${escapeHtml(t('webhook_save_btn'))}</span>
                    </button>
                </div>
                <div class="flex items-center justify-between pt-1">
                    <button type="button" id="setting-webhook-test-btn" class="px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-xs font-bold text-purple-700 transition cursor-pointer flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm">send</span>
                        <span data-i18n="webhook_test_btn">${escapeHtml(t('webhook_test_btn'))}</span>
                    </button>
                    <span id="setting-webhook-status" class="text-[11px] text-gray-500 font-semibold"></span>
                </div>
            </div>
        </div>
    `;

    // Visibility toggle
    const keyInput = document.getElementById('setting-api-key-input');
    const toggleVisBtn = document.getElementById('setting-api-key-toggle-vis');
    toggleVisBtn?.addEventListener('click', () => {
        if (!keyInput) return;
        const isPassword = keyInput.type === 'password';
        keyInput.type = isPassword ? 'text' : 'password';
        const icon = toggleVisBtn.querySelector('.material-symbols-rounded');
        if (icon) icon.textContent = isPassword ? 'visibility_off' : 'visibility';
    });

    // Copy button
    document.getElementById('setting-api-copy-btn')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(currentLoadedApiKey);
            const copyBtn = document.getElementById('setting-api-copy-btn');
            if (copyBtn) {
                const prev = copyBtn.innerHTML;
                copyBtn.innerHTML = `<span class="material-symbols-rounded text-sm">check</span><span>${escapeHtml(t('settings_api_copied'))}</span>`;
                setTimeout(() => { copyBtn.innerHTML = prev; }, 2000);
            }
            showNotificationPill(t('settings_api_copied'), 'check');
        } catch {
            keyInput?.select();
        }
    });

    // Test API button
    document.getElementById('setting-api-test-btn')?.addEventListener('click', async () => {
        const testBtn = document.getElementById('setting-api-test-btn');
        const testBox = document.getElementById('setting-api-test-box');
        const testJson = document.getElementById('setting-api-test-json');

        if (testBtn) {
            testBtn.disabled = true;
            testBtn.innerHTML = `<span class="material-symbols-rounded text-sm animate-spin">progress_activity</span><span>${escapeHtml(t('settings_api_testing'))}</span>`;
        }

        try {
            syncSlotsToCloud();
            const res = await testStatsApi(currentLoadedApiKey);
            if (testBox && testJson) {
                testBox.classList.remove('hidden');
                testJson.textContent = JSON.stringify(res.data, null, 2);
            }
        } catch (err) {
            if (testBox && testJson) {
                testBox.classList.remove('hidden');
                testJson.textContent = JSON.stringify({ error: 'test_failed', message: err.message }, null, 2);
            }
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.innerHTML = `<span class="material-symbols-rounded text-sm">play_arrow</span><span>${escapeHtml(t('settings_api_test_btn'))}</span>`;
            }
        }
    });

    // Regenerate Key button
    document.getElementById('setting-api-regen-btn')?.addEventListener('click', async () => {
        if (!confirm(t('settings_api_confirm_regenerate'))) return;
        const regenBtn = document.getElementById('setting-api-regen-btn');
        if (regenBtn) {
            regenBtn.disabled = true;
            regenBtn.innerHTML = `<span class="material-symbols-rounded text-sm animate-spin">progress_activity</span>`;
        }
        try {
            const res = await generateUserApiKey();
            currentLoadedApiKey = res?.apiKey || null;
            syncSlotsToCloud();
            showNotificationPill(t('settings_api_key_label') + ' regerada!', 'check');
        } catch (err) {
            showNotificationPill(err.message || 'Erro ao regerar chave', 'error');
        }
        updateApiSettingsUI();
    });

    // Revoke Key button
    document.getElementById('setting-api-revoke-btn')?.addEventListener('click', async () => {
        if (!confirm(t('settings_api_confirm_revoke'))) return;
        const revokeBtn = document.getElementById('setting-api-revoke-btn');
        if (revokeBtn) {
            revokeBtn.disabled = true;
            revokeBtn.innerHTML = `<span class="material-symbols-rounded text-sm animate-spin">progress_activity</span>`;
        }
        try {
            await revokeUserApiKey();
            currentLoadedApiKey = null;
            showNotificationPill('Chave revogada com sucesso', 'check');
        } catch (err) {
            showNotificationPill(err.message || 'Erro ao revogar chave', 'error');
        }
        updateApiSettingsUI();
    });

    // Webhook Save button
    document.getElementById('setting-webhook-save-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('setting-webhook-url-input');
        const saveBtn = document.getElementById('setting-webhook-save-btn');
        const urlVal = input ? input.value.trim() : '';
        if (saveBtn) saveBtn.disabled = true;
        try {
            await saveUserWebhook(urlVal);
            currentLoadedWebhookUrl = urlVal;
            showNotificationPill(t('webhook_saved_toast'), 'check');
        } catch (err) {
            showNotificationPill(err.message || 'Erro ao salvar webhook', 'error');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    });

    // Webhook Test button
    document.getElementById('setting-webhook-test-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('setting-webhook-url-input');
        const testBtn = document.getElementById('setting-webhook-test-btn');
        const statusSpan = document.getElementById('setting-webhook-status');
        const urlVal = input ? input.value.trim() : '';
        if (!urlVal) {
            showNotificationPill('Informe a URL do webhook antes de testar', 'warning');
            return;
        }
        if (testBtn) {
            testBtn.disabled = true;
            testBtn.innerHTML = `<span class="material-symbols-rounded text-sm animate-spin">progress_activity</span><span>${escapeHtml(t('webhook_testing'))}</span>`;
        }
        if (statusSpan) statusSpan.textContent = '';
        try {
            const res = await testUserWebhook(urlVal);
            if (statusSpan) {
                statusSpan.textContent = `${t('webhook_test_success')} (${res.status})`;
                statusSpan.className = 'text-[11px] text-emerald-600 font-semibold';
            }
            showNotificationPill(t('webhook_test_success'), 'check');
        } catch (err) {
            if (statusSpan) {
                statusSpan.textContent = err.message;
                statusSpan.className = 'text-[11px] text-red-600 font-semibold';
            }
            showNotificationPill(err.message || 'Falha no teste de webhook', 'error');
        } finally {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.innerHTML = `<span class="material-symbols-rounded text-sm">send</span><span>${escapeHtml(t('webhook_test_btn'))}</span>`;
            }
        }
    });
}

function switchSettingsStatsTab(tab) {
    settingsCurrentStatsTab = tab === 'notebook' ? 'notebook' : 'deck';
    if (settingStatsTabDeckBtn && settingStatsTabNotebookBtn) {
        if (settingsCurrentStatsTab === 'deck') {
            settingStatsTabDeckBtn.className = 'flex-1 py-1.5 px-3 rounded-xl transition-all text-center cursor-pointer bg-white text-[var(--md-sys-color-primary)] font-bold shadow-xs';
            settingStatsTabNotebookBtn.className = 'flex-1 py-1.5 px-3 rounded-xl transition-all text-center cursor-pointer text-[var(--md-sys-color-on-surface-variant)] font-semibold hover:text-[var(--md-sys-color-on-surface)]';
        } else {
            settingStatsTabNotebookBtn.className = 'flex-1 py-1.5 px-3 rounded-xl transition-all text-center cursor-pointer bg-white text-[var(--md-sys-color-primary)] font-bold shadow-xs';
            settingStatsTabDeckBtn.className = 'flex-1 py-1.5 px-3 rounded-xl transition-all text-center cursor-pointer text-[var(--md-sys-color-on-surface-variant)] font-semibold hover:text-[var(--md-sys-color-on-surface)]';
        }
    }
    renderSettingsPinnedStatsList(settingsCurrentStatsTab);
}

settingStatsTabDeckBtn?.addEventListener('click', () => switchSettingsStatsTab('deck'));
settingStatsTabNotebookBtn?.addEventListener('click', () => switchSettingsStatsTab('notebook'));

function renderSettingsPinnedStatsList(mode = settingsCurrentStatsTab) {
    if (!settingStatsListContainer) return;
    const targetMode = mode === 'notebook' ? 'notebook' : 'deck';
    const pinnedIds = getPinnedHeaderStats(targetMode);

    if (settingStatsPinnedCount) {
        settingStatsPinnedCount.textContent = t('pinned_stats_count', { count: pinnedIds.length, max: MAX_PINNED_STATS });
        if (pinnedIds.length >= MAX_PINNED_STATS) {
            settingStatsPinnedCount.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 flex-shrink-0';
        } else {
            settingStatsPinnedCount.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 flex-shrink-0';
        }
    }

    settingStatsListContainer.innerHTML = '';

    AVAILABLE_HEADER_STATS.forEach(stat => {
        const isPinned = pinnedIds.includes(stat.id);
        const statI18n = getStatI18n(stat.id);
        const displayLabel = targetMode === 'notebook'
            ? (statI18n.notebookLabel || stat.notebookLabel)
            : (statI18n.label || stat.label);
        const statTitle = statI18n.title || stat.title;
        const statDesc = statI18n.desc || stat.description;

        const row = document.createElement('div');
        row.className = `group/stat flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            isPinned
                ? 'bg-blue-50/50 border-blue-200/80'
                : 'bg-transparent border-transparent hover:bg-[var(--md-sys-color-surface-container-high)]'
        }`;

        row.innerHTML = `
            <div class="flex items-center gap-3 min-w-0 flex-1 pr-2">
                <div class="w-8 h-8 rounded-xl ${stat.iconBg} flex items-center justify-center flex-shrink-0 shadow-xs">
                    <span class="material-symbols-rounded text-lg">${stat.icon}</span>
                </div>
                <div class="min-w-0 flex-1 text-left">
                    <div class="flex items-center gap-1.5">
                        <span class="text-xs font-bold text-[var(--md-sys-color-on-surface)] truncate">${statTitle}</span>
                        <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono flex-shrink-0">${displayLabel}</span>
                    </div>
                    <p class="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">${statDesc}</p>
                </div>
            </div>
            <button type="button" class="pin-stat-btn p-1.5 rounded-xl transition-all cursor-pointer ${
                isPinned
                    ? 'bg-blue-100/80 border border-blue-300 text-blue-700 shadow-xs'
                    : 'bg-gray-100 border border-transparent text-gray-400 hover:text-gray-600'
            }" title="${isPinned ? t('unpin_from_header') : (pinnedIds.length >= MAX_PINNED_STATS ? t('pinned_stat_max_toast') : t('pin_to_header'))}">
                <img src="${isPinned ? '../assets/img/pinned.svg' : '../assets/img/unpinned.svg'}"
                     class="w-5 h-5 flex-shrink-0 pointer-events-none transition-transform active:scale-90 ${isPinned ? '' : 'opacity-60'}"
                     alt="${isPinned ? t('pinned') : t('not_pinned')}">
            </button>
        `;

        const handleToggle = (e) => {
            e.stopPropagation();
            let currentList = getPinnedHeaderStats(targetMode);
            const currentlyPinned = currentList.includes(stat.id);

            if (currentlyPinned) {
                if (currentList.length <= MIN_PINNED_STATS) {
                    showNotificationPill(t('pinned_stat_min_toast'), 'pinned.svg', true);
                    triggerHaptic('shake');
                    return;
                }
                currentList = currentList.filter(id => id !== stat.id);
                triggerHaptic('light');
                showNotificationPill(t('stat_unpinned_toast', { label: displayLabel, target: targetMode === 'notebook' ? t('notebook') : t('nav_normal_game') }), 'unpinned.svg');
            } else {
                if (currentList.length >= MAX_PINNED_STATS) {
                    showNotificationPill(t('pinned_stat_max_toast'), 'pinned.svg', true);
                    triggerHaptic('shake');
                    return;
                }
                currentList.push(stat.id);
                triggerHaptic('streakUp');
                showNotificationPill(t('stat_pinned_toast', { label: displayLabel, target: targetMode === 'notebook' ? t('notebook') : t('nav_normal_game') }), 'pinned.svg');
            }

            savePinnedHeaderStats(currentList, targetMode);
            renderSettingsPinnedStatsList(targetMode);

            if (targetMode === normalizeStatsMode(activeMode)) {
                renderHeaderPinnedStats();
                if (headerStatsDropdown && !headerStatsDropdown.classList.contains('hidden')) {
                    renderHeaderStatsDropdown();
                }
            }
        };

        const pinBtn = row.querySelector('.pin-stat-btn');
        if (pinBtn) pinBtn.addEventListener('click', handleToggle);
        row.addEventListener('click', handleToggle);

        settingStatsListContainer.appendChild(row);
    });
}

function openAppSettingsModal() {
    if (!appSettingsModal) return;
    updateSettingsModalState();
    appSettingsModal.classList.remove('hidden');
}

function closeAppSettingsModal() {
    if (!appSettingsModal) return;
    appSettingsModal.classList.add('hidden');
}

// Open / Close modal events
openSettingsModalBtn?.addEventListener('click', () => {
    closeHamburgerMenu();
    openAppSettingsModal();
});
closeAppSettingsModalBtn?.addEventListener('click', closeAppSettingsModal);
doneAppSettingsModalBtn?.addEventListener('click', closeAppSettingsModal);
appSettingsModal?.addEventListener('click', (e) => {
    if (e.target === appSettingsModal) closeAppSettingsModal();
});

// App Language selector in Settings Modal
settingLanguageSelect?.addEventListener('change', () => {
    const val = settingLanguageSelect.value;
    setLanguage(val);
    updateSettingsModalState();
});

window.addEventListener('flashcards:language-change', () => {
    applyTranslations();
    renderHeaderPinnedStats(true);
    if (settingLanguageSelect) {
        settingLanguageSelect.value = getLanguagePreference();
    }
    updateSettingsModalState();
});

// Accessibility: Haptic Switch
if (settingHapticSwitch) {
    settingHapticSwitch.addEventListener('change', () => {
        const enabled = Boolean(settingHapticSwitch.selected);
        setHapticEnabled(enabled);
        showNotificationPill(
            enabled ? t('haptic_enabled_toast') : t('haptic_disabled_toast'),
            "vibrate.svg"
        );
    });
}
if (settingHapticRow && settingHapticSwitch) {
    settingHapticRow.addEventListener('click', (e) => {
        if (e.target.closest('md-switch')) return;
        e.preventDefault();
        if (settingHapticSwitch.disabled) return;
        settingHapticSwitch.selected = !settingHapticSwitch.selected;
        settingHapticSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// Accessibility: Sound Switch
if (settingSoundSwitch) {
    settingSoundSwitch.addEventListener('change', () => {
        const enabled = Boolean(settingSoundSwitch.selected);
        setSoundEnabled(enabled);
        showNotificationPill(
            enabled ? t('sound_enabled_toast') : t('sound_disabled_toast'),
            "stats.svg"
        );
    });
}
if (settingSoundRow && settingSoundSwitch) {
    settingSoundRow.addEventListener('click', (e) => {
        if (e.target.closest('md-switch')) return;
        e.preventDefault();
        settingSoundSwitch.selected = !settingSoundSwitch.selected;
        settingSoundSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// Accessibility: Animations Switch
if (settingAnimationsSwitch) {
    settingAnimationsSwitch.addEventListener('change', () => {
        const enabled = Boolean(settingAnimationsSwitch.selected);
        setAnimationsEnabled(enabled);
        showNotificationPill(
            enabled ? t('animations_enabled_toast') : t('animations_disabled_toast'),
            "stats.svg"
        );
    });
}
if (settingAnimationsRow && settingAnimationsSwitch) {
    settingAnimationsRow.addEventListener('click', (e) => {
        if (e.target.closest('md-switch')) return;
        e.preventDefault();
        settingAnimationsSwitch.selected = !settingAnimationsSwitch.selected;
        settingAnimationsSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// Pomodoro Row click in modal
if (settingPomodoroRow && settingPomodoroSwitch) {
    settingPomodoroRow.addEventListener('click', (e) => {
        if (e.target.closest('md-switch')) return;
        e.preventDefault();
        settingPomodoroSwitch.selected = !settingPomodoroSwitch.selected;
        settingPomodoroSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// AI Switch in Settings Modal
if (settingAiSwitch) {
    settingAiSwitch.addEventListener('change', () => {
        const nextState = Boolean(settingAiSwitch.selected);
        if (nextState) {
            if (isUserPro()) {
                localStorage.setItem('flashcards_ai_enabled', 'true');
                initializeAi();
                initBackgroundCategorization();
                if (aiSwitch) aiSwitch.selected = true;
                updateSettingsModalState();
                showNotificationPill(t('ai_enabled_toast'), "enabled_ai.svg");
                debouncedSyncSlotsToCloud();
            } else {
                settingAiSwitch.selected = false;
                if (aiSwitch) aiSwitch.selected = false;
                closeAppSettingsModal();
                openProModal();
                showNotificationPill(t('pro_exclusive_feature'), "paywall.svg");
            }
        } else {
            localStorage.setItem('flashcards_ai_enabled', 'false');
            disableTutor();
            updateAiUI();
            if (aiSwitch) aiSwitch.selected = false;
            updateSettingsModalState();
            showNotificationPill(t('ai_disabled_toast'), "config_ai.svg");
            debouncedSyncSlotsToCloud();
        }
    });
}
if (settingAiRow && settingAiSwitch) {
    settingAiRow.addEventListener('click', (e) => {
        if (e.target.closest('md-switch') || e.target.closest('#setting-pro-btn')) return;
        e.preventDefault();
        settingAiSwitch.selected = !settingAiSwitch.selected;
        settingAiSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// Pro Plan Manage Button in Settings Modal
const settingProBtn = document.getElementById('setting-pro-btn');
settingProBtn?.addEventListener('click', () => {
    closeAppSettingsModal();
    openAccountModal();
});

// Notebook Goal Select in Settings Modal
settingNotebookGoalSelect?.addEventListener('change', () => {
    const rawVal = settingNotebookGoalSelect.value;
    const num = parseInt(rawVal, 10);
    const goal = (!isNaN(num) && num > 0) ? num : 0;
    setNotebookDailyGoal(goal);
    updateScoreDisplay();
    triggerHaptic('snap');
    updateSettingsModalState();
    showNotificationPill(
        goal > 0 ? t('daily_goal_toast', { goal }) : t('studying_all_due_cards'),
        'collection.svg'
    );
    checkAndCelebrateNotebookDailyGoal(false);
});

// Clear Notebook Button in Settings Modal
settingClearNotebookBtn?.addEventListener('click', () => {
    closeAppSettingsModal();
    if (clearNotebookBtn) {
        clearNotebookBtn.click();
    }
});

// --- DAILY NOTIFICATIONS SETTINGS LISTENERS ---
async function ensureNotificationPermission() {
    if (!hasNotificationSupport()) {
        showNotificationPill(t('browser_no_web_notif'), 'poor_wifi.svg', true);
        return false;
    }
    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
        showNotificationPill(t('notif_permission_denied'), 'poor_wifi.svg', true);
        return false;
    }
    return true;
}

// Master switch
settingNotifMasterSwitch?.addEventListener('change', async () => {
    const nextVal = Boolean(settingNotifMasterSwitch.selected);
    if (nextVal) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
            settingNotifMasterSwitch.selected = false;
            return;
        }
    }
    const settings = getNotificationSettings();
    settings.enabled = nextVal;
    if (nextVal && !settings.morning.enabled && !settings.noon.enabled && !settings.night.enabled) {
        settings.morning.enabled = true;
        settings.noon.enabled = true;
        settings.night.enabled = true;
    }
    saveNotificationSettings(settings);
    showNotificationPill(
        nextVal ? t('daily_reminders_enabled_toast') : t('daily_reminders_disabled_toast'),
        'notifications.svg'
    );
});

// Morning switch & time
settingNotifMorningSwitch?.addEventListener('change', async () => {
    const nextVal = Boolean(settingNotifMorningSwitch.selected);
    if (nextVal) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
            settingNotifMorningSwitch.selected = false;
            return;
        }
    }
    const settings = getNotificationSettings();
    settings.morning.enabled = nextVal;
    if (nextVal) settings.enabled = true;
    saveNotificationSettings(settings);
    showNotificationPill(
        nextVal ? t('morning_reminder_enabled_toast', { time: settings.morning.time }) : t('morning_reminder_disabled_toast'),
        'notifications.svg'
    );
});
settingNotifMorningTime?.addEventListener('change', () => {
    const settings = getNotificationSettings();
    settings.morning.time = settingNotifMorningTime.value || '09:00';
    saveNotificationSettings(settings);
});

// Noon switch & time
settingNotifNoonSwitch?.addEventListener('change', async () => {
    const nextVal = Boolean(settingNotifNoonSwitch.selected);
    if (nextVal) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
            settingNotifNoonSwitch.selected = false;
            return;
        }
    }
    const settings = getNotificationSettings();
    settings.noon.enabled = nextVal;
    if (nextVal) settings.enabled = true;
    saveNotificationSettings(settings);
    showNotificationPill(
        nextVal ? t('noon_reminder_enabled_toast', { time: settings.noon.time }) : t('noon_reminder_disabled_toast'),
        'notifications.svg'
    );
});
settingNotifNoonTime?.addEventListener('change', () => {
    const settings = getNotificationSettings();
    settings.noon.time = settingNotifNoonTime.value || '13:00';
    saveNotificationSettings(settings);
});

// Night switch & time (Urgente / Salvar Streak)
settingNotifNightSwitch?.addEventListener('change', async () => {
    const nextVal = Boolean(settingNotifNightSwitch.selected);
    if (nextVal) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
            settingNotifNightSwitch.selected = false;
            return;
        }
    }
    const settings = getNotificationSettings();
    settings.night.enabled = nextVal;
    if (nextVal) settings.enabled = true;
    saveNotificationSettings(settings);
    showNotificationPill(
        nextVal ? t('night_alert_enabled_toast', { time: settings.night.time }) : t('night_alert_disabled_toast'),
        'fire.svg'
    );
});
settingNotifNightTime?.addEventListener('change', () => {
    const settings = getNotificationSettings();
    settings.night.time = settingNotifNightTime.value || '21:00';
    saveNotificationSettings(settings);
});

// Test button
settingNotifTestBtn?.addEventListener('click', async () => {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    const settings = getNotificationSettings();
    const periodToTest = settings.night.enabled ? 'night' : (settings.noon.enabled ? 'noon' : 'morning');
    const sent = await sendDailyNotification(periodToTest, true);
    if (sent) {
        triggerHaptic('tap');
        showNotificationPill(t('test_notif_toast', { type: periodToTest === 'night' ? t('urgent_alert') : t('reminder') }), 'notifications.svg');
    }
});

// Start notification scheduler & visibility listener
startNotificationScheduler();
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        checkAndTriggerScheduledNotifications();
    }
});

// Legacy Haptic listeners (fallback)
if (hapticSwitch) {
    hapticSwitch.selected = isHapticEnabled();
    hapticSwitch.addEventListener('change', () => {
        const nextState = hapticSwitch.selected;
        setHapticEnabled(nextState);
        showNotificationPill(
            nextState ? t('haptic_enabled_toast') : t('haptic_disabled_toast'),
            "stats.svg"
        );
    });
}
if (hapticSettingRow && hapticSwitch) {
    hapticSettingRow.addEventListener('click', (e) => {
        if (e.target.closest('md-switch')) return;
        e.preventDefault();
        if (hapticSwitch.disabled) return;
        hapticSwitch.selected = !hapticSwitch.selected;
        hapticSwitch.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
if (hapticToggleBtn) {
    hapticToggleBtn.addEventListener('click', () => {
        const nextState = !isHapticEnabled();
        setHapticEnabled(nextState);
        showNotificationPill(
            nextState ? t('haptic_enabled_toast') : t('haptic_disabled_toast'),
            "stats.svg"
        );
    });
}

askAiBtn.addEventListener('click', () => {
    if (!isUserPro()) {
        openProModal();
        return;
    }
    aiChatContainer.classList.add('open');
    chatInput.focus();
});
closeChatBtn.addEventListener('click', () => aiChatContainer.classList.remove('open'));
sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (e.isComposing || e.keyCode === 229) return;
        sendChatMessage();
    }
});

document.querySelectorAll('#chat-quick-chips .gemini-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const promptKey = chip.getAttribute('data-prompt-key');
        const promptText = promptKey ? t(promptKey) : (chip.querySelector('[data-i18n]')?.textContent || '').trim();
        if (chatInput && promptText) {
            chatInput.value = promptText;
            sendChatMessage();
        }
    });
});
submitBtn.addEventListener('click', () => {
    console.log("[Game] Botão #submit-btn ('Verificar Resposta') clicado.");
    handleOpenSubmit();
});

if (answerInput) {
    answerInput.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            console.log("[Game] Enter detectado no input:", answerInput.id);
            handleOpenSubmit();
        }
    });
}

if (answerInput1 && answerInput2) {
    answerInput1.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (answerInput1.value.trim() && !answerInput2.value.trim()) {
                console.log("[Game] Enter em answerInput1 focando answerInput2.");
                answerInput2.focus();
            } else {
                console.log("[Game] Enter em answerInput1 submetendo resposta dupla.");
                handleOpenSubmit();
            }
        }
    });

    answerInput2.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            console.log("[Game] Enter detectado no input:", answerInput2.id);
            handleOpenSubmit();
        }
    });
}
nextQuestionBtn.addEventListener('click', () => {
    console.log("[Game] #next-question-btn ('Pular / Próxima Questão') clicado.");
    if (isAnimating) {
        console.warn("[Game] Transição bloqueada: animação em andamento.");
        return;
    }
    if (questionsPool.length === 0) {
        clearBalls();
        showDeckCompletionScreen();
        return;
    }
    animateCardToBack(() => {
        loadQuestion();
    });
});

const handleDelete = () => {
    if (!confirm(t('confirm_delete_card_simple'))) return;
    allQuestions = allQuestions.filter(q => q !== currentQuestion);
    questionsPool.splice(currentQuestionIndexInPool, 1);
    saveGameState(true);
    syncSlotsToCloud();
    if (questionsPool.length === 0) {
        clearBalls();
        updateScoreDisplay();
        showDeckCompletionScreen();
        return;
    }
    loadQuestion();
};
deleteCardBtn.addEventListener('click', handleDelete);
deleteCorrectionBtn.addEventListener('click', handleDelete);

// --- ANKI CONTROLS & GAMEPAD LOGIC ---
if (ankiFlipBtn) ankiFlipBtn.addEventListener('click', flipAnkiCard);
if (ankiBtnAgain) ankiBtnAgain.addEventListener('click', () => handleAnkiRating('again'));
if (ankiBtnHard) ankiBtnHard.addEventListener('click', () => handleAnkiRating('hard'));
if (ankiBtnGood) ankiBtnGood.addEventListener('click', () => handleAnkiRating('good'));
if (ankiBtnEasy) ankiBtnEasy.addEventListener('click', () => handleAnkiRating('easy'));

// --- VOICE CONTROLS LISTENERS ---
if (voiceMicBtn) {
    voiceMicBtn.addEventListener('click', () => {
        if (isVoiceRecording) {
            finishVoiceRecordingAndSend();
        } else {
            startVoiceRecording();
        }
    });
}
if (voiceCantSpeakBtn) {
    voiceCantSpeakBtn.addEventListener('click', skipCurrentVoiceCard);
}
if (voiceBtnAgain) voiceBtnAgain.addEventListener('click', () => handleVoiceRating('again'));
if (voiceBtnHard) voiceBtnHard.addEventListener('click', () => handleVoiceRating('hard'));
if (voiceBtnGood) voiceBtnGood.addEventListener('click', () => handleVoiceRating('good'));
if (voiceBtnEasy) voiceBtnEasy.addEventListener('click', () => handleVoiceRating('easy'));
if (voiceContinueBtn) voiceContinueBtn.addEventListener('click', advanceFromVoiceCard);

if (speechCardsSwitch) {
    speechCardsSwitch.addEventListener('change', () => {
        isVoiceCardsMutedThisSession = !speechCardsSwitch.selected;
        if (speechCardsSubtitle) {
            speechCardsSubtitle.textContent = speechCardsSwitch.selected
                ? t('speech_cards_enabled_desc')
                : t('speech_cards_disabled_desc');
        }
        showNotificationPill(
            speechCardsSwitch.selected ? t('speech_cards_unmuted_toast') : t('speech_cards_muted_toast'),
            'voice_explain.svg'
        );
        if (isVoiceCardsMutedThisSession && currentQuestion && currentQuestion.type === 'voice') {
            loadQuestion();
        }
    });
}

// Question card click to flip for Anki
if (questionCard) {
    questionCard.addEventListener('click', (e) => {
        if (currentQuestion && currentQuestion.type === 'anki' && !isAnkiFlipped) {
            // Ignore if clicked on bookmark, delete, image zoom, highlight popup, or marked text
            if (e.target.closest('#bookmark-card-btn') || e.target.closest('#delete-card-btn') || e.target.closest('#question-image-container') || e.target.closest('#text-highlight-popup') || e.target.closest('mark.card-hl')) {
                return;
            }
            // If highlight popup is open, clicking the card dismisses the popup instead of flipping
            if (textHighlightPopup && !textHighlightPopup.classList.contains('hidden')) {
                hideHighlightPopup();
                return;
            }
            // Ignore if text selection is active
            const sel = window.getSelection();
            if (sel && sel.toString().trim().length > 0) {
                return;
            }
            // On touch devices, ignore direct taps on question text so users can select text / double-tap without accidental flips
            if (e.target.closest('#question-text') && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
                return;
            }
            flipAnkiCard();
        }
    });
}

// --- ATALHOS DE TECLADO E GAMEPAD API (delegados para ./engine/input-controller.js) ---
initInputController({
    getCurrentQuestion: () => currentQuestion,
    getIsAnkiFlipped: () => isAnkiFlipped,
    getIsVoiceEvaluated: () => Boolean(voiceAnswerContainer && !voiceAnswerContainer.classList.contains('hidden')),
    getIsAnimating: () => isAnimating,
    onFlipAnki: flipAnkiCard,
    onAnkiRating: handleAnkiRating,
    onVoiceRating: handleVoiceRating,
    onVoiceContinue: advanceFromVoiceCard,
    onNextQuestion: () => {
        if (nextQuestionBtn && !nextQuestionBtn.classList.contains('hidden')) {
            nextQuestionBtn.click();
        } else {
            if (isAnimating) return;
            if (questionsPool.length === 0) {
                clearBalls();
                showDeckCompletionScreen();
                return;
            }
            animateCardToBack(() => {
                loadQuestion();
            });
        }
    },
    isNextQuestionBtnVisible: () => Boolean(nextQuestionBtn && !nextQuestionBtn.classList.contains('hidden')),
    isChatOpen: () => Boolean(aiChatContainer && aiChatContainer.classList.contains('open')),
    onHighlightShortcut: (hlColor) => {
        const target = getActiveTextSelection();
        if (target) {
            activeHighlightRange = target.range;
            activeHighlightField = target.field;
            applyHighlight(hlColor);
            return true;
        }
        return false;
    },
    onSelectMcOption: (keyNum) => {
        const btns = mcAnswerArea?.querySelectorAll('.mc-option-btn') || [];
        if (btns[keyNum - 1] && !btns[keyNum - 1].disabled) {
            btns[keyNum - 1].click();
            return true;
        }
        return false;
    },
    isModalOrDrawerOpen: () => {
        const hasOpenModal = document.querySelector('.modal-overlay:not(.hidden)') !== null;
        const isHamburgerOpen = hamburgerMenu && !hamburgerMenu.classList.contains('hidden');
        return hasOpenModal || isHamburgerOpen;
    }
});

// --- IMAGE LIGHTBOX ZOOM ---
if (questionImage && imageZoomModal && zoomedImage) {
    questionImage.addEventListener('click', () => {
        if (currentQuestion.image && !questionImage.classList.contains('hidden')) {
            openZoomForCard(currentQuestion.image, currentQuestion.imageCrop, currentQuestion.imageArrows);
        }
    });
}
if (ankiAnswerImage && imageZoomModal && zoomedImage) {
    ankiAnswerImage.addEventListener('click', () => {
        if (currentQuestion.answerImage && !ankiAnswerImage.classList.contains('hidden')) {
            openZoomForCard(currentQuestion.answerImage, currentQuestion.answerImageCrop, currentQuestion.answerImageArrows);
        }
    });
}
function closeImageZoom() {
    if (imageZoomModal && !imageZoomModal.classList.contains('hidden')) {
        imageZoomModal.classList.add('hidden');
        if (zoomedImage) zoomedImage.src = '';
        const zoomWrapper = document.getElementById('zoomed-image-wrapper');
        if (zoomWrapper) {
            const oldWrap = zoomWrapper.querySelector('.annotated-image-wrapper');
            if (oldWrap) oldWrap.remove();
        }
    }
}

if (closeImageZoomBtn && imageZoomModal) {
    closeImageZoomBtn.addEventListener('click', closeImageZoom);
}
if (imageZoomModal) {
    imageZoomModal.addEventListener('click', (e) => {
        if (e.target === imageZoomModal) {
            closeImageZoom();
        }
    });
}

// --- EDIT MODAL HANDLING (FOR ALL CARD TYPES) ---
let pendingEditImage = '';
let pendingEditImageCrop = null;
let pendingEditImageArrows = [];
let pendingEditAnsImage = '';
let pendingEditAnsImageCrop = null;
let pendingEditAnsImageArrows = [];

function renderEditArrowsInputs(arrows = []) {
    if (!editArrowsInputsList) return;
    editArrowsInputsList.innerHTML = '';
    const count = Array.isArray(arrows) ? arrows.length : 0;
    if (editArrowsCountBadge) editArrowsCountBadge.textContent = String(count);

    if (count === 0) {
        if (editArrowsEmptyMsg) editArrowsEmptyMsg.classList.remove('hidden');
        return;
    }
    if (editArrowsEmptyMsg) editArrowsEmptyMsg.classList.add('hidden');

    arrows.forEach((arrow, i) => {
        const theme = getArrowColorTheme(arrow.color);
        const row = document.createElement('div');
        row.className = "flex items-center gap-2 p-2 rounded-xl transition border shadow-2xs";
        row.style.backgroundColor = theme.bg;
        row.style.borderColor = theme.border;
        row.id = `edit-arrow-row-${i}`;

        const badge = document.createElement('div');
        badge.className = "w-6 h-6 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 shadow-xs select-none";
        badge.style.backgroundColor = theme.badgeBg;
        badge.style.color = theme.badgeText;
        badge.textContent = String(i + 1);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `edit-arrow-input-${i}`;
        input.className = 'edit-arrow-val flex-1 px-3 py-1.5 bg-white/95 border rounded-lg text-sm font-medium outline-none transition focus:ring-2';
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
        editArrowsInputsList.appendChild(row);
    });
}

function focusEditArrowInput(idx) {
    const input = document.getElementById(`edit-arrow-input-${idx}`);
    if (input) {
        input.focus();
        input.select();
        const row = document.getElementById(`edit-arrow-row-${idx}`);
        if (row) {
            row.classList.add('ring-2', 'ring-blue-400');
            setTimeout(() => row.classList.remove('ring-2', 'ring-blue-400'), 1200);
        }
    }
}

function updateEditImagePreviewUI(imgSrc) {
    const cleanSrc = sanitizeImageUrl(imgSrc);
    const isImageArrows = currentQuestion?.type === 'image_arrows';
    if (cleanSrc && editImagePreviewContainer) {
        renderAnnotatedImage({
            container: editImagePreviewContainer,
            imgElem: editImagePreview,
            imageUrl: cleanSrc,
            crop: pendingEditImageCrop,
            arrows: pendingEditImageArrows,
            showNumbers: isImageArrows,
            isImageArrows,
            onArrowClick: isImageArrows ? (idx) => focusEditArrowInput(idx) : null,
            maxHClass: 'max-h-40'
        });
        editImagePreviewContainer.classList.remove('hidden');
        if (editCropImageBtn) editCropImageBtn.classList.remove('hidden');
    } else if (editImagePreviewContainer) {
        if (editImagePreview) editImagePreview.src = '';
        editImagePreviewContainer.classList.add('hidden');
        if (editCropImageBtn) editCropImageBtn.classList.add('hidden');
        const oldWrap = editImagePreviewContainer.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
    }
    if (isImageArrows) {
        renderEditArrowsInputs(pendingEditImageArrows);
    }
}

function updateEditAnsImagePreviewUI(imgSrc) {
    const cleanSrc = sanitizeImageUrl(imgSrc);
    if (cleanSrc && editAnsImagePreviewContainer) {
        renderAnnotatedImage({
            container: editAnsImagePreviewContainer,
            imgElem: editAnsImagePreview,
            imageUrl: cleanSrc,
            crop: pendingEditAnsImageCrop,
            arrows: pendingEditAnsImageArrows,
            maxHClass: 'max-h-40'
        });
        editAnsImagePreviewContainer.classList.remove('hidden');
        if (editCropAnsImageBtn) editCropAnsImageBtn.classList.remove('hidden');
    } else if (editAnsImagePreviewContainer) {
        if (editAnsImagePreview) editAnsImagePreview.src = '';
        editAnsImagePreviewContainer.classList.add('hidden');
        if (editCropAnsImageBtn) editCropAnsImageBtn.classList.add('hidden');
        const oldWrap = editAnsImagePreviewContainer.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
    }
}

if (editImageUrlInput) {
    editImageUrlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        const clean = sanitizeImageUrl(url);
        if (clean !== pendingEditImage) {
            pendingEditImageCrop = null;
            pendingEditImageArrows = [];
        }
        pendingEditImage = clean;
        updateEditImagePreviewUI(pendingEditImage);
    });
}

if (editRemoveImageBtn) {
    editRemoveImageBtn.addEventListener('click', () => {
        pendingEditImage = '';
        pendingEditImageCrop = null;
        pendingEditImageArrows = [];
        if (editImageUrlInput) editImageUrlInput.value = '';
        updateEditImagePreviewUI('');
    });
}

if (editCropImageBtn) {
    editCropImageBtn.addEventListener('click', () => {
        if (!pendingEditImage) return;
        const isImageArrows = currentQuestion?.type === 'image_arrows';
        openImageEditorModal({
            imageUrl: pendingEditImage,
            crop: pendingEditImageCrop,
            arrows: pendingEditImageArrows,
            defaultTool: isImageArrows ? 'arrow' : 'crop',
            onSave: ({ crop, arrows }) => {
                pendingEditImageCrop = crop;
                pendingEditImageArrows = arrows.map((a, idx) => ({
                    ...a,
                    label: a.label || pendingEditImageArrows[idx]?.label || ''
                }));
                updateEditImagePreviewUI(pendingEditImage);
                if (isImageArrows) {
                    renderEditArrowsInputs(pendingEditImageArrows);
                }
            }
        });
    });
}

if (editAnsImageUrlInput) {
    editAnsImageUrlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        const clean = sanitizeImageUrl(url);
        if (clean !== pendingEditAnsImage) {
            pendingEditAnsImageCrop = null;
            pendingEditAnsImageArrows = [];
        }
        pendingEditAnsImage = clean;
        updateEditAnsImagePreviewUI(pendingEditAnsImage);
    });
}

if (editRemoveAnsImageBtn) {
    editRemoveAnsImageBtn.addEventListener('click', () => {
        pendingEditAnsImage = '';
        pendingEditAnsImageCrop = null;
        pendingEditAnsImageArrows = [];
        if (editAnsImageUrlInput) editAnsImageUrlInput.value = '';
        updateEditAnsImagePreviewUI('');
    });
}

if (editCropAnsImageBtn) {
    editCropAnsImageBtn.addEventListener('click', () => {
        if (!pendingEditAnsImage) return;
        openImageEditorModal({
            imageUrl: pendingEditAnsImage,
            crop: pendingEditAnsImageCrop,
            arrows: pendingEditAnsImageArrows,
            onSave: ({ crop, arrows }) => {
                pendingEditAnsImageCrop = crop;
                pendingEditAnsImageArrows = arrows;
                updateEditAnsImagePreviewUI(pendingEditAnsImage);
            }
        });
    });
}

// Edit Modal MCQ Options
function renderEditMcOptions(options = ["", "", "", ""], correctAnswer = "") {
    if (!editMcOptionsList) return;
    editMcOptionsList.innerHTML = '';
    options.forEach((optText, i) => {
        const isCorrect = optText === correctAnswer;
        const row = document.createElement('div');
        row.className = "flex items-center gap-2";

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'edit-mc-correct';
        radio.value = String(i);
        if (isCorrect) radio.checked = true;
        radio.className = 'w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer';
        radio.title = t('mark_as_correct_option');

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'edit-mc-opt-val flex-1 p-2 bg-gray-50 border border-gray-300 rounded-lg text-sm';
        textInput.value = optText || '';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'edit-mc-remove-opt-btn p-1 text-gray-400 hover:text-red-500 transition';
        removeBtn.title = t('remove_option_tooltip');
        removeBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';

        removeBtn.addEventListener('click', () => {
            const currentVals = Array.from(document.querySelectorAll('.edit-mc-opt-val')).map(inp => inp.value);
            if (currentVals.length <= 2) {
                alert(t('mc_min_options_error'));
                return;
            }
            currentVals.splice(i, 1);
            renderEditMcOptions(currentVals, correctAnswer);
        });

        row.append(radio, textInput, removeBtn);
        editMcOptionsList.appendChild(row);
    });

    if (editAddMcOptBtn) {
        editAddMcOptBtn.classList.toggle('hidden', options.length >= 6);
    }
}

if (editAddMcOptBtn) {
    editAddMcOptBtn.addEventListener('click', () => {
        const currentVals = Array.from(document.querySelectorAll('.edit-mc-opt-val')).map(inp => inp.value);
        if (currentVals.length >= 6) return;
        currentVals.push("");
        const checkedRadio = document.querySelector('input[name="edit-mc-correct"]:checked');
        const correctIdx = checkedRadio ? parseInt(checkedRadio.value) : 0;
        const curCorrect = currentVals[correctIdx] || "";
        renderEditMcOptions(currentVals, curCorrect);
    });
}

editBtn.addEventListener('click', () => {
    editQuestionInput.value = currentQuestion.description || '';

    const cardType = currentQuestion.type || 'open';
    if (editAnswer1Group) editAnswer1Group.classList.toggle('hidden', cardType === 'anki' || cardType === 'multiple_choice' || cardType === 'fill' || cardType === 'image_arrows' || cardType === 'voice');
    if (editAnswer2Group) editAnswer2Group.classList.toggle('hidden', cardType !== 'open_double');
    if (editAnkiAnswerGroup) editAnkiAnswerGroup.classList.toggle('hidden', cardType !== 'anki');
    if (editVoiceAnswerGroup) editVoiceAnswerGroup.classList.toggle('hidden', cardType !== 'voice');
    if (editMcOptionsGroup) editMcOptionsGroup.classList.toggle('hidden', cardType !== 'multiple_choice');
    if (editAnsImageGroup) editAnsImageGroup.classList.toggle('hidden', cardType !== 'anki');
    if (editFillAnswerGroup) editFillAnswerGroup.classList.toggle('hidden', cardType !== 'fill');
    if (editImageArrowsGroup) editImageArrowsGroup.classList.toggle('hidden', cardType !== 'image_arrows');

    if (cardType === 'open') {
        if (editAnswer1Label) editAnswer1Label.textContent = t('main_answer_label');
        editAnswerInput.value = currentQuestion.answer || '';
    } else if (cardType === 'open_double') {
        if (editAnswer1Label) editAnswer1Label.textContent = t('answer_1_label');
        editAnswerInput.value = currentQuestion.answer || '';
        editAnswer2Input.value = currentQuestion.answer2 || '';
    } else if (cardType === 'fill') {
        if (editFillAnswerInput) {
            editFillAnswerInput.value = currentQuestion.answer || (currentQuestion.answers || []).join('; ');
        }
    } else if (cardType === 'anki') {
        editAnkiAnswerInput.value = currentQuestion.answer || '';
    } else if (cardType === 'voice') {
        if (editVoiceAnswerInput) editVoiceAnswerInput.value = currentQuestion.answer || '';
    } else if (cardType === 'multiple_choice') {
        renderEditMcOptions(currentQuestion.options || ["", "", "", ""], currentQuestion.answer);
    } else if (cardType === 'image_arrows') {
        renderEditArrowsInputs(currentQuestion.imageArrows || []);
    }

    pendingEditImage = currentQuestion.image || '';
    pendingEditImageCrop = currentQuestion.imageCrop ? { ...currentQuestion.imageCrop } : null;
    pendingEditImageArrows = Array.isArray(currentQuestion.imageArrows) ? JSON.parse(JSON.stringify(currentQuestion.imageArrows)) : [];
    if (editImageUrlInput) editImageUrlInput.value = pendingEditImage;
    updateEditImagePreviewUI(pendingEditImage);

    pendingEditAnsImage = currentQuestion.answerImage || '';
    pendingEditAnsImageCrop = currentQuestion.answerImageCrop ? { ...currentQuestion.answerImageCrop } : null;
    pendingEditAnsImageArrows = Array.isArray(currentQuestion.answerImageArrows) ? JSON.parse(JSON.stringify(currentQuestion.answerImageArrows)) : [];
    if (editAnsImageUrlInput) editAnsImageUrlInput.value = pendingEditAnsImage;
    updateEditAnsImagePreviewUI(pendingEditAnsImage);

    editModal.classList.remove('hidden');
});

saveEditBtn.addEventListener('click', () => {
    currentQuestion.description = editQuestionInput.value;

    const t = currentQuestion.type || 'open';
    if (t === 'open') {
        currentQuestion.answer = editAnswerInput.value;
    } else if (t === 'open_double') {
        currentQuestion.answer = editAnswerInput.value;
        currentQuestion.answer2 = editAnswer2Input.value;
    } else if (t === 'fill') {
        const val = editFillAnswerInput ? editFillAnswerInput.value.trim() : '';
        currentQuestion.answer = val;
        currentQuestion.answers = val.split(';').map(s => s.trim()).filter(Boolean);
    } else if (t === 'anki') {
        currentQuestion.answer = editAnkiAnswerInput.value;
        if (pendingEditAnsImage) {
            currentQuestion.answerImage = pendingEditAnsImage;
            if (pendingEditAnsImageCrop) currentQuestion.answerImageCrop = pendingEditAnsImageCrop;
            else delete currentQuestion.answerImageCrop;
            if (pendingEditAnsImageArrows && pendingEditAnsImageArrows.length > 0) currentQuestion.answerImageArrows = pendingEditAnsImageArrows;
            else delete currentQuestion.answerImageArrows;
        } else {
            delete currentQuestion.answerImage;
            delete currentQuestion.answerImageCrop;
            delete currentQuestion.answerImageArrows;
        }
    } else if (t === 'voice') {
        if (editVoiceAnswerInput) currentQuestion.answer = editVoiceAnswerInput.value.trim();
    } else if (t === 'multiple_choice') {
        const optInputs = Array.from(document.querySelectorAll('.edit-mc-opt-val'));
        const options = optInputs.map(inp => inp.value.trim()).filter(Boolean);
        const checkedRadio = document.querySelector('input[name="edit-mc-correct"]:checked');
        const correctIdx = checkedRadio ? parseInt(checkedRadio.value) : 0;
        currentQuestion.options = options;
        currentQuestion.answer = optInputs[correctIdx]?.value.trim() || options[0];
    } else if (t === 'image_arrows') {
        const arrowInputs = Array.from(document.querySelectorAll('.edit-arrow-val'));
        arrowInputs.forEach((inp, idx) => {
            if (pendingEditImageArrows[idx]) {
                pendingEditImageArrows[idx].label = inp.value.trim();
            }
        });
        currentQuestion.imageArrows = JSON.parse(JSON.stringify(pendingEditImageArrows));
        currentQuestion.answer = pendingEditImageArrows.map(a => a.label || '').filter(Boolean).join('; ');
    }

    if (pendingEditImage) {
        currentQuestion.image = pendingEditImage;
        if (pendingEditImageCrop) currentQuestion.imageCrop = pendingEditImageCrop;
        else delete currentQuestion.imageCrop;
        if (pendingEditImageArrows && pendingEditImageArrows.length > 0) currentQuestion.imageArrows = pendingEditImageArrows;
        else delete currentQuestion.imageArrows;
    } else {
        delete currentQuestion.image;
        delete currentQuestion.imageCrop;
        delete currentQuestion.imageArrows;
    }

    saveGameState(true);
    syncSlotsToCloud();
    editModal.classList.add('hidden');
    updateFeedbackText();
    animateCardToBack(() => {
        loadQuestion();
    });
});
[closeModalBtn, cancelEditBtn].forEach(b => b.addEventListener('click', () => editModal.classList.add('hidden')));

// --- BOOKMARK & DROPDOWN SELECTOR LOGIC ---
function toggleBookmark() {
    const isMatchingDesc = (d1, d2) => d1 === d2 || (d1 && d2 && stripHtml(d1) === stripHtml(d2));
    const isBookmarked = isCardBookmarked(currentQuestion);

    // Load notebook state
    let notebookState = JSON.parse(localStorage.getItem(NOTEBOOK_STORAGE_KEY)) || {
        questionsPool: [], allQuestions: [], score: 0, deckTitle: "Caderno"
    };

    if (isBookmarked) {
        // Un-bookmark: Remove from Notebook
        notebookState.allQuestions = notebookState.allQuestions.filter(q => !isMatchingDesc(q.description, currentQuestion.description));
        notebookState.questionsPool = notebookState.questionsPool.filter(q => !isMatchingDesc(q.description, currentQuestion.description));

        // Also un-bookmark in normal deck (if present)
        let normalData = JSON.parse(localStorage.getItem('flashcardsSave'));
        if (normalData) {
            const findAndUnbookmark = (arr) => arr.forEach(q => {
                if (isMatchingDesc(q.description, currentQuestion.description)) q.bookmarked = false;
            });
            findAndUnbookmark(normalData.allQuestions);
            findAndUnbookmark(normalData.questionsPool);
            normalData.allQuestions = (normalData.allQuestions || []).map(sanitizeCardForStorage);
            normalData.questionsPool = (normalData.questionsPool || []).map(sanitizeCardForStorage);
            localStorage.setItem('flashcardsSave', encodeStoragePayload(normalData));
        }

        // Also update the active session's in-memory references if we are in normal mode
        if (activeMode === 'normal') {
            currentQuestion.bookmarked = false;
            const cardInAll = allQuestions.find(q => isMatchingDesc(q.description, currentQuestion.description));
            if (cardInAll) cardInAll.bookmarked = false;
        }

        notebookState.allQuestions = (notebookState.allQuestions || []).map(sanitizeCardForStorage);
        notebookState.questionsPool = (notebookState.questionsPool || []).map(sanitizeCardForStorage);
        notebookState.updatedAt = Date.now();
        localStorage.setItem(NOTEBOOK_STORAGE_KEY, encodeStoragePayload(notebookState));
        showNotificationPill(t('card_removed_from_notebook_toast'), "add_bookmark.svg");

        // If we are currently in notebook mode, remove from in-memory and go to next question
        if (activeMode === 'notebook') {
            allQuestions = allQuestions.filter(q => !isMatchingDesc(q.description, currentQuestion.description));
            questionsPool = questionsPool.filter(q => !isMatchingDesc(q.description, currentQuestion.description));
            loadQuestion();
            return;
        }
    } else {
        // Bookmark: Add to Notebook
        currentQuestion.bookmarked = true;

        const normalData = JSON.parse(localStorage.getItem('flashcardsSave'));
        const sourceDeckTitle = (activeMode === 'exam' && currentQuestion.sourceDeck)
            ? currentQuestion.sourceDeck
            : (normalData ? normalData.deckTitle : "Flashcards");
        currentQuestion.sourceDeck = currentQuestion.sourceDeck || sourceDeckTitle;

        // Also mark as bookmarked in normal deck in storage
        if (normalData) {
            const findAndBookmark = (arr) => arr.forEach(q => {
                if (isMatchingDesc(q.description, currentQuestion.description)) {
                    q.bookmarked = true;
                    q.sourceDeck = sourceDeckTitle;
                }
            });
            findAndBookmark(normalData.allQuestions);
            findAndBookmark(normalData.questionsPool);
            normalData.allQuestions = (normalData.allQuestions || []).map(sanitizeCardForStorage);
            normalData.questionsPool = (normalData.questionsPool || []).map(sanitizeCardForStorage);
            localStorage.setItem('flashcardsSave', encodeStoragePayload(normalData));
        }

        // Also update current session's in-memory reference
        const cardInAll = allQuestions.find(q => isMatchingDesc(q.description, currentQuestion.description));
        if (cardInAll) {
            cardInAll.bookmarked = true;
            cardInAll.sourceDeck = sourceDeckTitle;
        }

        notebookState.allQuestions.push(sanitizeCardForStorage(currentQuestion));
        notebookState.questionsPool.push(sanitizeCardForStorage(currentQuestion));
        notebookState.allQuestions = (notebookState.allQuestions || []).map(sanitizeCardForStorage);
        notebookState.questionsPool = (notebookState.questionsPool || []).map(sanitizeCardForStorage);
        notebookState.updatedAt = Date.now();

        localStorage.setItem(NOTEBOOK_STORAGE_KEY, encodeStoragePayload(notebookState));
        showNotificationPill(t('card_added_to_notebook_toast'), "bookmark_check.svg");
    }

    renderBookmarkIcon();
    syncSlotsToCloud();
}

function isCardBookmarked(question) {
    if (!question || !question.description) return false;
    let notebookState = JSON.parse(localStorage.getItem(NOTEBOOK_STORAGE_KEY));
    if (!notebookState || !notebookState.allQuestions) return false;
    return notebookState.allQuestions.some(q => q.description === question.description || (q.description && stripHtml(q.description) === stripHtml(question.description)));
}

function renderBookmarkIcon() {
    if (isCardBookmarked(currentQuestion)) {
        bookmarkCardIcon.src = "../assets/img/bookmark_check.svg";
    } else {
        bookmarkCardIcon.src = "../assets/img/add_bookmark.svg";
    }
}

function openDeckDropdown() {
    closeHamburgerMenu();
    closeHeaderStatsDropdown();
    deckSelectDropdown.classList.remove('hidden');
    deckSelectArrow.classList.add('rotate-180');
    updateDailyStreakUI();

    const normalData = JSON.parse(localStorage.getItem('flashcardsSave'));
    const normalTitle = normalData ? normalData.deckTitle : "Flashcards";
    if (deckItemNormalName) deckItemNormalName.textContent = normalTitle;

    let examData = null;
    try {
        examData = JSON.parse(localStorage.getItem('flashcardsExam'));
    } catch (e) {}
    const hasExam = !!(examData && examData.allQuestions && examData.allQuestions.length > 0);

    if (deckItemExam) {
        if (hasExam || activeMode === 'exam') {
            deckItemExam.classList.remove('hidden');
            const totalCards = (examData && examData.questionsPool) ? examData.questionsPool.length : 0;
            const numDecks = (examData && examData.decks) ? examData.decks.length : 0;
            if (deckItemExamSub) {
                deckItemExamSub.textContent = `${numDecks} ${numDecks === 1 ? t('deck_unit_singular') : t('decks_unit')} • ${totalCards} ${totalCards === 1 ? t('card_unit_singular') : t('cards_unit')}`;
            }
        } else {
            deckItemExam.classList.add('hidden');
        }
    }

    // Clear highlights
    [deckItemNormal, deckItemNotebook, deckItemExam].forEach(el => {
        el?.classList.remove('bg-blue-50', 'text-blue-600', 'bg-purple-50', 'text-purple-600');
    });

    if (activeMode === 'notebook') {
        deckItemNotebook?.classList.add('bg-blue-50', 'text-blue-600');
        dropdownExamDecksSection?.classList.add('hidden');
    } else if (activeMode === 'exam') {
        deckItemExam?.classList.add('bg-purple-50', 'text-purple-600');
        renderExamDecksInDropdown(examData);
    } else {
        deckItemNormal?.classList.add('bg-blue-50', 'text-blue-600');
        dropdownExamDecksSection?.classList.add('hidden');
    }
}

function renderExamDecksInDropdown(examData) {
    if (!dropdownExamDecksSection || !dropdownExamDecksList) return;
    dropdownExamDecksSection.classList.remove('hidden');
    dropdownExamDecksList.innerHTML = '';

    const decks = (examData && examData.decks) ? examData.decks : [];
    if (dropdownExamDecksCount) {
        dropdownExamDecksCount.textContent = t('exam_decks_count', { count: decks.length, suffix: decks.length !== 1 ? 's' : '' });
    }

    if (decks.length === 0) {
        dropdownExamDecksList.innerHTML = `<p class="text-xs text-gray-400 text-center py-2 italic">${t('no_decks_in_mix')}</p>`;
        return;
    }

    decks.forEach((deck) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-2 rounded-xl bg-gray-50/80 hover:bg-gray-100 transition text-xs';

        const isEnabled = deck.enabled !== false;
        const cardCount = allQuestions.filter(q => q.deckId === deck.id || q.sourceDeck === deck.name).length;
        const safeDeckName = escapeHtml(deck.name || 'Baralho');
        const safeDeckId = escapeHtml(deck.id || '');

        item.innerHTML = `
            <label class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                <input type="checkbox" class="exam-deck-toggle rounded text-purple-600 focus:ring-purple-500" ${isEnabled ? 'checked' : ''} data-deck-id="${safeDeckId}">
                <span class="font-medium text-gray-800 truncate ${isEnabled ? '' : 'line-through opacity-50'}" title="${safeDeckName}">${safeDeckName}</span>
            </label>
            <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">${cardCount}</span>
                <button type="button" class="exam-deck-del-btn p-1 text-gray-400 hover:text-red-500 transition" title="${t('remove_from_mix_tooltip')}">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;

        const toggle = item.querySelector('.exam-deck-toggle');
        toggle.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleDeckInExamMix(deck.id, toggle.checked);
        });

        const delBtn = item.querySelector('.exam-deck-del-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(t('confirm_remove_deck_from_exam', { name: deck.name }))) {
                removeDeckFromExamMix(deck.id);
            }
        });

        dropdownExamDecksList.appendChild(item);
    });
}

function toggleDeckInExamMix(deckId, enabled) {
    if (activeMode !== 'exam') return;
    let examData = {};
    try { examData = JSON.parse(localStorage.getItem('flashcardsExam')) || {}; } catch(e){}
    const decks = examData.decks || [];
    const targetDeck = decks.find(d => d.id === deckId);
    if (!targetDeck) return;
    targetDeck.enabled = enabled;
    examData.decks = decks;

    if (enabled) {
        const cardsToAdd = allQuestions.filter(q => (q.deckId === deckId || q.sourceDeck === targetDeck.name) && isPlayableCard(q));
        const existingDescriptions = new Set(questionsPool.map(q => q.description));
        const newCards = cardsToAdd.filter(c => !existingDescriptions.has(c.description));
        questionsPool = shuffleArray([...questionsPool, ...newCards]);
    } else {
        questionsPool = questionsPool.filter(q => q.deckId !== deckId && q.sourceDeck !== targetDeck.name);
    }

    saveGameState();
    updateScoreDisplay();

    if (!enabled && currentQuestion && (currentQuestion.deckId === deckId || currentQuestion.sourceDeck === targetDeck.name)) {
        loadQuestion();
    }

    renderExamDecksInDropdown(examData);
    showNotificationPill(t('deck_status_toast', { name: targetDeck.name, status: enabled ? t('enabled_status') : t('disabled_status') }), "dropdown.svg");
}

function removeDeckFromExamMix(deckId) {
    if (activeMode !== 'exam') return;
    let examData = {};
    try { examData = JSON.parse(localStorage.getItem('flashcardsExam')) || {}; } catch(e){}
    const removedDeck = (examData.decks || []).find(d => d.id === deckId);
    const removedName = removedDeck ? removedDeck.name : '';
    const decks = (examData.decks || []).filter(d => d.id !== deckId);

    examData.decks = decks;

    allQuestions = allQuestions.filter(q => q.deckId !== deckId && q.sourceDeck !== removedName);
    questionsPool = questionsPool.filter(q => q.deckId !== deckId && q.sourceDeck !== removedName);

    examData.allQuestions = allQuestions;
    examData.questionsPool = questionsPool;
    localStorage.setItem('flashcardsExam', encodeStoragePayload(examData));
    debouncedSyncSlotsToCloud();

    updateScoreDisplay();

    if (currentQuestion && (currentQuestion.deckId === deckId || currentQuestion.sourceDeck === removedName)) {
        loadQuestion();
    }

    renderExamDecksInDropdown(examData);
    showNotificationPill(t('deck_removed_from_mix_toast'), "delete.svg");
}

// Add Deck to Mix from Dropdown
if (dropdownAddDeckBtn && dropdownAddDeckInput) {
    dropdownAddDeckBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownAddDeckInput.click();
    });

    dropdownAddDeckInput.addEventListener('change', async () => {
        if (!dropdownAddDeckInput.files || dropdownAddDeckInput.files.length === 0) return;
        const files = Array.from(dropdownAddDeckInput.files);
        dropdownAddDeckInput.value = '';

        let addedCardsCount = 0;
        let examData = {};
        try { examData = JSON.parse(localStorage.getItem('flashcardsExam')) || {}; } catch(e){}
        const decks = examData.decks || [];

        for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.json')) continue;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                let cards = [];
                let name = file.name.replace(/\.json$/i, '');

                if (parsed && parsed.__flashcards_watermark__ === "notebook_backup_v1") {
                    cards = parsed.cards || [];
                    name = parsed.deckTitle || "Caderno";
                } else if (Array.isArray(parsed)) {
                    cards = parsed;
                }

                if (cards.length > 0) {
                    const newDeckId = generateSecureId('deck');
                    decks.push({
                        id: newDeckId,
                        name: name,
                        enabled: true,
                        cardCount: cards.length
                    });

                    const taggedCards = cards.map(c => ({
                        ...c,
                        deckId: newDeckId,
                        sourceDeck: name
                    }));

                    allQuestions.push(...taggedCards);
                    const playable = taggedCards.filter(isPlayableCard);
                    questionsPool.push(...playable);
                    addedCardsCount += playable.length;
                }
            } catch (err) {
                console.error("Erro ao adicionar baralho:", err);
            }
        }

        questionsPool = shuffleArray(questionsPool);
        examData.decks = decks;
        examData.allQuestions = allQuestions;
        examData.questionsPool = questionsPool;
        localStorage.setItem('flashcardsExam', encodeStoragePayload(examData));
        debouncedSyncSlotsToCloud();

        updateScoreDisplay();
        renderExamDecksInDropdown(examData);
        showNotificationPill(t('cards_added_to_mix_toast', { count: addedCardsCount }), "new.svg");
    });
}

function closeDeckDropdown() {
    deckSelectDropdown?.classList.add('hidden');
    deckSelectArrow?.classList.remove('rotate-180');
}

function updateMenuButtonsForActiveMode() {
    const exportTitle = document.getElementById('export-btn-title');
    const exportDesc = document.getElementById('export-btn-desc');
    const exportIcon = document.getElementById('export-btn-icon');
    const editorTitle = document.getElementById('go-to-editor-btn-title');
    const editorDesc = document.getElementById('go-to-editor-btn-desc');
    const editorIcon = document.getElementById('go-to-editor-btn-icon');

    if (activeMode === 'notebook') {
        if (exportTitle) exportTitle.textContent = t('save_backup_title');
        if (exportDesc) exportDesc.textContent = t('save_backup_desc');
        if (exportBtn) exportBtn.title = t('save_notebook_backup_tooltip');

        if (editorTitle) editorTitle.textContent = t('add_multiple_title');
        if (editorDesc) editorDesc.textContent = t('add_multiple_desc');
        if (editorIcon) {
            editorIcon.src = "../assets/img/bulk_add.svg";
            editorIcon.alt = t('add_multiple_title');
        }
        if (goToEditorBtn) goToEditorBtn.title = t('add_multiple_decks_notebook_tooltip');
        if (clearNotebookBtn) clearNotebookBtn.classList.remove('hidden');
    } else {
        if (exportTitle) exportTitle.textContent = t('save_deck_title');
        if (exportDesc) exportDesc.textContent = t('save_deck_desc');
        if (exportBtn) exportBtn.title = t('download_updated_json_tooltip');

        if (editorTitle) editorTitle.textContent = t('edit_deck_action_title');
        if (editorDesc) editorDesc.textContent = t('open_editor_ai_generator_desc');
        if (editorIcon) {
            editorIcon.src = "../assets/img/edit.svg";
            editorIcon.alt = t('edit');
        }
        if (goToEditorBtn) goToEditorBtn.title = t('edit_with_ai_assistant_tooltip');
        if (clearNotebookBtn) clearNotebookBtn.classList.add('hidden');
    }
}

function switchActiveMode(newMode) {
    saveGameState();
    archiveCurrentSession(false);

    activeMode = newMode;
    localStorage.setItem('flashcardsActiveMode', newMode);

    const storageKey = newMode === 'notebook'
        ? NOTEBOOK_STORAGE_KEY
        : (newMode === 'exam' ? 'flashcardsExam' : 'flashcardsSave');
    let data = JSON.parse(localStorage.getItem(storageKey));

    if (newMode === 'notebook' && (!data || !data.allQuestions)) {
        data = {
            allQuestions: [],
            questionsPool: [],
            score: 0,
            notebookReviewsCount: 0,
            deckTitle: "Caderno",
            updatedAt: Date.now()
        };
        localStorage.setItem(NOTEBOOK_STORAGE_KEY, encodeStoragePayload(data));
    }

    try {
        const slots = getLocalSlots();
        if (newMode === 'exam') {
            const examSlotIdx = slots.findIndex(s => s.isExam || s.mode === 'exam' || (s.deckData && s.deckData.decks));
            if (examSlotIdx !== -1) {
                slots.forEach((s, idx) => { s.isCurrent = (idx === examSlotIdx); });
                saveLocalSlots(slots);
            } else if (data && data.allQuestions && data.allQuestions.length > 0) {
                openDeckInSlots(data, data.deckTitle || "Semana de Provas", 'exam', null, { suppressPrompt: true });
            }
        } else if (newMode === 'normal') {
            const normalSlotIdx = slots.findIndex(s => !s.isExam && s.mode !== 'exam');
            if (normalSlotIdx !== -1) {
                slots.forEach((s, idx) => { s.isCurrent = (idx === normalSlotIdx); });
                saveLocalSlots(slots);
            }
        }
    } catch (e) {}

    allQuestions = data.allQuestions || [];
    if (newMode === 'notebook') {
        questionsPool = (allQuestions || []).filter(isPlayableCard);
        notebookReviewsCount = data.notebookReviewsCount || 0;
    } else {
        questionsPool = (data.questionsPool || []).filter(isPlayableCard);
    }
    score = data.score || 0;
    currentStep = data.currentStep || 0;
    precomputedNextCard = null;
    if (score === 0 && newMode !== 'notebook') {
        questionsPool = shuffleArray(questionsPool);
    }
    deckTitle.textContent = data.deckTitle || (newMode === 'notebook' ? "Caderno" : (newMode === 'exam' ? "Semana de Provas" : "Flashcards"));
    document.title = data.deckTitle ? `${data.deckTitle} | Flashcards` : "Estudando Flashcards";

    clearBalls();
    scoreDisplay.textContent = newMode === 'notebook' ? notebookReviewsCount : score;
    updateScoreDisplay();
    updateDailyStreakUI();
    updateMenuButtonsForActiveMode();
    isFirstQuestion = true;

    initStatsSession(deckTitle.textContent, newMode, allQuestions.filter(isPlayableCard).length, score);
    loadQuestion();

    const pillIcon = newMode === 'notebook' ? "collection.svg" : (newMode === 'exam' ? "magic.svg" : "uploaded.svg");
    showNotificationPill(t('studying_deck_toast', { title: deckTitle.textContent }), pillIcon);
}

// Bind Bookmark & Dropdown Listeners
bookmarkCardBtn.addEventListener('click', toggleBookmark);

deckSelectTrigger.addEventListener('click', (e) => {
    const isOpen = !deckSelectDropdown.classList.contains('hidden');
    if (isOpen) {
        closeDeckDropdown();
    } else {
        openDeckDropdown();
    }
    e.stopPropagation();
});

document.addEventListener('click', (e) => {
    closeDeckDropdown();
    if (headerStatsComponent && !headerStatsComponent.contains(e.target)) {
        closeHeaderStatsDropdown();
    }
});

deckItemNormal.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDeckDropdown();
    if (activeMode === 'normal') return;
    switchActiveMode('normal');
});

if (deckItemExplore) {
    deckItemExplore.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDeckDropdown();
        openExploreModal();
    });
}

if (menuAccountBtn) {
    menuAccountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeHamburgerMenu();
        openAccountModal();
    });
}

deckItemNotebook.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDeckDropdown();
    if (activeMode === 'notebook') return;
    switchActiveMode('notebook');
});

if (deckItemExam) {
    deckItemExam.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDeckDropdown();
        if (activeMode === 'exam') return;
        switchActiveMode('exam');
    });
}

function keepCardInFocus() {
    if (window.innerWidth <= 768) {
        const header = document.getElementById('global-header');
        const headerHeight = header ? header.offsetHeight : 54;
        const container = document.getElementById('game-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            if (rect.top < headerHeight + 4) {
                window.scrollTo({
                    top: Math.max(0, window.scrollY + rect.top - headerHeight - 6),
                    behavior: 'smooth'
                });
            }
        }
    }
}

function initMobileFocusHelpers() {
    const inputs = [answerInput, answerInput1, answerInput2].filter(Boolean);

    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            document.body.classList.add('keyboard-open');
            setTimeout(keepCardInFocus, 100);
            setTimeout(keepCardInFocus, 300);
        });

        input.addEventListener('blur', () => {
            document.body.classList.remove('keyboard-open');
        });
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (document.activeElement && (inputs.includes(document.activeElement) || document.activeElement.classList?.contains('fill-blank-input'))) {
                setTimeout(keepCardInFocus, 50);
            }
        });
    }
}

async function initGame() {
    checkAndResetModelFallback();
    resizeCanvas(); animate();

    initTransfer(); // Initialize P2P logic from transfer.js
    initExploreModal(); // Initialize Explore Files & Pro Modal
    initPwaInstallBanner(); // PWA Install Notification on Mobile/Tablet

    // Check if opening a shared deck via link (?share=...)
    const sharedLoaded = await checkAndLoadSharedDeck();
    if (sharedLoaded) return;

    // Check in background if imported shared decks have new updates from owner
    checkAndUpdateSharedSlots().catch(() => {});

    // Start real-time Firestore listeners (onSnapshot) for shared slots and cloud user doc
    subscribeToAllSharedSlots();
    initRealtimeCloudSync();

    activeMode = localStorage.getItem('flashcardsActiveMode') || 'normal';

    const saveState = localStorage.getItem('flashcardsSave');
    const notebookState = localStorage.getItem(NOTEBOOK_STORAGE_KEY);
    const examState = localStorage.getItem('flashcardsExam');

    if (!saveState && !notebookState && !examState) {
        window.location.href = ROUTES.HOME;
        return;
    }

    const storageKey = activeMode === 'notebook'
        ? NOTEBOOK_STORAGE_KEY
        : (activeMode === 'exam' ? 'flashcardsExam' : 'flashcardsSave');
    let data = JSON.parse(localStorage.getItem(storageKey));

    if (!data) {
        if (examState) activeMode = 'exam';
        else if (saveState) activeMode = 'normal';
        else activeMode = 'notebook';

        localStorage.setItem('flashcardsActiveMode', activeMode);
        const fallbackKey = activeMode === 'notebook'
            ? NOTEBOOK_STORAGE_KEY
            : (activeMode === 'exam' ? 'flashcardsExam' : 'flashcardsSave');
        data = JSON.parse(localStorage.getItem(fallbackKey));
    }

    allQuestions = data.allQuestions || [];
    if (activeMode === 'exam' && data && (data.allQuestions || []).length > 0) {
        try {
            const slots = getLocalSlots();
            const examSlotIdx = slots.findIndex(s => s.isExam || s.mode === 'exam' || (s.deckData && s.deckData.decks));
            if (examSlotIdx !== -1) {
                if (!slots[examSlotIdx].isCurrent) {
                    slots.forEach((s, idx) => { s.isCurrent = (idx === examSlotIdx); });
                    saveLocalSlots(slots);
                }
            } else {
                openDeckInSlots(data, data.deckTitle || "Semana de Provas", 'exam', null, { suppressPrompt: true });
            }
        } catch (e) {}
    }
    if (activeMode === 'notebook') {
        questionsPool = (allQuestions || []).filter(isPlayableCard);
        notebookReviewsCount = data.notebookReviewsCount || 0;
    } else {
        questionsPool = (data.questionsPool || []).filter(isPlayableCard);
    }
    allQuestions.forEach(q => { if (q) delete q.isBeingCorrected; });
    questionsPool.forEach(q => { if (q) delete q.isBeingCorrected; });
    isBeingCorrected = false;
    score = data.score || 0;
    currentStreak = data.currentStreak || 0;
    currentStep = data.currentStep || 0;
    consecutiveDueCardsCount = data.consecutiveDueCardsCount || 0;
    consecutiveNewCardsCount = data.consecutiveNewCardsCount || 0;
    precomputedNextCard = null;
    // Requirement 1: Make all cards random at start
    if ((score === 0 || !data.questionsPool || data.questionsPool.length === allQuestions.filter(isPlayableCard).length) && activeMode !== 'notebook') {
        questionsPool = shuffleArray(questionsPool);
    }
    updateStreakUI(false);
    updateDailyStreakUI();
    deckTitle.textContent = data.deckTitle || (activeMode === 'notebook' ? "Caderno" : (activeMode === 'exam' ? "Semana de Provas" : "Flashcards"));
    document.title = data.deckTitle ? `${data.deckTitle} | Flashcards` : "Estudando Flashcards";
    scoreDisplay.textContent = activeMode === 'notebook' ? notebookReviewsCount : score;

    const normalData = JSON.parse(localStorage.getItem('flashcardsSave'));
    if (normalData && deckItemNormalName) {
        deckItemNormalName.textContent = normalData.deckTitle || "Flashcards";
    }

    updateScoreDisplay();
    updateMenuButtonsForActiveMode();
    initStatsSession(deckTitle.textContent, activeMode, allQuestions.filter(isPlayableCard).length, score);
    loadQuestion();
    if (isTutorEnabled()) {
        initializeAi();
    } else {
        disableTutor();
        updateAiUI();
    }
    updateHapticUI();
    initPomodoro();
    initHeaderStats();
    initBackgroundCategorization();
    const initialGamepads = (navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
    if (initialGamepads.length > 0) {
        startGamepadLoop();
    }
    initMobileFocusHelpers();
}

async function initBackgroundCategorization() {
    try {
        const existingCategories = getStoredAiCategories();
        if (existingCategories?.cardTopicsBySignature && allQuestions && allQuestions.length > 0) {
            const sigMap = existingCategories.cardTopicsBySignature;
            let appliedCount = 0;
            allQuestions.forEach(q => {
                const sig = getCardSignature(q);
                if (sig && sigMap[sig]) {
                    q.aiTopic = sigMap[sig];
                    q.topic = q.topic || sigMap[sig];
                    appliedCount++;
                }
            });
            if (appliedCount > 0) {
                console.log(`[Algorithm] ${appliedCount} cartões associados a tópicos em cache. Prática intercalada (Interleaving) pronta.`);
            }
        }

        if (!isTutorEnabled()) {
            return;
        }

        const currentDeckTitle = (deckTitle?.textContent || 'Flashcards').trim();
        if (isDeckCategorized({ allQuestions, currentDeckTitle, categories: existingCategories })) {
            console.log("[Algorithm] Baralho já categorizado previamente. Interleaving ativo.");
            return;
        }

        setTimeout(async () => {
            try {
                console.log("[Algorithm] Iniciando categorização pedagógica de IA em segundo plano...");
                const deckTitles = [currentDeckTitle];
                const cards = (allQuestions || []).filter(isPlayableCard);
                if (cards.length === 0) return;

                const categorizedResult = await callGeminiFlashLiteCategorization({
                    currentDeckTitle,
                    deckTitles,
                    cards,
                    existingCategories: existingCategories || { knownSubjects: [], knownTopicsByDeck: {} }
                });

                if (categorizedResult?.cardTopics) {
                    const sigMap = categorizedResult.updatedCategories?.cardTopicsBySignature || {};
                    allQuestions.forEach(q => {
                        const sig = getCardSignature(q);
                        if (sig && sigMap[sig]) {
                            q.aiTopic = sigMap[sig];
                            q.topic = q.topic || sigMap[sig];
                        }
                    });
                    saveGameState();
                    console.log("[Algorithm] Categorização de IA concluída em segundo plano! Prática intercalada (Interleaving Effect) operando.");
                }
            } catch (err) {
                console.warn("[Algorithm] Categorização de IA em segundo plano falhou silenciosamente:", err.message);
            }
        }, 1500);
    } catch (e) {
        console.warn("[Algorithm] Falha ao verificar categorização em segundo plano:", e);
    }
}

function getInitialsAvatarSvg(nameOrEmail) {
    const initial = escapeHtml((nameOrEmail || 'U').charAt(0).toUpperCase());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="20" fill="#3b82f7"/><text x="20" y="25" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${initial}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function updateSyncButtonsVisibility(user) {
    const isUserLoggedIn = Boolean(user || auth.currentUser);
    if (isUserLoggedIn) {
        if (transferSessionBtn) transferSessionBtn.classList.add('hidden');
        if (receiveSessionBtn) receiveSessionBtn.classList.add('hidden');
    } else {
        if (transferSessionBtn) transferSessionBtn.classList.remove('hidden');
        if (receiveSessionBtn) receiveSessionBtn.classList.remove('hidden');
    }
}

export function updateHamburgerUserUI(user) {
    const currentUser = user || auth.currentUser;
    const menuAccountIcon = document.getElementById('menu-account-icon');
    const menuAccountAvatar = document.getElementById('menu-account-avatar');
    const menuAccountTitle = document.getElementById('menu-account-title');
    const menuAccountSubtitle = document.getElementById('menu-account-subtitle');

    if (currentUser) {
        const photo = sanitizeImageUrl(currentUser.photoURL || currentUser.providerData?.[0]?.photoURL || '');
        const displayName = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Usuário');
        const fallbackAvatar = sanitizeImageUrl(getInitialsAvatarSvg(displayName));

        if (menuAccountIcon) {
            menuAccountIcon.classList.add('hidden');
        }

        if (menuAccountAvatar) {
            menuAccountAvatar.referrerPolicy = 'no-referrer';
            menuAccountAvatar.onerror = function() {
                this.onerror = null;
                this.src = fallbackAvatar;
            };
            menuAccountAvatar.src = photo || fallbackAvatar;
            menuAccountAvatar.classList.remove('hidden');
        }

        if (menuAccountTitle) {
            menuAccountTitle.textContent = displayName;
        }
        if (menuAccountSubtitle) {
            menuAccountSubtitle.textContent = isUserPro() ? t('menu_pro_active') : t('menu_connected_google');
        }
    } else {
        if (menuAccountAvatar) {
            menuAccountAvatar.classList.add('hidden');
        }
        if (menuAccountIcon) {
            menuAccountIcon.classList.remove('hidden');
        }
        if (menuAccountTitle) {
            menuAccountTitle.textContent = t('my_account');
        }
        if (menuAccountSubtitle) {
            menuAccountSubtitle.textContent = t('menu_sync_and_pro');
        }
    }
}

onAuthChange((user) => {
    updateAiUI();
    updateSyncButtonsVisibility(user);
    updateHamburgerUserUI(user);
});
updateSyncButtonsVisibility(auth.currentUser);
updateHamburgerUserUI(auth.currentUser);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

window.addEventListener('resize', resizeCanvas);
window.addMsg = addMsg;

// Listen for cross-device Pro cloud sync updates
window.addEventListener('flashcards:sync-updated', (event) => {
    try {
        updateDailyStreakUI();
        renderHeaderPinnedStats();
        const isAiOn = localStorage.getItem('flashcards_ai_enabled') === 'true';
        if (aiSwitch) aiSwitch.selected = isAiOn;
        if (settingAiSwitch) settingAiSwitch.selected = isAiOn;
        updateAiUI();
        updateScoreDisplay();
        if (appSettingsModal && !appSettingsModal.classList.contains('hidden')) {
            updateSettingsModalState();
        }
        if (headerStatsDropdown && !headerStatsDropdown.classList.contains('hidden')) {
            renderHeaderStatsDropdown();
        }

        // Live-update active deck cards if updated in real time via onSnapshot (shared link or user doc)
        if (event.detail?.hasDeckChanges || event.detail?.source === 'realtime-shared-deck' || event.detail?.source === 'realtime-user-doc') {
            const storageKey = activeMode === 'notebook' ? NOTEBOOK_STORAGE_KEY : (activeMode === 'exam' ? 'flashcardsExam' : 'flashcardsSave');
            try {
                const freshSaved = JSON.parse(localStorage.getItem(storageKey) || '{}');
                if (!freshSaved || !Array.isArray(freshSaved.allQuestions) || freshSaved.allQuestions.length === 0) {
                    // Current deck was deleted on another device: switch to next available slot or go home
                    const slots = getLocalSlots();
                    const nextSlot = slots.find(s => s && s.deckData && s.cardCount > 0);
                    if (nextSlot) {
                        const isExam = Boolean(nextSlot.isExam || nextSlot.mode === 'exam');
                        switchActiveMode(isExam ? 'exam' : 'normal');
                    } else if (activeMode === 'notebook') {
                        allQuestions = [];
                        questionsPool = [];
                        loadQuestion();
                    } else {
                        window.location.href = ROUTES.HOME;
                    }
                    return;
                }

                allQuestions = freshSaved.allQuestions;

                if (freshSaved.score !== undefined) {
                    score = freshSaved.score;
                }
                if (freshSaved.currentStreak !== undefined) {
                    currentStreak = freshSaved.currentStreak;
                    updateStreakUI(false);
                }
                if (freshSaved.currentStep !== undefined) {
                    currentStep = freshSaved.currentStep;
                }
                if (freshSaved.notebookReviewsCount !== undefined) {
                    notebookReviewsCount = freshSaved.notebookReviewsCount;
                }
                if (freshSaved.deckTitle && deckTitle) {
                    deckTitle.textContent = freshSaved.deckTitle;
                    document.title = `${freshSaved.deckTitle} | Flashcards`;
                }

                if (Array.isArray(freshSaved.questionsPool)) {
                    questionsPool = freshSaved.questionsPool
                        .map(pq => allQuestions.find(aq => aq.description === pq.description) || pq)
                        .filter(isPlayableCard);
                } else {
                    questionsPool = (allQuestions || []).filter(isPlayableCard);
                }

                if (currentQuestion) {
                    const updatedCurrent = allQuestions.find(q => q === currentQuestion || q.description === currentQuestion.description);
                    if (updatedCurrent) {
                        Object.assign(currentQuestion, updatedCurrent);
                        ensureQuestionStructure();
                        const bodyElem = document.getElementById('question-body-text');
                        if (bodyElem && !bodyElem.innerHTML.includes('notebook-empty-back-btn')) {
                            const formatted = currentQuestion.type === 'fill'
                                ? renderFillBlanksQuestion(currentQuestion.description || '')
                                : renderMathAndMarkdown(currentQuestion.description || '');
                            bodyElem.innerHTML = formatted;
                        }
                        const isImageArrows = currentQuestion?.type === 'image_arrows';
                        setupCardImageWithPlaceholder(
                            currentQuestion.image,
                            questionImage,
                            questionImageContainer,
                            questionImagePlaceholder,
                            currentQuestion.imageCrop,
                            currentQuestion.imageArrows,
                            {
                                showNumbers: isImageArrows,
                                onArrowClick: isImageArrows ? (idx) => focusGameArrowInput(idx) : null,
                                errorElem: questionImageError,
                                isImageArrows
                            }
                        );
                    } else {
                        if (questionsPool.length > 0) {
                            loadQuestion();
                        } else {
                            clearBalls();
                            showDeckCompletionScreen();
                        }
                    }
                } else if (questionsPool.length > 0) {
                    loadQuestion();
                }

                updateScoreDisplay();
                renderBookmarkIcon();
            } catch (err) {}
        }
    } catch (e) {
        console.warn('Erro ao atualizar UI após sincronização:', e);
    }
});

// Check for URL deep-link to settings (e.g. game.html?open=settings&section=api)
try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open') === 'settings') {
        setTimeout(() => {
            openAppSettingsModal();
            if (urlParams.get('section') === 'api') {
                setTimeout(() => {
                    const apiSection = document.getElementById('settings-api-section');
                    if (apiSection) {
                        apiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
            }
        }, 300);
    }
} catch (e) {
    console.warn('Erro ao processar parâmetros de URL para configurações:', e);
}


