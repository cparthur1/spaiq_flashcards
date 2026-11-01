/**
 * js/engine/pomodoro.js
 * Módulo de controle do temporizador Pomodoro para combate à fadiga cognitiva
 * e promoção de micro-pausas estratégicas na consolidação da memória.
 */

import { triggerHaptic, isSoundEnabled } from './effects.js';
import { debouncedSyncSlotsToCloud } from '../slot-manager.js';
import { t } from '../i18n.js';

const POMODORO_STORAGE_KEY = 'flashcards_pomodoro_enabled';
const POMODORO_SETTINGS_KEY = 'flashcards_pomodoro_settings';

const DEFAULT_SETTINGS = {
    focusMinutes: 25,
    breakMinutes: 5
};

let isRunning = false;
let currentMode = 'study'; // 'study' | 'break' | 'idle'
let remainingSeconds = DEFAULT_SETTINGS.focusMinutes * 60;
let timerInterval = null;

// DOM Elements cache
let pomodoroSwitchEl = null;
let pomodoroConfigTriggerEl = null;
let pomodoroSubtitleEl = null;

let pomodoroModalEl = null;
let pomodoroFocusSelectEl = null;
let pomodoroBreakSelectEl = null;
let pomodoroSaveSettingsBtnEl = null;
let closePomodoroModalBtnEl = null;

let pomodoroPromptDialogEl = null;
let pomodoroAcceptBreakBtnEl = null;
let pomodoroSnoozeBreakBtnEl = null;

let pomodoroBreakOverlayEl = null;
let pomodoroBreakCountdownEl = null;
let pomodoroResumeBtnEl = null;

export function getPomodoroSettings() {
    try {
        const raw = localStorage.getItem(POMODORO_SETTINGS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                focusMinutes: Number(parsed.focusMinutes) || DEFAULT_SETTINGS.focusMinutes,
                breakMinutes: Number(parsed.breakMinutes) || DEFAULT_SETTINGS.breakMinutes
            };
        }
    } catch (e) {
        console.warn("[Pomodoro] Erro ao ler configurações do Pomodoro:", e);
    }
    return { ...DEFAULT_SETTINGS };
}

export function savePomodoroSettings(settings) {
    try {
        const focus = Math.max(5, Math.min(90, Number(settings.focusMinutes) || DEFAULT_SETTINGS.focusMinutes));
        const rest = Math.max(1, Math.min(30, Number(settings.breakMinutes) || DEFAULT_SETTINGS.breakMinutes));
        const payload = { focusMinutes: focus, breakMinutes: rest };
        localStorage.setItem(POMODORO_SETTINGS_KEY, JSON.stringify(payload));
        console.log("[Pomodoro] Novas configurações salvas:", payload);
        debouncedSyncSlotsToCloud();
        return payload;
    } catch (e) {
        console.warn("[Pomodoro] Erro ao salvar configurações do Pomodoro:", e);
        return { ...DEFAULT_SETTINGS };
    }
}

export function isPomodoroEnabled() {
    return localStorage.getItem(POMODORO_STORAGE_KEY) === 'true';
}

export function setPomodoroEnabled(enabled) {
    localStorage.setItem(POMODORO_STORAGE_KEY, enabled ? 'true' : 'false');
    console.log("[Pomodoro] Status atualizado:", enabled ? "ATIVADO" : "DESATIVADO");
    
    if (enabled) {
        startStudyCycle();
        triggerHaptic('tap');
    } else {
        stopPomodoro();
    }
    updatePomodoroUI();
    debouncedSyncSlotsToCloud();
}

