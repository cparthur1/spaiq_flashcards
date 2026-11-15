/**
 * js/engine/effects.js
 * Módulo de efeitos visuais e sensoriais: vibração tátil (Haptic API),
 * efeitos sonoros (Web Audio API), controle de acessibilidade/movimento reduzido,
 * física de bolinhas no Canvas de fundo, confetes de comemoração e ondas de choque (Shockwave).
 */

import { debouncedSyncSlotsToCloud } from '../slot-manager.js';
import { t } from '../i18n.js';

// --- HAPTIC FEEDBACK (VIBRATION API) ---
const HAPTIC_STORAGE_KEY = 'flashcardsHapticEnabled';

const HAPTIC_PATTERNS = {
    tap: [10],
    correct: [12],
    scorePulse: [15],
    cardFlip: [10],
    cardToBack: [12, 20, 12, 20, 12, 20, 12, 20, 12, 20, 12, 210, 42],
    wrong: [20, 50, 20],
    shake: [20, 50, 20],
    fillPop: [18],
    streakUp: [15, 35, 25],
    streakReset: [25],
    timerDone: [120, 80, 120, 80, 260, 120, 400]
};

export function isHapticEnabled() {
    return localStorage.getItem(HAPTIC_STORAGE_KEY) !== 'false';
}

export function setHapticEnabled(enabled) {
    localStorage.setItem(HAPTIC_STORAGE_KEY, enabled ? 'true' : 'false');
    updateHapticUI();
    if (enabled) {
        triggerHaptic('tap');
    }
    debouncedSyncSlotsToCloud();
}

export function triggerHaptic(type) {
    if (!isHapticEnabled()) return;
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    try {
        if (type === 'stop') {
            navigator.vibrate(0);
            return;
        }
        const pattern = Array.isArray(type) ? type : (HAPTIC_PATTERNS[type] || [12]);
        navigator.vibrate(pattern);
    } catch (e) {
        // Ignora silenciosamente se bloqueado por políticas do navegador
    }
}

export function updateHapticUI() {
    const switches = [
        document.getElementById('haptic-switch'),
        document.getElementById('setting-haptic-switch')
    ];
    const hapticStatusBadge = document.getElementById('haptic-status-badge');
    const hasVibrationSupport = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    const enabled = isHapticEnabled();

    switches.forEach(sw => {
        if (!sw) return;
        if (!hasVibrationSupport) {
            sw.disabled = true;
            sw.selected = false;
            sw.title = t('vibration_unavailable_device');
        } else {
            sw.disabled = false;
            sw.selected = enabled;
            sw.title = enabled ? t('vibration_enabled') : t('vibration_disabled');
        }
    });

    if (hapticStatusBadge) {
        if (!hasVibrationSupport) {
            hapticStatusBadge.textContent = t('unavailable_status');
            hapticStatusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500';
            return;
        }

        if (enabled) {
            hapticStatusBadge.textContent = t('active_status_fem');
            hapticStatusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
        } else {
            hapticStatusBadge.textContent = t('disabled_status_fem');
            hapticStatusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500';
        }
    }
}

// --- SOUND FEEDBACK (WEB AUDIO API) ---
const SOUND_STORAGE_KEY = 'flashcardsSoundEnabled';
let audioCtxInstance = null;

export function isSoundEnabled() {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== 'false';
}

function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioCtxInstance) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            audioCtxInstance = new AudioCtx();
        }
    }
    if (audioCtxInstance && audioCtxInstance.state === 'suspended') {
        audioCtxInstance.resume().catch(() => {});
    }
    return audioCtxInstance;
}

