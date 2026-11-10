// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/tutorial.js
 * Interactive First-Time Onboarding Tutorial (Navi Fuzzy Soft Light Fairy)
 *
 * Script:
 * A: Spawn and say "Are you new here?"
 * B: When clicked, play tutorial_hello.mp3, move around "create deck" and say
 *    "If you dont have a deck, the best thig to do is to create one"
 * C: Play tutorial_hey.mp3 and say "Here you can create decks in lots of ways, the best to get started is using what you already have"
 * D: Move around "create from materials", play tutorial_listen.mp3 and say
 *    "Click here to upload your school notes, slides, photos, questions... and make them into a deck"
 * E: Play tutorial_hey.mp3 and say "Here you can create cards manually or ask the robot to edit or add new cards. Lets wait for the rock to think and create our first deck"
 * F: Play tutorial_look.mp3, move around "play now" and say "The deck is done! Lets jump to the game"
 * G: Play tutorial_hey.mp3 and say "You can start learning now by answering this fresh cards. Come back everyday to improve memory. You can create as many decks as you want, going back to the beggining"
 * H: Play tutorial_out.mp3, say "Bye!" and despawn
 */

import { t } from './i18n.js';

export const TUTORIAL_COMPLETED_KEY = 'flashcards_tutorial_completed';
export const TUTORIAL_STEP_KEY = 'flashcards_tutorial_step';
export const TUTORIAL_FORCE_REPLAY_KEY = 'flashcards_tutorial_force_replay';

let fairyContainer = null;
let speechBubble = null;
let particleCanvas = null;
let particleCtx = null;
let particles = [];
let animFrameId = null;
let currentAudio = null;
let highlightedElement = null;
let fairyX = 70;
let fairyY = 400;
let isFairyFlying = false;
let isTutorialActive = false;
let stepTimer = null;
let resizeHandler = null;

// Typewriter state
let typewriterTimer = null;
let isTypewriterActive = false;
let currentFullText = '';
let currentActionCallback = null;

// --- CHECK IF USER HAS ALREADY PLAYED ---

export function hasUserPlayedBefore() {
    if (localStorage.getItem(TUTORIAL_COMPLETED_KEY) === 'true') {
        return true;
    }
    // Saved decks or active sessions
    if (localStorage.getItem('flashcardsSave') ||
        localStorage.getItem('flashcardsExam') ||
        localStorage.getItem('flashcardsNotebook')) {
        return true;
    }
    // Active study mode
    if (localStorage.getItem('flashcardsActiveMode')) {
        return true;
    }
    // Tracked study stats or cards reviewed
    const statsRaw = localStorage.getItem('flashcards_stats') || localStorage.getItem('flashcardsStats');
    if (statsRaw) {
        try {
            const parsed = JSON.parse(statsRaw);
            if (parsed && (
                parsed.totalReviewed > 0 ||
                parsed.cardsAnswered > 0 ||
                (Array.isArray(parsed.history) && parsed.history.length > 0) ||
                (parsed.decks && Object.keys(parsed.decks).length > 0)
            )) {
                return true;
            }
        } catch (e) {
            return true;
        }
    }
    // Daily streak records
    const streakRaw = localStorage.getItem('flashcards_daily_streak');
    if (streakRaw) {
        try {
            const parsed = JSON.parse(streakRaw);
            if (parsed && (
                parsed.currentStreak > 0 ||
                parsed.totalDaysStudied > 0 ||
                (parsed.history && Object.keys(parsed.history).length > 0)
            )) {
                return true;
            }
        } catch (e) {
            return true;
        }
    }
    // Slot decks
    const slotsManifest = localStorage.getItem('flashcards_slots_manifest');
    if (slotsManifest) {
        try {
            const parsed = JSON.parse(slotsManifest);
            if (parsed && Array.isArray(parsed.slots) && parsed.slots.length > 0) {
                return true;
            }
        } catch (e) {}
    }
    for (let i = 0; i < 8; i++) {
        if (localStorage.getItem(`flashcards_slot_${i}`)) {
            return true;
        }
    }
    return false;
}

// --- AUDIO CONTROLLER ---

function getAudioUrl(filename) {
    const isSubdir = window.location.pathname.includes('/pages/');
    const prefix = isSubdir ? '../' : '';
    return `${prefix}assets/audio/${filename}`;
}

export function playTutorialSound(filename) {
    try {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
        const audio = new Audio(getAudioUrl(filename));
        currentAudio = audio;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.log('Audio autoplay blocked or paused:', err);
            });
        }
        return audio;
    } catch (e) {
        console.warn('Error playing tutorial audio:', e);
        return null;
    }
}

// --- RADIANT SPARKLE TAIL SYSTEM (Stars & Glowing Stardust) ---