function startStudyCycle() {
    clearInterval(timerInterval);
    const settings = getPomodoroSettings();
    currentMode = 'study';
    remainingSeconds = settings.focusMinutes * 60;
    isRunning = true;

    hideBreakNotification();
    hideBreakOverlay();

    console.log(`[Pomodoro] Ciclo de foco iniciado: ${settings.focusMinutes} minutos.`);

    timerInterval = setInterval(() => {
        if (!isPomodoroEnabled()) {
            stopPomodoro();
            return;
        }

        if (currentMode === 'study') {
            remainingSeconds--;
            if (remainingSeconds <= 0) {
                clearInterval(timerInterval);
                onStudyTimeElapsed();
            }
        }
    }, 1000);
}

function onStudyTimeElapsed() {
    console.log("[Pomodoro] Tempo de foco concluído. Solicitando micro-pausa ao usuário.");
    triggerHaptic('scorePulse');
    showBreakNotification();
}

export function showBreakNotification() {
    if (!pomodoroPromptDialogEl) pomodoroPromptDialogEl = document.getElementById('pomodoro-prompt-dialog');
    if (pomodoroPromptDialogEl) {
        pomodoroPromptDialogEl.classList.remove('hidden');
        requestAnimationFrame(() => {
            pomodoroPromptDialogEl.classList.remove('-translate-y-24', 'opacity-0');
            pomodoroPromptDialogEl.classList.add('translate-y-0', 'opacity-100');
        });
        triggerHaptic('tap');
    }
}

export function hideBreakNotification() {
    if (!pomodoroPromptDialogEl) pomodoroPromptDialogEl = document.getElementById('pomodoro-prompt-dialog');
    if (pomodoroPromptDialogEl) {
        pomodoroPromptDialogEl.classList.remove('translate-y-0', 'opacity-100');
        pomodoroPromptDialogEl.classList.add('-translate-y-24', 'opacity-0');
        setTimeout(() => {
            if (pomodoroPromptDialogEl && pomodoroPromptDialogEl.classList.contains('-translate-y-24')) {
                pomodoroPromptDialogEl.classList.add('hidden');
            }
        }, 500);
    }
}

export function acceptBreak() {
    hideBreakNotification();
    const settings = getPomodoroSettings();
    currentMode = 'break';
    remainingSeconds = settings.breakMinutes * 60;
    isRunning = true;

    console.log(`[Pomodoro] Micro-pausa aceita: ${settings.breakMinutes} minutos.`);
    triggerHaptic('tap');

    showBreakOverlay();
    updateBreakCountdownDisplay();

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!isPomodoroEnabled()) {
            stopPomodoro();
            return;
        }

        if (currentMode === 'break') {
            remainingSeconds--;
            updateBreakCountdownDisplay();

            if (remainingSeconds <= 0) {
                clearInterval(timerInterval);
                onBreakTimeElapsed();
            }
        }
    }, 1000);
}

export function snoozeBreak(minutes = 5) {
    hideBreakNotification();
    currentMode = 'study';
    remainingSeconds = minutes * 60;
    console.log(`[Pomodoro] Pausa adiada por ${minutes} minutos.`);
    triggerHaptic('tap');

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!isPomodoroEnabled()) {
            stopPomodoro();
            return;
        }
        remainingSeconds--;
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            onStudyTimeElapsed();
        }
    }, 1000);
}

function playPomodoroChime() {
    if (!isSoundEnabled()) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        const now = ctx.currentTime;
        // Acorde harmônico ascendente suave: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            gain.gain.setValueAtTime(0, now + idx * 0.12);
            gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.12 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.65);
        });
    } catch (e) {
        // Ignora silenciosamente se autoplay estiver restrito pelo navegador
    }
}