export function playFeedbackSound(type) {
    if (!isSoundEnabled()) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        if (type === 'correct') {
            // Dois tons harmônicos ascendentes suaves: C5 (523Hz), E5 (659Hz)
            const notes = [523.25, 659.25];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                gain.gain.setValueAtTime(0, now + idx * 0.08);
                gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.28);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + 0.3);
            });
        } else if (type === 'wrong') {
            // Tom suave e discreto descendente
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
        } else if (type === 'confirm' || type === 'toggle') {
            // Sinal doce para confirmação de ativação do som
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(880.00, now + 0.09); // A5
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'flip') {
            // Micro-click suave tipo folhear página
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(620, now + 0.04);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.06);
        } else if (type === 'counter_tick') {
            // Micro-tick sutil para o contador rolante
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(680, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.02);
            gain.gain.setValueAtTime(0.025, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.03);
        } else if (type === 'rank_s') {
            // Fanfarra triunfante arpegiada para Rank S: C5, E5, G5, C6, E6
            const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                gain.gain.setValueAtTime(0, now + idx * 0.07);
                gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.07 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.45);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.07);
                osc.stop(now + idx * 0.07 + 0.5);
            });
        } else if (type === 'rank_a') {
            // Tríade brilhante para Rank A: C5, G5, C6
            const notes = [523.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);
                gain.gain.setValueAtTime(0, now + idx * 0.08);
                gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.4);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + 0.42);
            });
        } else if (type === 'rank_b') {
            // Duo positivo para Rank B: D5, A5
            const notes = [587.33, 880.00];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.09);
                gain.gain.setValueAtTime(0, now + idx * 0.09);
                gain.gain.linearRampToValueAtTime(0.10, now + idx * 0.09 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.09);
                osc.stop(now + idx * 0.09 + 0.38);
            });
        } else if (type === 'rank_c') {
            // Chime encorajador para Rank C: C5, F5
            const notes = [523.25, 698.46];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.10);
                gain.gain.setValueAtTime(0, now + idx * 0.10);
                gain.gain.linearRampToValueAtTime(0.09, now + idx * 0.10 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.10 + 0.32);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.10);
                osc.stop(now + idx * 0.10 + 0.35);
            });
        }
    } catch (e) {
        // Ignora silenciosamente se áudio for bloqueado pelo navegador
    }
}

export function setSoundEnabled(enabled) {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
    updateSoundUI();
    if (enabled) {
        playFeedbackSound('confirm');
    }
    debouncedSyncSlotsToCloud();
}

export function updateSoundUI() {
    const soundSwitch = document.getElementById('setting-sound-switch');
    if (soundSwitch) {
        soundSwitch.selected = isSoundEnabled();
        soundSwitch.title = isSoundEnabled() ? t('sound_effects_enabled_title') : t('sound_effects_disabled_title');
    }
}

// --- ANIMATIONS & MOTION PREFERENCE ---
const ANIMATIONS_STORAGE_KEY = 'flashcardsAnimationsEnabled';

export function isAnimationsEnabled() {
    return localStorage.getItem(ANIMATIONS_STORAGE_KEY) !== 'false';
}

export function applyAnimationsPreference() {
    const enabled = isAnimationsEnabled();
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('reduce-motion', !enabled);
    }
}

export function setAnimationsEnabled(enabled) {
    localStorage.setItem(ANIMATIONS_STORAGE_KEY, enabled ? 'true' : 'false');
    applyAnimationsPreference();
    updateAnimationsUI();
    if (enabled) {
        triggerHaptic('tap');
    }
    debouncedSyncSlotsToCloud();
}

export function updateAnimationsUI() {
    const animSwitch = document.getElementById('setting-animations-switch');
    if (animSwitch) {
        animSwitch.selected = isAnimationsEnabled();
        animSwitch.title = isAnimationsEnabled() ? t('animations_enabled') : t('animations_reduced');
    }
}

export function updateAccessibilityUI() {
    updateHapticUI();
    updateSoundUI();
    updateAnimationsUI();
}

if (typeof window !== 'undefined') {
    window.addEventListener('flashcards:sync-updated', () => {
        applyAnimationsPreference();
        updateAccessibilityUI();
    });
}

