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
let shockwaveContainerElem = null;
let questionCardElem = null;

let isCanvasLoopRunning = false;
let canvasAnimationId = null;
let balls = [];
let celebrationParticles = [];

export function initEffects(options = {}) {
    canvasElement = options.canvas || document.getElementById('background-canvas');
    if (canvasElement) {
        canvasCtx = canvasElement.getContext('2d');
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
    }
}

function startCanvasLoop() {
    if (!isCanvasLoopRunning) {
        isCanvasLoopRunning = true;
        canvasAnimationId = requestAnimationFrame(animate);
    }
}

export function clearBalls() {
    balls = [];
    celebrationParticles = [];
    if (canvasAnimationId) {
        cancelAnimationFrame(canvasAnimationId);
        canvasAnimationId = null;
    }
    isCanvasLoopRunning = false;
    if (canvasCtx && canvasElement) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
}

export function launchCelebrationParticles(count = 140) {
    if (!isAnimationsEnabled()) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
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
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    balls.forEach(ball => {
        if (ball.y + ball.radius > canvasElement.height) {
            ball.y = canvasElement.height - ball.radius;
        }
        canvasCtx.beginPath();
        canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        canvasCtx.fillStyle = ball.color;
        canvasCtx.fill();
        canvasCtx.closePath();
    });
    if (balls.some(b => !b.isStatic) || celebrationParticles.length > 0) {
        startCanvasLoop();
    }
}

export function createBall(isCorrect) {
    if (!canvasElement) canvasElement = document.getElementById('background-canvas');
    if (!canvasElement) return -1;
    if (!canvasCtx) canvasCtx = canvasElement.getContext('2d');
    if (!canvasCtx) return -1;

    const noMotion = !isAnimationsEnabled() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const radius = Math.random() * 5 + 8;
    const x = Math.random() * (canvasElement.width - radius * 2) + radius;
    const y = noMotion ? (canvasElement.height - radius) : -radius;
    const color = isCorrect ? 'rgba(74, 222, 128, 0.8)' : 'rgba(239, 68, 68, 0.8)';
    balls.push({ x, y, radius, color, dy: 0, isStatic: noMotion });

    if (noMotion) {
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, radius, 0, Math.PI * 2);
        canvasCtx.fillStyle = color;
        canvasCtx.fill();
        canvasCtx.closePath();
    } else {
        startCanvasLoop();
    }
    return balls.length - 1;
}

export function animate() {
    if (!canvasElement || !canvasCtx) return;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    let anyMoving = false;

    // Renderiza e atualiza partículas de comemoração
    if (celebrationParticles.length > 0) {
        anyMoving = true;
        for (let i = celebrationParticles.length - 1; i >= 0; i--) {
            const p = celebrationParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.wobble += p.wobbleSpeed;
            p.x += Math.sin(p.wobble) * 1.6;
            p.rotation += p.rotationSpeed;
            p.vy += 0.05; // gravidade
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
            ball.dy += 0.2;
            ball.y += ball.dy;
            if (ball.y + ball.radius >= canvasElement.height) {
                ball.y = canvasElement.height - ball.radius;
                ball.isStatic = true;
                continue;
            }
            let isTouchingStatic = false;
            for (let j = 0; j < balls.length; j++) {
                if (i === j || !balls[j].isStatic) continue;
                const otherBall = balls[j];
                const dx = ball.x - otherBall.x;
                const dy = ball.y - otherBall.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = ball.radius + otherBall.radius;
                if (distance < minDistance && ball.y < otherBall.y) {
                    isTouchingStatic = true;
                    if (!ball.firstContactTime) ball.firstContactTime = Date.now();
                    ball.dy *= -0.3;
                    const overlap = minDistance - distance;
                    const angle = Math.atan2(dy, dx);
                    ball.x += Math.cos(angle) * overlap;
                    ball.y += Math.sin(angle) * overlap;
                    ball.x += dx * 0.08;
                    break;
                }
            }
            if (isTouchingStatic && ball.firstContactTime) {
                if (Date.now() - ball.firstContactTime > 5000) {
                    ball.isStatic = true;
                }
            }
        }
    }
    balls.forEach(ball => {
        canvasCtx.beginPath();
        canvasCtx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        canvasCtx.fillStyle = ball.color;
        canvasCtx.fill();
        canvasCtx.closePath();
    });
    if (balls.length > 300) balls.shift();

    if (anyMoving) {
        canvasAnimationId = requestAnimationFrame(animate);
    } else {
        isCanvasLoopRunning = false;
        canvasAnimationId = null;
    }
}