function initParticleCanvas() {
    if (particleCanvas) return;
    particleCanvas = document.createElement('canvas');
    particleCanvas.id = 'tutorial-particle-canvas';
    document.body.appendChild(particleCanvas);
    particleCtx = particleCanvas.getContext('2d');

    resizeHandler = () => {
        if (!particleCanvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        particleCanvas.width = window.innerWidth * dpr;
        particleCanvas.height = window.innerHeight * dpr;
        if (particleCtx) {
            particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    };
    resizeHandler();
    window.addEventListener('resize', resizeHandler, { passive: true });
}

function spawnParticle(x, y, count = 1, isBurst = false) {
    const colors = ['#ffffff', '#bae6fd', '#7dd3fc', '#38bdf8', '#60a5fa', '#fef08a'];
    for (let i = 0; i < count; i++) {
        const isStar = Math.random() < 0.45;
        const angle = isBurst ? Math.random() * Math.PI * 2 : (Math.random() * Math.PI + Math.PI * 0.1);
        const speed = isBurst ? Math.random() * 4.5 + 1.8 : Math.random() * 1.6 + 0.3;
        particles.push({
            x: x + (Math.random() - 0.5) * 16,
            y: y + (Math.random() - 0.5) * 16,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed + (isBurst ? 0 : 0.7),
            size: isStar ? (Math.random() * 4.5 + 2.5) : (Math.random() * 3.5 + 2.0),
            life: 1.0,
            decay: Math.random() * 0.022 + 0.015,
            color: colors[Math.floor(Math.random() * colors.length)],
            isStar: isStar,
            rotation: Math.random() * Math.PI,
            rotationSpeed: (Math.random() - 0.5) * 0.1
        });
    }

    if (!animFrameId) {
        startParticleLoop();
    }
}

function drawSparkleStar(ctx, x, y, size, alpha, color, rotation) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#38bdf8';

    ctx.beginPath();
    const s = size * 1.4;
    // 4-pointed diamond sparkle star
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(0, 0, s, 0);
    ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0);
    ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.closePath();
    ctx.fill();

    // Central bright dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawGlowCircle(ctx, x, y, size, alpha, color) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.shadowBlur = 9;
    ctx.shadowColor = '#38bdf8';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function startParticleLoop() {
    if (animFrameId) return;

    const loop = () => {
        if (!particleCtx || !particleCanvas) {
            animFrameId = null;
            return;
        }

        // When fairy is despawned and all particles settled, stop loop to preserve 0% CPU
        if (!isTutorialActive && particles.length === 0) {
            particleCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            animFrameId = null;
            return;
        }

        particleCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        // Continuous emission from fairy center while active
        if (isTutorialActive && fairyContainer && fairyContainer.style.display !== 'none') {
            if (isFairyFlying) {
                spawnParticle(fairyX, fairyY, 4, false);
            } else if (Math.random() < 0.65) {
                spawnParticle(fairyX, fairyY, 1, false);
            }
        }

        // Update and render each sparkle
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            p.rotation += p.rotationSpeed;

            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            // Twinkle oscillation
            const twinkle = Math.sin(p.life * Math.PI * 4);
            const currentAlpha = Math.max(0.15, p.life * (0.6 + 0.4 * twinkle));
            const currentSize = p.size * (0.8 + 0.3 * Math.abs(twinkle));

            if (p.isStar) {
                drawSparkleStar(particleCtx, p.x, p.y, currentSize, currentAlpha, p.color, p.rotation);
            } else {
                drawGlowCircle(particleCtx, p.x, p.y, currentSize, currentAlpha, p.color);
            }
        }

        animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);
}

// --- FAIRY DOM & MOTION (FUZZY SOFT LIGHT) ---