// --- CANVAS ANIMATION & VISUAL EFFECTS ---
let canvasElement = null;
let canvasCtx = null;
let staticCanvas = null;
let staticCtx = null;
let shockwaveContainerElem = null;
let questionCardElem = null;

let isCanvasLoopRunning = false;
let canvasAnimationId = null;
let lastFrameTime = 0;
let balls = [];
let celebrationParticles = [];

const reducedMotionMediaQuery = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

function isReducedMotionPreferred() {
    return Boolean(reducedMotionMediaQuery && reducedMotionMediaQuery.matches);
}

function ensureStaticCanvas() {
    if (!canvasElement) return false;
    if (!staticCanvas && typeof document !== 'undefined') {
        staticCanvas = document.createElement('canvas');
        staticCtx = staticCanvas.getContext('2d');
    }
    if (!staticCanvas || !staticCtx) return false;
    if (staticCanvas.width !== canvasElement.width || staticCanvas.height !== canvasElement.height) {
        staticCanvas.width = canvasElement.width;
        staticCanvas.height = canvasElement.height;
        rebuildStaticCanvas();
    }
    return true;
}

function drawBallOnStaticCanvas(ball) {
    if (!ensureStaticCanvas() || !ball) return;
    staticCtx.beginPath();
    staticCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    staticCtx.fillStyle = ball.color;
    staticCtx.fill();
}

function rebuildStaticCanvas() {
    if (!staticCanvas || !staticCtx) return;
    staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
    for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.isStatic) {
            staticCtx.beginPath();
            staticCtx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            staticCtx.fillStyle = b.color;
            staticCtx.fill();
        }
    }
}

export function initEffects(options = {}) {
    canvasElement = options.canvas || document.getElementById('background-canvas');
    if (canvasElement) {
        canvasCtx = canvasElement.getContext('2d');
        ensureStaticCanvas();
    }
    shockwaveContainerElem = options.shockwaveContainer || document.getElementById('shockwave-container');
    questionCardElem = options.questionCard || document.getElementById('question-card');

    applyAnimationsPreference();
    updateAccessibilityUI();
}

export function getBalls() {
    return balls;
}

export function setBallColor(index, color) {
    if (balls && balls[index]) {
        balls[index].color = color;
        if (balls[index].isStatic) {
            rebuildStaticCanvas();
            if (!isCanvasLoopRunning) {
                redrawCanvas();
            }
        }
    }
}

export function startCanvasLoop() {
    if (!isCanvasLoopRunning) {
        isCanvasLoopRunning = true;
        lastFrameTime = 0;
        canvasAnimationId = requestAnimationFrame(animate);
    }
}

export function pauseCanvasLoop() {
    if (canvasAnimationId) {
        cancelAnimationFrame(canvasAnimationId);
        canvasAnimationId = null;
    }
    isCanvasLoopRunning = false;
    lastFrameTime = 0;
}

export function resumeCanvasLoop() {
    if (isCanvasLoopRunning) return;
    if (balls.some(b => !b.isStatic) || celebrationParticles.length > 0) {
        startCanvasLoop();
    } else {
        redrawCanvas();
    }
}

export function redrawCanvas() {
    if (!canvasElement || !canvasCtx) return;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (ensureStaticCanvas()) {
        rebuildStaticCanvas();
        if (staticCanvas.width > 0 && staticCanvas.height > 0) {
            canvasCtx.drawImage(staticCanvas, 0, 0);
        }
        for (let i = 0; i < balls.length; i++) {
            const ball = balls[i];
            if (!ball.isStatic) {
                canvasCtx.beginPath();
                canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                canvasCtx.fillStyle = ball.color;
                canvasCtx.fill();
            }
        }
    } else {
        balls.forEach(ball => {
            canvasCtx.beginPath();
            canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            canvasCtx.fillStyle = ball.color;
            canvasCtx.fill();
        });
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseCanvasLoop();
        } else {
            resumeCanvasLoop();
        }
    });
}

