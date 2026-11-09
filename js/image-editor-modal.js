// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/image-editor-modal.js
 * Image Cropping & Arrow Annotation Module (Material Design 3 Expressive)
 * Allows cropping images and adding arrows on top of fetched web links without
 * saving raster data/files into the deck JSON, preserving storage limits.
 */

import { t } from './i18n.js';
import { sanitizeImageUrl } from './utils.js';

const activePreloaders = new Set();

export const ARROW_COLORS = [
    { name: 'blue', hex: '#3b82f7' },
    { name: 'red', hex: '#ef4444' },
    { name: 'yellow', hex: '#eab308' },
    { name: 'green', hex: '#10b981' },
    { name: 'white', hex: '#ffffff' }
];

/**
 * Returns background, border, and badge color tokens for arrow-matching UI.
 */
export function getArrowColorTheme(hex) {
    const clean = (hex || '#3b82f7').toLowerCase();
    switch (clean) {
        case '#ef4444':
            return {
                bg: '#fef2f2',
                border: '#fca5a5',
                focusRing: '#ef4444',
                badgeBg: '#ef4444',
                badgeText: '#ffffff',
                textColor: '#991b1b',
                name: 'Vermelho'
            };
        case '#eab308':
            return {
                bg: '#fefce8',
                border: '#fde047',
                focusRing: '#eab308',
                badgeBg: '#eab308',
                badgeText: '#ffffff',
                textColor: '#854d0e',
                name: 'Amarelo'
            };
        case '#10b981':
            return {
                bg: '#ecfdf5',
                border: '#6ee7b7',
                focusRing: '#10b981',
                badgeBg: '#10b981',
                badgeText: '#ffffff',
                textColor: '#065f46',
                name: 'Verde'
            };
        case '#ffffff':
            return {
                bg: '#f8fafc',
                border: '#cbd5e1',
                focusRing: '#64748b',
                badgeBg: '#475569',
                badgeText: '#ffffff',
                textColor: '#1e293b',
                name: 'Branco'
            };
        case '#3b82f7':
        default:
            return {
                bg: '#eff6ff',
                border: '#93c5fd',
                focusRing: '#3b82f7',
                badgeBg: '#3b82f7',
                badgeText: '#ffffff',
                textColor: '#1e40af',
                name: 'Azul'
            };
    }
}

/**
 * Calculates vector coordinates for an arrow shaft and arrowhead.
 */
function calculateArrowSvgParts(arrow, naturalWidth, naturalHeight) {
    const x1 = (arrow.startX / 100) * naturalWidth;
    const y1 = (arrow.startY / 100) * naturalHeight;
    const x2 = (arrow.endX / 100) * naturalWidth;
    const y2 = (arrow.endY / 100) * naturalHeight;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;

    const angle = Math.atan2(dy, dx);
    const minDim = Math.min(naturalWidth, naturalHeight);

    // Dynamic sizing based on image dimensions
    const headLen = Math.max(14, Math.min(minDim * 0.045, 36));
    const headWidth = headLen * 0.75;
    const shaftWidth = Math.max(2.5, Math.min(minDim * 0.009, 6));

    // Base coordinates for arrowhead triangle
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cosPerp = -sinA;
    const sinPerp = cosA;

    // Arrowhead tip is at (x2, y2)
    // Left and right corners of arrowhead base
    const baseCenterX = x2 - headLen * cosA;
    const baseCenterY = y2 - headLen * sinA;

    const leftX = baseCenterX + (headWidth / 2) * cosPerp;
    const leftY = baseCenterY + (headWidth / 2) * sinPerp;

    const rightX = baseCenterX - (headWidth / 2) * cosPerp;
    const rightY = baseCenterY - (headWidth / 2) * sinPerp;

    // Sleek inner notch for modern chevron arrow
    const notchX = x2 - headLen * 0.72 * cosA;
    const notchY = y2 - headLen * 0.72 * sinA;

    return {
        x1, y1, x2, y2,
        shaftEndX: notchX,
        shaftEndY: notchY,
        leftX, leftY,
        rightX, rightY,
        notchX, notchY,
        shaftWidth,
        color: arrow.color || '#3b82f7'
    };
}

