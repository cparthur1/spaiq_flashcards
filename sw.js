// SPDX-License-Identifier: GPL-2.0-only
/*
 * Copyright (C) 2026 Arthur <arthur.paludo.c@gmail.com>
 */

const CACHE_NAME = 'flashcards-v15.10'; // Increment version to trigger update

const BASE_PATH = self.registration && self.registration.scope 
  ? new URL(self.registration.scope).pathname.replace(/\/$/, '') 
  : '';

const RAW_ASSETS = [
  '/',
  '/index.html',
  '/pages/game.html',
  '/pages/generate.html',
  '/pages/stats.html',
  '/pages/bulk-add.html',
  '/css/style.css',
  '/assets/fonts/fonts.css',
  '/assets/fonts/material-symbols-rounded.woff2',
  '/assets/fonts/roboto-flex.woff2',
  '/assets/vendor/material-web.bundle.js',
  '/assets/vendor/purify.min.js',
  '/js/i18n.js',
  '/js/index.js',
  '/js/game.js',
  '/js/account-modal.js',
  '/js/firebase-client.js',
  '/js/backend-api.js',
  '/js/slot-manager.js',
  '/js/share-manager.js',
  '/js/explore-modal.js',
  '/js/bulk-add.js',
  '/js/engine/scheduler.js',
  '/js/engine/notebook-scheduler.js',
  '/js/engine/effects.js',
  '/js/engine/pro-unlock-celebration.js',
  '/js/engine/input-controller.js',
  '/js/engine/tutor.js',
  '/js/engine/pomodoro.js',
  '/js/engine/notifications.js',
  '/js/engine/pwa-install.js',
  '/js/generate.js',
  '/js/stats.js',
  '/js/stats-tracker.js',
  '/js/stats-ai.js',
  '/js/key-manager.js',
  '/js/ripple.js',
  '/js/utils.js',
  '/js/config.js',
  '/js/pdf-worker.js',
  '/manifest.json',
  '/favicon.png',
  '/assets/img/favicon.png',
  '/assets/img/logo.svg',
  '/assets/img/logo.png',
  '/assets/img/badge.svg',
  '/assets/img/badge.png',
  '/assets/img/menu.svg',
  '/assets/img/stats.svg',
  '/assets/img/bulk_add.svg',
  '/assets/img/fire.svg',
  '/assets/img/config_ai.svg',
  '/assets/img/enabled_ai.svg',
  '/assets/img/highlight.svg',
  '/assets/img/tutor.svg',
  '/assets/img/open_chat.svg',
  '/assets/img/exit.svg',
  '/assets/img/open.svg',
  '/assets/img/open_double.svg',
  '/assets/img/fill.svg',
  '/assets/img/anki.svg',
  '/assets/img/multiple choice.svg',
  '/assets/img/comment.svg',
  '/assets/img/settings.svg',
  '/assets/img/notifications.svg',
  '/assets/img/paywall.svg',
  '/assets/img/PRO.svg',
  '/assets/img/open_folder.svg',
  '/assets/img/criar_novo.svg',
  '/assets/img/install_webapp/apple_share.png',
  '/assets/img/install_webapp/apple_add.png',
  '/assets/img/install_webapp/apple_add.svg',
  '/assets/img/apple_share.png',
  '/assets/img/apple_add.png',
  '/assets/img/apple_add.svg'
];

const ASSETS_TO_CACHE = RAW_ASSETS.map(p => p === '/' ? (BASE_PATH || '/') : `${BASE_PATH}${p}`);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch (e) {
            console.warn(`[SW] Aviso ao cachear ${url}:`, e);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./pages/game.html');
      }
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || 'Flashcards';
  const options = {
    body: data.body || 'Hora de revisar seus cards e acelerar seu aprendizado.',
    icon: `${BASE_PATH}/assets/img/logo.png`,
    badge: `${BASE_PATH}/assets/img/badge.png`,
    tag: data.tag || 'flashcards-push',
    renotify: true,
    data: data.data || { url: './pages/game.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

const ALLOWED_CDN_HOSTS = new Set([
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'esm.run'
]);

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategy: Network-first with no-cache for origin assets to always deliver fresh code
  if (ASSETS_TO_CACHE.includes(url.pathname) || url.origin === self.location.origin) {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }));
    return;
  }

  // Strategy: Cache-First for whitelisted CDNs
  if (ALLOWED_CDN_HOSTS.has(url.hostname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Default: Network-only
  event.respondWith(fetch(event.request));
});