export function clearBalls() {
    balls = [];
    celebrationParticles = [];
    if (canvasAnimationId) {
        cancelAnimationFrame(canvasAnimationId);
        canvasAnimationId = null;
    }
    isCanvasLoopRunning = false;
    lastFrameTime = 0;
    if (staticCtx && staticCanvas) {
        staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);
    }
    if (canvasCtx && canvasElement) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
}

export function launchCelebrationParticles(count = 140) {
    if (!isAnimationsEnabled()) return;
    if (isReducedMotionPreferred()) return;
    const colors = [
        '#10B981', '#34D399', '#F59E0B', '#FBBF24', 
        '#6366F1', '#818CF8', '#EC4899', '#F43F5E', 
        '#06B6D4', '#3B82F6', '#8B5CF6'
    ];
    const w = canvasElement?.width || window.innerWidth;
    const h = canvasElement?.height || window.innerHeight;
    for (let i = 0; i < count; i++) {
        celebrationParticles.push({
            x: Math.random() * w,
            y: -15 - Math.random() * (h * 0.4),
            vx: (Math.random() - 0.5) * 5,
            vy: Math.random() * 4 + 2,
            size: Math.random() * 8 + 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 8,
            wobble: Math.random() * Math.PI,
            wobbleSpeed: Math.random() * 0.08 + 0.04,
            shape: Math.random() > 0.35 ? 'rect' : 'circle'
        });
    }
    startCanvasLoop();
}

export function cleanShockwaveContainer() {
    const container = shockwaveContainerElem || document.getElementById('shockwave-container');
    if (container) {
        container.innerHTML = '';
    }
}

export function playCompletionShockwave() {
    if (!isAnimationsEnabled()) return;
    const prefersReducedMotion = isReducedMotionPreferred();
    const container = shockwaveContainerElem || document.getElementById('shockwave-container');
    const card = questionCardElem || document.getElementById('question-card');
    if (prefersReducedMotion || !container || !card) return;

    cleanShockwaveContainer();

    card.classList.remove('card-shockwave-pulse');
    void card.offsetWidth;
    card.classList.add('card-shockwave-pulse');
    setTimeout(() => card.classList.remove('card-shockwave-pulse'), 750);

    const rect = card.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);

    const maxDist = Math.hypot(
        Math.max(cx, window.innerWidth - cx),
        Math.max(cy, window.innerHeight - cy)
    ) + 60;

    const diameter = Math.round(maxDist * 2);

    const wave1 = document.createElement('div');
    wave1.className = 'completion-ripple-wave';
    wave1.style.left = `${cx}px`;
    wave1.style.top = `${cy}px`;
    wave1.style.width = `${diameter}px`;
    wave1.style.height = `${diameter}px`;
    wave1.style.background = 'radial-gradient(circle closest-side, rgba(16, 185, 129, 0) 0%, rgba(16, 185, 129, 0.04) 42%, rgba(16, 185, 129, 0.22) 68%, rgba(37, 99, 235, 0.26) 82%, rgba(59, 130, 246, 0.12) 92%, rgba(37, 99, 235, 0) 100%)';
    container.appendChild(wave1);

    const anim1 = wave1.animate([
        { transform: 'translate(-50%, -50%) scale(0.04)', opacity: 0.95, offset: 0, easing: 'cubic-bezier(0.16, 0.92, 0.28, 1.25)' },
        { transform: 'translate(-50%, -50%) scale(0.32)', opacity: 0.92, offset: 0.22, easing: 'cubic-bezier(0.55, -0.28, 0.72, 0.1)' },
        { transform: 'translate(-50%, -50%) scale(0.23)', opacity: 0.86, offset: 0.36, easing: 'cubic-bezier(0.12, 0.45, 0.18, 1)' },
        { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 0, offset: 1.0 }
    ], {
        duration: 1020,
        fill: 'forwards'
    });
    anim1.onfinish = () => wave1.remove();

    setTimeout(() => {
        if (!container) return;
        const wave2 = document.createElement('div');
        wave2.className = 'completion-ripple-wave';
        wave2.style.left = `${cx}px`;
        wave2.style.top = `${cy}px`;
        wave2.style.width = `${diameter}px`;
        wave2.style.height = `${diameter}px`;
        wave2.style.background = 'radial-gradient(circle closest-side, rgba(37, 99, 235, 0) 0%, rgba(37, 99, 235, 0.04) 48%, rgba(37, 99, 235, 0.18) 72%, rgba(16, 185, 129, 0.22) 85%, rgba(16, 185, 129, 0.08) 93%, rgba(16, 185, 129, 0) 100%)';
        container.appendChild(wave2);

        const anim2 = wave2.animate([
            { transform: 'translate(-50%, -50%) scale(0.04)', opacity: 0.88, offset: 0, easing: 'cubic-bezier(0.16, 0.92, 0.28, 1.25)' },
            { transform: 'translate(-50%, -50%) scale(0.28)', opacity: 0.84, offset: 0.22, easing: 'cubic-bezier(0.55, -0.28, 0.72, 0.1)' },
            { transform: 'translate(-50%, -50%) scale(0.20)', opacity: 0.78, offset: 0.36, easing: 'cubic-bezier(0.12, 0.45, 0.18, 1)' },
            { transform: 'translate(-50%, -50%) scale(1.06)', opacity: 0, offset: 1.0 }
        ], {
            duration: 960,
            fill: 'forwards'
        });
        anim2.onfinish = () => wave2.remove();
    }, 90);
}