function onBreakTimeElapsed() {
    console.log("[Pomodoro] Pausa finalizada. Cérebro pronto para retomar.");
    triggerHaptic('timerDone');
    playPomodoroChime();

    if (!pomodoroBreakOverlayEl) pomodoroBreakOverlayEl = document.getElementById('pomodoro-break-overlay');
    if (pomodoroBreakOverlayEl) {
        pomodoroBreakOverlayEl.classList.remove('pomodoro-state-running');
        pomodoroBreakOverlayEl.classList.add('pomodoro-state-done');

        const iconEl = document.getElementById('pomodoro-break-icon');
        if (iconEl) iconEl.textContent = 'rocket_launch';

        const statusTextEl = document.getElementById('pomodoro-break-status-text');
        if (statusTextEl) statusTextEl.textContent = '';

        const titleEl = document.getElementById('pomodoro-break-title');
        if (titleEl) titleEl.textContent = t('pomodoro_break_over_title');

        const descEl = document.getElementById('pomodoro-break-desc');
        if (descEl) {
            descEl.textContent = '';
            descEl.classList.add('hidden');
        }

        const timerLabelEl = document.getElementById('pomodoro-break-timer-label');
        if (timerLabelEl) timerLabelEl.textContent = t('pomodoro_break_timer_label');

        if (!pomodoroBreakCountdownEl) pomodoroBreakCountdownEl = document.getElementById('pomodoro-break-countdown');
        if (pomodoroBreakCountdownEl) {
            pomodoroBreakCountdownEl.textContent = '00:00';
        }

        const resumeIconEl = document.getElementById('pomodoro-resume-icon');
        if (resumeIconEl) resumeIconEl.textContent = 'play_arrow';

        const resumeTextEl = document.getElementById('pomodoro-resume-text');
        if (resumeTextEl) resumeTextEl.textContent = t('pomodoro_continue');
    }
}

export function finishBreak() {
    console.log("[Pomodoro] Retomando estudo pós-pausa.");
    hideBreakOverlay();
    triggerHaptic('tap');
    startStudyCycle();
}

function showBreakOverlay() {
    if (!pomodoroBreakOverlayEl) pomodoroBreakOverlayEl = document.getElementById('pomodoro-break-overlay');
    if (pomodoroBreakOverlayEl) {
        pomodoroBreakOverlayEl.classList.remove('pomodoro-state-done');
        pomodoroBreakOverlayEl.classList.add('pomodoro-state-running');

        const iconEl = document.getElementById('pomodoro-break-icon');
        if (iconEl) iconEl.textContent = 'self_improvement';

        const statusTextEl = document.getElementById('pomodoro-break-status-text');
        if (statusTextEl) statusTextEl.textContent = '';

        const titleEl = document.getElementById('pomodoro-break-title');
        if (titleEl) titleEl.textContent = t('pomodoro_break_title');

        const descEl = document.getElementById('pomodoro-break-desc');
        if (descEl) {
            descEl.textContent = t('pomodoro_break_desc');
            descEl.classList.remove('hidden');
        }

        const timerLabelEl = document.getElementById('pomodoro-break-timer-label');
        if (timerLabelEl) timerLabelEl.textContent = t('pomodoro_break_timer_label');

        const resumeIconEl = document.getElementById('pomodoro-resume-icon');
        if (resumeIconEl) resumeIconEl.textContent = 'fast_forward';

        const resumeTextEl = document.getElementById('pomodoro-resume-text');
        if (resumeTextEl) resumeTextEl.textContent = t('pomodoro_skip_break');

        pomodoroBreakOverlayEl.classList.remove('hidden');
    }
}

function hideBreakOverlay() {
    if (!pomodoroBreakOverlayEl) pomodoroBreakOverlayEl = document.getElementById('pomodoro-break-overlay');
    if (pomodoroBreakOverlayEl) {
        pomodoroBreakOverlayEl.classList.add('hidden');
        pomodoroBreakOverlayEl.classList.remove('pomodoro-state-done', 'pomodoro-state-running');
    }
}

