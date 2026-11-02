// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/engine/pro-unlock-celebration.js
 * Celebratory unlock animation for Flashcards Pro (Material Design 3).
 * Features:
 * - 2-phase state transformation: Silver/Cool Cyan -> Radiant 24K Gold & Sunburst
 * - Sleek Flashcards PRO Cards & Rosette Medal emblem SVG
 * - 360-degree canvas golden diamond and sparkle particle burst
 * - 3D slam typography ("FLASHCARDS PRO - DESBLOQUEADO!")
 * - Tactile haptic vibration (silent, without background audio)
 */

import { triggerHaptic } from './effects.js';
import { t } from '../i18n.js';

let isCelebrationActive = false;

/**
 * Triggers the full-screen Pro Unlock celebration animation
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {Function} [options.onComplete]
 */
export function triggerProUnlockCelebration(options = {}) {
  if (isCelebrationActive) return;
  isCelebrationActive = true;

  const {
    title = t('pro_unlocked_title'),
    subtitle = t('pro_unlocked_subtitle'),
    onComplete = null
  } = options;

  // Tactile initial haptic
  try {
    triggerHaptic('tap');
  } catch (e) {}

  // Remove any previous instance
  document.getElementById('pro-unlock-celebration-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pro-unlock-celebration-overlay';
  overlay.className = 'fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden font-sans select-none';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    user-select: none;
    background: radial-gradient(circle at center, #0284c7 0%, #0369a1 40%, #075985 80%, #082f49 100%);
    transition: background 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease, transform 0.4s ease;
  `;

  overlay.innerHTML = `
    <style id="pro-unlock-internal-css">
      #pro-unlock-celebration-overlay.unlocked-golden {
        background: radial-gradient(circle at center, #f59e0b 0%, #d97706 40%, #b45309 80%, #78350f 100%) !important;
      }

      .f-unlock-mesh {
        position: absolute;
        inset: 0;
        opacity: 0.14;
        background-image: 
          linear-gradient(30deg, #ffffff 12%, transparent 12.5%, transparent 87%, #ffffff 87.5%, #ffffff),
          linear-gradient(150deg, #ffffff 12%, transparent 12.5%, transparent 87%, #ffffff 87.5%, #ffffff),
          linear-gradient(30deg, #ffffff 12%, transparent 12.5%, transparent 87%, #ffffff 87.5%, #ffffff),
          linear-gradient(150deg, #ffffff 12%, transparent 12.5%, transparent 87%, #ffffff 87.5%, #ffffff),
          linear-gradient(60deg, rgba(255,255,255,0.4) 25%, transparent 25.5%, transparent 75%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0.4)),
          linear-gradient(60deg, rgba(255,255,255,0.4) 25%, transparent 25.5%, transparent 75%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0.4));
        background-size: 80px 140px;
        background-position: 0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px;
        pointer-events: none;
      }

      .f-unlock-sunburst {
        position: absolute;
        width: 250vmax;
        height: 250vmax;
        background: repeating-conic-gradient(
          from 0deg,
          rgba(255, 255, 255, 0.18) 0deg 9deg,
          transparent 9deg 18deg
        );
        animation: fRotateSunburst 28s linear infinite;
        opacity: 0;
        transition: opacity 0.5s ease;
        pointer-events: none;
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-unlock-sunburst {
        opacity: 1;
      }
      @keyframes fRotateSunburst {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .f-unlock-blast {
        position: absolute;
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: radial-gradient(circle, #ffffff 0%, #fef08a 35%, #f59e0b 65%, transparent 75%);
        transform: scale(0.1);
        opacity: 0;
        pointer-events: none;
        z-index: 5;
      }
      .f-unlock-blast.animate {
        animation: fShockwaveBoom 0.85s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
      }
      @keyframes fShockwaveBoom {
        0% { transform: scale(0.1); opacity: 1; }
        40% { opacity: 0.95; }
        100% { transform: scale(32); opacity: 0; }
      }

      .f-unlock-stage {
        position: relative;
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 20px;
        max-width: 580px;
        width: 100%;
      }
      .f-unlock-stage.shake {
        animation: fStageShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
      }
      @keyframes fStageShake {
        10%, 90% { transform: translate3d(-4px, 2px, 0); }
        20%, 80% { transform: translate3d(5px, -3px, 0); }
        30%, 50%, 70% { transform: translate3d(-6px, 4px, 0); }
        40%, 60% { transform: translate3d(6px, -4px, 0); }
      }

      .f-unlock-badge-box {
        position: relative;
        width: 220px;
        height: 220px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }

      .f-badge-silver, .f-badge-gold {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .f-badge-silver {
        opacity: 1;
        transform: scale(0.95);
        animation: fBadgeIntro 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.25) forwards;
      }
      @keyframes fBadgeIntro {
        0% { transform: scale(0.2) rotate(-8deg); opacity: 0; }
        70% { transform: scale(1.15) rotate(2deg); opacity: 1; }
        100% { transform: scale(1) rotate(0deg); opacity: 1; }
      }

      .f-badge-gold {
        opacity: 0;
        transform: scale(0.85);
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-badge-silver {
        opacity: 0;
        transform: scale(1.18);
        pointer-events: none;
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-badge-gold {
        opacity: 1;
        transform: scale(1);
        animation: fBadgeFloat 3s ease-in-out infinite alternate;
      }
      @keyframes fBadgeFloat {
        0% { transform: translateY(0) rotate(0deg); }
        100% { transform: translateY(-8px) rotate(1deg); }
      }

      .f-unlock-glow {
        position: absolute;
        width: 260px;
        height: 260px;
        background: radial-gradient(circle, rgba(254, 240, 138, 0.85) 0%, rgba(245, 158, 11, 0.45) 45%, transparent 75%);
        filter: blur(28px);
        border-radius: 50%;
        opacity: 0;
        transition: opacity 0.5s ease;
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-unlock-glow {
        opacity: 1;
      }

      .f-unlock-subtitle {
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.35em;
        color: #fffbeb;
        text-transform: uppercase;
        text-shadow: 0 2px 10px rgba(180, 83, 9, 0.8), 0 0 20px rgba(254, 240, 138, 0.6);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.4s ease 0.1s, transform 0.4s ease 0.1s;
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-unlock-subtitle {
        opacity: 1;
        transform: translateY(0);
      }

      .f-unlock-title {
        font-size: clamp(38px, 9vw, 68px);
        font-weight: 1000;
        letter-spacing: 0.04em;
        color: #ffffff;
        text-transform: uppercase;
        font-style: italic;
        line-height: 1;
        text-shadow: 
          0 1px 0 #fde047,
          0 2px 0 #eab308,
          0 3px 0 #ca8a04,
          0 5px 0 #a16207,
          0 7px 0 #713f12,
          0 10px 18px rgba(0, 0, 0, 0.6);
        transform: scaleY(1.05) scale(0.3);
        opacity: 0;
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-unlock-title {
        animation: fTitleSlam 0.55s cubic-bezier(0.175, 0.885, 0.32, 1.25) 0.15s forwards;
      }
      @keyframes fTitleSlam {
        0% { transform: scale(2.2) scaleY(1.2); opacity: 0; filter: blur(8px); }
        60% { transform: scale(0.95) scaleY(1.02); opacity: 1; filter: blur(0); }
        100% { transform: scale(1.0) scaleY(1.05); opacity: 1; filter: blur(0); }
      }

      .f-unlock-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin-top: 20px;
        opacity: 0;
        transform: translateY(15px);
        transition: opacity 0.4s ease 0.35s, transform 0.4s ease 0.35s;
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-unlock-chips {
        opacity: 1;
        transform: translateY(0);
      }

      .f-unlock-chip {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(8px);
        color: #854d0e;
        border: 1px solid rgba(254, 240, 138, 0.8);
        font-size: 12px;
        font-weight: 800;
        padding: 6px 14px;
        border-radius: 9999px;
        box-shadow: 0 4px 12px rgba(120, 53, 15, 0.25);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .f-unlock-btn {
        margin-top: 28px;
        background: linear-gradient(180deg, #ffffff 0%, #fef08a 30%, #facc15 70%, #eab308 100%);
        color: #713f12;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 0.2em;
        padding: 15px 38px;
        border-radius: 9999px;
        border: 2px solid #ffffff;
        box-shadow: 0 10px 25px rgba(113, 63, 18, 0.45), 0 0 20px rgba(253, 224, 71, 0.6);
        cursor: pointer;
        opacity: 0;
        transform: translateY(20px) scale(0.9);
        transition: opacity 0.4s ease 0.5s, transform 0.4s ease 0.5s, box-shadow 0.2s ease;
      }
      #pro-unlock-celebration-overlay.unlocked-golden .f-unlock-btn {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .f-unlock-btn:hover {
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 14px 30px rgba(113, 63, 18, 0.55), 0 0 30px rgba(253, 224, 71, 0.8);
      }
    </style>

    <div class="f-unlock-sunburst"></div>
    <div class="f-unlock-mesh"></div>
    <div id="f-unlock-blast" class="f-unlock-blast"></div>
    <canvas id="f-unlock-particles-canvas" class="absolute inset-0 pointer-events-none w-full h-full" style="position:absolute; inset:0; pointer-events:none;"></canvas>

    <div id="f-unlock-stage" class="f-unlock-stage">
      <div class="f-unlock-badge-box">
        <div class="f-unlock-glow"></div>
        
        <!-- Silver Emblem (Entrance) -->
        <div class="f-badge-silver">
          <svg width="210" height="210" viewBox="0 0 200 200">
            <defs>
              <filter id="f-shadow-silver" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.35"/>
              </filter>
              <linearGradient id="f-card-silver-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="50%" stop-color="#f1f5f9"/>
                <stop offset="100%" stop-color="#cbd5e1"/>
              </linearGradient>
              <linearGradient id="f-card-silver-border" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="100%" stop-color="#94a3b8"/>
              </linearGradient>
              <linearGradient id="f-rosette-silver" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="50%" stop-color="#cbd5e1"/>
                <stop offset="100%" stop-color="#64748b"/>
              </linearGradient>
            </defs>
            
            <!-- Back Card Left -->
            <g transform="rotate(-12 100 95)">
              <rect x="54" y="34" width="92" height="122" rx="16" fill="#64748b" opacity="0.4" filter="url(#f-shadow-silver)"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="url(#f-card-silver-bg)" opacity="0.6"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="none" stroke="url(#f-card-silver-border)" stroke-width="1.5" opacity="0.7"/>
            </g>

            <!-- Back Card Right -->
            <g transform="rotate(12 100 95)">
              <rect x="54" y="34" width="92" height="122" rx="16" fill="#64748b" opacity="0.4" filter="url(#f-shadow-silver)"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="url(#f-card-silver-bg)" opacity="0.75"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="none" stroke="url(#f-card-silver-border)" stroke-width="1.5" opacity="0.8"/>
            </g>

            <!-- Front Main Card -->
            <g filter="url(#f-shadow-silver)">
              <rect x="52" y="32" width="96" height="126" rx="18" fill="url(#f-card-silver-bg)"/>
              <rect x="52" y="32" width="96" height="126" rx="18" fill="none" stroke="url(#f-card-silver-border)" stroke-width="2"/>
              <rect x="57" y="37" width="86" height="116" rx="14" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6"/>

              <!-- Mini lines imitating flashcard content -->
              <rect x="68" y="47" width="24" height="4" rx="2" fill="#94a3b8" opacity="0.6"/>
              <circle cx="124" cy="49" r="3" fill="#94a3b8" opacity="0.6"/>

              <!-- Center Pro Rosette Medal -->
              <g transform="translate(100, 84) scale(2.5) translate(-12, -12)">
                <path d="M12,23.3L8.65,20H4V15.35L0.7,12L4,8.65V4H8.65L12,0.7L15.35,4H20V8.65L23.3,12L20,15.35V20H15.35L12,23.3Z" fill="url(#f-rosette-silver)" stroke="#475569" stroke-width="0.5"/>
                <circle cx="12" cy="12" r="7.5" fill="#f8fafc" stroke="#64748b" stroke-width="0.5"/>
                <path d="M9.08,16.25L12,14.48l2.93,1.78l-0.78-3.33l2.6-2.25L13.33,10.4L12,7.25L10.68,10.4L7.25,10.68l2.6,2.25L9.08,16.25Z" fill="url(#f-rosette-silver)"/>
              </g>

              <!-- PRO Pill Badge -->
              <rect x="74" y="122" width="52" height="22" rx="11" fill="#334155"/>
              <rect x="75" y="123" width="50" height="20" rx="10" fill="url(#f-card-silver-bg)"/>
              <text x="100" y="137.5" text-anchor="middle" font-size="11" font-weight="900" font-family="system-ui, -apple-system, sans-serif" letter-spacing="2" fill="#1e293b">PRO</text>
            </g>
          </svg>
        </div>

        <!-- 24K Gold Emblem (Explosion) -->
        <div class="f-badge-gold">
          <svg width="210" height="210" viewBox="0 0 200 200">
            <defs>
              <filter id="f-shadow-gold" x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#78350f" flood-opacity="0.45"/>
              </filter>
              <linearGradient id="f-card-gold-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fffbeb"/>
                <stop offset="40%" stop-color="#fef08a"/>
                <stop offset="75%" stop-color="#fde047"/>
                <stop offset="100%" stop-color="#f59e0b"/>
              </linearGradient>
              <linearGradient id="f-card-gold-border" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="50%" stop-color="#facc15"/>
                <stop offset="100%" stop-color="#b45309"/>
              </linearGradient>
              <linearGradient id="f-rosette-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="30%" stop-color="#fde047"/>
                <stop offset="70%" stop-color="#f59e0b"/>
                <stop offset="100%" stop-color="#b45309"/>
              </linearGradient>
            </defs>

            <!-- Back Card Left -->
            <g transform="rotate(-12 100 95)">
              <rect x="54" y="34" width="92" height="122" rx="16" fill="#78350f" opacity="0.4" filter="url(#f-shadow-gold)"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="url(#f-card-gold-bg)" opacity="0.75"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="none" stroke="url(#f-card-gold-border)" stroke-width="1.8" opacity="0.85"/>
            </g>

            <!-- Back Card Right -->
            <g transform="rotate(12 100 95)">
              <rect x="54" y="34" width="92" height="122" rx="16" fill="#78350f" opacity="0.4" filter="url(#f-shadow-gold)"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="url(#f-card-gold-bg)" opacity="0.85"/>
              <rect x="54" y="34" width="92" height="122" rx="16" fill="none" stroke="url(#f-card-gold-border)" stroke-width="1.8" opacity="0.95"/>
            </g>

            <!-- Front Main Card -->
            <g filter="url(#f-shadow-gold)">
              <rect x="52" y="32" width="96" height="126" rx="18" fill="url(#f-card-gold-bg)"/>
              <rect x="52" y="32" width="96" height="126" rx="18" fill="none" stroke="url(#f-card-gold-border)" stroke-width="2.5"/>
              <rect x="57" y="37" width="86" height="116" rx="14" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.75"/>

              <!-- Mini lines imitating flashcard content -->
              <rect x="68" y="47" width="24" height="4" rx="2" fill="#b45309" opacity="0.4"/>
              <circle cx="124" cy="49" r="3" fill="#b45309" opacity="0.4"/>

              <!-- Center Pro Rosette Medal -->
              <g transform="translate(100, 84) scale(2.5) translate(-12, -12)">
                <path d="M12,23.3L8.65,20H4V15.35L0.7,12L4,8.65V4H8.65L12,0.7L15.35,4H20V8.65L23.3,12L20,15.35V20H15.35L12,23.3Z" fill="url(#f-rosette-gold)" stroke="#78350f" stroke-width="0.5"/>
                <circle cx="12" cy="12" r="7.5" fill="#fffbeb" stroke="#b45309" stroke-width="0.5"/>
                <path d="M9.08,16.25L12,14.48l2.93,1.78l-0.78-3.33l2.6-2.25L13.33,10.4L12,7.25L10.68,10.4L7.25,10.68l2.6,2.25L9.08,16.25Z" fill="url(#f-rosette-gold)"/>
              </g>

              <!-- PRO Pill Badge -->
              <rect x="74" y="122" width="52" height="22" rx="11" fill="#78350f"/>
              <rect x="75" y="123" width="50" height="20" rx="10" fill="url(#f-card-gold-bg)"/>
              <text x="100" y="137.5" text-anchor="middle" font-size="11" font-weight="900" font-family="system-ui, -apple-system, sans-serif" letter-spacing="2" fill="#78350f">PRO</text>
            </g>
          </svg>
        </div>
      </div>

      <div class="f-unlock-subtitle">${subtitle}</div>
      <div class="f-unlock-title">${title}</div>

      <div class="f-unlock-chips">
        <div class="f-unlock-chip">
          <span class="material-symbols-rounded text-sm" style="font-size: 16px;">bolt</span>
          <span>${t('unlimited_ai_tutor_chip')}</span>
        </div>
        <div class="f-unlock-chip">
          <span class="material-symbols-rounded text-sm" style="font-size: 16px;">auto_stories</span>
          <span>${t('deck_generations_label')}</span>
        </div>
        <div class="f-unlock-chip">
          <span class="material-symbols-rounded text-sm" style="font-size: 16px;">cloud_done</span>
          <span>${t('realtime_cloud_chip')}</span>
        </div>
        <div class="f-unlock-chip">
          <span class="material-symbols-rounded text-sm" style="font-size: 16px;">star</span>
          <span>${t('exclusive_features_chip')}</span>
        </div>
      </div>

      <button id="f-unlock-confirm-btn" class="f-unlock-btn">
        ${t('enjoy_now_btn')}
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Setup Canvas Particles
  const canvas = overlay.querySelector('#f-unlock-particles-canvas');
  let animationFrameId = null;
  let particles = [];

  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    class DiamondSparkle {
      constructor(cx, cy) {
        this.x = cx;
        this.y = cy;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 9 + 4;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = Math.random() * 8 + 4;
        this.color = Math.random() > 0.3 ? '#fde047' : '#ffffff';
        this.alpha = 1;
        this.decay = Math.random() * 0.015 + 0.01;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        this.isStar = Math.random() > 0.5;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.vy += 0.07;
        this.rotation += this.rotationSpeed;
        this.alpha -= this.decay;
      }
      draw(c) {
        if (this.alpha <= 0) return;
        c.save();
        c.globalAlpha = Math.max(0, this.alpha);
        c.translate(this.x, this.y);
        c.rotate(this.rotation);
        c.fillStyle = this.color;
        c.shadowColor = '#f59e0b';
        c.shadowBlur = 8;
        if (this.isStar) {
          c.beginPath();
          c.moveTo(0, -this.size);
          c.quadraticCurveTo(0, 0, this.size, 0);
          c.quadraticCurveTo(0, 0, 0, this.size);
          c.quadraticCurveTo(0, 0, -this.size, 0);
          c.quadraticCurveTo(0, 0, 0, -this.size);
          c.fill();
        } else {
          c.beginPath();
          c.moveTo(0, -this.size);
          c.lineTo(this.size * 0.7, 0);
          c.lineTo(0, this.size);
          c.lineTo(-this.size * 0.7, 0);
          c.closePath();
          c.fill();
        }
        c.restore();
      }
    }

    function spawnBurst() {
      const rect = overlay.querySelector('.f-unlock-badge-box')?.getBoundingClientRect();
      const cx = rect ? (rect.left + rect.width / 2) : (window.innerWidth / 2);
      const cy = rect ? (rect.top + rect.height / 2) : (window.innerHeight / 2.5);

      for (let i = 0; i < 75; i++) {
        particles.push(new DiamondSparkle(cx, cy));
      }
    }

    function renderParticles() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }
      if (particles.length > 0) {
        animationFrameId = requestAnimationFrame(renderParticles);
      }
    }

    // Schedule the impact sequence at 680ms
    setTimeout(() => {
      overlay.classList.add('unlocked-golden');
      overlay.querySelector('#f-unlock-blast')?.classList.add('animate');
      overlay.querySelector('#f-unlock-stage')?.classList.add('shake');

      spawnBurst();
      renderParticles();

      // Victory haptic pattern
      try {
        triggerHaptic([20, 30, 25, 60, 40]);
      } catch (e) {}
    }, 680);
  }

  // Dismiss handler
  function dismissCelebration() {
    if (!overlay) return;
    overlay.style.opacity = '0';
    overlay.style.transform = 'scale(1.04)';
    overlay.style.pointerEvents = 'none';

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    setTimeout(() => {
      overlay.remove();
      isCelebrationActive = false;
      if (typeof onComplete === 'function') {
        onComplete();
      }
    }, 400);
  }

  overlay.querySelector('#f-unlock-confirm-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissCelebration();
  });

  // Tap anywhere to dismiss after impact
  setTimeout(() => {
    overlay.addEventListener('click', dismissCelebration);
  }, 1200);

  // Escape key to dismiss
  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onKeydown);
      dismissCelebration();
    }
  };
  window.addEventListener('keydown', onKeydown);
}

// Bind to window for instant testing and global access
if (typeof window !== 'undefined') {
  window.triggerProUnlockAnimation = triggerProUnlockCelebration;
}