function createFairyDOM() {
    if (fairyContainer) return fairyContainer;

    isTutorialActive = true;
    initParticleCanvas();

    fairyContainer = document.createElement('div');
    fairyContainer.id = 'tutorial-fairy-container';
    fairyContainer.setAttribute('role', 'button');
    fairyContainer.setAttribute('tabindex', '0');
    fairyContainer.setAttribute('aria-label', 'Guia Tutorial');

    fairyContainer.innerHTML = `
        <div class="tutorial-fairy-wrapper">
            <svg class="tutorial-fairy-svg" viewBox="0 0 200 200" aria-hidden="true">
                <defs>
                    <!-- Soft diffuse radial gradient for fuzzy core -->
                    <radialGradient id="fairyFuzzyCoreGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
                        <stop offset="28%" stop-color="#e0f2fe" stop-opacity="0.95"/>
                        <stop offset="55%" stop-color="#38bdf8" stop-opacity="0.82"/>
                        <stop offset="82%" stop-color="#3b82f7" stop-opacity="0.38"/>
                        <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0"/>
                    </radialGradient>

                    <!-- Outer diffuse aura gradient -->
                    <radialGradient id="fairyFuzzyAuraGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#60a5fa" stop-opacity="0.85"/>
                        <stop offset="38%" stop-color="#3b82f7" stop-opacity="0.55"/>
                        <stop offset="72%" stop-color="#2563eb" stop-opacity="0.22"/>
                        <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0"/>
                    </radialGradient>

                    <linearGradient id="fairyWingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="rgba(255, 255, 255, 0.95)"/>
                        <stop offset="40%" stop-color="rgba(224, 242, 254, 0.8)"/>
                        <stop offset="80%" stop-color="rgba(186, 230, 253, 0.55)"/>
                        <stop offset="100%" stop-color="rgba(125, 211, 252, 0.25)"/>
                    </linearGradient>

                    <!-- Fuzzy Soft Light Multi-stage Blur Filters -->
                    <filter id="fairyFuzzyFilter" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blurMed"/>
                        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blurWide"/>
                        <feMerge>
                            <feMergeNode in="blurWide"/>
                            <feMergeNode in="blurMed"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>

                    <filter id="fairyWideAuraFilter" x="-70%" y="-70%" width="240%" height="240%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="11"/>
                    </filter>
                </defs>

                <!-- WINGS LAYER (BEHIND SOFT LIGHT) -->
                <!-- Upper Left Wing -->
                <g class="fairy-wing fairy-wing-tl">
                    <path d="M90 95 C 75 70, 35 30, 25 15 C 32 35, 45 65, 60 85 C 72 98, 85 98, 90 95 Z" 
                          fill="url(#fairyWingGrad)" stroke="rgba(255,255,255,0.9)" stroke-width="0.8"/>
                    <path d="M 40 40 Q 55 60 78 88" stroke="rgba(186, 230, 253, 0.75)" stroke-width="0.7" fill="none"/>
                    <path d="M 50 55 Q 65 72 82 92" stroke="rgba(186, 230, 253, 0.75)" stroke-width="0.7" fill="none"/>
                </g>

                <!-- Upper Right Wing -->
                <g class="fairy-wing fairy-wing-tr">
                    <path d="M110 95 C 125 70, 165 30, 175 15 C 168 35, 155 65, 140 85 C 128 98, 115 98, 110 95 Z" 
                          fill="url(#fairyWingGrad)" stroke="rgba(255,255,255,0.9)" stroke-width="0.8"/>
                    <path d="M 160 40 Q 145 60 122 88" stroke="rgba(186, 230, 253, 0.75)" stroke-width="0.7" fill="none"/>
                    <path d="M 150 55 Q 135 72 118 92" stroke="rgba(186, 230, 253, 0.75)" stroke-width="0.7" fill="none"/>
                </g>

                <!-- Lower Left Wing -->
                <g class="fairy-wing fairy-wing-bl">
                    <path d="M92 108 C 70 115, 30 118, 20 120 C 35 130, 60 132, 80 122 C 88 116, 91 110, 92 108 Z" 
                          fill="url(#fairyWingGrad)" stroke="rgba(255,255,255,0.85)" stroke-width="0.7"/>
                    <path d="M 45 122 Q 65 122 86 114" stroke="rgba(186, 230, 253, 0.6)" stroke-width="0.6" fill="none"/>
                </g>

                <!-- Lower Right Wing -->
                <g class="fairy-wing fairy-wing-br">
                    <path d="M108 108 C 130 115, 170 118, 180 120 C 165 130, 140 132, 120 122 C 112 116, 109 110, 108 108 Z" 
                          fill="url(#fairyWingGrad)" stroke="rgba(255,255,255,0.85)" stroke-width="0.7"/>
                    <path d="M 155 122 Q 135 122 114 114" stroke="rgba(186, 230, 253, 0.6)" stroke-width="0.6" fill="none"/>
                </g>

                <!-- FUZZY SOFT LIGHT BODY (Pure ethereal glowing wisp, no shiny dots) -->
                <!-- Outermost Wide Diffuse Ambient Glow -->
                <circle cx="100" cy="100" r="48" fill="url(#fairyFuzzyAuraGrad)" filter="url(#fairyWideAuraFilter)" class="fairy-fuzzy-ambient"/>

                <!-- Middle Fuzzy Halo with Soft Feathering -->
                <circle cx="100" cy="100" r="38" fill="url(#fairyFuzzyCoreGrad)" filter="url(#fairyFuzzyFilter)" class="fairy-fuzzy-halo"/>

                <!-- Concentrated Glowing Core -->
                <circle cx="100" cy="100" r="22" fill="url(#fairyFuzzyCoreGrad)"/>

                <!-- Bright Inner Soft Wisp (Gaussian blurred white/cyan light) -->
                <circle cx="100" cy="100" r="14" fill="#ffffff" opacity="0.92" filter="url(#fairyFuzzyFilter)" class="fairy-fuzzy-core"/>
            </svg>
        </div>
    `;

    document.body.appendChild(fairyContainer);
    initSpeechBubbleDOM();
    startParticleLoop();
    return fairyContainer;
}

