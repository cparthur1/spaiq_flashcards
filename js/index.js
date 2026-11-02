// Handles landing page functionality: redirects, single deck and Semana de Provas multi-deck uploads.
import { ROUTES, shuffleArray, generateSecureId, escapeHtml } from './utils.js';
import { getDailyStreak } from './engine/notebook-scheduler.js';
import { initExploreModal, openExploreModal } from './explore-modal.js';
import { checkAndLoadSharedDeck, checkAndUpdateSharedSlots, subscribeToAllSharedSlots } from './share-manager.js';
import { openDeckInSlots, syncSlotsToCloud, initRealtimeCloudSync } from './slot-manager.js';
import { t, initI18n, getCurrentLanguage, setLanguage, getLanguagePreference } from './i18n.js';

async function init() {
    // 0. Initialize language menu
    setupLanguageMenu();

    // 1. Check for shared deck via deep-link (?share=...)
    const sharedLoaded = await checkAndLoadSharedDeck();
    if (sharedLoaded) return;

    // Check in background if imported shared decks have new updates from owner
    checkAndUpdateSharedSlots().catch(() => {});

    // Start real-time Firestore listeners (onSnapshot)
    subscribeToAllSharedSlots();
    initRealtimeCloudSync();

    // 2. Initialize the Explore Files Modal
    initExploreModal();
    const openExploreBtn = document.getElementById('open-explore-btn');
    if (openExploreBtn) {
        openExploreBtn.addEventListener('click', openExploreModal);
    }

    // 3. Continue Active Session Button
    const continueSessionBtn = document.getElementById('continue-session-btn');
    const hasActiveSession = localStorage.getItem('flashcardsSave') || localStorage.getItem('flashcardsExam');
    if (continueSessionBtn && hasActiveSession) {
        continueSessionBtn.classList.remove('hidden');
        continueSessionBtn.addEventListener('click', () => {
            window.location.href = ROUTES.GAME;
        });
    }

    // 4. Update Daily Streak Count above "Explorar arquivos"
    updateHomeDailyStreak();
    window.addEventListener('focus', updateHomeDailyStreak);
    window.addEventListener('flashcards:sync-updated', () => {
        updateHomeDailyStreak();
    });
    window.addEventListener('storage', (e) => {
        if (!e.key || e.key.includes('streak') || e.key.includes('flashcards')) {
            updateHomeDailyStreak();
        }
    });

    // --- Check Saved Exam Week Session ---
    const examSavedBadge = document.getElementById('exam-saved-badge');
    const examSavedSessionBox = document.getElementById('exam-saved-session-box');
    const examSavedCardsCount = document.getElementById('exam-saved-cards-count');
    const examSavedDecksText = document.getElementById('exam-saved-decks-text');
    const examContinueBtn = document.getElementById('exam-continue-btn');

    let savedExamData = null;
    try {
        const raw = localStorage.getItem('flashcardsExam');
        if (raw) {
            savedExamData = JSON.parse(raw);
            if (savedExamData && savedExamData.questionsPool && savedExamData.questionsPool.length > 0) {
                if (examSavedBadge) examSavedBadge.classList.remove('hidden');
                if (examSavedSessionBox) examSavedSessionBox.classList.remove('hidden');
                if (examSavedCardsCount) {
                    examSavedCardsCount.textContent = t('cards_remaining', { count: savedExamData.questionsPool.length });
                }
                if (examSavedDecksText) {
                    const deckNames = (savedExamData.decks || []).map(d => d.name).join(', ');
                    examSavedDecksText.textContent = deckNames ? t('saved_mix_prefix', { names: deckNames }) : t('exam_saved_desc');
                }
            }
        }
    } catch (e) {
        console.warn("Erro ao ler sessão salva de Semana de Provas:", e);
    }

    if (examContinueBtn) {
        examContinueBtn.addEventListener('click', () => {
            if (savedExamData) {
                openDeckInSlots(savedExamData, savedExamData.deckTitle || "Semana de Provas", 'exam');
            } else {
                localStorage.setItem('flashcardsActiveMode', 'exam');
            }
            window.location.href = ROUTES.GAME;
        });
    }

    const fileInput = document.getElementById('file-input');
    const startBtn = document.getElementById('start-btn');
    const uploadError = document.getElementById('upload-error');
    let selectedFiles = [];

    function setUploadError(msg) {
        if (!uploadError) return;
        uploadError.replaceChildren();
        const img = document.createElement('img');
        img.src = 'assets/img/error.svg';
        img.className = 'w-5 h-5 inline-block mr-1';
        img.alt = 'Erro';
        const textNode = document.createTextNode(` ${msg}`);
        uploadError.appendChild(img);
        uploadError.appendChild(textNode);
    }


    // Helper: Read single file as text
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (err) => reject(err);
            reader.readAsText(file);
        });
    }

    // Helper: Start Exam Week Session
    function startExamWeek(decksList) {
        if (!decksList || decksList.length === 0) return;

        let allCombinedQuestions = [];
        let registeredDecks = [];

        decksList.forEach(d => {
            registeredDecks.push({
                id: d.id,
                name: d.name,
                enabled: true,
                cardCount: d.cards.length
            });
            d.cards.forEach(card => {
                allCombinedQuestions.push({
                    ...card,
                    deckId: d.id,
                    sourceDeck: d.name
                });
            });
        });

        const playable = allCombinedQuestions.filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
        const shuffledPool = shuffleArray(playable);

        const examState = {
            deckTitle: "Semana de Provas",
            score: 0,
            decks: registeredDecks,
            allQuestions: allCombinedQuestions,
            questionsPool: shuffledPool
        };

        try {
            openDeckInSlots(examState, "Semana de Provas", 'exam');
            window.location.href = ROUTES.GAME;
        } catch (err) {
            if (err.name === 'QuotaExceededError') {
                alert(t('exam_decks_large_error'));
            } else {
                alert(t('exam_error_start_alert', { message: err.message }));
            }
        }
    }

    // --- MAIN FILE INPUT UPLOAD ---
    function handleFileSelection() {
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            selectedFiles = Array.from(fileInput.files);
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                startBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
                if (selectedFiles.length === 1) {
                    startBtn.replaceChildren();
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-rounded text-xl';
                    icon.textContent = 'folder_open';
                    startBtn.append(icon, document.createTextNode(` Abrir ${selectedFiles[0].name}`));
                } else {
                    startBtn.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg> Abrir Semana de Provas (${Number(selectedFiles.length) || 0} baralhos)`;
                }
            }
            if (uploadError) uploadError.textContent = '';
        }
    }

    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelection);
        fileInput.addEventListener('input', handleFileSelection);
        if (fileInput.files && fileInput.files.length > 0) {
            handleFileSelection();
        }
    }

    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            if (!selectedFiles || selectedFiles.length === 0) {
                uploadError.textContent = t('select_json_files_error');
                return;
            }

            // Multi-deck mode triggered from main input
            if (selectedFiles.length > 1) {
                try {
                    const loadedDecks = [];
                    for (const file of selectedFiles) {
                        const content = await readFileAsText(file);
                        const parsed = JSON.parse(content);
                        let cards = [];
                        let name = file.name.replace(/\.json$/i, '');

                        if (parsed && parsed.__flashcards_watermark__ === "notebook_backup_v1") {
                            cards = parsed.cards || [];
                            name = parsed.deckTitle || "Caderno";
                        } else if (parsed && parsed.__flashcards_watermark__ === "exam_week_backup_v1") {
                            // Already an exam week backup
                            const examState = {
                                deckTitle: parsed.deckTitle || "Semana de Provas",
                                score: 0,
                                decks: parsed.decks || [],
                                allQuestions: parsed.cards || [],
                                questionsPool: shuffleArray((parsed.cards || []).filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note'))
                            };
                            openDeckInSlots(examState, examState.deckTitle, 'exam');
                            window.location.href = ROUTES.GAME;
                            return;
                        } else if (Array.isArray(parsed)) {
                            cards = parsed;
                        }

                        if (cards.length > 0) {
                            loadedDecks.push({
                                id: generateSecureId('deck'),
                                name: name,
                                cards: cards
                            });
                        }
                    }

                    if (loadedDecks.length === 0) {
                        throw new Error(t('no_valid_cards_found'));
                    }

                    startExamWeek(loadedDecks);
                } catch (e) {
                    setUploadError(t('error_loading_decks', { message: e.message }));
                }
                return;
            }

            // Single file upload
            const currentFile = selectedFiles[0];
            try {
                const content = await readFileAsText(currentFile);
                const parsed = JSON.parse(content);
                let questions = [];
                let deckTitle = currentFile.name.replace(/\.json$/i, '');
                let isNotebook = false;
                let isExamBackup = false;

                if (parsed && parsed.__flashcards_watermark__ === "notebook_backup_v1") {
                    questions = parsed.cards || [];
                    deckTitle = parsed.deckTitle || "Caderno";
                    isNotebook = true;
                } else if (parsed && parsed.__flashcards_watermark__ === "exam_week_backup_v1") {
                    isExamBackup = true;
                    const playable = (parsed.cards || []).filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
                    const examState = {
                        deckTitle: parsed.deckTitle || "Semana de Provas",
                        score: 0,
                        decks: parsed.decks || [],
                        allQuestions: parsed.cards || [],
                        questionsPool: shuffleArray(playable)
                    };
                    openDeckInSlots(examState, examState.deckTitle, 'exam');
                    window.location.href = ROUTES.GAME;
                    return;
                } else if (Array.isArray(parsed)) {
                    questions = parsed;
                } else {
                    throw new Error(t('invalid_json_deck'));
                }

                if (questions.length === 0) {
                    throw new Error(t('json_empty_cards'));
                }

                if (isNotebook) {
                    const playable = questions.filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
                    const notebookState = {
                        questionsPool: [...playable],
                        allQuestions: [...questions],
                        score: 0,
                        deckTitle: deckTitle
                    };
                    try {
                        localStorage.setItem('flashcardsNotebook', JSON.stringify(notebookState));
                        localStorage.setItem('flashcardsActiveMode', 'notebook');
                        syncSlotsToCloud();
                        window.location.href = ROUTES.GAME;
                    } catch (err) {
                        if (err.name === 'QuotaExceededError') {
                            setUploadError(t('notebook_backup_too_large'));
                        } else {
                            setUploadError(t('error_saving_notebook', { message: err.message }));
                        }
                    }
                } else {
                    localStorage.setItem('flashcardsActiveMode', 'normal');
                    saveAndRedirect(questions, deckTitle);
                }
            } catch (e) {
                setUploadError(t('error_reading_file', { message: e.message }));
            }
        });
    }

    function saveAndRedirect(questions, title) {
        const playable = questions.filter(q => q && q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
        const gameState = {
            questionsPool: [...playable],
            allQuestions: [...questions],
            score: 0,
            deckTitle: title
        };
        try {
            openDeckInSlots(gameState, title);
            window.location.href = ROUTES.GAME;
        } catch (err) {
            if (err.name === 'QuotaExceededError') {
                setUploadError(t('deck_too_large_error'));
            } else {
                setUploadError(t('error_saving_deck', { message: err.message }));
            }
        }
    }

    // --- SEMANA DE PROVAS MODAL LOGIC ---
    const openExamBtn = document.getElementById('open-exam-btn');
    const examModal = document.getElementById('exam-modal');
    const closeExamModalBtn = document.getElementById('close-exam-modal-btn');
    const cancelExamModalBtn = document.getElementById('cancel-exam-modal-btn');
    const examDropZone = document.getElementById('exam-drop-zone');
    const examFileInput = document.getElementById('exam-file-input');
    const examDeckList = document.getElementById('exam-deck-list');
    const examEmptyMsg = document.getElementById('exam-empty-msg');
    const examDecksCount = document.getElementById('exam-decks-count');
    const examTotalCards = document.getElementById('exam-total-cards');
    const startExamBtn = document.getElementById('start-exam-btn');
    const examError = document.getElementById('exam-error');

    let modalDecks = []; // Array of { id, name, cards: [...] }

    function openExamModal() {
        if (examModal) {
            examModal.classList.remove('hidden');
        }
    }

    // Deep-link check to open exam modal if redirected from another page
    const examUrlParam = new URLSearchParams(window.location.search).get('openExam');
    if (examUrlParam === '1') {
        openExamModal();
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    function closeExamModal() {
        if (examModal) {
            examModal.classList.add('hidden');
        }
    }

    if (openExamBtn) openExamBtn.addEventListener('click', openExamModal);
    if (closeExamModalBtn) closeExamModalBtn.addEventListener('click', closeExamModal);
    if (cancelExamModalBtn) cancelExamModalBtn.addEventListener('click', closeExamModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && examModal && !examModal.classList.contains('hidden')) {
            closeExamModal();
        }
    });

    if (examDropZone && examFileInput) {
        examDropZone.addEventListener('click', () => examFileInput.click());

        examDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            examDropZone.classList.add('border-purple-500', 'bg-purple-50/50');
        });

        examDropZone.addEventListener('dragleave', () => {
            examDropZone.classList.remove('border-purple-500', 'bg-purple-50/50');
        });

        examDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            examDropZone.classList.remove('border-purple-500', 'bg-purple-50/50');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                processExamFiles(Array.from(e.dataTransfer.files));
            }
        });

        examFileInput.addEventListener('change', () => {
            if (examFileInput.files && examFileInput.files.length > 0) {
                processExamFiles(Array.from(examFileInput.files));
                examFileInput.value = '';
            }
        });
    }

    async function processExamFiles(files) {
        if (examError) {
            examError.textContent = '';
            examError.classList.add('hidden');
        }

        for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.json')) continue;
            try {
                const text = await readFileAsText(file);
                const parsed = JSON.parse(text);
                let cards = [];
                let name = file.name.replace(/\.json$/i, '');

                if (parsed && parsed.__flashcards_watermark__ === "notebook_backup_v1") {
                    cards = parsed.cards || [];
                    name = parsed.deckTitle || "Caderno";
                } else if (parsed && parsed.__flashcards_watermark__ === "exam_week_backup_v1") {
                    // Import multiple decks from exam week backup
                    if (parsed.decks && Array.isArray(parsed.decks)) {
                        parsed.decks.forEach(d => {
                            const dCards = (parsed.cards || []).filter(c => c.deckId === d.id || c.sourceDeck === d.name);
                            modalDecks.push({
                                id: d.id || generateSecureId('deck'),
                                name: d.name,
                                cards: dCards.length > 0 ? dCards : (parsed.cards || [])
                            });
                        });
                        continue;
                    }
                    cards = parsed.cards || [];
                } else if (Array.isArray(parsed)) {
                    cards = parsed;
                }

                if (cards.length > 0) {
                    modalDecks.push({
                        id: generateSecureId('deck'),
                        name: name,
                        cards: cards
                    });
                }
            } catch (err) {
                if (examError) {
                    examError.textContent = t('error_reading_file_named', { name: file.name, message: err.message });
                    examError.classList.remove('hidden');
                }
            }
        }
        renderExamDecksList();
    }

    function renderExamDecksList() {
        if (!examDeckList) return;
        examDeckList.innerHTML = '';

        if (modalDecks.length === 0) {
            if (examEmptyMsg) examEmptyMsg.classList.remove('hidden');
            if (examDecksCount) examDecksCount.textContent = '0';
            if (examTotalCards) examTotalCards.textContent = t('total_cards_count', { count: 0 });
            if (startExamBtn) startExamBtn.disabled = true;
            return;
        }

        if (examEmptyMsg) examEmptyMsg.classList.add('hidden');

        let totalCards = 0;

        modalDecks.forEach((deck, index) => {
            totalCards += deck.cards.length;

            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200 transition group';
            item.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <svg class="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    <span class="text-sm font-semibold text-gray-800 truncate flex-1 text-left" title="${escapeHtml(deck.name)}">${escapeHtml(deck.name)}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium flex-shrink-0">${deck.cards.length} cards</span>
                </div>
                <button type="button" class="remove-deck-btn ml-2 p-1 text-gray-400 hover:text-red-500 transition" title="Remover baralho">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;

            const removeBtn = item.querySelector('.remove-deck-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                modalDecks.splice(index, 1);
                renderExamDecksList();
            });

            examDeckList.appendChild(item);
        });

        if (examDecksCount) examDecksCount.textContent = modalDecks.length;
        if (examTotalCards) examTotalCards.textContent = t('total_cards_count', { count: totalCards });
        if (startExamBtn) startExamBtn.disabled = modalDecks.length === 0;
    }

    if (startExamBtn) {
        startExamBtn.addEventListener('click', () => {
            if (modalDecks.length === 0) return;
            startExamWeek(modalDecks);
        });
    }
}

/**
 * Updates daily streak badge and fire icon on landing screen above "Explorar arquivos"
 */
export function updateHomeDailyStreak() {
    const streakBadge = document.getElementById('home-daily-streak-badge');
    const streakCount = document.getElementById('home-streak-count');
    const streakLabel = document.getElementById('home-streak-label');
    const streakFire = document.getElementById('home-streak-fire-icon');
    if (!streakCount) return;

    try {
        const streakData = getDailyStreak();
        const count = Number(streakData?.streak) || 0;
        const isToday = Boolean(streakData?.isTodayStudied);

        streakCount.textContent = count;
        if (streakLabel) {
            streakLabel.textContent = count === 1 ? t('streak_label_singular') : t('streak_label_plural');
        }

        if (count > 0) {
            streakFire?.classList.remove('grayscale', 'opacity-60');
            streakBadge?.classList.remove('bg-gray-50', 'border-gray-200', 'text-gray-600');
            streakBadge?.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-900');
            streakCount?.classList.remove('text-gray-700');
            streakCount?.classList.add('text-amber-700');
            streakBadge?.setAttribute('title', isToday ? t('streak_active_today') : t('streak_maintain_today'));
        } else {
            streakFire?.classList.add('grayscale', 'opacity-60');
            streakBadge?.classList.remove('bg-amber-50', 'border-amber-200', 'text-amber-900');
            streakBadge?.classList.add('bg-gray-50', 'border-gray-200', 'text-gray-600');
            streakCount?.classList.remove('text-amber-700');
            streakCount?.classList.add('text-gray-700');
            streakBadge?.setAttribute('title', t('streak_start_today'));
        }
    } catch (e) {
        console.warn('Erro ao atualizar streak na tela inicial:', e);
    }
}

/**
 * Sets up the top-right language menu on the landing page
 */
function setupLanguageMenu() {
    const langBtn = document.getElementById('lang-menu-btn');
    const langDropdown = document.getElementById('lang-dropdown-menu');
    const currentLabel = document.getElementById('lang-current-label');
    const optionBtns = document.querySelectorAll('.lang-option-btn');

    function updateLanguageUI() {
        const cur = getCurrentLanguage();
        const pref = getLanguagePreference();
        if (currentLabel) {
            currentLabel.textContent = cur === 'pt-BR' ? 'PT' : 'EN';
        }
        optionBtns.forEach(btn => {
            const lang = btn.getAttribute('data-lang');
            const check = btn.querySelector('.lang-check-icon');
            if (check) {
                if (lang === pref) {
                    check.classList.remove('hidden');
                } else {
                    check.classList.add('hidden');
                }
            }
        });
    }

    if (langBtn && langDropdown) {
        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            langDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!langDropdown.contains(e.target) && !langBtn.contains(e.target)) {
                langDropdown.classList.add('hidden');
            }
        });

        optionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const selected = btn.getAttribute('data-lang');
                setLanguage(selected);
                updateLanguageUI();
                updateHomeDailyStreak();
                langDropdown.classList.add('hidden');
            });
        });
    }

    window.addEventListener('flashcards:language-change', () => {
        updateLanguageUI();
        updateHomeDailyStreak();
    });

    updateLanguageUI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
