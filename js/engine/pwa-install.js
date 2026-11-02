// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/engine/pwa-install.js
 * PWA Installation Banner & Instructions for Mobile & Tablet (iOS & Android)
 * Material Design 3 Expressive.
 */

import { t } from '../i18n.js';

let deferredPrompt = (typeof window !== 'undefined' && window.deferredPrompt) ? window.deferredPrompt : null;
let bannerEl = null;

// Capture the beforeinstallprompt event as early as possible
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.deferredPrompt = e;
  });
}

/**
 * Check if running as a standalone installed PWA
 */
export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true ||
    (typeof document !== 'undefined' && document.referrer.includes('android-app://'))
  );
}

/**
 * Check if the user is using a phone or tablet
 */
export function isMobileOrTablet() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouch = navigator.maxTouchPoints > 0;
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIPad = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSmallScreen = window.matchMedia('(max-width: 1024px)').matches && isTouch;
  return (isMobileUa || isIPad || isSmallScreen);
}

/**
 * Check if using an Apple iOS or iPadOS device
 */
export function isAppleDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Get assets root path based on current directory
 */
function getAssetsRoot() {
  return (typeof window !== 'undefined' && window.location.pathname.includes('/pages/')) ? '../' : './';
}

/**
 * Show iOS installation steps modal
 */
export function showIosInstallModal() {
  const existing = document.getElementById('pwa-ios-install-modal');
  if (existing) existing.remove();

  const assetsRoot = getAssetsRoot();
  const modal = document.createElement('div');
  modal.id = 'pwa-ios-install-modal';
  modal.className = 'fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none transition-opacity duration-300 opacity-0';

  modal.innerHTML = `
    <div class="m3-dialog-card w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-gray-200 text-center space-y-4 transform transition-transform duration-300 translate-y-8 sm:translate-y-0 sm:scale-95">
      <div class="flex items-center justify-between pb-1 border-b border-gray-100">
        <div class="flex items-center gap-2.5 text-left">
          <div class="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-rounded text-2xl">install_mobile</span>
          </div>
          <div>
            <h3 class="text-sm font-bold text-gray-900 leading-tight">${t('pwa_install_ios_title')}</h3>
            <p class="text-[11px] text-gray-500">${t('add_to_home_fullscreen')}</p>
          </div>
        </div>
        <button id="pwa-ios-modal-x" class="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
          <span class="material-symbols-rounded text-xl">close</span>
        </button>
      </div>

      <div class="space-y-2.5 text-left text-xs bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
        <!-- Passo 1 -->
        <div class="flex items-center gap-3 p-2.5 bg-white rounded-xl shadow-2xs border border-gray-100">
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">1</div>
          <div class="flex-1 flex items-center gap-1.5 flex-wrap">
            <span class="text-gray-700">${t('pwa_click_label')}</span>
            <img src="${assetsRoot}assets/img/install_webapp/apple_share.png" onerror="this.onerror=null; this.src='${assetsRoot}assets/img/apple_share.png';" alt="${t('pwa_share_word')}" class="h-6 w-auto inline-block p-0.5 bg-gray-50 rounded border border-gray-200 shadow-2xs align-middle">
            <strong class="text-gray-900 font-semibold">${t('pwa_share_word')}</strong>
          </div>
        </div>

        <!-- Passo 2 -->
        <div class="flex items-center gap-3 p-2.5 bg-white rounded-xl shadow-2xs border border-gray-100">
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">2</div>
          <div class="flex-1 flex items-center gap-1.5 flex-wrap">
            <img src="${assetsRoot}assets/img/install_webapp/apple_add.png" onerror="this.onerror=null; this.src='${assetsRoot}assets/img/apple_add.png';" alt="${t('pwa_add_to_home_screen')}" class="h-6 w-auto inline-block p-0.5 bg-gray-50 rounded border border-gray-200 shadow-2xs align-middle">
            <strong class="text-gray-900 font-semibold">${t('pwa_add_to_home_screen')}</strong>
          </div>
        </div>

        <!-- Passo 3 -->
        <div class="flex items-center gap-3 p-2.5 bg-white rounded-xl shadow-2xs border border-gray-100">
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">3</div>
          <div class="flex-1 text-gray-900 font-semibold">
            ${t('pwa_open_as_webapp')}
          </div>
        </div>
      </div>

      <button id="pwa-ios-modal-close" class="m3-btn-expressive m3-btn-filled w-full py-3 px-4 text-xs font-bold rounded-xl shadow-xs cursor-pointer">
        ${t('got_it_btn')}
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    const card = modal.querySelector('.m3-dialog-card');
    if (card) {
      card.classList.remove('translate-y-8', 'sm:scale-95');
    }
  });

  const closeModal = () => {
    modal.classList.add('opacity-0');
    const card = modal.querySelector('.m3-dialog-card');
    if (card) {
      card.classList.add('translate-y-8', 'sm:scale-95');
    }
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('#pwa-ios-modal-x')?.addEventListener('click', closeModal);
  modal.querySelector('#pwa-ios-modal-close')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/**
 * Show Android installation instructions modal if native prompt is not active
 */
export function showAndroidInstallModal() {
  const existing = document.getElementById('pwa-android-install-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pwa-android-install-modal';
  modal.className = 'fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none transition-opacity duration-300 opacity-0';

  modal.innerHTML = `
    <div class="m3-dialog-card w-full max-w-sm bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-gray-200 text-center space-y-4 transform transition-transform duration-300 translate-y-8 sm:translate-y-0 sm:scale-95">
      <div class="flex items-center justify-between pb-1 border-b border-gray-100">
        <div class="flex items-center gap-2.5 text-left">
          <div class="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-rounded text-2xl">install_mobile</span>
          </div>
          <div>
            <h3 class="text-sm font-bold text-gray-900 leading-tight">${t('pwa_install_android_title')}</h3>
            <p class="text-[11px] text-gray-500">${t('add_to_home_fullscreen')}</p>
          </div>
        </div>
        <button id="pwa-android-modal-x" class="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
          <span class="material-symbols-rounded text-xl">close</span>
        </button>
      </div>

      <div class="space-y-2.5 text-left text-xs bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
        <div class="flex items-center gap-3 p-2 bg-white rounded-xl shadow-2xs border border-gray-100">
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">1</div>
          <div class="flex-1 text-gray-700">
            ${t('pwa_android_step1_html')}
          </div>
        </div>

        <div class="flex items-center gap-3 p-2 bg-white rounded-xl shadow-2xs border border-gray-100">
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">2</div>
          <div class="flex-1 text-gray-700">
            ${t('pwa_android_step2_html')}
          </div>
        </div>

        <div class="flex items-center gap-3 p-2 bg-white rounded-xl shadow-2xs border border-gray-100">
          <div class="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">3</div>
          <div class="flex-1 text-gray-700">
            ${t('pwa_open_created_icon')}
          </div>
        </div>
      </div>

      <button id="pwa-android-modal-close" class="m3-btn-expressive m3-btn-filled w-full py-3 px-4 text-xs font-bold rounded-xl shadow-xs cursor-pointer">
        ${t('got_it_btn')}
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  requestAnimationFrame(() => {
    modal.classList.remove('opacity-0');
    const card = modal.querySelector('.m3-dialog-card');
    if (card) {
      card.classList.remove('translate-y-8', 'sm:scale-95');
    }
  });

  const closeModal = () => {
    modal.classList.add('opacity-0');
    const card = modal.querySelector('.m3-dialog-card');
    if (card) {
      card.classList.add('translate-y-8', 'sm:scale-95');
    }
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('#pwa-android-modal-x')?.addEventListener('click', closeModal);
  modal.querySelector('#pwa-android-modal-close')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/**
 * Handle user clicking the "Instalar" button
 */
export async function triggerInstallAction() {
  if (isAppleDevice()) {
    showIosInstallModal();
    return;
  }

  // Android / Chromium: use beforeinstallprompt
  const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? window.deferredPrompt : null);
  if (promptEvent) {
    try {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        dismissPwaInstallBanner();
      }
      deferredPrompt = null;
      if (typeof window !== 'undefined') window.deferredPrompt = null;
    } catch (e) {
      console.warn('[PWA Install] Erro ao invocar prompt nativo:', e);
      showAndroidInstallModal();
    }
  } else {
    // If prompt not available, show manual instructions
    showAndroidInstallModal();
  }
}