/**
 * Generates SVG markup for all arrows given natural pixel dimensions.
 */
export function buildArrowsSvgContent(arrows, naturalWidth, naturalHeight, { showNumbers = false } = {}) {
    if (!Array.isArray(arrows) || arrows.length === 0) return '';

    const minDim = Math.min(naturalWidth, naturalHeight);
    const badgeRadius = Math.max(12, Math.min(minDim * 0.034, 24));
    const badgeFontSize = Math.max(11, Math.min(badgeRadius * 1.12, 19));

    return arrows.map((arrow, idx) => {
        const parts = calculateArrowSvgParts(arrow, naturalWidth, naturalHeight);
        if (!parts) return '';

        const filterId = `arrow-shadow-${Math.random().toString(36).slice(2, 8)}-${idx}`;
        const isWhite = (parts.color || '').toLowerCase() === '#ffffff';
        const numColor = isWhite ? '#0f172a' : '#ffffff';

        const numberBadgeMarkup = showNumbers ? `
            <!-- Number badge at arrow start (non-pointed end) -->
            <g class="arrow-number-badge" data-badge-index="${idx}">
                <circle cx="${parts.x1}" cy="${parts.y1}" r="${badgeRadius}"
                    fill="${parts.color}" stroke="#ffffff" stroke-width="2.5" />
                <text x="${parts.x1}" y="${parts.y1}"
                    fill="${numColor}" font-size="${badgeFontSize}" font-weight="900"
                    font-family="system-ui, -apple-system, sans-serif" text-anchor="middle" dominant-baseline="central">${idx + 1}</text>
            </g>
        ` : '';

        return `
            <g class="arrow-group ${showNumbers ? 'cursor-pointer hover:opacity-95' : ''}" data-arrow-index="${idx}" style="${showNumbers ? 'cursor: pointer;' : ''}">
                <defs>
                    <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.75" />
                    </filter>
                </defs>
                <g filter="url(#${filterId})">
                    <!-- Contrast outline underneath for maximum legibility on any background -->
                    <line x1="${parts.x1}" y1="${parts.y1}" x2="${parts.shaftEndX}" y2="${parts.shaftEndY}"
                        stroke="#ffffff" stroke-width="${parts.shaftWidth + 3}" stroke-linecap="round" opacity="0.85" />
                    
                    <!-- Colored shaft -->
                    <line x1="${parts.x1}" y1="${parts.y1}" x2="${parts.shaftEndX}" y2="${parts.shaftEndY}"
                        stroke="${parts.color}" stroke-width="${parts.shaftWidth}" stroke-linecap="round" />
                    
                    <!-- Arrowhead outline -->
                    <polygon points="${parts.x2},${parts.y2} ${parts.leftX},${parts.leftY} ${parts.notchX},${parts.notchY} ${parts.rightX},${parts.rightY}"
                        fill="${parts.color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
                    
                    ${numberBadgeMarkup}
                </g>
            </g>
        `;
    }).join('');
}

/**
 * Checks whether an image has custom crop or arrow annotations.
 */
export function isImageAnnotated(crop, arrows) {
    const hasCrop = crop && typeof crop === 'object' &&
        (crop.x > 0.5 || crop.y > 0.5 || crop.width < 99.5 || crop.height < 99.5);
    const hasArrows = Array.isArray(arrows) && arrows.length > 0;
    return Boolean(hasCrop || hasArrows);
}

/**
 * Renders an annotated (cropped + arrows) image or clean standard image
 * into the specified container element.
 */
