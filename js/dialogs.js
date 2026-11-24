/**
 * js/dialogs.js
 * Material Design 3 Expressive custom dialogs replacing native alert(), confirm(), and prompt().
 * Uses native <dialog> top-layer modal with accessible focus management, keyboard handling,
 * overscroll containment, and GPU-composited entry/exit animations.
 */

import { t } from './i18n.js';

let dialogQueue = Promise.resolve();
let supportsDisplayTransitionCache;

function canTransitionDisplay() {
    if (supportsDisplayTransitionCache !== undefined) return supportsDisplayTransitionCache;
    if (typeof window === 'undefined' || !window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
        return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransitionCache = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransitionCache;
}

function supportsTopLayerExit() {
    return Boolean(typeof window !== 'undefined' && window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
}

async function closeDialogWithMotion(dialog, returnValue = '') {
    if (!dialog || !dialog.open) return;
    if (dialog.hasAttribute('data-closing')) return;

    if (!supportsTopLayerExit()) {
        dialog.setAttribute('data-closing', '');
        try {
            const animations = typeof dialog.getAnimations === 'function'
                ? dialog.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming?.().iterations !== Infinity)
                : [];
            if (animations.length > 0) {
                await Promise.race([
                    Promise.allSettled(animations.map((a) => a.finished)),
                    new Promise((resolve) => setTimeout(resolve, 160))
                ]);
            } else {
                await new Promise((resolve) => setTimeout(resolve, 130));
            }
        } catch {
            // fallback immediate close
        }
        dialog.removeAttribute('data-closing');
    }

    if (dialog.open) {
        dialog.close(returnValue);
    }
}

const VARIANT_STYLES = {
    info: {
        icon: 'info',
        badgeBg: 'bg-blue-50 text-[#3b82f7] border-blue-200/80',
        confirmBtn: 'bg-[#3b82f7] hover:bg-blue-600 text-white shadow-sm'
    },
    primary: {
        icon: 'help',
        badgeBg: 'bg-blue-50 text-[#3b82f7] border-blue-200/80',
        confirmBtn: 'bg-[#3b82f7] hover:bg-blue-600 text-white shadow-sm'
    },
    success: {
        icon: 'check_circle',
        badgeBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/80',
        confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
    },
    warning: {
        icon: 'warning',
        badgeBg: 'bg-amber-50 text-amber-600 border-amber-200/80',
        confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
    },
    danger: {
        icon: 'delete_forever',
        badgeBg: 'bg-red-50 text-red-600 border-red-200/80',
        confirmBtn: 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
    }
};

function inferAlertVariant(message) {
    const msg = String(message || '').toLowerCase();
    if (/(sucesso|success|restaurad|restored|importad|imported|reativad|reactivated|confirmad|confirmed|liberado|unlocked)/.test(msg)) {
        return 'success';
    }
    if (/(erro|error|falha|failed|inválid|invalid|negad|denied|bloquead|blocked|limite|quota|vazio|empty|não suportad|not supported)/.test(msg)) {
        return 'warning';
    }
    return 'info';
}

function inferConfirmVariant(message) {
    const msg = String(message || '').toLowerCase();
    if (/(excluir|deletar|apagar|remover|limpar|cancelar assinatura|revogar|permanente|irrevog|delete|remove|clear|cancel subscription|revoke|permanently)/.test(msg)) {
        return 'danger';
    }
    return 'primary';
}

function enqueueDialog(factory) {
    const resultPromise = dialogQueue.then(factory, factory);
    dialogQueue = resultPromise.then(() => undefined, () => undefined);
    return resultPromise;
}

function showBaseDialog({
    mode = 'alert',
    title = '',
    message = '',
    defaultValue = '',
    placeholder = '',
    confirmText = '',
    cancelText = '',
    variant = '',
    icon = '',
    lightDismiss = true
} = {}) {
    return enqueueDialog(() => new Promise((resolve) => {
        if (typeof document === 'undefined' || !document.body) {
            resolve(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined);
            return;
        }

        const resolvedVariant = variant || (mode === 'confirm' ? inferConfirmVariant(message) : mode === 'alert' ? inferAlertVariant(message) : 'primary');
        const styleSpec = VARIANT_STYLES[resolvedVariant] || VARIANT_STYLES.info;
        const resolvedIcon = icon || (mode === 'prompt' ? 'edit_note' : styleSpec.icon);
        const resolvedTitle = title || (
            mode === 'confirm'
                ? (resolvedVariant === 'danger' ? t('dialog_danger_title') : t('dialog_confirm_title'))
                : mode === 'prompt'
                    ? t('dialog_prompt_title')
                    : t('dialog_alert_title')
        );
        const resolvedConfirm = confirmText || (mode === 'alert' ? t('dialog_ok') : t('dialog_confirm'));
        const resolvedCancel = cancelText || t('cancel');

        const dialog = document.createElement('dialog');
        dialog.className = 'm3-app-dialog';
        const titleId = `m3-app-dialog-title-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const descId = `m3-app-dialog-desc-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        dialog.setAttribute('aria-labelledby', titleId);
        dialog.setAttribute('aria-describedby', descId);
        if (lightDismiss) {
            dialog.setAttribute('closedby', 'any');
        }

        const form = document.createElement('form');
        form.method = 'dialog';
        form.className = 'flex flex-col';

        // Content area
        const body = document.createElement('div');
        body.className = 'p-6 pb-4 flex flex-col gap-3.5';

        const headerRow = document.createElement('div');
        headerRow.className = 'flex items-start gap-3.5';

        const iconWrap = document.createElement('div');
        iconWrap.className = `w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${styleSpec.badgeBg}`;
        const iconSpan = document.createElement('span');
        iconSpan.className = 'material-symbols-rounded text-2xl select-none';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.textContent = resolvedIcon;
        iconWrap.appendChild(iconSpan);

        const textWrap = document.createElement('div');
        textWrap.className = 'min-w-0 flex-1 pt-0.5 text-left';

        const heading = document.createElement('h1');
        heading.id = titleId;
        heading.className = 'text-base sm:text-lg font-extrabold text-[var(--md-sys-color-on-surface)] leading-snug tracking-tight';
        heading.textContent = resolvedTitle;

        const desc = document.createElement('p');
        desc.id = descId;
        desc.className = 'mt-1.5 text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed whitespace-pre-line break-words';
        desc.textContent = String(message ?? '');

        textWrap.appendChild(heading);
        textWrap.appendChild(desc);
        headerRow.appendChild(iconWrap);
        headerRow.appendChild(textWrap);
        body.appendChild(headerRow);

        let promptInput = null;
        if (mode === 'prompt') {
            promptInput = document.createElement('input');
            promptInput.type = 'text';
            promptInput.value = String(defaultValue ?? '');
            promptInput.placeholder = placeholder || t('dialog_input_placeholder');
            promptInput.autocomplete = 'off';
            promptInput.className = 'w-full px-3.5 py-2.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] text-sm font-medium text-[var(--md-sys-color-on-surface)] focus:bg-white focus:outline-none focus:border-[#3b82f7] focus:ring-2 focus:ring-[#3b82f7]/25 transition';
            body.appendChild(promptInput);
        }

        // Actions footer
        const footer = document.createElement('div');
        footer.className = 'px-6 py-4 bg-[var(--md-sys-color-surface-container-low)]/80 border-t border-[var(--md-sys-color-outline-variant)]/80 flex items-center justify-end gap-2.5';

        let cancelBtn = null;
        if (mode === 'confirm' || mode === 'prompt') {
            cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'm3-btn-expressive px-4 py-2 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)] bg-transparent hover:bg-[var(--md-sys-color-surface-container-high)] rounded-full transition cursor-pointer';
            cancelBtn.textContent = resolvedCancel;
            if (mode === 'confirm' && resolvedVariant === 'danger') {
                cancelBtn.autofocus = true;
            }
            cancelBtn.addEventListener('click', () => {
                closeDialogWithMotion(dialog, 'cancel');
            });
            footer.appendChild(cancelBtn);
        }

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'submit';
        confirmBtn.value = 'confirm';
        confirmBtn.className = `m3-btn-expressive px-5 py-2 text-sm font-bold rounded-full transition cursor-pointer ${styleSpec.confirmBtn}`;
        confirmBtn.textContent = resolvedConfirm;
        if (mode === 'alert' || (mode === 'confirm' && resolvedVariant !== 'danger')) {
            confirmBtn.autofocus = true;
        }
        footer.appendChild(confirmBtn);

        form.appendChild(body);
        form.appendChild(footer);
        dialog.appendChild(form);
        document.body.appendChild(dialog);

        let settled = false;
        const finish = (choice) => {
            if (settled) return;
            settled = true;
            dialog.returnValue = '';
            // Allow exit transition to finish cleanly before DOM removal
            setTimeout(() => {
                dialog.remove();
            }, supportsTopLayerExit() ? 150 : 20);

            if (mode === 'confirm') {
                resolve(choice === 'confirm');
            } else if (mode === 'prompt') {
                resolve(choice === 'confirm' ? (promptInput ? promptInput.value : '') : null);
            } else {
                resolve(undefined);
            }
        };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            closeDialogWithMotion(dialog, 'confirm');
        });

        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            closeDialogWithMotion(dialog, 'cancel');
        });

        dialog.addEventListener('close', () => {
            finish(dialog.returnValue || 'cancel');
        });

        // Fallback light dismiss for browsers without closedby="any" (e.g., Safari)
        if (lightDismiss && !('closedBy' in HTMLDialogElement.prototype)) {
            const isOutside = (e) => {
                const r = dialog.getBoundingClientRect();
                return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
            };
            let pressedOutside = false;
            dialog.addEventListener('pointerdown', (e) => {
                pressedOutside = isOutside(e);
            });
            dialog.addEventListener('pointerup', (e) => {
                if (pressedOutside && isOutside(e)) {
                    closeDialogWithMotion(dialog, 'cancel');
                }
                pressedOutside = false;
            });
        }

        try {
            dialog.showModal();
        } catch {
            dialog.remove();
            resolve(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined);
            return;
        }

        if (promptInput) {
            requestAnimationFrame(() => {
                promptInput.focus();
                promptInput.select();
            });
        }
    }));
}

/**
 * Custom M3 Expressive replacement for window.alert().
 * @param {string} message
 * @param {Object} [options]
 * @returns {Promise<void>}
 */
export function appAlert(message, options = {}) {
    return showBaseDialog({ mode: 'alert', message, ...options });
}

/**
 * Custom M3 Expressive replacement for window.confirm().
 * @param {string} message
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
export function appConfirm(message, options = {}) {
    return showBaseDialog({ mode: 'confirm', message, ...options });
}

/**
 * Custom M3 Expressive replacement for window.prompt().
 * @param {string} message
 * @param {string} [defaultValue]
 * @param {Object} [options]
 * @returns {Promise<string|null>}
 */
export function appPrompt(message, defaultValue = '', options = {}) {
    return showBaseDialog({ mode: 'prompt', message, defaultValue, ...options });
}