function initSpeechBubbleDOM() {
    if (speechBubble) return speechBubble;

    speechBubble = document.createElement('div');
    speechBubble.id = 'tutorial-speech-bubble';
    speechBubble.setAttribute('role', 'dialog');
    speechBubble.setAttribute('aria-live', 'polite');

    speechBubble.innerHTML = `
        <div class="tutorial-bubble-top">
            <div class="tutorial-badge-chip">
                <span class="material-symbols-rounded tutorial-sparkle-icon">auto_awesome</span>
                <span>Tutorial</span>
            </div>
            <button type="button" id="tutorial-skip-btn" class="tutorial-skip-btn" aria-label="${t('tutorial_skip')}" title="${t('tutorial_skip')}">
                <span class="material-symbols-rounded">close</span>
            </button>
        </div>
        <div id="tutorial-bubble-text" class="tutorial-bubble-text">
            <span id="tutorial-text-content"></span><span id="tutorial-text-cursor" class="tutorial-typing-cursor"></span>
        </div>
        <div id="tutorial-bubble-actions" class="tutorial-bubble-actions">
            <button type="button" id="tutorial-action-btn" class="tutorial-action-btn is-hidden">
                <span id="tutorial-action-btn-text"></span>
                <span class="material-symbols-rounded text-sm">arrow_forward</span>
            </button>
        </div>
    `;

    document.body.appendChild(speechBubble);

    const skipBtn = speechBubble.querySelector('#tutorial-skip-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            skipTutorial();
        });
    }

    // Fast-forward typewriter or execute action on bubble click
    speechBubble.addEventListener('click', (e) => {
        if (e.target.closest('#tutorial-skip-btn') || e.target.closest('#tutorial-action-btn')) {
            return;
        }
        if (isTypewriterActive) {
            completeTypewriterEarly();
        } else if (typeof currentActionCallback === 'function') {
            currentActionCallback();
        }
    });

    return speechBubble;
}

export function updateFairyPosition(x, y) {
    fairyX = x;
    fairyY = y;
    if (fairyContainer) {
        fairyContainer.style.transform = `translate3d(${Math.round(x - 50)}px, ${Math.round(y - 50)}px, 0)`;
    }
}

export function flyFairyTo(targetX, targetY, duration = 1200, onArrival = null) {
    if (!fairyContainer) createFairyDOM();
    isFairyFlying = true;
    fairyContainer.classList.add('fairy-flying');
    hideBubble();

    const startX = fairyX;
    const startY = fairyY;
    const startTime = performance.now();
    const arcHeight = -Math.min(90, Math.abs(targetX - startX) * 0.22 + 25);

    const animateFlight = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // EaseInOutCubic
        const ease = progress < 0.5 
            ? 4 * progress * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        const currentX = startX + (targetX - startX) * ease;
        const currentY = startY + (targetY - startY) * ease + Math.sin(progress * Math.PI) * arcHeight;

        updateFairyPosition(currentX, currentY);

        if (progress < 1) {
            requestAnimationFrame(animateFlight);
        } else {
            isFairyFlying = false;
            fairyContainer.classList.remove('fairy-flying');
            updateFairyPosition(targetX, targetY);
            if (typeof onArrival === 'function') {
                onArrival();
            }
        }
    };

    requestAnimationFrame(animateFlight);
}

// --- GAME-STYLE IN-LINE TYPEWRITER TEXT ANIMATION ---

function renderTypewriterText(fullText, onComplete = null) {
    if (typewriterTimer) {
        clearTimeout(typewriterTimer);
        typewriterTimer = null;
    }

    currentFullText = fullText;
    isTypewriterActive = true;

    const contentEl = speechBubble ? speechBubble.querySelector('#tutorial-text-content') : null;
    const cursorEl = speechBubble ? speechBubble.querySelector('#tutorial-text-cursor') : null;
    const actionBtn = speechBubble ? speechBubble.querySelector('#tutorial-action-btn') : null;

    if (contentEl) contentEl.textContent = '';
    if (cursorEl) cursorEl.style.display = 'inline-block';
    if (actionBtn) actionBtn.classList.add('is-hidden');

    let charIndex = 0;
    const len = fullText.length;
    const baseSpeed = 22; // ms per character

    const typeNextChar = () => {
        if (!isTypewriterActive) return;

        if (charIndex < len) {
            const char = fullText.charAt(charIndex);
            if (contentEl) contentEl.textContent += char;
            charIndex++;

            // Natural game punctuation cadence
            let delay = baseSpeed;
            if (char === '.' || char === '!' || char === '?') {
                delay = 180;
            } else if (char === ',' || char === ':' || char === ';') {
                delay = 85;
            }

            typewriterTimer = setTimeout(typeNextChar, delay);
        } else {
            isTypewriterActive = false;
            typewriterTimer = null;
            if (cursorEl) cursorEl.style.display = 'none';
            if (actionBtn) actionBtn.classList.remove('is-hidden');
            if (typeof onComplete === 'function') {
                onComplete();
            }
        }
    };

    typeNextChar();
}

