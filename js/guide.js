// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/guide.js
 * Controller for the Scientific Guide Article: "How to Write Good Flashcards"
 * Manages reading progress tracking, table of contents intersection observer,
 * interactive Bloom's Taxonomy explorer, and copyable card templates.
 */

import { initI18n, setupHeaderLanguageMenu, t } from './i18n.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Language selector in top app bar
    setupHeaderLanguageMenu('guide-lang-btn', 'guide-lang-dropdown', 'guide-lang-label');

    // 2. Reading Progress Bar Tracking
    const progressBar = document.getElementById('reading-progress-bar');
    function updateReadingProgress() {
        if (!progressBar) return;
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (totalHeight <= 0) {
            progressBar.style.width = '0%';
            return;
        }
        const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100));
        progressBar.style.width = `${progress}%`;
    }
    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    updateReadingProgress();

    // 3. Table of Contents Intersection Observer for Active State
    const tocLinks = document.querySelectorAll('.article-toc-link');
    const sections = document.querySelectorAll('article section[id]');

    if (sections.length > 0 && tocLinks.length > 0) {
        const observerOptions = {
            root: null,
            rootMargin: '-20% 0px -60% 0px',
            threshold: 0
        };

        const activeObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    tocLinks.forEach((link) => {
                        const href = link.getAttribute('href');
                        if (href === `#${id}`) {
                            link.classList.add('active');
                            // Ensure visible on mobile horizontal scroll
                            link.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        } else {
                            link.classList.remove('active');
                        }
                    });
                }
            });
        }, observerOptions);

        sections.forEach((sec) => activeObserver.observe(sec));
    }

    // 4. Interactive Bloom's Taxonomy Level Switcher
    const bloomTabs = document.querySelectorAll('.bloom-tab-btn');
    const bloomPanels = document.querySelectorAll('.bloom-panel');

    bloomTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const targetLevel = tab.getAttribute('data-bloom-level');

            bloomTabs.forEach((t) => {
                t.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
                t.classList.add('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
                t.setAttribute('aria-selected', 'false');
            });

            tab.classList.remove('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
            tab.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
            tab.setAttribute('aria-selected', 'true');

            bloomPanels.forEach((panel) => {
                if (panel.getAttribute('data-bloom-level') === targetLevel) {
                    panel.classList.remove('hidden');
                    panel.classList.add('animate-fade-in');
                } else {
                    panel.classList.add('hidden');
                    panel.classList.remove('animate-fade-in');
                }
            });
        });
    });

    // 5. Copyable Card Template Snippets with Toast
    const copyBtns = document.querySelectorAll('.copy-template-btn');
    const toast = document.getElementById('guide-toast');
    let toastTimeout = null;

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
        toast.classList.add('opacity-100', 'translate-y-0');

        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
            toast.classList.remove('opacity-100', 'translate-y-0');
        }, 3000);
    }

    copyBtns.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const targetId = btn.getAttribute('data-copy-target');
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;

            const textToCopy = targetEl.getAttribute('data-raw-text') || targetEl.textContent.trim();
            try {
                await navigator.clipboard.writeText(textToCopy);
                showToast(t('article_copied_toast'));
                
                const icon = btn.querySelector('.material-symbols-rounded');
                if (icon) {
                    const originalText = icon.textContent;
                    icon.textContent = 'check';
                    setTimeout(() => {
                        icon.textContent = originalText;
                    }, 2000);
                }
            } catch (err) {
                console.error('[Guide] Failed to copy:', err);
                showToast('Erro ao copiar texto.');
            }
        });
    });
});