export function resizeCanvas() {
    if (!canvasElement) canvasElement = document.getElementById('background-canvas');
    if (!canvasElement) return;
    if (!canvasCtx) canvasCtx = canvasElement.getContext('2d');
    if (!canvasCtx) return;

    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    for (let i = 0; i < balls.length; i++) {
        const ball = balls[i];
        if (ball.y + ball.radius > canvasElement.height) {
            ball.y = canvasElement.height - ball.radius;
        }
    }
    ensureStaticCanvas();
    rebuildStaticCanvas();
    redrawCanvas();
    if (balls.some(b => !b.isStatic) || celebrationParticles.length > 0) {
        startCanvasLoop();
    }
}

export function createBall(isCorrect) {
    if (!canvasElement) canvasElement = document.getElementById('background-canvas');
    if (!canvasElement) return -1;
    if (!canvasCtx) canvasCtx = canvasElement.getContext('2d');
    if (!canvasCtx) return -1;

    const noMotion = !isAnimationsEnabled() || isReducedMotionPreferred();
    const radius = Math.random() * 5 + 8;
    const x = Math.random() * (canvasElement.width - radius * 2) + radius;
    const y = noMotion ? (canvasElement.height - radius) : -radius;
    const color = isCorrect ? 'rgba(74, 222, 128, 0.8)' : 'rgba(239, 68, 68, 0.8)';
    const newBall = { x, y, radius, color, dy: 0, isStatic: noMotion };
    balls.push(newBall);

    let shifted = false;
    if (balls.length > 300) {
        balls.shift();
        shifted = true;
    }

    if (noMotion) {
        if (shifted) {
            rebuildStaticCanvas();
        } else {
            drawBallOnStaticCanvas(newBall);
        }
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, radius, 0, Math.PI * 2);
        canvasCtx.fillStyle = color;
        canvasCtx.fill();
    } else {
        if (shifted) {
            rebuildStaticCanvas();
        }
        startCanvasLoop();
    }
    return balls.length - 1;
}