function completeTypewriterEarly() {
    if (!isTypewriterActive) return false;
    if (typewriterTimer) {
        clearTimeout(typewriterTimer);
        typewriterTimer = null;
    }
    isTypewriterActive = false;

    const contentEl = speechBubble ? speechBubble.querySelector('#tutorial-text-content') : null;
    const cursorEl = speechBubble ? speechBubble.querySelector('#tutorial-text-cursor') : null;
    const actionBtn = speechBubble ? speechBubble.querySelector('#tutorial-action-btn') : null;

    if (contentEl) contentEl.textContent = currentFullText;
    if (cursorEl) cursorEl.style.display = 'none';
    if (actionBtn) actionBtn.classList.remove('is-hidden');
    return true;
}

function showBubble(text, buttonText, onActionClick) {
    if (!speechBubble) initSpeechBubbleDOM();
    currentActionCallback = onActionClick;

    const actionBtn = speechBubble.querySelector('#tutorial-action-btn');
    const btnLabel = speechBubble.querySelector('#tutorial-action-btn-text');

    if (btnLabel && buttonText) {
        btnLabel.textContent = buttonText;
    }
    if (actionBtn) {
        if (buttonText) {
            actionBtn.style.display = 'inline-flex';
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                if (typeof onActionClick === 'function') onActionClick();
            };
        } else {
            actionBtn.style.display = 'none';
        }
    }

    positionBubble();
    speechBubble.classList.add('is-visible');

    // Run game in-line typewriter animation
    renderTypewriterText(text);
}

function hideBubble() {
    if (speechBubble) {
        speechBubble.classList.remove('is-visible');
    }
    if (typewriterTimer) {
        clearTimeout(typewriterTimer);
        typewriterTimer = null;
    }
    isTypewriterActive = false;
}

function positionBubble() {
    if (!speechBubble || !fairyContainer) return;
    const bubbleWidth = 310;
    const bubbleHeight = 140;

    let targetLeft = fairyX + 65;
    let targetTop = fairyY - 70;

    // Boundary checks
    if (targetLeft + bubbleWidth > window.innerWidth - 16) {
        targetLeft = fairyX - bubbleWidth - 65;
    }
    if (targetLeft < 16) {
        targetLeft = Math.max(16, (window.innerWidth - bubbleWidth) / 2);
    }

    if (fairyY > window.innerHeight - 200) {
        targetTop = fairyY - bubbleHeight - 50;
    } else if (targetTop < 20) {
        targetTop = fairyY + 50;
    }

    speechBubble.style.left = `${Math.round(targetLeft)}px`;
    speechBubble.style.top = `${Math.round(targetTop)}px`;
}

function highlightElement(el) {
    clearHighlight();
    if (!el) return;
    highlightedElement = el;
    el.classList.add('tutorial-target-highlight');
}

function clearHighlight() {
    if (highlightedElement) {
        highlightedElement.classList.remove('tutorial-target-highlight');
        highlightedElement = null;
    }
    document.querySelectorAll('.tutorial-target-highlight').forEach(el => {
        el.classList.remove('tutorial-target-highlight');
    });
}

// --- TUTORIAL SCRIPT RUNNER ---

export function skipTutorial() {
    clearTimeout(stepTimer);
    clearHighlight();
    hideBubble();
    playTutorialSound('tutorial_out.mp3');

    if (fairyContainer) {
        spawnParticle(fairyX, fairyY, 30, true);
        flyFairyTo(-120, fairyY + 80, 700, () => {
            despawnTutorial();
        });
    } else {
        despawnTutorial();
    }

    sessionStorage.removeItem(TUTORIAL_FORCE_REPLAY_KEY);
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
    localStorage.removeItem(TUTORIAL_STEP_KEY);
}

