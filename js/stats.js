import { getStatsStorage, saveStatsStorage, resetAllStats } from './stats-tracker.js';
import { 
    callGeminiFlashLiteCategorization, 
    getStoredAiCategories, 
    saveStoredAiCategories, 
    computeAiStats,
    isDeckCategorized,
    getCardSignature
} from './stats-ai.js';
import { ROUTES, escapeHtml } from './utils.js';
import { getDailyStreak, getHeatmapActivityMap, getTodayDateString } from './engine/notebook-scheduler.js';
import { initExploreModal, openProModal, isUserPro } from './explore-modal.js';
import { onAuthChange } from './firebase-client.js';
import { t, getCurrentLanguage } from './i18n.js';

// DOM Elements
const backToGameBtn = document.getElementById('back-to-game-btn');
const deckBadge = document.getElementById('deck-badge');
const liveSyncIndicator = document.getElementById('live-sync-indicator');
const exportStatsBtn = document.getElementById('export-stats-btn');
const clearStatsBtn = document.getElementById('clear-stats-btn');

// Activity Heatmap & Streak Freeze DOM Elements
const activityHeatmap = document.getElementById('activity-heatmap');
const heatmapStreakVal = document.getElementById('heatmap-streak-val');
const heatmapFreezeStatus = document.getElementById('heatmap-freeze-status');
const heatmapHoverInfo = document.getElementById('heatmap-hover-info');

function getActiveStorageKey() {
    const activeMode = localStorage.getItem('flashcardsActiveMode') || 'normal';
    if (activeMode === 'notebook') return 'flashcardsNotebook';
    if (activeMode === 'exam') return 'flashcardsExam';
    return 'flashcardsSave';
}

function getStoredGameState() {
    try {
        const storageKey = getActiveStorageKey();
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn("Erro ao ler gameState do localStorage:", e);
        return {};
    }
}

// Tabs
const tabBtnCurrent = document.getElementById('tab-btn-current');
const tabBtnHistory = document.getElementById('tab-btn-history');
const tabBtnStruggling = document.getElementById('tab-btn-struggling');
const tabContentCurrent = document.getElementById('tab-content-current');
const tabContentHistory = document.getElementById('tab-content-history');
const tabContentStruggling = document.getElementById('tab-content-struggling');
const historyBadgeCount = document.getElementById('history-badge-count');
const strugglingBadgeCount = document.getElementById('struggling-badge-count');

// Session Completed Celebration Banner
const sessionCompletedBanner = document.getElementById('session-completed-banner');
const bannerStatAcc = document.getElementById('banner-stat-acc');
const bannerStatTime = document.getElementById('banner-stat-time');
const bannerStatStreak = document.getElementById('banner-stat-streak');
const bannerStatAi = document.getElementById('banner-stat-ai');

// KPI Elements
const kpiProgressPercent = document.getElementById('kpi-progress-percent');
const kpiProgressRatio = document.getElementById('kpi-progress-ratio');
const kpiProgressBar = document.getElementById('kpi-progress-bar');
const kpiAccuracyPercent = document.getElementById('kpi-accuracy-percent');
const kpiAccuracyFeedback = document.getElementById('kpi-accuracy-feedback');
const kpiCorrectCount = document.getElementById('kpi-correct-count');
const kpiIncorrectCount = document.getElementById('kpi-incorrect-count');
const kpiDuration = document.getElementById('kpi-duration');
const kpiTimePerCard = document.getElementById('kpi-time-per-card');
const kpiCurrentStreak = document.getElementById('kpi-current-streak');
const kpiBestStreak = document.getElementById('kpi-best-streak');

// Anki Elements
const ankiTotalBadge = document.getElementById('anki-total-badge');
const ankiBarAgain = document.getElementById('anki-bar-again');
const ankiBarHard = document.getElementById('anki-bar-hard');
const ankiBarGood = document.getElementById('anki-bar-good');
const ankiBarEasy = document.getElementById('anki-bar-easy');
const ankiCountAgain = document.getElementById('anki-count-again');
const ankiCountHard = document.getElementById('anki-count-hard');
const ankiCountGood = document.getElementById('anki-count-good');
const ankiCountEasy = document.getElementById('anki-count-easy');
const ankiPctAgain = document.getElementById('anki-pct-again');
const ankiPctHard = document.getElementById('anki-pct-hard');
const ankiPctGood = document.getElementById('anki-pct-good');
const ankiPctEasy = document.getElementById('anki-pct-easy');

// Panels
const byTypeContainer = document.getElementById('by-type-container');
const timelineStrip = document.getElementById('timeline-strip');
const timelineCounterBadge = document.getElementById('timeline-counter-badge');
const insightTitle = document.getElementById('insight-title');
const insightText = document.getElementById('insight-text');

// Pace, Mastery & Highlights Elements
const paceEstimateBadge = document.getElementById('pace-estimate-badge');
const paceEstimateTime = document.getElementById('pace-estimate-time');
const paceEstimateSub = document.getElementById('pace-estimate-sub');
const paceFastestCard = document.getElementById('pace-fastest-card');
const paceSlowestCard = document.getElementById('pace-slowest-card');

const masteryLevelBadge = document.getElementById('mastery-level-badge');
const masteryScore = document.getElementById('mastery-score');
const masteryProgressBar = document.getElementById('mastery-progress-bar');
const masteryDescription = document.getElementById('mastery-description');

const highlightsTotalBadge = document.getElementById('highlights-total-badge');
const highlightsSummaryText = document.getElementById('highlights-summary-text');
const hlCountYellow = document.getElementById('hl-count-yellow');
const hlCountGreen = document.getElementById('hl-count-green');
const hlCountBlue = document.getElementById('hl-count-blue');
const hlCountPurple = document.getElementById('hl-count-purple');

// History Elements
const alltimeSessions = document.getElementById('alltime-sessions');
const alltimeTime = document.getElementById('alltime-time');
const alltimeCards = document.getElementById('alltime-cards');
const alltimeAccuracy = document.getElementById('alltime-accuracy');
const alltimeBestStreak = document.getElementById('alltime-best-streak');
const chartTrendBadge = document.getElementById('chart-trend-badge');
const accuracyChartContainer = document.getElementById('accuracy-chart-container');
const historyList = document.getElementById('history-list');

// Struggling Elements
const strugglingList = document.getElementById('struggling-list');
const addAllToNotebookBtn = document.getElementById('add-all-to-notebook-btn');

// AI Elements
const aiStatsSection = document.getElementById('ai-stats-section');
const aiHistorySubjectsSection = document.getElementById('ai-history-subjects-section');

let isAiLoading = false;

function formatSeconds(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function showStatsPill(message, isSuccess = true) {
    const existing = document.getElementById('stats-floating-pill');
    if (existing) existing.remove();

    const pill = document.createElement('div');
    pill.id = 'stats-floating-pill';
    pill.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-xl border border-white/20 transition-all duration-300 transform translate-y-10 opacity-0 text-sm font-semibold flex items-center gap-2 ${
        isSuccess ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-white'
    }`;
    pill.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <span>${escapeHtml(message || '')}</span>
    `;
    document.body.appendChild(pill);

    requestAnimationFrame(() => {
        pill.classList.remove('translate-y-10', 'opacity-0');
        pill.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
        pill.classList.remove('translate-y-0', 'opacity-100');
        pill.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => pill.remove(), 400);
    }, 3000);
}

// TAB SWITCHING (Material Design 3 Shared Axis X Motion)
let currentActiveTab = 'current';
const TAB_INDEX_MAP = {
    'current': 0,
    'history': 1,
    'struggling': 2
};