/**
 * Dismiss and remove banner
 */
export function dismissPwaInstallBanner() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('flashcards_pwa_banner_dismissed', 'true');
  }
  if (bannerEl) {
    bannerEl.style.opacity = '0';
    bannerEl.style.transform = 'translateY(-12px)';
    setTimeout(() => {
      bannerEl?.remove();
      bannerEl = null;
    }, 300);
  }
}

/**
 * Initialize and display PWA installation notification on mobile / tablet in game
 */
export function initPwaInstallBanner() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Don't show if already running as standalone app
  if (isStandaloneApp()) {
    return;
  }

  // Only show for phones and tablets
  if (!isMobileOrTablet()) {
    return;
  }

  // Check if dismissed in this session
  if (sessionStorage.getItem('flashcards_pwa_banner_dismissed') === 'true') {
    return;
  }

  // Wait a moment so page finishes initial rendering smoothly
  setTimeout(() => {
    if (document.getElementById('pwa-install-notification-banner')) return;

    bannerEl = document.createElement('div');
    bannerEl.id = 'pwa-install-notification-banner';
    bannerEl.className = 'fixed top-14 sm:top-16 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-40 flex items-center justify-between gap-3 p-3 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-blue-200 transition-all duration-300 transform -translate-y-4 opacity-0 select-none';

    bannerEl.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 shadow-2xs">
          <span class="material-symbols-rounded text-xl">install_mobile</span>
        </div>
        <p class="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">
          ${t('pwa_install_better_experience')}
        </p>
      </div>

      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button id="pwa-install-action-btn" class="m3-btn-expressive m3-btn-filled py-1.5 px-3 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs cursor-pointer flex items-center gap-1 transition">
          <span class="material-symbols-rounded text-base">download</span>
          <span>${t('install_btn')}</span>
        </button>
        <button id="pwa-install-dismiss-btn" class="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer" title="${t('dismiss_notice_title')}">
          <span class="material-symbols-rounded text-lg">close</span>
        </button>
      </div>
    `;

    document.body.appendChild(bannerEl);

    // Fade and slide in
    requestAnimationFrame(() => {
      if (bannerEl) {
        bannerEl.style.opacity = '1';
        bannerEl.style.transform = 'translateY(0)';
      }
    });

    // Event listeners
    bannerEl.querySelector('#pwa-install-action-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerInstallAction();
    });

    bannerEl.querySelector('#pwa-install-dismiss-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissPwaInstallBanner();
    });
  }, 1200);
}