function despawnTutorial() {
    isTutorialActive = false;
    clearTimeout(stepTimer);
    stepTimer = null;
    clearHighlight();

    if (typewriterTimer) {
        clearTimeout(typewriterTimer);
        typewriterTimer = null;
    }
    isTypewriterActive = false;

    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio.src = '';
        } catch (e) {}
        currentAudio = null;
    }

    if (fairyContainer && fairyContainer.parentNode) {
        fairyContainer.parentNode.removeChild(fairyContainer);
    }
    if (speechBubble && speechBubble.parentNode) {
        speechBubble.parentNode.removeChild(speechBubble);
    }
    if (particleCanvas && particleCanvas.parentNode) {
        particleCanvas.parentNode.removeChild(particleCanvas);
    }

    fairyContainer = null;
    speechBubble = null;
    particleCanvas = null;
    particleCtx = null;
    particles = [];

    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
}

// Handle clicks on fairy: skip typing or advance
function handleFairyClick(onAdvance) {
    if (isTypewriterActive) {
        completeTypewriterEarly();
    } else if (typeof onAdvance === 'function') {
        onAdvance();
    }
}

// STEP A: index.html - Spawn & say "Are you new here?"
function runStepA() {
    createFairyDOM();
    const initialX = Math.min(100, window.innerWidth * 0.15);
    const initialY = Math.max(100, window.innerHeight - 150);
    updateFairyPosition(initialX, initialY);

    showBubble(
        t('tutorial_step_a'),
        t('tutorial_btn_yes'),
        () => runStepB()
    );

    fairyContainer.onclick = () => handleFairyClick(() => runStepB());
}

// STEP B: index.html - Clicked -> play tutorial_hello.mp3, move around "create deck", say script B
function runStepB() {
    clearTimeout(stepTimer);
    playTutorialSound('tutorial_hello.mp3');

    const createDeckBtn = document.getElementById('open-create-btn');
    let targetX = window.innerWidth / 2 + 180;
    let targetY = window.innerHeight / 2;

    if (createDeckBtn) {
        const rect = createDeckBtn.getBoundingClientRect();
        if (rect.right + 70 < window.innerWidth) {
            targetX = rect.right + 45;
            targetY = rect.top + rect.height / 2;
        } else {
            targetX = rect.left + rect.width / 2;
            targetY = Math.max(70, rect.top - 55);
        }
    }

    flyFairyTo(targetX, targetY, 1200, () => {
        if (createDeckBtn) highlightElement(createDeckBtn);

        showBubble(
            t('tutorial_step_b'),
            t('tutorial_btn_create_deck'),
            () => proceedToGenerate()
        );

        if (createDeckBtn) {
            createDeckBtn.addEventListener('click', () => {
                localStorage.setItem(TUTORIAL_STEP_KEY, 'C');
            }, { once: true });
        }

        fairyContainer.onclick = () => handleFairyClick(() => proceedToGenerate());
    });
}

function proceedToGenerate() {
    localStorage.setItem(TUTORIAL_STEP_KEY, 'C');
    const isSubdir = window.location.pathname.includes('/pages/');
    window.location.href = isSubdir ? 'generate.html' : 'pages/generate.html';
}

// STEP C: generate.html - play tutorial_hey.mp3, say script C
function runStepC() {
    createFairyDOM();
    const mode11 = document.getElementById('card-mode-1-1');
    let targetX = 90;
    let targetY = 220;

    if (mode11) {
        const rect = mode11.getBoundingClientRect();
        targetX = Math.max(60, rect.left - 45);
        targetY = rect.top + 60;
    }
    updateFairyPosition(targetX, targetY);

    playTutorialSound('tutorial_hey.mp3');

    showBubble(
        t('tutorial_step_c'),
        t('tutorial_btn_next'),
        () => runStepD()
    );

    fairyContainer.onclick = () => handleFairyClick(() => runStepD());
}

// STEP D: generate.html - move around "create from materials", play tutorial_listen.mp3, say script D
function runStepD() {
    clearTimeout(stepTimer);
    localStorage.setItem(TUTORIAL_STEP_KEY, 'D');
    const cardMode21 = document.getElementById('card-mode-2-1');
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    if (cardMode21) {
        const rect = cardMode21.getBoundingClientRect();
        if (rect.right + 60 < window.innerWidth) {
            targetX = rect.right - 20;
            targetY = rect.top + rect.height / 2;
        } else {
            targetX = rect.left + rect.width / 2;
            targetY = rect.top + rect.height / 2;
        }
    }

    playTutorialSound('tutorial_listen.mp3');

    flyFairyTo(targetX, targetY, 1100, () => {
        if (cardMode21) highlightElement(cardMode21);

        showBubble(
            t('tutorial_step_d'),
            t('tutorial_btn_generate_ai'),
            () => openMaterialsModalForTutorial()
        );

        if (cardMode21) {
            cardMode21.addEventListener('click', () => {
                if (localStorage.getItem(TUTORIAL_STEP_KEY) === 'D') {
                    openMaterialsModalForTutorial();
                }
            });
        }

        fairyContainer.onclick = () => handleFairyClick(() => openMaterialsModalForTutorial());
    });
}