function switchTab(tabName) {
    if (tabName === currentActiveTab) return;

    const oldIndex = TAB_INDEX_MAP[currentActiveTab] ?? 0;
    const newIndex = TAB_INDEX_MAP[tabName] ?? 0;
    const direction = newIndex >= oldIndex ? 'forward' : 'backward';

    const updateDOM = () => {
        [tabBtnCurrent, tabBtnHistory, tabBtnStruggling].forEach(btn => {
            btn.classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.add('text-gray-600');
            btn.removeAttribute('aria-selected');
        });

        [tabContentCurrent, tabContentHistory, tabContentStruggling].forEach(content => {
            content.classList.add('hidden');
            content.classList.remove('m3-tab-panel-enter-forward', 'm3-tab-panel-enter-backward');
        });

        let targetBtn = tabBtnCurrent;
        let targetContent = tabContentCurrent;

        if (tabName === 'history') {
            targetBtn = tabBtnHistory;
            targetContent = tabContentHistory;
            try {
                renderHistory(getStatsStorage());
            } catch (err) {
                console.error('Error rendering history:', err);
            }
        } else if (tabName === 'struggling') {
            targetBtn = tabBtnStruggling;
            targetContent = tabContentStruggling;
            try {
                renderStrugglingCards(getStatsStorage().currentSession);
            } catch (err) {
                console.error('Error rendering struggling cards:', err);
            }
        }

        targetBtn.classList.add('bg-white', 'text-blue-600', 'shadow-sm');
        targetBtn.classList.remove('text-gray-600');
        targetBtn.setAttribute('aria-selected', 'true');

        targetContent.classList.remove('hidden');
        targetContent.classList.add(direction === 'forward' ? 'm3-tab-panel-enter-forward' : 'm3-tab-panel-enter-backward');
        
        currentActiveTab = tabName;
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

// MAIN RENDER FUNCTION
function renderAllStats(options = {}) {
    const isLiveUpdate = Boolean(options.isLiveUpdate);
    const statsData = getStatsStorage();
    const activeMode = localStorage.getItem('flashcardsActiveMode') || 'normal';
    const gameState = getStoredGameState();

    const deckTitle = gameState.deckTitle || (activeMode === 'notebook' ? 'Caderno' : (activeMode === 'exam' ? 'Semana de Provas' : 'Flashcards'));
    if (deckBadge && deckBadge.textContent !== deckTitle) {
        deckBadge.textContent = deckTitle;
    }

    // --- TAB 1: CURRENT SESSION ---
    const lastHistory = statsData.history && statsData.history[0];
    const currentOrLastSession = (statsData.currentSession && statsData.currentSession.cardsAnswered > 0)
        ? statsData.currentSession
        : (lastHistory || statsData.currentSession || null);
    renderCurrentSession(currentOrLastSession, gameState, statsData.history);

    // --- AI SECTION: TOPICS & SUBJECTS ---
    renderAiSection(gameState, statsData, isLiveUpdate, currentOrLastSession);

    // --- TAB 2: HISTORY ---
    const history = statsData.history || [];
    if (historyBadgeCount) historyBadgeCount.textContent = history.length;
    if (!isLiveUpdate || currentActiveTab === 'history') {
        renderHistory(statsData);
    }

    // --- TAB 3: STRUGGLING CARDS ---
    const strugglingObj = statsData.currentSession && statsData.currentSession.strugglingCards ? statsData.currentSession.strugglingCards : {};
    const ignored = (statsData.currentSession && statsData.currentSession.ignoredStrugglingKeys) || [];
    const strugglingCount = Math.min(20, Object.keys(strugglingObj).filter(k => !ignored.includes(k)).length);
    if (strugglingBadgeCount) {
        strugglingBadgeCount.textContent = strugglingCount;
        strugglingBadgeCount.classList.toggle('hidden', strugglingCount === 0);
    }
    if (addAllToNotebookBtn) {
        addAllToNotebookBtn.classList.toggle('hidden', strugglingCount === 0);
    }
    if (!isLiveUpdate || currentActiveTab === 'struggling') {
        renderStrugglingCards(statsData.currentSession);
    }
}

function renderCurrentSession(sess, gameState, history) {
    const playableAll = gameState.allQuestions ? gameState.allQuestions.filter(q => q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note') : null;
    const totalCards = playableAll ? playableAll.length : (sess ? sess.totalCardsInDeck : 0);
    const poolRemaining = gameState.questionsPool ? gameState.questionsPool.length : 0;
    const isCompleted = Boolean(sess && (sess.completed || (totalCards > 0 && poolRemaining === 0)));
    const completedCards = isCompleted ? totalCards : Math.max(0, totalCards - poolRemaining);

    const answered = sess && typeof sess.cardsAnswered === 'number' ? sess.cardsAnswered : completedCards;
    const correct = sess && typeof sess.correctCount === 'number' ? sess.correctCount : completedCards;
    const incorrect = sess && typeof sess.incorrectCount === 'number' ? sess.incorrectCount : 0;
    const duration = sess ? sess.durationSeconds || 0 : 0;

    const progressPct = totalCards > 0 ? (isCompleted ? 100 : Math.round((completedCards / totalCards) * 100)) : 0;
    const accuracyPct = answered > 0 ? Math.round((correct / answered) * 100) : 100;
    const accuracyRate = answered > 0 ? (correct / answered) : 1;

    // Disconsider cards taking longer than 90s to be answered (study break / tab left idle)
    let avgSeconds = '0';
    if (sess && sess.activeCardsCount > 0 && typeof sess.activeDurationSeconds === 'number') {
        avgSeconds = (sess.activeDurationSeconds / sess.activeCardsCount).toFixed(1);
    } else if (sess && sess.answersLog && sess.answersLog.length > 0) {
        const validEntries = sess.answersLog.filter(e => typeof e.timeSeconds === 'number' && e.timeSeconds <= 90);
        if (validEntries.length > 0) {
            const sumValid = validEntries.reduce((acc, e) => acc + e.timeSeconds, 0);
            avgSeconds = (sumValid / validEntries.length).toFixed(1);
        } else if (answered > 0) {
            avgSeconds = (duration / answered).toFixed(1);
        }
    } else if (answered > 0) {
        avgSeconds = (duration / answered).toFixed(1);
    }

    // Session Completed Celebration Banner
    if (sessionCompletedBanner) {
        if (isCompleted) {
            sessionCompletedBanner.classList.remove('hidden');
            if (bannerStatAcc) {
                bannerStatAcc.replaceChildren();
                const icon = document.createElement('span');
                icon.className = 'material-symbols-rounded text-sm';
                icon.textContent = 'track_changes';
                const text = document.createElement('span');
                text.textContent = t('accuracy_stat_label', { accuracy: Number(accuracyPct) || 0 });
                bannerStatAcc.append(icon, text);
            }
            if (bannerStatTime) {
                bannerStatTime.replaceChildren();
                const icon = document.createElement('span');
                icon.className = 'material-symbols-rounded text-sm';
                icon.textContent = 'timer';
                const text = document.createElement('span');
                text.textContent = ` ${formatSeconds(duration)}`;
                bannerStatTime.append(icon, text);
            }
            const maxStreak = Number(sess ? (sess.bestStreak || sess.maxStreak || sess.currentStreak || 0) : 0) || 0;
            if (bannerStatStreak) {
                bannerStatStreak.replaceChildren();
                const fire = document.createElement('span');
                fire.className = 'material-symbols-rounded text-sm text-amber-500 select-none';
                fire.textContent = 'local_fire_department';
                const text = document.createElement('span');
                text.textContent = ` ${maxStreak} ${t('in_a_row')}`;
                bannerStatStreak.append(fire, text);
            }
            const aiCount = Number(sess ? (sess.aiCorrectionsCount || (sess.answersLog || []).filter(e => e.rating === 'ai_corrected').length) : 0) || 0;
            if (bannerStatAi) {
                if (aiCount > 0) {
                    bannerStatAi.replaceChildren();
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-rounded text-sm';
                    icon.textContent = 'auto_awesome';
                    const text = document.createElement('span');
                    text.textContent = ` ${aiCount} ${t('with_ai')}`;
                    bannerStatAi.append(icon, text);
                    bannerStatAi.classList.remove('hidden');
                } else {
                    bannerStatAi.classList.add('hidden');
                }
            }
        } else {
            sessionCompletedBanner.classList.add('hidden');
        }
    }

    // Update KPIs
    kpiProgressPercent.textContent = `${progressPct}%`;
    kpiProgressRatio.textContent = t('kpi_progress_ratio', { completed: completedCards, total: totalCards });
    kpiProgressBar.style.width = `${progressPct}%`;

    kpiAccuracyPercent.textContent = `${accuracyPct}%`;
    kpiAccuracyPercent.className = `text-2xl sm:text-3xl font-extrabold ${
        accuracyPct >= 80 ? 'text-emerald-600' :
        accuracyPct >= 65 ? 'text-amber-500' : 'text-red-600'
    }`;
    kpiAccuracyFeedback.textContent = accuracyPct >= 85 ? t('excellent_mastery') : accuracyPct >= 70 ? t('good_pace') : t('needs_attention');
    kpiCorrectCount.textContent = correct;
    kpiIncorrectCount.textContent = incorrect;

    kpiDuration.textContent = formatSeconds(duration);
    kpiTimePerCard.textContent = `${avgSeconds}s`;

    kpiCurrentStreak.textContent = sess ? sess.currentStreak || 0 : 0;
    kpiBestStreak.textContent = sess ? sess.bestStreak || 0 : 0;

    // Sub-Card 1: Cognitive Pace & Completion Estimate
    renderPaceAndEstimate(sess, gameState, parseFloat(avgSeconds), isCompleted ? 0 : poolRemaining, accuracyRate);

    // Sub-Card 2: Deck Mastery Level
    renderDeckMastery(progressPct, accuracyPct, sess ? sess.currentStreak || 0 : 0, completedCards, totalCards);

    // Sub-Card 3: Flashcard Text Highlights
    renderHighlightsStats(gameState);

    // Anki Quality Distribution
    const anki = sess && sess.ankiRatings ? sess.ankiRatings : { again: 0, hard: 0, good: 0, easy: 0 };
    const ankiTotal = (anki.again || 0) + (anki.hard || 0) + (anki.good || 0) + (anki.easy || 0);
    ankiTotalBadge.textContent = t('anki_responses_count', { count: ankiTotal });

    const pctAgain = ankiTotal > 0 ? Math.round((anki.again / ankiTotal) * 100) : 0;
    const pctHard = ankiTotal > 0 ? Math.round((anki.hard / ankiTotal) * 100) : 0;
    const pctGood = ankiTotal > 0 ? Math.round((anki.good / ankiTotal) * 100) : 0;
    const pctEasy = ankiTotal > 0 ? Math.round((anki.easy / ankiTotal) * 100) : 0;

    ankiBarAgain.style.width = `${pctAgain}%`;
    ankiBarHard.style.width = `${pctHard}%`;
    ankiBarGood.style.width = `${pctGood}%`;
    ankiBarEasy.style.width = `${pctEasy}%`;

    ankiCountAgain.textContent = anki.again || 0;
    ankiCountHard.textContent = anki.hard || 0;
    ankiCountGood.textContent = anki.good || 0;
    ankiCountEasy.textContent = anki.easy || 0;

    ankiPctAgain.textContent = `${pctAgain}%`;
    ankiPctHard.textContent = `${pctHard}%`;
    ankiPctGood.textContent = `${pctGood}%`;
    ankiPctEasy.textContent = `${pctEasy}%`;

    // Performance by Question Type
    renderPerformanceByType(sess);

    // Timeline Flow (only last 10, newest on the left)
    renderTimelineFlow(sess);

    // Pedagogical Insights
    generatePedagogicalInsight(progressPct, accuracyPct, avgSeconds, anki, answered, history);
}

function renderPerformanceByType(sess) {
    byTypeContainer.innerHTML = '';
    const byType = sess && sess.byType ? sess.byType : {};

    const typeLabels = {
        'multiple_choice': { name: t('card_type_mc'), icon: 'edit_note', color: 'bg-blue-500' },
        'open': { name: t('card_type_open'), icon: 'keyboard', color: 'bg-emerald-500' },
        'open_double': { name: t('card_type_open_double'), icon: 'bolt', color: 'bg-purple-500' },
        'fill': { name: t('card_type_fill'), icon: 'draw', color: 'bg-teal-500' },
        'anki': { name: t('card_type_anki'), icon: 'psychology', color: 'bg-indigo-500' }
    };

    let hasAnyData = false;

    Object.keys(typeLabels).forEach(key => {
        const item = byType[key] || { total: 0, correct: 0 };
        if (item.total > 0) {
            hasAnyData = true;
            const pct = Math.round((item.correct / item.total) * 100);
            const info = typeLabels[key];

            const row = document.createElement('div');
            row.className = 'space-y-1.5';
            row.innerHTML = `
                <div class="flex items-center justify-between text-xs">
                    <span class="font-medium text-gray-700 flex items-center gap-1.5">
                        <span class="material-symbols-rounded text-sm">${info.icon}</span>
                        <span>${info.name}</span>
                    </span>
                    <span class="font-bold text-gray-900">${pct}% <span class="text-gray-400 font-normal">(${item.correct}/${item.total})</span></span>
                </div>
                <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div class="${info.color} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
            `;
            byTypeContainer.appendChild(row);
        }
    });

    if (!hasAnyData) {
        byTypeContainer.innerHTML = `
            <p class="text-xs text-gray-400 italic py-2">
                Nenhum dado por formato registrado nesta sessão ainda.
            </p>
        `;
    }
}

function renderPaceAndEstimate(sess, gameState, avgSeconds, poolRemaining, accuracyRate = 1) {
    if (!paceEstimateTime) return;

    const log = sess && sess.answersLog ? sess.answersLog : [];

    // Fastest and slowest card (excluding cards taking > 90s as breaks)
    if (log.length > 0) {
        const times = log.map(e => e.timeSeconds).filter(t => typeof t === 'number' && !isNaN(t));
        const validTimes = times.filter(t => t <= 90);
        const effectiveTimes = validTimes.length > 0 ? validTimes : times;

        const correctEntries = log.filter(e => e.isCorrect && typeof e.timeSeconds === 'number');
        const validCorrectEntries = correctEntries.filter(e => e.timeSeconds <= 90);
        const effectiveCorrect = validCorrectEntries.length > 0 ? validCorrectEntries : correctEntries;

        const minTime = effectiveCorrect.length > 0 
            ? Math.min(...effectiveCorrect.map(e => e.timeSeconds))
            : Math.min(...effectiveTimes);
        const maxTime = Math.max(...effectiveTimes);

        if (paceFastestCard) paceFastestCard.textContent = `${minTime}s`;
        if (paceSlowestCard) paceSlowestCard.textContent = `${maxTime}s`;
    } else {
        if (paceFastestCard) paceFastestCard.textContent = '--';
        if (paceSlowestCard) paceSlowestCard.textContent = '--';
    }

    // Remaining time estimate
    const allQuestionsCount = gameState.allQuestions ? gameState.allQuestions.length : 0;
    if (poolRemaining === 0 && allQuestionsCount > 0) {
        if (paceEstimateTime) {
            paceEstimateTime.textContent = t('pace_completed');
            paceEstimateTime.removeAttribute('title');
        }
        if (paceEstimateSub) {
            paceEstimateSub.textContent = t('all_cards_answered');
            paceEstimateSub.removeAttribute('title');
        }
        if (paceEstimateBadge) {
            paceEstimateBadge.textContent = t('pace_100_cleared');
            paceEstimateBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
            paceEstimateBadge.removeAttribute('title');
        }
    } else if (poolRemaining > 0 && avgSeconds > 0) {
        let accRate = typeof accuracyRate === 'number' && !isNaN(accuracyRate) ? accuracyRate : 1;
        if (accuracyRate === undefined && sess) {
            const a = sess.cardsAnswered || 0;
            const c = sess.correctCount || 0;
            accRate = a > 0 ? c / a : 1;
        }

        // Mantém a taxa de erro constante: cada tentativa tem probabilidade accRate de concluir/graduar o card.
        // O piso de 0.15 (15%) evita divisões por zero ou estimativas infinitas caso o usuário tenha errado os primeiros cards.
        const effectiveAccuracy = Math.max(0.15, Math.min(1.0, accRate));
        const expectedAttempts = poolRemaining / effectiveAccuracy;
        const estSeconds = Math.round(expectedAttempts * avgSeconds);

        const hours = Math.floor(estSeconds / 3600);
        const mins = Math.floor((estSeconds % 3600) / 60);
        const secs = estSeconds % 60;
        let timeStr = '';
        if (hours > 0) {
            timeStr = `~${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim();
        } else if (mins > 0) {
            timeStr = `~${mins} min ${secs > 0 ? `${secs}s` : ''}`.trim();
        } else {
            timeStr = `~${secs}s`;
        }

        const totalAttempts = Math.round(expectedAttempts);
        const errPercent = Math.round((1 - effectiveAccuracy) * 100);
        const tooltip = errPercent > 0
            ? t('forecast_with_errors', { err: errPercent, attempts: totalAttempts, avg: avgSeconds })
            : t('forecast_clean', { avg: avgSeconds });

        if (paceEstimateTime) {
            paceEstimateTime.textContent = timeStr;
            paceEstimateTime.title = tooltip;
        }
        if (paceEstimateSub) {
            const remTxt = t('pace_remaining_cards', { count: poolRemaining, suffix: poolRemaining > 1 ? 's' : '', suffix_pl: poolRemaining > 1 ? 's' : '' });
            paceEstimateSub.textContent = totalAttempts > poolRemaining
                ? `${remTxt}${t('attempts_suffix', { attempts: totalAttempts })}`
                : remTxt;
            paceEstimateSub.title = tooltip;
        }
        if (paceEstimateBadge) {
            paceEstimateBadge.textContent = t('pace_badge_label', { sec: avgSeconds });
            paceEstimateBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700';
            paceEstimateBadge.title = tooltip;
        }
    } else {
        if (paceEstimateTime) {
            paceEstimateTime.textContent = '--';
            paceEstimateTime.removeAttribute('title');
        }
        if (paceEstimateSub) {
            paceEstimateSub.textContent = t('pace_start_hint');
            paceEstimateSub.removeAttribute('title');
        }
        if (paceEstimateBadge) {
            paceEstimateBadge.textContent = t('waiting_for_data');
            paceEstimateBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600';
            paceEstimateBadge.removeAttribute('title');
        }
    }
}

function renderDeckMastery(progressPct, accuracyPct, currentStreak, completedCards, totalCards) {
    if (!masteryScore) return;

    if (totalCards === 0) {
        masteryScore.textContent = '0 pts';
        if (masteryProgressBar) masteryProgressBar.style.width = '0%';
        if (masteryLevelBadge) {
            masteryLevelBadge.textContent = t('no_data');
            masteryLevelBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600';
        }
        if (masteryDescription) masteryDescription.textContent = t('no_cards_in_deck');
        return;
    }

    // 40% progress in deck, 45% accuracy, 15% streak bonus (clamped)
    const streakBonus = Math.min(15, (currentStreak || 0) * 1.5);
    const calculatedScore = Math.round((progressPct * 0.40) + (accuracyPct * 0.45) + streakBonus);
    const score = Math.max(0, Math.min(100, calculatedScore));

    masteryScore.textContent = `${score} pts`;
    if (masteryProgressBar) masteryProgressBar.style.width = `${score}%`;

    let badgeText = t('mastery_initiating');
    let badgeClass = 'bg-amber-100 text-amber-800';
    let desc = t('mastery_initiating_desc');

    if (score >= 85) {
        badgeText = t('mastery_master');
        badgeClass = 'bg-purple-100 text-purple-700';
        desc = t('mastery_master_desc');
    } else if (score >= 65) {
        badgeText = t('mastery_advanced');
        badgeClass = 'bg-emerald-100 text-emerald-700';
        desc = t('mastery_advanced_desc');
    } else if (score >= 40) {
        badgeText = t('mastery_in_progress');
        badgeClass = 'bg-blue-100 text-blue-700';
        desc = t('mastery_in_progress_desc');
    }

    if (masteryLevelBadge) {
        masteryLevelBadge.textContent = badgeText;
        masteryLevelBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`;
    }
    if (masteryDescription) {
        masteryDescription.textContent = desc;
    }
}

function renderHighlightsStats(gameState) {
    if (!highlightsSummaryText) return;

    const cards = gameState.allQuestions || [];
    let markedCardsCount = 0;
    let totalHighlightsCount = 0;
    let yellowCount = 0;
    let greenCount = 0;
    let blueCount = 0;
    let purpleCount = 0;

    cards.forEach(q => {
        const text = `${q.description || ''} ${q.answer || ''}`;
        const yellowMatches = text.match(/card-hl-yellow/g) || [];
        const greenMatches = text.match(/card-hl-green/g) || [];
        const blueMatches = text.match(/card-hl-blue/g) || [];
        const purpleMatches = text.match(/card-hl-purple/g) || [];

        const totalCardMarks = yellowMatches.length + greenMatches.length + blueMatches.length + purpleMatches.length;
        if (totalCardMarks > 0) {
            markedCardsCount++;
            totalHighlightsCount += totalCardMarks;
            yellowCount += yellowMatches.length;
            greenCount += greenMatches.length;
            blueCount += blueMatches.length;
            purpleCount += purpleMatches.length;
        }
    });

    if (highlightsTotalBadge) {
        highlightsTotalBadge.textContent = `${markedCardsCount} card${markedCardsCount !== 1 ? 's' : ''}`;
    }
    if (highlightsSummaryText) {
        highlightsSummaryText.textContent = totalHighlightsCount;
    }

    if (hlCountYellow) hlCountYellow.textContent = yellowCount;
    if (hlCountGreen) hlCountGreen.textContent = greenCount;
    if (hlCountBlue) hlCountBlue.textContent = blueCount;
    if (hlCountPurple) hlCountPurple.textContent = purpleCount;
}

let showAllTimelineCards = false;

function renderTimelineFlow(sess) {
    timelineStrip.innerHTML = '';
    const log = sess && sess.answersLog ? sess.answersLog : [];

    if (log.length === 0) {
        timelineStrip.innerHTML = `<p class="text-xs text-gray-400 italic py-2">${t('no_cards_answered_session')}</p>`;
        if (timelineCounterBadge) {
            timelineCounterBadge.innerHTML = `<span>${t('timeline_most_recent_10')}</span>`;
        }
        return;
    }

    const totalAnswered = log.length;
    // Show either all cards or last 10 answers, with the most recent on the left
    const displayedEntries = showAllTimelineCards ? log.slice().reverse() : log.slice(-10).reverse();

    if (timelineCounterBadge) {
        timelineCounterBadge.style.cursor = 'pointer';
        timelineCounterBadge.title = showAllTimelineCards ? t('timeline_click_last_10') : t('timeline_click_see_all');
        if (showAllTimelineCards) {
            timelineCounterBadge.innerHTML = `<span>&larr; ${t('timeline_all_cards', { total: totalAnswered })} <span class="underline font-normal opacity-80 ml-1">${t('timeline_see_10')}</span></span>`;
        } else {
            timelineCounterBadge.innerHTML = totalAnswered > 10
                ? `<span>&larr; ${t('timeline_10_of_total', { total: totalAnswered })} <span class="underline font-normal opacity-80 ml-1">${t('timeline_see_all')}</span></span>`
                : `<span>&larr; ${t('timeline_recent_round', { total: totalAnswered })}</span>`;
        }
    }

    displayedEntries.forEach((entry, reverseIdx) => {
        const originalCardNum = totalAnswered - reverseIdx;
        const isLatest = reverseIdx === 0;

        const dot = document.createElement('div');
        const isOk = entry.isCorrect;
        const isAiCorrected = entry.rating === 'ai_corrected';
        const isAnkiHard = entry.rating === 'hard';
        const isAnkiEasy = entry.rating === 'easy';

        let badgeColor = isOk ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white';
        let label = isOk ? '<span class="material-symbols-rounded text-sm">check</span>' : '<span class="material-symbols-rounded text-sm">close</span>';
        if (isAiCorrected) {
            badgeColor = 'bg-amber-400 text-amber-950';
            label = '<span class="material-symbols-rounded text-sm">auto_awesome</span>';
        } else if (isAnkiHard) {
            badgeColor = 'bg-orange-500 text-white';
            label = '<span class="material-symbols-rounded text-sm">bolt</span>';
        } else if (isAnkiEasy) {
            badgeColor = 'bg-blue-500 text-white';
            label = '<span class="material-symbols-rounded text-sm">star</span>';
        }

        const ringEffect = isLatest 
            ? 'ring-2 ring-blue-500 ring-offset-2' 
            : '';

        const safeQuestion = escapeHtml(entry.question || '');
        const safeRating = escapeHtml(entry.rating || '');
        const safeUserAnswer = escapeHtml(entry.userAnswer || '');
        const safeAiExplanation = escapeHtml(entry.aiExplanation || '');
        const safeStatus = isAiCorrected ? t('ai_corrected') : safeRating;
        const recentLabel = isLatest ? t('timeline_last_answered') : t('timeline_nth_recent', { n: reverseIdx + 1 });

        dot.className = `flex-shrink-0 w-8 h-8 rounded-xl ${badgeColor} ${ringEffect} flex items-center justify-center font-bold text-xs cursor-pointer shadow-sm hover:scale-110 transition-transform relative group`;
        dot.innerHTML = `
            ${label}
            ${isLatest ? `<span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white animate-pulse" title="${escapeHtml(t('timeline_most_recent_10'))}"></span>` : ''}
            <!-- Tooltip -->
            <div class="hidden group-hover:block absolute bottom-full mb-2 z-30 p-2.5 bg-gray-900/95 text-white text-[11px] rounded-xl shadow-xl w-56 text-left backdrop-blur-sm pointer-events-none -left-20">
                <div class="flex items-center justify-between mb-1 pb-1 border-b border-gray-700">
                    <span class="font-bold text-gray-200">#${originalCardNum}</span>
                    <span class="text-[10px] font-semibold ${isLatest ? 'text-blue-400' : 'text-gray-400'}">
                        ${recentLabel}
                    </span>
                </div>
                <p class="text-gray-200 truncate mb-1" title="${safeQuestion}">${safeQuestion}</p>
                <div class="flex items-center justify-between text-gray-400 text-[10px]">
                    <span>${t('time_label')}: <b>${entry.timeSeconds}s</b></span>
                    <span>${t('status_label')}: <b>${safeStatus}</b></span>
                </div>
                ${safeUserAnswer ? `<p class="text-blue-300 text-[10px] truncate mt-1 pt-1 border-t border-gray-800">${t('typed_label')}: ${safeUserAnswer}</p>` : ''}
                ${safeAiExplanation ? `<p class="text-amber-300 text-[10px] line-clamp-2 mt-1 pt-1 border-t border-gray-800" title="${safeAiExplanation}">IA: ${safeAiExplanation}</p>` : ''}
            </div>
        `;
        timelineStrip.appendChild(dot);
    });
}

function generatePedagogicalInsight(progressPct, accuracyPct, avgSeconds, anki, answered, history) {
    if (!insightTitle || !insightText) return;
    if (answered === 0) {
        insightTitle.textContent = t('session_in_progress');
        insightText.textContent = t('session_in_progress_desc');
        return;
    }

    let comparisonText = '';
    if (history && history.length > 0) {
        const lastSess = history[0];
        const lastAcc = lastSess.accuracy !== undefined ? lastSess.accuracy : 0;
        const diff = accuracyPct - lastAcc;
        if (diff > 0) {
            comparisonText = t('comparison_performance_better', { diff, lastAcc });
        } else if (diff < 0) {
            comparisonText = t('comparison_lower', { diff: Math.abs(diff), lastAcc });
        } else {
            comparisonText = t('comparison_stable', { lastAcc });
        }
    }

    if (accuracyPct >= 85) {
        insightTitle.textContent = t('high_retention_title');
        insightText.textContent = t('high_retention_desc', { accuracy: accuracyPct, avg: avgSeconds, comparison: comparisonText });
    } else if (accuracyPct >= 70) {
        insightTitle.textContent = t('good_progress_title');
        insightText.textContent = t('good_progress_desc', { accuracy: accuracyPct, comparison: comparisonText });
    } else {
        insightTitle.textContent = t('spaced_rep_recommended_title');
        insightText.textContent = t('spaced_rep_recommended_desc', { accuracy: accuracyPct, comparison: comparisonText });
    }
}

// ==================== SEÇÃO DE INTELIGÊNCIA ARTIFICIAL ====================

function renderTopicItem(t, idx, topicsList = []) {
    const isAnswered = t.answeredCount > 0;
    const acc = t.accuracy;

    let badgeClass = 'bg-gray-100 text-gray-600';
    let badgeText = 'Pendente';
    let barColor = 'bg-gray-300';
    let barWidth = '0%';

    if (isAnswered) {
        barWidth = `${acc}%`;
        const answeredTopics = Array.isArray(topicsList) ? topicsList.filter(item => item.answeredCount > 0) : [];
        const isBestAnswered = answeredTopics.length > 0 && answeredTopics[answeredTopics.length - 1] === t;
        const isWorstAnswered = answeredTopics.length > 0 && answeredTopics[0] === t;

        if (acc >= 80) {
            badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
            badgeText = isBestAnswered ? t('best_subject') : t('high_retention');
            barColor = 'bg-emerald-500';
        } else if (acc >= 60) {
            badgeClass = 'bg-blue-100 text-blue-700 border border-blue-200';
            badgeText = (isWorstAnswered && answeredTopics.length > 1) ? t('attention_review') : t('stable_status');
            barColor = 'bg-blue-500';
        } else {
            badgeClass = 'bg-red-100 text-red-700 border border-red-200';
            badgeText = isWorstAnswered ? t('attention_review') : t('attention_review');
            barColor = 'bg-red-500';
        }
    }

    const safeTopic = escapeHtml(t.topic || t('general_topic'));

    return `
        <div class="p-3.5 rounded-xl bg-gray-50/80 border border-gray-200/70 transition hover:border-purple-300 shadow-xs">
            <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0 flex-1">
                    <h4 class="text-xs sm:text-sm font-bold text-gray-900 truncate" title="${safeTopic}">
                        ${safeTopic}
                    </h4>
                    <p class="text-[11px] text-gray-500">
                        ${t.cardsCount} ${t.cardsCount !== 1 ? t('cards_unit') : t('card_unit_singular')} ${isAnswered ? `• ${t.correctCount}/${t.answeredCount} ${t('correct_plural')}` : `• ${t('not_answered_round')}`}
                    </p>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}">
                        ${badgeText}
                    </span>
                    <span class="text-xs font-extrabold text-gray-800">
                        ${isAnswered ? `${acc}%` : '--'}
                    </span>
                </div>
            </div>
            <!-- Progress / Retention Bar -->
            <div class="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden shadow-inner">
                <div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${barWidth}"></div>
            </div>
        </div>
    `;
}

function renderSubjectItem(s, idx, totalSubjects) {
    const acc = s.accuracy;
    let badgeClass = 'bg-blue-100 text-blue-700 border border-blue-200';
    let badgeText = t('stable_status');
    let barColor = 'bg-blue-500';

    if (idx === 0 && s.totalAnswered > 0) {
        badgeClass = 'bg-purple-100 text-purple-700 border border-purple-200';
        badgeText = t('best_subject');
        barColor = 'bg-purple-600';
    } else if (idx === totalSubjects - 1 && totalSubjects > 1 && acc < 70 && s.totalAnswered > 0) {
        badgeClass = 'bg-amber-100 text-amber-800 border border-amber-200';
        badgeText = t('recommended_focus');
        barColor = 'bg-amber-500';
    } else if (acc >= 80) {
        badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
        badgeText = t('high_retention');
        barColor = 'bg-emerald-500';
    }

    const safeSubject = escapeHtml(s.subject || t('general_topic'));
    const safeDeckNames = escapeHtml(s.decks.join(', '));

    return `
        <div class="p-3.5 rounded-xl bg-gray-50/80 border border-gray-200/70 transition hover:border-purple-300 shadow-xs">
            <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0 flex-1">
                    <h4 class="text-xs sm:text-sm font-bold text-gray-900 truncate" title="${safeSubject}">
                        ${safeSubject}
                    </h4>
                    <p class="text-[11px] text-gray-500 truncate max-w-[200px]" title="${safeDeckNames}">
                        ${s.decks.length} ${s.decks.length !== 1 ? t('decks_unit') : t('deck_unit_singular')}: ${safeDeckNames}
                    </p>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}">
                        ${badgeText}
                    </span>
                    <span class="text-xs font-extrabold text-gray-800">
                        ${s.totalAnswered > 0 ? `${acc}%` : '--'}
                    </span>
                </div>
            </div>
            <!-- Accuracy Bar -->
            <div class="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden shadow-inner">
                <div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${s.totalAnswered > 0 ? acc : 0}%"></div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-gray-400 mt-1.5">
                <span>${s.totalCorrect}/${s.totalAnswered} acertos</span>
                <span>${s.totalSessions} sessõe${s.totalSessions !== 1 ? 's' : 'ão'}</span>
            </div>
        </div>
    `;
}

function renderHistorySubjectsSection(subjectsStats) {
    if (!aiHistorySubjectsSection) return;
    if (!subjectsStats || subjectsStats.length === 0) {
        aiHistorySubjectsSection.innerHTML = '';
        return;
    }

    const subjectsHtml = subjectsStats.map((s, idx) => renderSubjectItem(s, idx, subjectsStats.length)).join('');

    aiHistorySubjectsSection.innerHTML = `
        <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-rounded text-base align-middle text-purple-600">menu_book</span>
                    <div>
                        <h2 class="font-bold text-base text-gray-900">Desempenho por Matérias Globais (IA)</h2>
                        <p class="text-xs text-gray-500">Baralhos agrupados em disciplinas com base no histórico</p>
                    </div>
                </div>
                <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                    ${subjectsStats.length} matéria${subjectsStats.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${subjectsHtml}
            </div>
        </div>
    `;
}

function renderAiDashboard(currentDeckTitle, subjectsStats, topicsStats, gameState, statsData) {
    if (!aiStatsSection) return;

    const safeDeckTitle = escapeHtml(currentDeckTitle || t('deck_default_title'));

    const topicsHtml = topicsStats.length > 0
        ? topicsStats.map((t, idx) => renderTopicItem(t, idx, topicsStats)).join('')
        : `<p class="text-xs text-gray-400 italic py-4 text-center">${t('no_topics_classified')}</p>`;

    const subjectsHtml = subjectsStats.length > 0
        ? subjectsStats.map((s, idx) => renderSubjectItem(s, idx, subjectsStats.length)).join('')
        : `<p class="text-xs text-gray-400 italic py-4 text-center">${t('no_subjects_classified')}</p>`;

    aiStatsSection.innerHTML = `
        <div class="space-y-4">
            <!-- Header Bar -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-transparent p-4 rounded-2xl border border-purple-200/70">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-sm font-bold text-gray-900">${t('ai_categorization_title')}</h2>
                        </div>
                        <p class="text-xs text-gray-500">${t('ai_categorization_desc')}</p>
                    </div>
                </div>

                <div class="flex items-center gap-2 self-end sm:self-auto">
                    <button id="btn-refresh-ai-stats" class="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 transition shadow-xs flex items-center gap-1.5" title="${t('recalculate_ai_cat_tooltip')}">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>${t('recategorize_with_ai')}</span>
                    </button>
                </div>
            </div>

            <!-- 2-Column Responsive Panels -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                <!-- Panel 1: Assuntos Dentro do Baralho Atual -->
                <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                            <div>
                                <h3 class="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                                    <span class="material-symbols-rounded text-base text-blue-600">topic</span> ${t('topics_of_this_deck')}
                                </h3>
                                <p class="text-[11px] text-gray-500 truncate max-w-[200px]" title="${safeDeckTitle}">
                                    ${safeDeckTitle}
                                </p>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                <span class="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-md" title="${t('worst_to_best_tooltip')}">
                                    ${t('worst_to_best_label')}
                                </span>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                    ${topicsStats.length} ${topicsStats.length !== 1 ? t('topics_unit_plural') : t('topic_unit_singular')}
                                </span>
                            </div>
                        </div>

                        <div class="space-y-2.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1" id="ai-topics-list">
                            ${topicsHtml}
                        </div>
                    </div>
                </div>

                <!-- Panel 2: Matérias Globais (Visão de Todos os Baralhos) -->
                <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                            <div>
                                <h3 class="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                                    <span class="material-symbols-rounded text-base text-purple-600">menu_book</span> ${t('performance_by_subject')}
                                </h3>
                            </div>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                ${subjectsStats.length} ${subjectsStats.length !== 1 ? t('subjects_unit_plural') : t('subject_unit_singular')}
                            </span>
                        </div>

                        <div class="space-y-2.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1" id="ai-subjects-list">
                            ${subjectsHtml}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;

    document.getElementById('btn-refresh-ai-stats')?.addEventListener('click', () => {
        if (!isUserPro()) {
            openProModal();
            return;
        }
        triggerAiCategorization(gameState, statsData);
    });

    // Also update Tab 2 Subjects section if present
    if (aiHistorySubjectsSection) {
        renderHistorySubjectsSection(subjectsStats);
    }
}

function renderAiSection(gameState, statsData, isLiveUpdate = false, sessionToUse = null) {
    if (!aiStatsSection) return;

    const currentDeckTitle = gameState.deckTitle || (localStorage.getItem('flashcardsActiveMode') === 'notebook' ? 'Caderno' : (localStorage.getItem('flashcardsActiveMode') === 'exam' ? 'Semana de Provas' : 'Flashcards'));
    const categories = getStoredAiCategories();
    const activeSession = sessionToUse || (statsData.currentSession && statsData.currentSession.cardsAnswered > 0 ? statsData.currentSession : (statsData.history && statsData.history[0])) || statsData.currentSession || null;

    // Check if the deck/cards are already categorized (either in JSON cards or in stored categories)
    const alreadyCategorized = isDeckCategorized({
        allQuestions: gameState.allQuestions || [],
        currentDeckTitle,
        categories
    });

    // If ALREADY CATEGORIZED: render the dashboard immediately!
    if (alreadyCategorized) {
        const { subjectsStats, topicsStats } = computeAiStats({
            categories,
            currentDeckTitle,
            allQuestions: gameState.allQuestions || [],
            currentSession: activeSession,
            history: statsData.history
        });

        renderAiDashboard(currentDeckTitle, subjectsStats, topicsStats, gameState, statsData);
        return;
    }

    // IF USER IS NOT PRO: Display Paywalled UI
    if (!isUserPro()) {
        aiStatsSection.innerHTML = `
            <div id="paywalled-stats-ai-card" class="is-paywalled bg-gradient-to-b from-purple-500/5 via-blue-500/5 to-transparent p-5 sm:p-6 rounded-2xl border border-purple-200/80 shadow-sm relative overflow-hidden cursor-pointer group">
                <div class="paywall-badge-pill">
                    <img src="../assets/img/paywall.svg" alt="Pro"><span>PRO</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200/80">
                                <span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                Gemini Flash-Lite
                            </span>
                            <span class="text-xs text-gray-400 font-medium">Categorização Semântica</span>
                        </div>
                        <h2 class="text-base sm:text-lg font-bold text-gray-900">Desempenho por Matérias & Assuntos (IA)</h2>
                        <p class="text-xs text-gray-600 max-w-xl leading-relaxed">
                            Recurso exclusivo Flashcards Pro: categorize seus baralhos e obtenha diagnósticos avançados de retenção com inteligência artificial.
                        </p>
                    </div>

                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button id="btn-paywall-stats-ai" class="m3-btn-expressive m3-btn-filled px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shadow-md">
                            <img src="../assets/img/paywall.svg" class="w-3.5 h-3.5" alt="Pro">
                            <span>Desbloquear com Pro</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('paywalled-stats-ai-card')?.addEventListener('click', () => {
            openProModal();
        });
        if (aiHistorySubjectsSection) aiHistorySubjectsSection.innerHTML = '';
        return;
    }

    // Case 2: Loading State
    if (isAiLoading) {
        return;
    }

    if (isLiveUpdate) return;

    // Case 3: Deck not yet categorized, Pro user -> Show Categorize Button
    aiStatsSection.innerHTML = `
        <div class="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-transparent p-5 sm:p-6 rounded-2xl border border-purple-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                        <span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                        Gemini Flash-Lite
                    </span>
                    <span class="text-xs text-gray-500 font-medium">Categorização Semântica</span>
                </div>
                <h2 class="text-base sm:text-lg font-bold text-gray-900">Categorizar Baralho com IA</h2>
                <p class="text-xs text-gray-600 max-w-xl">
                    Classifique os cards de "<b>${escapeHtml(currentDeckTitle)}</b>" em tópicos e matérias para análise de retenção. A categorização é permanente e salva no seu navegador.
                </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <button id="btn-generate-ai-stats"
                    class="px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.98] transition shadow-md flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Categorizar com IA</span>
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-generate-ai-stats')?.addEventListener('click', () => {
        triggerAiCategorization(gameState, statsData);
    });

    if (aiHistorySubjectsSection) aiHistorySubjectsSection.innerHTML = '';
}

async function triggerAiCategorization(gameState, statsData) {
    if (!isUserPro()) {
        openProModal();
        return;
    }

    isAiLoading = true;
    if (aiStatsSection) {
        aiStatsSection.innerHTML = `
            <div class="bg-white p-8 rounded-2xl border border-purple-200 shadow-sm flex flex-col items-center justify-center text-center space-y-3 py-10">
                <div class="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                <div class="space-y-1">
                    <h3 class="text-sm font-bold text-gray-900">Analisando Baralhos e Assuntos com Gemini Flash-Lite...</h3>
                    <p class="text-xs text-gray-500 max-w-md">
                        Categorizando seus baralhos em matérias amplas e mapeando os tópicos específicos dos cards com o menor número possível de categorias.
                    </p>
                </div>
            </div>
        `;
    }

    try {
        const activeMode = localStorage.getItem('flashcardsActiveMode') || 'normal';
        const currentDeckTitle = gameState.deckTitle || (activeMode === 'notebook' ? 'Caderno' : (activeMode === 'exam' ? 'Semana de Provas' : 'Flashcards'));
        const historyDeckTitles = (statsData.history || []).map(s => s.deckTitle).filter(Boolean);
        const deckTitles = Array.from(new Set([currentDeckTitle, ...historyDeckTitles]));
        const cards = (gameState.allQuestions || []).filter(q => q.type !== 'divisor' && q.type !== 'divider' && q.type !== 'note');
        const existingCategories = getStoredAiCategories() || { knownSubjects: [], knownTopicsByDeck: {} };

        const categorizedResult = await callGeminiFlashLiteCategorization({
            currentDeckTitle,
            deckTitles,
            cards,
            existingCategories
        });

        // Persist aiTopic directly into the stored allQuestions array
        try {
            const storageKey = getActiveStorageKey();
            const rawStored = localStorage.getItem(storageKey);
            if (rawStored) {
                const parsedStored = JSON.parse(rawStored);
                if (parsedStored.allQuestions) {
                    const sigMap = categorizedResult.updatedCategories?.cardTopicsBySignature || {};
                    const deckSubj = categorizedResult.updatedCategories?.deckSubjects?.[currentDeckTitle];
                    parsedStored.allQuestions.forEach(q => {
                        const sig = getCardSignature(q);
                        if (sig && sigMap[sig]) {
                            q.aiTopic = sigMap[sig];
                            q.topic = sigMap[sig];
                        }
                        if (deckSubj) {
                            q.aiSubject = deckSubj;
                            q.subject = deckSubj;
                        }
                    });
                    localStorage.setItem(storageKey, JSON.stringify(parsedStored));
                    gameState.allQuestions = parsedStored.allQuestions;
                }
            }
        } catch (e) {
            console.warn("Erro ao persistir aiTopic nos cards do jogo:", e);
        }

        isAiLoading = false;
        showStatsPill("Estatísticas de IA geradas e salvas com sucesso!", true);
        renderAiSection(gameState, statsData);

    } catch (err) {
        console.error("Erro na categorização IA:", err);
        isAiLoading = false;
        if (!aiStatsSection) return;

        aiStatsSection.innerHTML = `
            <div class="bg-red-50 border border-red-200 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-rounded text-base text-red-600 align-middle">warning</span>
                        <h3 class="text-sm font-bold text-red-800">Não foi possível gerar as estatísticas com IA</h3>
                    </div>
                    <p id="ai-stats-error-text" class="text-xs text-red-700 max-w-lg"></p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button id="btn-retry-ai" class="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition shadow-sm">
                        Tentar Novamente
                    </button>
                </div>
            </div>
        `;
        const errTextEl = document.getElementById('ai-stats-error-text');
        if (errTextEl) {
            errTextEl.textContent = (err && err.message) ? err.message : 'Verifique sua conexão ou se seu plano Flashcards Pro está ativo.';
        }

        document.getElementById('btn-retry-ai')?.addEventListener('click', () => {
            triggerAiCategorization(gameState, statsData);
        });
    }
}

// --- CALENDÁRIO DE ATIVIDADE (HEATMAP) & STREAK FREEZE ---
function formatCellTitle(day) {
    const [y, m, d] = day.dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formatted = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
    if (day.isFrozen) {
        return `${formatted}: ❄️ Streak protegido pelo congelador`;
    }
    if (day.count > 0) {
        return `${formatted}: ${day.count} ${day.count === 1 ? 'card resolvido' : 'cards resolvidos'}`;
    }
    return `${formatted}: 0 cards`;
}

function renderActivityHeatmap(statsData) {
    if (!activityHeatmap) return;

    const streakData = getDailyStreak();
    const streakVal = Number(streakData.streak) || 0;
    const freezesAvail = typeof streakData.freezesAvailable === 'number' ? streakData.freezesAvailable : 1;
    const frozenDatesSet = new Set(streakData.frozenDates || []);

    // 1. Atualiza badge de sequência diária no cabeçalho
    if (heatmapStreakVal) {
        heatmapStreakVal.textContent = `${streakVal} ${streakVal === 1 ? 'dia' : 'dias'}`;
    }

    // 2. Atualiza status de Streak Freeze no cabeçalho
    if (heatmapFreezeStatus) {
        let freezeHtml = `
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl ${freezesAvail > 0 ? 'bg-cyan-50 text-cyan-800 border-cyan-200/90' : 'bg-gray-50 text-gray-600 border-gray-200'} border text-xs font-bold shadow-2xs" title="O Streak Freeze protege sua sequência se você faltar 1 dia. Ganhe +1 proteção a cada 7 dias de streak (máx: 2).">
                <span class="text-sm select-none">❄️</span>
                <span>${freezesAvail}/2 ${freezesAvail === 1 ? 'Proteção ativa' : 'Proteções ativas'}</span>
            </div>
        `;
        if (streakData.streakProtectedByFreeze) {
            freezeHtml += `
                <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold animate-pulse" title="${t('streak_protected_title')}">
                    <span class="material-symbols-rounded text-sm">shield</span>
                    <span>${t('streak_protected_recently')}</span>
                </div>
            `;
        }
        heatmapFreezeStatus.innerHTML = freezeHtml;
    }

    // 3. Obtém o mapa consolidado de resolução diária (Streak History + Histórico de Sessões)
    const activityMap = getHeatmapActivityMap(statsData?.history || [], statsData?.currentSession || null);

    // 4. Configuração da janela temporal: 20 semanas alinhadas pelo domingo
    const TOTAL_WEEKS = 20;
    const now = new Date();
    const todayStr = getTodayDateString(now);
    const dayOfWeek = now.getDay(); // 0 = Domingo, 6 = Sábado

    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startDate.setDate(startDate.getDate() - dayOfWeek - ((TOTAL_WEEKS - 1) * 7));

    const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const DAY_LABELS = ['', 'Seg', '', 'Qua', '', 'Sex', ''];

    const weeks = [];
    let runningDate = new Date(startDate);
    let prevMonth = -1;
    let totalActiveDays = 0;
    let totalPeriodCards = 0;

    for (let w = 0; w < TOTAL_WEEKS; w++) {
        const weekDays = [];
        let monthHeader = null;

        for (let d = 0; d < 7; d++) {
            const dateStr = getTodayDateString(runningDate);
            const m = runningDate.getMonth();

            // Mostra o rótulo do mês na primeira coluna em que o mês surge
            if (d === 0 && m !== prevMonth) {
                monthHeader = MONTH_LABELS[m];
                prevMonth = m;
            }

            const isToday = (dateStr === todayStr);
            const isFuture = (runningDate > now && !isToday);
            const count = Number(activityMap[dateStr]) || 0;
            const isFrozen = frozenDatesSet.has(dateStr);

            if (!isFuture) {
                if (count > 0) {
                    totalActiveDays++;
                    totalPeriodCards += count;
                } else if (isFrozen) {
                    totalActiveDays++;
                }
            }

            weekDays.push({
                dateStr,
                dateObj: new Date(runningDate),
                dayOfWeek: d,
                count,
                isFrozen,
                isToday,
                isFuture
            });

            runningDate.setDate(runningDate.getDate() + 1);
        }

        weeks.push({
            monthHeader,
            days: weekDays
        });
    }

    // 5. Renderização da grade em HTML
    let html = `<div class="flex flex-col gap-1.5 select-none w-full">`;

    // Linha de cabeçalho dos meses
    html += `<div class="flex items-center gap-1 text-[11px] font-semibold text-gray-400 pl-8">`;
    for (let w = 0; w < TOTAL_WEEKS; w++) {
        const mLabel = weeks[w].monthHeader || '';
        html += `<div class="w-4 sm:w-4.5 text-left truncate overflow-visible">${mLabel}</div>`;
    }
    html += `</div>`;

    // Linha principal com rótulos de dias da semana + colunas de semanas
    html += `<div class="flex items-start gap-2">`;

    // Coluna esquerda com os dias da semana (Seg, Qua, Sex)
    html += `<div class="flex flex-col gap-1 text-[10px] text-gray-400 font-medium w-6 text-right pt-0.5">`;
    for (let d = 0; d < 7; d++) {
        html += `<div class="h-4 sm:h-4.5 flex items-center justify-end leading-none">${DAY_LABELS[d] || ''}</div>`;
    }
    html += `</div>`;

    // Colunas de semanas com as células diárias
    html += `<div class="flex gap-1 items-start">`;
    for (let w = 0; w < TOTAL_WEEKS; w++) {
        html += `<div class="flex flex-col gap-1">`;
        for (let d = 0; d < 7; d++) {
            const day = weeks[w].days[d];

            if (day.isFuture) {
                html += `<div class="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-xs opacity-0 pointer-events-none"></div>`;
                continue;
            }

            let colorClasses = 'bg-gray-100 border border-gray-200/50 hover:bg-gray-200';
            let cellContent = '';

            if (day.isFrozen) {
                colorClasses = 'bg-cyan-100 text-cyan-800 border-2 border-cyan-400 font-bold text-[8px] flex items-center justify-center';
                cellContent = '❄️';
            } else if (day.count >= 30) {
                colorClasses = 'bg-emerald-700 border border-emerald-800 text-white';
            } else if (day.count >= 15) {
                colorClasses = 'bg-emerald-500 border border-emerald-600 text-white';
            } else if (day.count >= 5) {
                colorClasses = 'bg-emerald-300 border border-emerald-400 text-emerald-950';
            } else if (day.count >= 1) {
                colorClasses = 'bg-emerald-100 border border-emerald-200/80 text-emerald-800';
            }

            const todayRing = day.isToday ? 'ring-2 ring-blue-500 ring-offset-1 z-1' : '';

            html += `<div 
                class="heatmap-cell w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-xs transition-all duration-150 cursor-pointer hover:scale-130 hover:z-20 ${colorClasses} ${todayRing}"
                data-date="${day.dateStr}"
                data-count="${day.count}"
                data-frozen="${day.isFrozen}"
                data-today="${day.isToday}"
                title="${formatCellTitle(day)}"
            >${cellContent}</div>`;
        }
        html += `</div>`;
    }
    html += `</div>`; // Fim week columns
    html += `</div>`; // Fim grid row
    html += `</div>`; // Fim container

    activityHeatmap.innerHTML = html;

    // 6. Resumo inicial na barra de detalhes
    const daysUnit = totalActiveDays === 1 ? t('active_day_singular') : t('active_days_plural');
    const cardsUnit = totalPeriodCards === 1 ? t('card_reviewed_singular') : t('cards_reviewed_plural');
    const defaultSummary = `<span class="text-gray-500"><span class="material-symbols-rounded text-sm align-middle mr-0.5">bar_chart</span> ${t('heatmap_summary_days', { days: totalActiveDays, daysUnit, cards: totalPeriodCards, cardsUnit })}</span>`;
    if (heatmapHoverInfo) {
        heatmapHoverInfo.innerHTML = defaultSummary;
    }

    // 7. Eventos de hover e clique para inspeção rápida
    const cells = activityHeatmap.querySelectorAll('.heatmap-cell');
    cells.forEach(cell => {
        const dateStr = cell.getAttribute('data-date');
        const count = Number(cell.getAttribute('data-count')) || 0;
        const isFrozen = cell.getAttribute('data-frozen') === 'true';
        const isToday = cell.getAttribute('data-today') === 'true';

        const showDetail = () => {
            if (!heatmapHoverInfo) return;
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const formatted = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const capFormatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

            if (isFrozen) {
                heatmapHoverInfo.innerHTML = `<span class="text-cyan-700 font-bold">❄️ ${capFormatted}</span>: <span class="text-gray-700 font-medium">Streak protegido pelo congelador!</span>`;
            } else if (count > 0) {
                heatmapHoverInfo.innerHTML = `<span class="text-gray-900 font-bold">${capFormatted}</span>: <span class="text-emerald-600 font-extrabold">${count} ${count === 1 ? 'card resolvido' : 'cards resolvidos'}</span>${isToday ? ' <span class="text-xs bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">Hoje</span>' : ''}`;
            } else {
                heatmapHoverInfo.innerHTML = `<span class="text-gray-700 font-medium">${capFormatted}</span>: <span class="text-gray-400">Nenhum card resolvido</span>${isToday ? ' <span class="text-xs bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">Hoje</span>' : ''}`;
            }
        };

        cell.addEventListener('mouseenter', showDetail);
        cell.addEventListener('click', showDetail);
    });

    activityHeatmap.addEventListener('mouseleave', () => {
        if (heatmapHoverInfo) {
            heatmapHoverInfo.innerHTML = defaultSummary;
        }
    });
}

// --- TAB 2: HISTORY ---
function renderHistory(statsData) {
    const history = statsData.history || [];
    historyBadgeCount.textContent = history.length;

    // Render Activity Heatmap & Streak Freeze
    try {
        renderActivityHeatmap(statsData);
    } catch (e) {
        console.error('Error rendering activity heatmap:', e);
    }

    // Summary numbers
    alltimeSessions.textContent = statsData.allTime ? statsData.allTime.totalSessions || history.length : history.length;
    
    const totalSeconds = statsData.allTime ? statsData.allTime.totalTimeSeconds || 0 : 0;
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    alltimeTime.textContent = `${hours}h ${mins}m`;

    alltimeCards.textContent = statsData.allTime ? statsData.allTime.totalCardsAnswered || 0 : 0;
    
    const totalAns = statsData.allTime ? statsData.allTime.totalCardsAnswered || 0 : 0;
    const totalCorr = statsData.allTime ? statsData.allTime.totalCorrect || 0 : 0;
    const histAcc = totalAns > 0 ? Math.round((totalCorr / totalAns) * 100) : 0;
    alltimeAccuracy.textContent = `${histAcc}%`;

    if (alltimeBestStreak) {
        const bestStreak = statsData.allTime ? statsData.allTime.bestStreakAllTime || 0 : 0;
        const valElem = document.getElementById('alltime-best-streak-val');
        if (valElem) {
            valElem.textContent = bestStreak;
        } else {
            alltimeBestStreak.innerHTML = `<span class="material-symbols-rounded text-xl text-amber-500 select-none">local_fire_department</span> <span>${bestStreak}</span>`;
        }
    }

    // Render Accuracy Chart
    try {
        renderAccuracyChart(history);
    } catch (e) {
        console.error('Error rendering accuracy chart:', e);
    }

    // Render Past Sessions List
    historyList.innerHTML = '';
    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p class="text-sm">${t('no_past_sessions')}</p>
                <p class="text-xs mt-1">${t('complete_round_hint')}</p>
            </div>
        `;
        return;
    }

    const currentLang = getCurrentLanguage();
    history.forEach((sess, idx) => {
        const dateStr = new Date(sess.startTime).toLocaleDateString(currentLang, {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        const acc = sess.accuracy !== undefined ? sess.accuracy : 0;
        const accColor = acc >= 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
            acc >= 65 ? 'text-amber-600 bg-amber-50 border-amber-200' :
            'text-red-600 bg-red-50 border-red-200';

        const safeCards = Number(sess.cardsAnswered) || 0;
        const safeDuration = escapeHtml(formatSeconds(sess.durationSeconds));
        const safeStreak = Number(sess.bestStreak) || 0;
        const safeAcc = Number(acc) || 0;
        const safeIdx = Number(history.length - idx) || 0;
        const safeTitle = escapeHtml(sess.deckTitle || 'Flashcards');
        const safeDate = escapeHtml(dateStr);

        const card = document.createElement('div');
        card.className = 'p-3 sm:p-4 rounded-xl border border-gray-200 hover:border-blue-400 transition bg-gray-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';
        card.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    #${safeIdx}
                </div>
                <div class="min-w-0">
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-sm text-gray-900 truncate">${safeTitle}</h3>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-medium ${sess.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}">
                            ${sess.completed ? t('session_completed') : t('session_partial')}
                        </span>
                    </div>
                    <p class="text-xs text-gray-500 mt-0.5">${safeDate} • ${t('duration')}: ${safeDuration} • ${safeCards} ${safeCards === 1 ? t('card_unit_singular') : t('cards_unit')}</p>
                </div>
            </div>

            <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                ${safeStreak > 0 ? `<span class="text-xs text-amber-600 font-semibold flex items-center gap-1"><span class="material-symbols-rounded text-sm text-amber-500 select-none">local_fire_department</span> <span>${safeStreak}</span></span>` : ''}
                <div class="px-3 py-1 rounded-xl border ${accColor} text-sm font-extrabold">
                    ${safeAcc}%
                </div>
            </div>
        `;
        historyList.appendChild(card);
    });
}

function renderAccuracyChart(history) {
    accuracyChartContainer.innerHTML = '';
    if (!history || history.length === 0) {
        accuracyChartContainer.innerHTML = `<p class="text-xs text-gray-400 italic m-auto">${t('no_session_history_chart')}</p>`;
        chartTrendBadge.classList.add('hidden');
        return;
    }

    // Sort from most recent to oldest (newest session first on the left, max 12)
    const chartData = [...history]
        .sort((a, b) => (b.startTime || b.endTime || 0) - (a.startTime || a.endTime || 0))
        .slice(0, 12);

    if (chartData.length >= 2) {
        const recent = chartData[0].accuracy || 0;
        const older = chartData[chartData.length - 1].accuracy || 0;
        const diff = recent - older;
        const trendIcon = diff >= 0 ? 'trending_up' : 'trending_down';
        const trendPrefix = diff >= 0 ? '+' : '';
        chartTrendBadge.innerHTML = `<span class="material-symbols-rounded text-sm align-middle">${trendIcon}</span> ${trendPrefix}${diff}%`;
        chartTrendBadge.className = `text-xs font-bold px-2.5 py-1 rounded-full ${
            diff >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
        }`;
        chartTrendBadge.classList.remove('hidden');
    } else {
        chartTrendBadge.classList.add('hidden');
    }

    chartData.forEach((item, index) => {
        const acc = item.accuracy !== undefined ? item.accuracy : 0;
        const heightPct = Math.max(8, Math.min(100, acc));

        const barColor = acc >= 80 ? 'bg-emerald-500 hover:bg-emerald-600' :
            acc >= 65 ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600';

        const label = index === 0 ? 'Atual' : `S${index + 1}`;

        const safeAcc = Number(acc) || 0;
        const safeCards = Number(item.cardsAnswered) || 0;
        const safeDuration = escapeHtml(formatSeconds(item.durationSeconds));
        const safeLabel = escapeHtml(label);

        const col = document.createElement('div');
        col.className = 'flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer min-w-[28px]';

        const tooltip = document.createElement('div');
        tooltip.className = 'hidden group-hover:block absolute bottom-full mb-2 z-30 p-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl whitespace-nowrap';
        const tSpan1 = document.createElement('span');
        tSpan1.className = 'font-bold';
        tSpan1.textContent = `${safeAcc}% de acerto`;
        const tSpan2 = document.createElement('span');
        tSpan2.textContent = `${safeCards} cards • ${safeDuration}`;
        tooltip.append(tSpan1, document.createElement('br'), tSpan2);

        const accSpan = document.createElement('span');
        accSpan.className = 'text-[10px] font-bold text-gray-600 mb-1 opacity-0 group-hover:opacity-100 transition-opacity';
        accSpan.textContent = `${safeAcc}%`;

        const bar = document.createElement('div');
        bar.className = `w-full max-w-[36px] ${barColor} rounded-t-lg transition-all duration-500`;
        bar.style.height = `${heightPct}%`;

        const lblSpan = document.createElement('span');
        lblSpan.className = 'text-[9px] text-gray-400 mt-1 font-mono';
        lblSpan.textContent = safeLabel;

        col.append(tooltip, accSpan, bar, lblSpan);
        accuracyChartContainer.appendChild(col);
    });
}

// --- TAB 3: STRUGGLING CARDS ---
function renderStrugglingCards(sess) {
    strugglingList.innerHTML = '';
    const strugglingObj = sess && sess.strugglingCards ? sess.strugglingCards : {};
    const ignored = (sess && sess.ignoredStrugglingKeys) || [];

    // Filter out ignored cards
    const validEntries = Object.entries(strugglingObj).filter(([key]) => !ignored.includes(key));

    // Sort in descending order of incorrectCount (cards with most errors first)
    validEntries.sort((a, b) => (b[1].incorrectCount || 0) - (a[1].incorrectCount || 0));

    // Leave strictly the top 20 cards with most errors
    const top20Entries = validEntries.slice(0, 20);

    strugglingBadgeCount.textContent = top20Entries.length;
    if (top20Entries.length > 0) {
        strugglingBadgeCount.classList.remove('hidden');
        addAllToNotebookBtn.classList.remove('hidden');
    } else {
        strugglingBadgeCount.classList.add('hidden');
        addAllToNotebookBtn.classList.add('hidden');
    }

    if (top20Entries.length === 0) {
        strugglingList.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p class="text-sm font-semibold text-emerald-600 flex items-center justify-center gap-1.5"><span class="material-symbols-rounded text-base text-emerald-500">celebration</span> ${t('no_struggling_cards')}</p>
                <p class="text-xs mt-1">${t('struggling_cards_desc')}</p>
            </div>
        `;
        return;
    }

    top20Entries.forEach(([key, item], idx) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'p-4 rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:border-gray-300 shadow-xs';
        const safeDesc = escapeHtml(item.description || '');
        const safeAns = escapeHtml(item.answer || t('consult_card'));
        const safeRating = escapeHtml(item.lastRating || t('i_missed'));
        const safeType = escapeHtml(item.type || 'open');
        const errCount = Number(item.incorrectCount) || 1;
        const errText = t('errors_label', { count: errCount, s: errCount > 1 ? 's' : '' });

        cardEl.innerHTML = `
            <div class="space-y-1 flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-mono">
                        #${idx + 1}
                    </span>
                    <span class="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                        ${errText}
                    </span>
                    <span class="text-[10px] text-gray-400">
                        ${t('last_rating_label')}: ${safeRating}
                    </span>
                </div>
                <p class="text-sm font-semibold text-gray-800 leading-snug">${safeDesc}</p>
                <p class="text-xs text-emerald-600 font-medium">${t('answer_label')}: ${safeAns}</p>
            </div>
            <div class="flex flex-col items-center sm:items-end gap-1.5 flex-shrink-0 self-end sm:self-center">
                <button class="add-single-notebook-btn w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 text-xs font-semibold transition shadow-xs flex items-center justify-center gap-1"
                    data-desc="${encodeURIComponent(item.description || '')}" data-ans="${encodeURIComponent(item.answer || '')}" data-ans2="${encodeURIComponent(item.answer2 || '')}" data-type="${safeType}" data-topic="${encodeURIComponent(item.aiTopic || '')}" data-subject="${encodeURIComponent(item.aiSubject || '')}">
                    + ${t('notebook_label')}
                </button>
                <button class="ignore-single-struggling-btn text-[11px] font-medium text-gray-400 hover:text-red-500 transition hover:underline px-1 py-0.5"
                    data-key="${encodeURIComponent(key)}">
                    ${t('ignore')}
                </button>
            </div>
        `;
        strugglingList.appendChild(cardEl);
    });

    // Add listener to "+ Caderno" buttons
    document.querySelectorAll('.add-single-notebook-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const desc = decodeURIComponent(btn.dataset.desc);
            const ans = decodeURIComponent(btn.dataset.ans);
            const ans2 = decodeURIComponent(btn.dataset.ans2);
            const type = btn.dataset.type;
            const topic = decodeURIComponent(btn.dataset.topic || '');
            const subject = decodeURIComponent(btn.dataset.subject || '');
            addCardToNotebook({ description: desc, answer: ans, answer2: ans2, type: type, aiTopic: topic, aiSubject: subject });
            btn.innerHTML = `${t('added_singular')} <span class="material-symbols-rounded text-sm align-middle">check</span>`;
            btn.classList.add('bg-emerald-100', 'text-emerald-700');
            btn.disabled = true;
        });
    });

    // Add listener to "Ignorar" buttons
    document.querySelectorAll('.ignore-single-struggling-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cardSig = decodeURIComponent(btn.dataset.key || btn.dataset.cardSig || '');
            ignoreCardFromStruggling(cardSig);
        });
    });
}

function ignoreCardFromStruggling(cardKey) {
    const statsData = getStatsStorage();
    if (statsData.currentSession && statsData.currentSession.strugglingCards) {
        delete statsData.currentSession.strugglingCards[cardKey];
        if (!statsData.currentSession.ignoredStrugglingKeys) {
            statsData.currentSession.ignoredStrugglingKeys = [];
        }
        if (!statsData.currentSession.ignoredStrugglingKeys.includes(cardKey)) {
            statsData.currentSession.ignoredStrugglingKeys.push(cardKey);
        }
        saveStatsStorage(statsData);
        showStatsPill(t('card_removed_from_focus'), true);
        renderStrugglingCards(statsData.currentSession);
    }
}

function addCardToNotebook(card) {
    const sanitizeCard = (c) => {
        if (!c || typeof c !== 'object') return c;
        const copy = { ...c };
        delete copy.isBeingCorrected;
        delete copy._lastUserAnswer;
        delete copy.apiKey;
        delete copy.api_key;
        delete copy.key;
        delete copy.token;
        delete copy.secret;
        delete copy.credential;
        return copy;
    };

    let notebookState = JSON.parse(localStorage.getItem('flashcardsNotebook')) || {
        allQuestions: [], questionsPool: [], score: 0, deckTitle: 'Caderno'
    };

    const cleanCard = sanitizeCard(card);
    const alreadyExists = (notebookState.allQuestions || []).some(q => q.description === cleanCard.description);
    if (!alreadyExists) {
        notebookState.allQuestions.push(cleanCard);
        notebookState.questionsPool.push(cleanCard);
        notebookState.allQuestions = (notebookState.allQuestions || []).map(sanitizeCard);
        notebookState.questionsPool = (notebookState.questionsPool || []).map(sanitizeCard);
        localStorage.setItem('flashcardsNotebook', JSON.stringify(notebookState));
        showStatsPill(t('card_added_toast'), true);
    } else {
        showStatsPill(t('card_already_in_notebook'), true);
    }
}

// ACTION LISTENERS
tabBtnCurrent?.addEventListener('click', () => switchTab('current'));
tabBtnHistory?.addEventListener('click', () => switchTab('history'));
tabBtnStruggling?.addEventListener('click', () => switchTab('struggling'));

timelineCounterBadge?.addEventListener('click', () => {
    showAllTimelineCards = !showAllTimelineCards;
    const statsData = getStatsStorage();
    const currentOrLast = statsData.currentSession || (statsData.history && statsData.history[0]) || null;
    renderTimelineFlow(currentOrLast);
});

addAllToNotebookBtn?.addEventListener('click', () => {
    const statsData = getStatsStorage();
    const sess = statsData.currentSession;
    const strugglingObj = sess && sess.strugglingCards ? sess.strugglingCards : {};
    const ignored = (sess && sess.ignoredStrugglingKeys) || [];

    const validEntries = Object.entries(strugglingObj).filter(([key]) => !ignored.includes(key));
    validEntries.sort((a, b) => (b[1].incorrectCount || 0) - (a[1].incorrectCount || 0));
    const top20Entries = validEntries.slice(0, 20);

    let notebookState = JSON.parse(localStorage.getItem('flashcardsNotebook')) || {
        allQuestions: [], questionsPool: [], score: 0, deckTitle: 'Caderno'
    };
    let addedCount = 0;
    top20Entries.forEach(([key, item]) => {
        if (!notebookState.allQuestions.some(q => q.description === item.description)) {
            notebookState.allQuestions.push({ ...item });
            notebookState.questionsPool.push({ ...item });
            addedCount++;
        }
    });
    if (addedCount > 0) {
        localStorage.setItem('flashcardsNotebook', JSON.stringify(notebookState));
    }

    showStatsPill(`${addedCount} cards adicionados ao Caderno!`, true);
    renderStrugglingCards(statsData.currentSession);
});

clearStatsBtn?.addEventListener('click', () => {
    if (confirm(t('clear_stats_confirm'))) {
        resetAllStats();
        showStatsPill(t('stats_reset_success'), true);
        renderAllStats();
    }
});

exportStatsBtn?.addEventListener('click', () => {
    const data = getStatsStorage();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcards_estatisticas_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showStatsPill(t('report_exported_success'), true);
});

// INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {
    initExploreModal();
    await getApiKeyAsync();
    renderAllStats();
});

window.addEventListener('flashcards:language-change', () => {
    renderAllStats();
});

onAuthChange(() => {
    const gameState = getStoredGameState();
    const statsData = getStatsStorage();
    renderAiSection(gameState, statsData);
});

// REAL-TIME CROSS-TAB AUTO-SYNC (Ultra-lightweight: 0% CPU idle, RAF debounced, background-tab deferred)
const SYNC_STORAGE_KEYS = new Set([
    'flashcards_stats',
    'flashcards_daily_streak',
    'flashcardsSave',
    'flashcardsNotebook',
    'flashcardsExam',
    'flashcardsActiveMode'
]);

let pendingLiveUpdate = false;
let liveUpdateRafId = null;

function scheduleLiveStatsUpdate() {
    if (document.hidden) {
        pendingLiveUpdate = true;
        return;
    }
    if (liveUpdateRafId) {
        cancelAnimationFrame(liveUpdateRafId);
    }
    liveUpdateRafId = requestAnimationFrame(() => {
        liveUpdateRafId = null;
        renderAllStats({ isLiveUpdate: true });
    });
}

window.addEventListener('storage', (event) => {
    // If event.key is null (storage clear) or matches one of our monitored game keys
    if (!event.key || SYNC_STORAGE_KEYS.has(event.key)) {
        scheduleLiveStatsUpdate();
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pendingLiveUpdate) {
        pendingLiveUpdate = false;
        scheduleLiveStatsUpdate();
    }
});

// React to cloud synchronization for Pro users
window.addEventListener('flashcards:sync-updated', () => {
    scheduleLiveStatsUpdate();
});