export function animate(timestamp) {
    if (!canvasElement || !canvasCtx) return;
    const nowTs = typeof timestamp === 'number' ? timestamp : performance.now();
    const dt = lastFrameTime > 0 ? Math.min(2.2, Math.max(0.2, (nowTs - lastFrameTime) / 16.6667)) : 1;
    lastFrameTime = nowTs;

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    const hasStaticCache = ensureStaticCanvas();
    if (hasStaticCache && staticCanvas.width > 0 && staticCanvas.height > 0) {
        canvasCtx.drawImage(staticCanvas, 0, 0);
    }

    let anyMoving = false;
    const nowWall = Date.now();

    // Renderiza e atualiza partículas de comemoração
    if (celebrationParticles.length > 0) {
        anyMoving = true;
        for (let i = celebrationParticles.length - 1; i >= 0; i--) {
            const p = celebrationParticles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.wobble += p.wobbleSpeed * dt;
            p.x += Math.sin(p.wobble) * 1.6 * dt;
            p.rotation += p.rotationSpeed * dt;
            p.vy += 0.05 * dt; // gravidade
            if (p.y > canvasElement.height + 25) {
                celebrationParticles.splice(i, 1);
                continue;
            }
            canvasCtx.save();
            canvasCtx.translate(p.x, p.y);
            canvasCtx.rotate((p.rotation * Math.PI) / 180);
            canvasCtx.fillStyle = p.color;
            if (p.shape === 'rect') {
                canvasCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            } else {
                canvasCtx.beginPath();
                canvasCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                canvasCtx.fill();
            }
            canvasCtx.restore();
        }
    }

    for (let i = 0; i < balls.length; i++) {
        const ball = balls[i];
        if (!ball.isStatic) {
            anyMoving = true;
            ball.dy += 0.2 * dt;
            ball.y += ball.dy * dt;
            if (ball.y + ball.radius >= canvasElement.height) {
                ball.y = canvasElement.height - ball.radius;
                ball.isStatic = true;
                ball.dy = 0;
                drawBallOnStaticCanvas(ball);
                canvasCtx.beginPath();
                canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                canvasCtx.fillStyle = ball.color;
                canvasCtx.fill();
                continue;
            }
            let isTouchingStatic = false;
            for (let j = 0; j < balls.length; j++) {
                if (i === j || !balls[j].isStatic) continue;
                const otherBall = balls[j];
                if (ball.y >= otherBall.y) continue;
                const minDistance = ball.radius + otherBall.radius;
                const dy = ball.y - otherBall.y;
                if (dy < -minDistance) continue;
                const dx = ball.x - otherBall.x;
                if (dx > minDistance || dx < -minDistance) continue;

                const distSq = dx * dx + dy * dy;
                if (distSq < minDistance * minDistance) {
                    const distance = Math.sqrt(distSq) || 0.001;
                    isTouchingStatic = true;
                    if (!ball.firstContactTime) ball.firstContactTime = nowWall;
                    ball.dy *= -0.3;
                    const overlap = minDistance - distance;
                    const invDist = 1 / distance;
                    ball.x += (dx * invDist) * overlap;
                    ball.y += (dy * invDist) * overlap;
                    ball.x += dx * 0.08;
                    if (Math.abs(ball.dy) < 0.25) {
                        ball.isStatic = true;
                        ball.dy = 0;
                        drawBallOnStaticCanvas(ball);
                    }
                    break;
                }
            }
            if (!ball.isStatic && isTouchingStatic && ball.firstContactTime) {
                if (nowWall - ball.firstContactTime > 350) {
                    ball.isStatic = true;
                    ball.dy = 0;
                    drawBallOnStaticCanvas(ball);
                }
            }

            canvasCtx.beginPath();
            canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            canvasCtx.fillStyle = ball.color;
            canvasCtx.fill();
        } else if (!hasStaticCache) {
            canvasCtx.beginPath();
            canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            canvasCtx.fillStyle = ball.color;
            canvasCtx.fill();
        }
    }

    if (anyMoving) {
        canvasAnimationId = requestAnimationFrame(animate);
    } else {
        isCanvasLoopRunning = false;
        canvasAnimationId = null;
        lastFrameTime = 0;
    }
}