function openMaterialsModalForTutorial() {
    clearHighlight();
    const cardMode21 = document.getElementById('card-mode-2-1');
    const modal21 = document.getElementById('modal-2-1');

    if (modal21 && modal21.classList.contains('hidden')) {
        if (cardMode21) cardMode21.click();
    }

    // Position fairy near modal dialog to guide user
    setTimeout(() => {
        const dialogCard = modal21 ? modal21.querySelector('.m3-dialog-card, .bg-white') : null;
        let targetX = window.innerWidth / 2 + 250;
        let targetY = 160;

        if (dialogCard) {
            const rect = dialogCard.getBoundingClientRect();
            if (rect.right + 70 < window.innerWidth) {
                targetX = rect.right + 40;
                targetY = rect.top + 50;
            } else {
                targetX = rect.left + rect.width / 2;
                targetY = Math.max(70, rect.top - 55);
            }
        }

        flyFairyTo(targetX, targetY, 800, () => {
            showBubble(
                t('tutorial_modal_tip'),
                t('tutorial_btn_use_sample'),
                () => {
                    // Fallback if user does not have files on hand
                    if (modal21) modal21.classList.add('hidden');
                    runStepE(true);
                }
            );
        });
    }, 180);

    // If modal is closed or cancelled, return to Step D
    const cancelBtn = document.getElementById('cancel-modal-2-1-btn');
    const closeBtn = document.getElementById('close-modal-2-1-btn');
    [cancelBtn, closeBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (localStorage.getItem(TUTORIAL_STEP_KEY) === 'D') {
                    setTimeout(() => runStepD(), 200);
                }
            }, { once: true });
        }
    });
}

let isGeneratingInStepE = false;

// Listen to real AI generation events from generate.js
window.addEventListener('flashcardsDeckGenerationStarted', () => {
    if (localStorage.getItem(TUTORIAL_STEP_KEY) === 'D') {
        runStepE(false);
    }
});

window.addEventListener('flashcardsDeckGenerationDone', (e) => {
    if (localStorage.getItem(TUTORIAL_STEP_KEY) === 'E' || isGeneratingInStepE) {
        if (!e.detail || !e.detail.success || e.detail.count === 0) {
            if (typeof window.loadTutorialDeck === 'function') {
                window.loadTutorialDeck();
            }
        }
        runStepF();
    }
});

// STEP E: generate.html - create cards / AI thinking, play tutorial_hey.mp3, say script E
function runStepE(useSampleDeckFallback = false) {
    clearTimeout(stepTimer);
    clearHighlight();
    hideBubble();
    localStorage.setItem(TUTORIAL_STEP_KEY, 'E');

    // Close modal if open
    const modal21 = document.getElementById('modal-2-1');
    if (modal21) modal21.classList.add('hidden');

    if (useSampleDeckFallback && typeof window.loadTutorialDeck === 'function') {
        window.loadTutorialDeck();
        isGeneratingInStepE = false;
    } else {
        isGeneratingInStepE = true;
    }

    playTutorialSound('tutorial_hey.mp3');

    // Fly to bottom-left near sidebar
    const targetX = 80;
    const targetY = Math.max(120, window.innerHeight - 160);

    flyFairyTo(targetX, targetY, 900, () => {
        if (fairyContainer) fairyContainer.classList.add('fairy-thinking');

        if (useSampleDeckFallback) {
            showBubble(
                t('tutorial_step_e'),
                t('tutorial_btn_next'),
                () => runStepF()
            );

            fairyContainer.onclick = () => handleFairyClick(() => runStepF());

            // If fallback sample deck, wait for typewriter then simulate thinking pause
            stepTimer = setTimeout(() => {
                runStepF();
            }, 5500);
        } else {
            // Real AI generation in progress: show dialogue, allow clicking to fast-forward typing, but do not skip to step F prematurely
            showBubble(
                t('tutorial_step_e'),
                null,
                null
            );

            fairyContainer.onclick = () => handleFairyClick(null);
        }
    });
}

// STEP F: generate.html - play tutorial_look.mp3, move around "play now", say script F
function runStepF() {
    clearTimeout(stepTimer);
    isGeneratingInStepE = false;
    localStorage.setItem(TUTORIAL_STEP_KEY, 'F');
    if (fairyContainer) fairyContainer.classList.remove('fairy-thinking');

    playTutorialSound('tutorial_look.mp3');

    const playBtn = document.getElementById('play-deck-btn');
    let targetX = window.innerWidth - 120;
    let targetY = 100;

    if (playBtn) {
        const rect = playBtn.getBoundingClientRect();
        targetX = Math.max(60, rect.left - 55);
        targetY = rect.top + rect.height / 2;
    }

    flyFairyTo(targetX, targetY, 1100, () => {
        if (playBtn) highlightElement(playBtn);

        showBubble(
            t('tutorial_step_f'),
            t('tutorial_btn_play_now'),
            () => proceedToGame()
        );

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                localStorage.setItem(TUTORIAL_STEP_KEY, 'G');
            }, { once: true });
        }

        fairyContainer.onclick = () => handleFairyClick(() => proceedToGame());
    });
}