function updateBreakCountdownDisplay() {
    if (!pomodoroBreakCountdownEl) pomodoroBreakCountdownEl = document.getElementById('pomodoro-break-countdown');
    if (pomodoroBreakCountdownEl && currentMode === 'break' && remainingSeconds > 0) {
        const mins = Math.floor(Math.max(0, remainingSeconds) / 60);
        const secs = Math.max(0, remainingSeconds) % 60;
        pomodoroBreakCountdownEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
}

export function stopPomodoro() {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    currentMode = 'idle';
    hideBreakNotification();
    hideBreakOverlay();
}

export function openPomodoroSettingsModal() {
    if (!pomodoroModalEl) pomodoroModalEl = document.getElementById('pomodoro-modal');
    if (!pomodoroModalEl) return;

    const settings = getPomodoroSettings();
    if (pomodoroFocusSelectEl) pomodoroFocusSelectEl.value = String(settings.focusMinutes);
    if (pomodoroBreakSelectEl) pomodoroBreakSelectEl.value = String(settings.breakMinutes);

    pomodoroModalEl.classList.remove('hidden');
}

export function closePomodoroSettingsModal() {
    if (!pomodoroModalEl) pomodoroModalEl = document.getElementById('pomodoro-modal');
    if (pomodoroModalEl) {
        pomodoroModalEl.classList.add('hidden');
    }
}

export function updatePomodoroUI() {
    if (!pomodoroSwitchEl) pomodoroSwitchEl = document.getElementById('pomodoro-switch');
    if (!pomodoroSubtitleEl) pomodoroSubtitleEl = document.getElementById('pomodoro-subtitle');

    const settingPomodoroSwitch = document.getElementById('setting-pomodoro-switch');
    const settingFocusSelect = document.getElementById('setting-pomodoro-focus-select');
    const settingBreakSelect = document.getElementById('setting-pomodoro-break-select');

    const enabled = isPomodoroEnabled();
    const settings = getPomodoroSettings();

    if (pomodoroSwitchEl) {
        pomodoroSwitchEl.selected = enabled;
    }
    if (settingPomodoroSwitch) {
        settingPomodoroSwitch.selected = enabled;
    }

    if (settingFocusSelect) {
        settingFocusSelect.value = String(settings.focusMinutes);
    }
    if (settingBreakSelect) {
        settingBreakSelect.value = String(settings.breakMinutes);
    }

    if (pomodoroSubtitleEl) {
        pomodoroSubtitleEl.textContent = `${settings.focusMinutes} min ${t('focus_time').toLowerCase()} • ${settings.breakMinutes} min ${t('micro_break').toLowerCase()}`;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('flashcards:sync-updated', () => {
        updatePomodoroUI();
        const enabled = isPomodoroEnabled();
        if (enabled && !isRunning) {
            startStudyCycle();
        } else if (!enabled && isRunning) {
            stopPomodoro();
        }
    });

    window.addEventListener('flashcards:language-change', () => {
        updatePomodoroUI();
    });
}

export function initPomodoro() {
    pomodoroSwitchEl = document.getElementById('pomodoro-switch');
    pomodoroConfigTriggerEl = document.getElementById('pomodoro-config-trigger');
    pomodoroSubtitleEl = document.getElementById('pomodoro-subtitle');

    pomodoroModalEl = document.getElementById('pomodoro-modal');
    pomodoroFocusSelectEl = document.getElementById('pomodoro-focus-select');
    pomodoroBreakSelectEl = document.getElementById('pomodoro-break-select');
    pomodoroSaveSettingsBtnEl = document.getElementById('save-pomodoro-settings-btn');
    closePomodoroModalBtnEl = document.getElementById('close-pomodoro-modal-btn');

    pomodoroPromptDialogEl = document.getElementById('pomodoro-prompt-dialog');
    pomodoroAcceptBreakBtnEl = document.getElementById('pomodoro-accept-break-btn');
    pomodoroSnoozeBreakBtnEl = document.getElementById('pomodoro-snooze-break-btn');

    pomodoroBreakOverlayEl = document.getElementById('pomodoro-break-overlay');
    pomodoroBreakCountdownEl = document.getElementById('pomodoro-break-countdown');
    pomodoroResumeBtnEl = document.getElementById('pomodoro-resume-btn');

    // Switch listener
    if (pomodoroSwitchEl) {
        pomodoroSwitchEl.addEventListener('change', (e) => {
            const checked = Boolean(pomodoroSwitchEl.selected);
            setPomodoroEnabled(checked);
        });
    }

    // Modal settings switch listener
    const settingPomodoroSwitch = document.getElementById('setting-pomodoro-switch');
    if (settingPomodoroSwitch) {
        settingPomodoroSwitch.addEventListener('change', () => {
            const checked = Boolean(settingPomodoroSwitch.selected);
            setPomodoroEnabled(checked);
        });
    }

    // Modal select listeners
    const settingFocusSelect = document.getElementById('setting-pomodoro-focus-select');
    const settingBreakSelect = document.getElementById('setting-pomodoro-break-select');
    const handleSettingDurationChange = () => {
        const focusMinutes = Number(settingFocusSelect?.value || 25);
        const breakMinutes = Number(settingBreakSelect?.value || 5);
        savePomodoroSettings({ focusMinutes, breakMinutes });
        updatePomodoroUI();
        if (isPomodoroEnabled()) {
            startStudyCycle();
        }
    };
    if (settingFocusSelect) settingFocusSelect.addEventListener('change', handleSettingDurationChange);
    if (settingBreakSelect) settingBreakSelect.addEventListener('change', handleSettingDurationChange);

    // Config trigger (click row or title to open popup)
    if (pomodoroConfigTriggerEl) {
        pomodoroConfigTriggerEl.addEventListener('click', (e) => {
            e.preventDefault();
            openPomodoroSettingsModal();
        });
    }

    // Close settings modal
    if (closePomodoroModalBtnEl) {
        closePomodoroModalBtnEl.addEventListener('click', () => {
            closePomodoroSettingsModal();
        });
    }

    // Save settings
    if (pomodoroSaveSettingsBtnEl) {
        pomodoroSaveSettingsBtnEl.addEventListener('click', (e) => {
            e.preventDefault();
            const focusMinutes = Number(pomodoroFocusSelectEl?.value || 25);
            const breakMinutes = Number(pomodoroBreakSelectEl?.value || 5);
            savePomodoroSettings({ focusMinutes, breakMinutes });
            updatePomodoroUI();
            closePomodoroSettingsModal();
            triggerHaptic('tap');

            // Se o pomodoro estiver ativo, reinicia o ciclo com as novas durações
            if (isPomodoroEnabled()) {
                startStudyCycle();
            }
        });
    }

    // Accept Break button
    if (pomodoroAcceptBreakBtnEl) {
        pomodoroAcceptBreakBtnEl.addEventListener('click', () => {
            acceptBreak();
        });
    }

    // Snooze Break button
    if (pomodoroSnoozeBreakBtnEl) {
        pomodoroSnoozeBreakBtnEl.addEventListener('click', () => {
            snoozeBreak(5);
        });
    }

    // Resume Study from Break screen
    if (pomodoroResumeBtnEl) {
        pomodoroResumeBtnEl.addEventListener('click', () => {
            finishBreak();
        });
    }

    updatePomodoroUI();

    // Se já estava ativado em sessão anterior, inicia o ciclo
    if (isPomodoroEnabled()) {
        startStudyCycle();
    }
}

/**
 * Retorna o status atual do Pomodoro para visualização no cabeçalho ou em estatísticas.
 * @returns {{ enabled: boolean, isRunning: boolean, currentMode: string, remainingSeconds: number, formattedTime: string }}
 */
export function getPomodoroStatus() {
    const enabled = isPomodoroEnabled();
    const mins = Math.max(0, Math.floor(remainingSeconds / 60));
    const secs = Math.max(0, remainingSeconds % 60);
    const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return {
        enabled,
        isRunning,
        currentMode,
        remainingSeconds,
        formattedTime
    };
}