export function renderAnnotatedImage({
    container,
    imgElem = null,
    placeholderElem = null,
    errorElem = null,
    imageUrl,
    crop = null,
    arrows = [],
    alt = 'Imagem',
    maxHClass = 'max-h-48 sm:max-h-72',
    zoomable = false,
    showNumbers = false,
    onArrowClick = null,
    onClick = null,
    isImageArrows = false
}) {
    if (!container) return;

    const safeUrl = sanitizeImageUrl(imageUrl);
    const isArrowCard = Boolean(showNumbers || isImageArrows);

    const showNotFoundPlaceholder = () => {
        container.classList.remove('hidden');
        if (placeholderElem) placeholderElem.classList.add('hidden');
        const dynamicLoader = container.querySelector('.dynamic-image-loading-placeholder');
        if (dynamicLoader) dynamicLoader.remove();
        if (imgElem) {
            imgElem.classList.add('hidden');
            imgElem.src = '';
        }
        const oldWrap = container.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();

        if (errorElem) {
            errorElem.classList.remove('hidden');
        } else {
            let notFound = container.querySelector('.image-not-found-placeholder');
            if (!notFound) {
                notFound = document.createElement('div');
                notFound.className = `image-not-found-placeholder w-full max-w-sm sm:max-w-md ${maxHClass} rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant,#cbd5e1)] bg-[var(--md-sys-color-surface-container-low,#f8fafc)] flex flex-col items-center justify-center p-4 text-center select-none shadow-xs space-y-1.5 animate-fadeIn`;
                notFound.innerHTML = `
                    <span class="material-symbols-rounded text-3xl sm:text-4xl text-[#3b82f7]">broken_image</span>
                    <p class="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface,#0f172a)]">${t('image_not_found') || 'Imagem não encontrada'}</p>
                    <p class="text-[11px] text-[var(--md-sys-color-on-surface-variant,#64748b)] max-w-xs leading-normal">${t('image_not_found_desc') || 'O link da imagem está quebrado ou inacessível.'}</p>
                `;
                container.appendChild(notFound);
            }
            notFound.classList.remove('hidden');
        }
    };

    const hideLoaders = () => {
        if (placeholderElem) placeholderElem.classList.add('hidden');
        const dynamicLoader = container.querySelector('.dynamic-image-loading-placeholder');
        if (dynamicLoader) dynamicLoader.remove();
    };

    if (!safeUrl) {
        if (isArrowCard) {
            showNotFoundPlaceholder();
            return;
        }
        container.classList.add('hidden');
        if (placeholderElem) placeholderElem.classList.add('hidden');
        if (errorElem) errorElem.classList.add('hidden');
        const notFound = container.querySelector('.image-not-found-placeholder');
        if (notFound) notFound.remove();
        if (imgElem) {
            imgElem.classList.add('hidden');
            imgElem.src = '';
        }
        // Remove any dynamic annotated wrapper
        const oldWrap = container.querySelector('.annotated-image-wrapper');
        if (oldWrap) oldWrap.remove();
        return;
    }

    container.classList.remove('hidden');
    if (errorElem) errorElem.classList.add('hidden');
    const existingNotFound = container.querySelector('.image-not-found-placeholder');
    if (existingNotFound) existingNotFound.remove();

    if (placeholderElem) {
        placeholderElem.classList.remove('hidden');
    } else {
        let dynamicLoader = container.querySelector('.dynamic-image-loading-placeholder');
        if (!dynamicLoader) {
            dynamicLoader = document.createElement('div');
            dynamicLoader.className = `dynamic-image-loading-placeholder image-loading-placeholder w-full max-w-sm sm:max-w-md ${maxHClass} rounded-2xl flex flex-col items-center justify-center gap-2 select-none shadow-sm min-h-[140px]`;
            dynamicLoader.innerHTML = `
                <span class="material-symbols-rounded text-3xl text-[var(--md-sys-color-on-surface-variant,#64748b)] opacity-40 animate-pulse">image</span>
                <span class="text-xs font-medium text-[var(--md-sys-color-on-surface-variant,#64748b)] opacity-60">${t('loading_image') || 'Carregando imagem...'}</span>
            `;
            container.appendChild(dynamicLoader);
        }
        dynamicLoader.classList.remove('hidden');
    }

    const hasCrop = crop && typeof crop === 'object' &&
        (crop.width > 0 && crop.height > 0 && (crop.x > 0.5 || crop.y > 0.5 || crop.width < 99.5 || crop.height < 99.5));
    const hasArrows = Array.isArray(arrows) && arrows.length > 0;
    const isAnnotated = Boolean(hasCrop || hasArrows);

    // Clean any existing dynamic wrapper from previous renders
    const oldWrap = container.querySelector('.annotated-image-wrapper');
    if (oldWrap) oldWrap.remove();

    // Fast-path: plain unannotated image with a dedicated existing <img> element
    if (!isAnnotated && imgElem) {
        imgElem.referrerPolicy = 'no-referrer';
        imgElem.alt = alt;
        if (zoomable) {
            imgElem.classList.add('cursor-pointer', 'card-img-zoomable');
        }
        if (onClick) {
            imgElem.onclick = onClick;
        }

        let handled = false;
        const markLoaded = () => {
            if (handled) return;
            handled = true;
            hideLoaders();
            imgElem.classList.remove('hidden', 'opacity-0');
            imgElem.classList.add('opacity-100');
        };

        const markError = () => {
            if (handled) return;
            handled = true;
            hideLoaders();
            imgElem.classList.add('hidden');
            showNotFoundPlaceholder();
        };

        // Bind listeners BEFORE setting src to avoid missing synchronous cache events
        imgElem.onload = markLoaded;
        imgElem.onerror = markError;
        imgElem.src = safeUrl;

        // Check if already completed and naturalWidth > 0 (memory/disk cache hit)
        if (imgElem.complete && imgElem.naturalWidth > 0) {
            markLoaded();
        } else if (typeof imgElem.decode === 'function') {
            imgElem.decode().then(markLoaded).catch(() => {
                if (imgElem.complete && imgElem.naturalWidth > 0) {
                    markLoaded();
                }
            });
        }
        return;
    }

    // Preload image to get natural dimensions for cropping / SVG positioning
    const preloader = new Image();
    preloader.referrerPolicy = 'no-referrer';
    activePreloaders.add(preloader);
    let handled = false;

    const cleanupPreloader = () => {
        activePreloaders.delete(preloader);
    };

    const onImageReady = () => {
        if (handled) return;
        handled = true;
        cleanupPreloader();
        hideLoaders();

        const natW = preloader.naturalWidth || 800;
        const natH = preloader.naturalHeight || 600;

        // Clean any existing wrapper
        const existingWrap = container.querySelector('.annotated-image-wrapper');
        if (existingWrap) existingWrap.remove();

        if (!isAnnotated) {
            // Unannotated without imgElem: ensure plain img element is created
            let img = container.querySelector('img:not(.annotated-image-wrapper img)');
            if (!img) {
                img = document.createElement('img');
                img.className = `w-auto ${maxHClass} rounded-2xl shadow-md border border-[var(--md-sys-color-outline-variant,#e2e8f0)] object-contain select-none`;
                container.appendChild(img);
            }
            img.referrerPolicy = 'no-referrer';
            img.src = safeUrl;
            img.alt = alt;
            img.classList.remove('hidden', 'opacity-0');
            img.classList.add('opacity-100');
            if (zoomable) {
                img.classList.add('cursor-pointer', 'transition-transform', 'hover:scale-[1.01]');
            }
            if (onClick) img.onclick = onClick;
            return;
        }

        // Hide standalone imgElem if we are rendering an annotated wrapper
        if (imgElem) {
            imgElem.classList.add('hidden');
            imgElem.src = '';
        }

        // Compute aspect ratio and SVG viewBox
        const effectiveCrop = hasCrop ? crop : { x: 0, y: 0, width: 100, height: 100 };
        const cropPixX = Math.max(0, (effectiveCrop.x / 100) * natW);
        const cropPixY = Math.max(0, (effectiveCrop.y / 100) * natH);
        const cropPixW = Math.max(1, (effectiveCrop.width / 100) * natW);
        const cropPixH = Math.max(1, (effectiveCrop.height / 100) * natH);

        // Create container wrapper (inline-block with max-height & max-width constraints)
        const wrapper = document.createElement('div');
        wrapper.className = `annotated-image-wrapper relative overflow-hidden rounded-2xl shadow-md border border-[var(--md-sys-color-outline-variant,#e2e8f0)] bg-[var(--md-sys-color-surface-container-low,#f1f5f9)] select-none inline-block max-w-full ${maxHClass}`;

        if (zoomable) {
            wrapper.classList.add('cursor-pointer', 'transition-transform', 'hover:scale-[1.01]');
        }

        // 1. In-flow invisible spacer SVG gives the wrapper its exact cropped aspect ratio and responsive scaling
        const spacer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        spacer.setAttribute('viewBox', `0 0 ${cropPixW} ${cropPixH}`);
        spacer.setAttribute('width', cropPixW);
        spacer.setAttribute('height', cropPixH);
        spacer.setAttribute('class', `block w-auto h-auto max-w-full ${maxHClass}`);
        spacer.style.maxHeight = 'inherit';
        spacer.style.visibility = 'hidden';
        spacer.style.pointerEvents = 'none';

        // 2. Inner image offset & scaled to display only cropped frame
        const innerImg = document.createElement('img');
        innerImg.referrerPolicy = 'no-referrer';
        innerImg.src = safeUrl;
        innerImg.alt = alt;
        innerImg.className = 'absolute max-w-none max-h-none select-none pointer-events-none';
        innerImg.style.width = `${(100 / effectiveCrop.width) * 100}%`;
        innerImg.style.height = `${(100 / effectiveCrop.height) * 100}%`;
        innerImg.style.left = `${-(effectiveCrop.x / effectiveCrop.width) * 100}%`;
        innerImg.style.top = `${-(effectiveCrop.y / effectiveCrop.height) * 100}%`;

        // 3. SVG overlay for vector arrows
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', `absolute inset-0 w-full h-full select-none ${onArrowClick ? 'pointer-events-auto' : 'pointer-events-none'}`);
        svg.setAttribute('viewBox', `${cropPixX} ${cropPixY} ${cropPixW} ${cropPixH}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.innerHTML = buildArrowsSvgContent(arrows, natW, natH, { showNumbers });

        if (onArrowClick) {
            svg.addEventListener('click', (e) => {
                const grp = e.target.closest('.arrow-group');
                if (grp) {
                    e.stopPropagation();
                    const arrowIdx = parseInt(grp.dataset.arrowIndex, 10);
                    if (!isNaN(arrowIdx) && typeof onArrowClick === 'function') {
                        onArrowClick(arrowIdx);
                    }
                }
            });
        }

        wrapper.appendChild(spacer);
        wrapper.appendChild(innerImg);
        wrapper.appendChild(svg);

        if (onClick) {
            wrapper.onclick = onClick;
        }

        container.appendChild(wrapper);
    };

    const onImageError = () => {
        if (handled) return;
        handled = true;
        cleanupPreloader();
        hideLoaders();
        if (imgElem) {
            imgElem.classList.add('hidden');
            imgElem.src = '';
        }
        showNotFoundPlaceholder();
    };

    preloader.onload = onImageReady;
    preloader.onerror = onImageError;
    preloader.src = safeUrl;
    if (preloader.complete && preloader.naturalWidth > 0) {
        onImageReady();
    } else if (typeof preloader.decode === 'function') {
        preloader.decode().then(onImageReady).catch(() => {
            if (preloader.complete && preloader.naturalWidth > 0) {
                onImageReady();
            }
        });
    }
}

let imageEditorUiPromise = null;
function getImageEditorUi() {
    if (!imageEditorUiPromise) {
        imageEditorUiPromise = import("./image-editor-ui.js");
    }
    return imageEditorUiPromise;
}

/**
 * Opens the Image Editor Modal for a given image URL and existing annotations.
 * Lazy-loads the heavy editor UI and SVG interaction logic on demand.
 */
export async function openImageEditorModal(options) {
    const mod = await getImageEditorUi();
    return mod.openImageEditorModal(options);
}

/**
 * Closes the Image Editor Modal.
 */
export function closeImageEditorModal() {
    const modal = document.getElementById("image-editor-modal");
    if (modal) modal.classList.add("hidden");
    if (imageEditorUiPromise) {
        imageEditorUiPromise.then(mod => mod.closeImageEditorModal()).catch(() => {});
    }
}