function proceedToGame() {
    localStorage.setItem(TUTORIAL_STEP_KEY, 'G');
    const playBtn = document.getElementById('play-deck-btn');
    if (playBtn) {
        playBtn.click();
    } else {
        window.location.href = 'game.html';
    }
}

// STEP G: game.html - play tutorial_hey.mp3, say script G
function runStepG() {
    createFairyDOM();
    const targetX = 80;
    const targetY = Math.max(110, window.innerHeight - 170);
    updateFairyPosition(targetX, targetY);

    playTutorialSound('tutorial_hey.mp3');

    showBubble(
        t('tutorial_step_g'),
        t('tutorial_btn_continue'),
        () => runStepH()
    );

    fairyContainer.onclick = () => handleFairyClick(() => runStepH());

    // Auto-advance after typewriter finishes + reading time
    stepTimer = setTimeout(() => {
        runStepH();
    }, 7500);
}

// STEP H: game.html - play tutorial_out.mp3, say "Bye!" and despawn
function runStepH() {
    clearTimeout(stepTimer);
    clearHighlight();

    playTutorialSound('tutorial_out.mp3');

    showBubble(
        t('tutorial_step_h'),
        null,
        null
    );

    // Burst sparkles and fly away off-screen
    spawnParticle(fairyX, fairyY, 36, true);

    setTimeout(() => {
        hideBubble();
        flyFairyTo(-120, window.innerHeight + 120, 1000, () => {
            despawnTutorial();
            sessionStorage.removeItem(TUTORIAL_FORCE_REPLAY_KEY);
            localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
            localStorage.removeItem(TUTORIAL_STEP_KEY);
        });
    }, 1100);
}

// --- INITIALIZATION ENTRY POINT ---

export function initTutorial() {
    const isForceReplay = sessionStorage.getItem(TUTORIAL_FORCE_REPLAY_KEY) === 'true';
    const isCompleted = localStorage.getItem(TUTORIAL_COMPLETED_KEY) === 'true';

    // If completed and not forced replay, never run
    if (isCompleted && !isForceReplay) {
        return;
    }

    const savedStep = localStorage.getItem(TUTORIAL_STEP_KEY);

    // If not in the middle of a step and user has already played before,
    // mark completed so it never appears for existing players!
    if (!savedStep && !isForceReplay && hasUserPlayedBefore()) {
        localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
        return;
    }

    const currentPath = window.location.pathname;
    const isIndex = currentPath.endsWith('/') || currentPath.endsWith('/index.html') || currentPath.includes('index');
    const isGenerate = currentPath.includes('generate.html');
    const isGame = currentPath.includes('game.html');

    if (isIndex) {
        if (!savedStep || savedStep === 'A') {
            setTimeout(runStepA, 600);
        } else if (savedStep === 'B') {
            setTimeout(runStepB, 400);
        }
    } else if (isGenerate) {
        if (savedStep === 'C') {
            setTimeout(runStepC, 500);
        } else if (savedStep === 'D') {
            setTimeout(runStepD, 400);
        } else if (savedStep === 'E') {
            if (typeof deckCards !== 'undefined' && deckCards.length > 0) {
                setTimeout(runStepF, 400);
            } else {
                setTimeout(() => runStepE(true), 400);
            }
        } else if (savedStep === 'F') {
            setTimeout(runStepF, 400);
        }
    } else if (isGame) {
        if (savedStep === 'G' || (isForceReplay && !savedStep)) {
            setTimeout(runStepG, 700);
        } else if (savedStep === 'H') {
            setTimeout(runStepH, 400);
        }
    }
}

// Development and testing helper to replay tutorial anytime
export function replayTutorial() {
    localStorage.removeItem(TUTORIAL_COMPLETED_KEY);
    localStorage.removeItem(TUTORIAL_STEP_KEY);
    sessionStorage.setItem(TUTORIAL_FORCE_REPLAY_KEY, 'true');
    const isSubdir = window.location.pathname.includes('/pages/');
    window.location.href = isSubdir ? '../index.html' : 'index.html';
}

if (typeof window !== 'undefined') {
    window.initTutorial = initTutorial;
    window.replayTutorial = replayTutorial;
    window.skipTutorial = skipTutorial;
}

// Auto-run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initTutorial());
} else {
    setTimeout(() => initTutorial(), 100);
}
