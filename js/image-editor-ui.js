// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/image-editor-ui.js
 * Heavy UI & Interaction Module for Image Cropping & Arrow Annotation.
 * Lazy loaded on demand when the user triggers the image editor modal.
 */

import { t } from './i18n.js';
import { sanitizeImageUrl } from './utils.js';
import {
    ARROW_COLORS,
    getArrowColorTheme,
    buildArrowsSvgContent,
    renderAnnotatedImage
} from './image-editor-modal.js';

let modalInitialized = false;
let currentCrop = null;
let currentArrows = [];
let activeTool = 'crop'; // 'crop' | 'arrow'
let activeArrowColor = '#3b82f7';
let activeArrow = null;
let isDrawingArrow = false;
let dragHandle = null;
let dragStartCoords = null;
let initialCropAtDrag = null;
let currentSaveCallback = null;
let currentCancelCallback = null;
let loadedImageNaturalWidth = 1;
let loadedImageNaturalHeight = 1;
let isPreviewActive = false;

/**
 * Injects modal HTML into document if not already present.
 */
function injectImageEditorModalHtml() {
    if (document.getElementById('image-editor-modal')) return;

    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'image-editor-modal-wrapper';
    modalWrapper.innerHTML = `
        <div id="image-editor-modal" class="hidden fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn select-none">
            <div class="m3-dialog-card w-full max-w-4xl bg-[var(--md-sys-color-surface-container-lowest,#ffffff)] rounded-[28px] shadow-2xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] overflow-hidden flex flex-col max-h-[94vh]">
                
                <!-- HEADER -->
                <div class="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-[var(--md-sys-color-outline-variant,#e2e8f0)] bg-[var(--md-sys-color-surface-container-low,#f1f5f9)] flex items-center justify-between">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <span class="material-symbols-rounded text-2xl text-blue-600 flex-shrink-0">crop</span>
                        <div class="min-w-0">
                            <h3 class="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface,#0f172a)] truncate" data-i18n="adjust_image_title">
                                ${t('adjust_image_title')}
                            </h3>
                            <p class="text-xs text-[var(--md-sys-color-on-surface-variant,#475569)] truncate hidden sm:block" data-i18n="adjust_image_subtitle">
                                ${t('adjust_image_subtitle')}
                            </p>
                        </div>
                    </div>
                    <button type="button" id="img-edit-close-btn" class="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-high,#cbd5e1)] text-[var(--md-sys-color-on-surface-variant,#475569)] transition-colors flex-shrink-0" title="${t('close')}">
                        <span class="material-symbols-rounded text-xl">close</span>
                    </button>
                </div>

                <!-- TOOLBAR -->
                <div class="px-4 py-2.5 sm:px-6 sm:py-3 border-b border-[var(--md-sys-color-outline-variant,#e2e8f0)] bg-white flex flex-wrap items-center justify-between gap-2.5">
                    <!-- Segmented Tool Selection -->
                    <div class="inline-flex rounded-xl p-1 bg-[var(--md-sys-color-surface-container-low,#f1f5f9)] border border-[var(--md-sys-color-outline-variant,#e2e8f0)]">
                        <button type="button" id="img-tool-crop-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-[#3b82f7] text-white shadow-xs">
                            <span class="material-symbols-rounded text-base">crop</span>
                            <span data-i18n="crop_tool">${t('crop_tool')}</span>
                        </button>
                        <button type="button" id="img-tool-arrow-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-[var(--md-sys-color-on-surface-variant,#475569)] hover:text-black">
                            <span class="material-symbols-rounded text-base">north_east</span>
                            <span data-i18n="arrow_tool">${t('arrow_tool')}</span>
                        </button>
                    </div>

                    <!-- Arrow Color Picker (shown when Arrow tool is active) -->
                    <div id="img-arrow-color-bar" class="hidden items-center gap-1.5">
                        <span class="text-xs text-[var(--md-sys-color-on-surface-variant,#475569)] font-medium mr-1">Cor:</span>
                        <div class="flex items-center gap-1.5">
                            ${ARROW_COLORS.map(c => `
                                <button type="button" class="img-color-chip w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${c.hex === '#3b82f7' ? 'border-[#3b82f7] ring-2 ring-blue-300' : 'border-gray-300'}" style="background-color: ${c.hex}" data-color="${c.hex}" title="${c.name}"></button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Quick Action Buttons -->
                    <div class="flex items-center gap-1 sm:gap-2 ml-auto">
                        <button type="button" id="img-edit-undo-arrow-btn" class="px-2.5 py-1.5 rounded-xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] hover:bg-[var(--md-sys-color-surface-container-low,#f1f5f9)] text-xs font-medium text-[var(--md-sys-color-on-surface,#0f172a)] flex items-center gap-1 transition-colors" title="${t('undo_arrow')}">
                            <span class="material-symbols-rounded text-base">undo</span>
                            <span class="hidden sm:inline" data-i18n="undo_arrow">${t('undo_arrow')}</span>
                        </button>
                        <button type="button" id="img-edit-reset-crop-btn" class="px-2.5 py-1.5 rounded-xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] hover:bg-[var(--md-sys-color-surface-container-low,#f1f5f9)] text-xs font-medium text-[var(--md-sys-color-on-surface,#0f172a)] flex items-center gap-1 transition-colors" title="${t('reset_crop')}">
                            <span class="material-symbols-rounded text-base">crop_free</span>
                            <span class="hidden sm:inline" data-i18n="reset_crop">${t('reset_crop')}</span>
                        </button>
                        <button type="button" id="img-edit-toggle-preview-btn" class="px-2.5 py-1.5 rounded-xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] hover:bg-[var(--md-sys-color-surface-container-low,#f1f5f9)] text-xs font-medium text-[var(--md-sys-color-on-surface,#0f172a)] flex items-center gap-1 transition-colors">
                            <span class="material-symbols-rounded text-base">visibility</span>
                            <span id="img-edit-preview-label" data-i18n="preview_mode">${t('preview_mode')}</span>
                        </button>
                    </div>
                </div>

                <!-- INSTRUCTION HINT -->
                <div class="px-6 py-1.5 bg-blue-50/70 border-b border-blue-100 flex items-center gap-2 text-xs text-blue-900">
                    <span class="material-symbols-rounded text-sm text-blue-600 flex-shrink-0">info</span>
                    <span id="img-edit-hint-text" class="truncate font-medium">${t('crop_instructions')}</span>
                </div>

                <!-- WORKSPACE STAGE -->
                <div class="p-3 sm:p-6 flex-1 overflow-auto bg-[var(--md-sys-color-surface-container-low,#f8fafc)] flex items-center justify-center min-h-[260px] sm:min-h-[380px] custom-scrollbar">
                    
                    <!-- Loading state -->
                    <div id="img-edit-loader" class="flex flex-col items-center justify-center gap-3">
                        <div class="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        <span class="text-xs font-medium text-[var(--md-sys-color-on-surface-variant,#475569)]" data-i18n="loading">${t('loading')}</span>
                    </div>

                    <!-- Error state -->
                    <div id="img-edit-error" class="hidden flex-col items-center justify-center gap-2 max-w-sm text-center p-6 bg-white rounded-2xl border border-red-200 shadow-sm">
                        <span class="material-symbols-rounded text-3xl text-red-500">broken_image</span>
                        <h4 class="text-sm font-bold text-gray-800" data-i18n="image_load_error_title">${t('image_load_error_title')}</h4>
                        <p class="text-xs text-gray-500" data-i18n="image_load_error_desc">${t('image_load_error_desc')}</p>
                    </div>

                    <!-- Editor Image & Interactive Overlay Stage -->
                    <div id="img-edit-stage" class="hidden relative inline-block select-none overflow-hidden touch-none rounded-xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] bg-white shadow-md">
                        <img id="img-edit-source" src="" alt="Edit Target" class="block max-h-[50vh] sm:max-h-[58vh] max-w-full w-auto h-auto object-contain pointer-events-none select-none">
                        
                        <!-- Interactive SVG overlay -->
                        <svg id="img-edit-svg" class="absolute inset-0 w-full h-full select-none touch-none" style="cursor: crosshair;">
                            <!-- Injected dynamically: crop overlays, handles, arrows -->
                        </svg>
                    </div>

                    <!-- Live Preview Stage (when preview toggle is active) -->
                    <div id="img-edit-preview-stage" class="hidden flex-col items-center justify-center p-4">
                        <div id="img-edit-preview-box" class="relative overflow-hidden rounded-2xl shadow-xl border border-[var(--md-sys-color-outline-variant,#e2e8f0)] bg-white max-h-[50vh] sm:max-h-[58vh]">
                            <!-- Injected dynamically in preview mode -->
                        </div>
                    </div>
                </div>

                <!-- FOOTER -->
                <div class="px-5 py-3.5 sm:px-6 sm:py-4 bg-[var(--md-sys-color-surface-container-low,#f1f5f9)] border-t border-[var(--md-sys-color-outline-variant,#e2e8f0)] flex items-center justify-between">
                    <button type="button" id="img-edit-clear-arrows-btn" class="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1">
                        <span class="material-symbols-rounded text-base">delete</span>
                        <span data-i18n="clear_arrows">${t('clear_arrows')}</span>
                    </button>
                    
                    <div class="flex items-center gap-2.5">
                        <button type="button" id="img-edit-cancel-btn" class="m3-btn-expressive m3-btn-text text-xs sm:text-sm font-semibold px-4 py-2" data-i18n="cancel">
                            ${t('cancel')}
                        </button>
                        <button type="button" id="img-edit-save-btn" class="m3-btn-expressive m3-btn-filled text-xs sm:text-sm font-bold bg-[#3b82f7] hover:bg-blue-600 text-white px-5 py-2 rounded-xl shadow-md flex items-center gap-1.5" data-i18n="apply_adjustments">
                            <span class="material-symbols-rounded text-base">check</span>
                            <span>${t('apply_adjustments')}</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    `;
    document.body.appendChild(modalWrapper);
    attachModalEvents();
}

/**
 * Clamps a number between min and max.
 */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Re-renders the SVG overlay inside the editor modal.
 */
function renderEditorSvg() {
    const svg = document.getElementById('img-edit-svg');
    const sourceImg = document.getElementById('img-edit-source');
    if (!svg || !sourceImg) return;

    const natW = loadedImageNaturalWidth || 800;
    const natH = loadedImageNaturalHeight || 600;

    // Viewbox matching natural image coordinates
    svg.setAttribute('viewBox', `0 0 ${natW} ${natH}`);

    const crop = currentCrop || { x: 0, y: 0, width: 100, height: 100 };
    const cropPixX = Math.max(0, Math.min(natW, (crop.x / 100) * natW));
    const cropPixY = Math.max(0, Math.min(natH, (crop.y / 100) * natH));
    const cropPixW = Math.max(1, Math.min(natW - cropPixX, (crop.width / 100) * natW));
    const cropPixH = Math.max(1, Math.min(natH - cropPixY, (crop.height / 100) * natH));

    const topH = Math.max(0, cropPixY);
    const bottomH = Math.max(0, natH - (cropPixY + cropPixH));
    const leftW = Math.max(0, cropPixX);
    const rightW = Math.max(0, natW - (cropPixX + cropPixW));
    const bottomY = Math.min(natH, cropPixY + cropPixH);
    const rightX = Math.min(natW, cropPixX + cropPixW);

    // Base markup: 4 dim rectangles outside crop region (strictly positive dimensions to prevent SVG negative rect errors)
    let markup = `
            <g class="crop-backdrop">
                <!-- Top dim -->
                ${topH > 0.05 ? `<rect x="0" y="0" width="${natW}" height="${topH}" fill="rgba(0, 0, 0, 0.52)" />` : ''}
                <!-- Bottom dim -->
                ${bottomH > 0.05 ? `<rect x="0" y="${bottomY}" width="${natW}" height="${bottomH}" fill="rgba(0, 0, 0, 0.52)" />` : ''}
                <!-- Left dim -->
                ${leftW > 0.05 ? `<rect x="0" y="${cropPixY}" width="${leftW}" height="${cropPixH}" fill="rgba(0, 0, 0, 0.52)" />` : ''}
                <!-- Right dim -->
                ${rightW > 0.05 ? `<rect x="${rightX}" y="${cropPixY}" width="${rightW}" height="${cropPixH}" fill="rgba(0, 0, 0, 0.52)" />` : ''}
            </g>
    `;

    // Render crop boundary and handles when Crop tool is active
    if (activeTool === 'crop') {
        svg.style.cursor = 'default';
        const handleRadius = Math.max(6, Math.min(Math.min(natW, natH) * 0.02, 14));

        markup += `
            <g class="crop-ui">
                <!-- Crop Rect Border -->
                <rect x="${cropPixX}" y="${cropPixY}" width="${cropPixW}" height="${cropPixH}"
                    fill="transparent" stroke="#3b82f7" stroke-width="2.5" stroke-dasharray="8,6" />
                
                <!-- Draggable center area -->
                <rect x="${cropPixX}" y="${cropPixY}" width="${cropPixW}" height="${cropPixH}"
                    fill="transparent" style="cursor: move;" data-handle="move" />

                <!-- Corner and Edge Handles -->
                <!-- NW -->
                <circle cx="${cropPixX}" cy="${cropPixY}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: nwse-resize;" data-handle="nw" />
                <!-- N -->
                <circle cx="${cropPixX + cropPixW / 2}" cy="${cropPixY}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: ns-resize;" data-handle="n" />
                <!-- NE -->
                <circle cx="${cropPixX + cropPixW}" cy="${cropPixY}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: nesw-resize;" data-handle="ne" />
                <!-- E -->
                <circle cx="${cropPixX + cropPixW}" cy="${cropPixY + cropPixH / 2}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: ew-resize;" data-handle="e" />
                <!-- SE -->
                <circle cx="${cropPixX + cropPixW}" cy="${cropPixY + cropPixH}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: nwse-resize;" data-handle="se" />
                <!-- S -->
                <circle cx="${cropPixX + cropPixW / 2}" cy="${cropPixY + cropPixH}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: ns-resize;" data-handle="s" />
                <!-- SW -->
                <circle cx="${cropPixX}" cy="${cropPixY + cropPixH}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: nesw-resize;" data-handle="sw" />
                <!-- W -->
                <circle cx="${cropPixX}" cy="${cropPixY + cropPixH / 2}" r="${handleRadius}" fill="#ffffff" stroke="#3b82f7" stroke-width="3" style="cursor: ew-resize;" data-handle="w" />
            </g>
        `;
    } else {
        svg.style.cursor = 'crosshair';
        // When Arrow tool is active, show subtle crop outline without handles
        markup += `
            <g class="crop-subtle-box">
                <rect x="${cropPixX}" y="${cropPixY}" width="${cropPixW}" height="${cropPixH}"
                    fill="transparent" stroke="#3b82f7" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.75" />
            </g>
        `;
    }

    // Render committed arrows
    const allArrows = [...currentArrows];
    if (activeArrow) {
        allArrows.push(activeArrow);
    }
    markup += buildArrowsSvgContent(allArrows, natW, natH, { showNumbers: true });

    svg.innerHTML = markup;
}

/**
 * Updates preview box when Preview Mode is enabled.
 */
function updatePreviewBox() {
    const previewBox = document.getElementById('img-edit-preview-box');
    const sourceImg = document.getElementById('img-edit-source');
    if (!previewBox || !sourceImg) return;

    previewBox.innerHTML = '';
    const crop = currentCrop || { x: 0, y: 0, width: 100, height: 100 };
    renderAnnotatedImage({
        container: previewBox,
        imageUrl: sourceImg.src,
        crop: crop,
        arrows: currentArrows,
        maxHClass: 'max-h-[50vh] sm:max-h-[58vh]',
        zoomable: false
    });
}

/**
 * Attaches interactive pointer events and toolbar listeners.
 */
function attachModalEvents() {
    const modal = document.getElementById('image-editor-modal');
    const closeBtn = document.getElementById('img-edit-close-btn');
    const cancelBtn = document.getElementById('img-edit-cancel-btn');
    const saveBtn = document.getElementById('img-edit-save-btn');
    const toolCropBtn = document.getElementById('img-tool-crop-btn');
    const toolArrowBtn = document.getElementById('img-tool-arrow-btn');
    const undoArrowBtn = document.getElementById('img-edit-undo-arrow-btn');
    const resetCropBtn = document.getElementById('img-edit-reset-crop-btn');
    const clearArrowsBtn = document.getElementById('img-edit-clear-arrows-btn');
    const togglePreviewBtn = document.getElementById('img-edit-toggle-preview-btn');
    const arrowColorBar = document.getElementById('img-arrow-color-bar');
    const hintText = document.getElementById('img-edit-hint-text');
    const svg = document.getElementById('img-edit-svg');

    // Close / Cancel
    const handleClose = () => {
        closeImageEditorModal();
        if (typeof currentCancelCallback === 'function') {
            currentCancelCallback();
        }
    };
    closeBtn?.addEventListener('click', handleClose);
    cancelBtn?.addEventListener('click', handleClose);

    // Save Adjustments
    saveBtn?.addEventListener('click', () => {
        let finalCrop = null;
        if (currentCrop) {
            const isFull = currentCrop.x <= 0.8 && currentCrop.y <= 0.8 &&
                currentCrop.width >= 98.5 && currentCrop.height >= 98.5;
            if (!isFull) {
                finalCrop = {
                    x: Math.round(currentCrop.x * 10) / 10,
                    y: Math.round(currentCrop.y * 10) / 10,
                    width: Math.round(currentCrop.width * 10) / 10,
                    height: Math.round(currentCrop.height * 10) / 10
                };
            }
        }

        const finalArrows = (currentArrows || []).map(a => ({
            startX: Math.round(a.startX * 10) / 10,
            startY: Math.round(a.startY * 10) / 10,
            endX: Math.round(a.endX * 10) / 10,
            endY: Math.round(a.endY * 10) / 10,
            color: a.color || '#3b82f7',
            label: a.label || ''
        }));

        if (typeof currentSaveCallback === 'function') {
            currentSaveCallback({
                crop: finalCrop,
                arrows: finalArrows
            });
        }
        closeImageEditorModal();
    });

    // Tool switching: Crop vs Arrow
    const switchTool = (tool) => {
        activeTool = tool;
        if (tool === 'crop') {
            toolCropBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-[#3b82f7] text-white shadow-xs";
            toolArrowBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-[var(--md-sys-color-on-surface-variant,#475569)] hover:text-black";
            arrowColorBar.classList.add('hidden');
            arrowColorBar.classList.remove('flex');
            hintText.textContent = t('crop_instructions');
        } else {
            toolArrowBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-[#3b82f7] text-white shadow-xs";
            toolCropBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-[var(--md-sys-color-on-surface-variant,#475569)] hover:text-black";
            arrowColorBar.classList.remove('hidden');
            arrowColorBar.classList.add('flex');
            hintText.textContent = t('arrow_instructions');
        }
        renderEditorSvg();
    };

    toolCropBtn?.addEventListener('click', () => switchTool('crop'));
    toolArrowBtn?.addEventListener('click', () => switchTool('arrow'));

    // Color chips
    const colorChips = document.querySelectorAll('.img-color-chip');
    colorChips.forEach(chip => {
        chip.addEventListener('click', () => {
            activeArrowColor = chip.dataset.color || '#3b82f7';
            colorChips.forEach(c => {
                c.classList.remove('ring-2', 'ring-blue-300', 'border-[#3b82f7]');
                c.classList.add('border-gray-300');
            });
            chip.classList.remove('border-gray-300');
            chip.classList.add('ring-2', 'ring-blue-300', 'border-[#3b82f7]');
        });
    });

    // Undo arrow
    undoArrowBtn?.addEventListener('click', () => {
        if (currentArrows.length > 0) {
            currentArrows.pop();
            renderEditorSvg();
            if (isPreviewActive) updatePreviewBox();
        }
    });

    // Reset crop
    resetCropBtn?.addEventListener('click', () => {
        currentCrop = { x: 0, y: 0, width: 100, height: 100 };
        renderEditorSvg();
        if (isPreviewActive) updatePreviewBox();
    });

    // Clear all arrows
    clearArrowsBtn?.addEventListener('click', () => {
        currentArrows = [];
        activeArrow = null;
        renderEditorSvg();
        if (isPreviewActive) updatePreviewBox();
    });

    // Toggle Preview
    togglePreviewBtn?.addEventListener('click', () => {
        isPreviewActive = !isPreviewActive;
        const stage = document.getElementById('img-edit-stage');
        const previewStage = document.getElementById('img-edit-preview-stage');
        const label = document.getElementById('img-edit-preview-label');

        if (isPreviewActive) {
            stage.classList.add('hidden');
            previewStage.classList.remove('hidden');
            previewStage.classList.add('flex');
            label.textContent = t('edit_mode');
            togglePreviewBtn.classList.add('bg-blue-100', 'border-blue-400', 'text-blue-700');
            updatePreviewBox();
        } else {
            previewStage.classList.add('hidden');
            previewStage.classList.remove('flex');
            stage.classList.remove('hidden');
            label.textContent = t('preview_mode');
            togglePreviewBtn.classList.remove('bg-blue-100', 'border-blue-400', 'text-blue-700');
            renderEditorSvg();
        }
    });

    // Pointer events on SVG stage
    if (svg) {
        const getPercentCoords = (e) => {
            const rect = svg.getBoundingClientRect();
            const px = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
            const py = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
            return { x: px, y: py };
        };

        svg.addEventListener('pointerdown', (e) => {
            const coords = getPercentCoords(e);
            dragStartCoords = coords;

            if (activeTool === 'crop') {
                const target = e.target;
                const handle = target?.dataset?.handle;
                if (handle) {
                    dragHandle = handle;
                    initialCropAtDrag = currentCrop ? { ...currentCrop } : { x: 0, y: 0, width: 100, height: 100 };
                    svg.setPointerCapture(e.pointerId);
                    e.preventDefault();
                }
            } else if (activeTool === 'arrow') {
                isDrawingArrow = true;
                activeArrow = {
                    startX: coords.x,
                    startY: coords.y,
                    endX: coords.x,
                    endY: coords.y,
                    color: activeArrowColor
                };
                svg.setPointerCapture(e.pointerId);
                e.preventDefault();
            }
        });

        svg.addEventListener('pointermove', (e) => {
            if (!dragStartCoords) return;
            const coords = getPercentCoords(e);

            if (activeTool === 'crop' && dragHandle && initialCropAtDrag) {
                const dx = coords.x - dragStartCoords.x;
                const dy = coords.y - dragStartCoords.y;
                const nextCrop = { ...initialCropAtDrag };

                if (dragHandle === 'move') {
                    nextCrop.x = clamp(initialCropAtDrag.x + dx, 0, 100 - initialCropAtDrag.width);
                    nextCrop.y = clamp(initialCropAtDrag.y + dy, 0, 100 - initialCropAtDrag.height);
                } else if (dragHandle === 'se') {
                    nextCrop.width = clamp(initialCropAtDrag.width + dx, 5, 100 - initialCropAtDrag.x);
                    nextCrop.height = clamp(initialCropAtDrag.height + dy, 5, 100 - initialCropAtDrag.y);
                } else if (dragHandle === 'e') {
                    nextCrop.width = clamp(initialCropAtDrag.width + dx, 5, 100 - initialCropAtDrag.x);
                } else if (dragHandle === 's') {
                    nextCrop.height = clamp(initialCropAtDrag.height + dy, 5, 100 - initialCropAtDrag.y);
                } else if (dragHandle === 'nw') {
                    const newX = clamp(initialCropAtDrag.x + dx, 0, initialCropAtDrag.x + initialCropAtDrag.width - 5);
                    const newY = clamp(initialCropAtDrag.y + dy, 0, initialCropAtDrag.y + initialCropAtDrag.height - 5);
                    nextCrop.width = initialCropAtDrag.width - (newX - initialCropAtDrag.x);
                    nextCrop.height = initialCropAtDrag.height - (newY - initialCropAtDrag.y);
                    nextCrop.x = newX;
                    nextCrop.y = newY;
                } else if (dragHandle === 'w') {
                    const newX = clamp(initialCropAtDrag.x + dx, 0, initialCropAtDrag.x + initialCropAtDrag.width - 5);
                    nextCrop.width = initialCropAtDrag.width - (newX - initialCropAtDrag.x);
                    nextCrop.x = newX;
                } else if (dragHandle === 'n') {
                    const newY = clamp(initialCropAtDrag.y + dy, 0, initialCropAtDrag.y + initialCropAtDrag.height - 5);
                    nextCrop.height = initialCropAtDrag.height - (newY - initialCropAtDrag.y);
                    nextCrop.y = newY;
                } else if (dragHandle === 'ne') {
                    const newY = clamp(initialCropAtDrag.y + dy, 0, initialCropAtDrag.y + initialCropAtDrag.height - 5);
                    nextCrop.height = initialCropAtDrag.height - (newY - initialCropAtDrag.y);
                    nextCrop.y = newY;
                    nextCrop.width = clamp(initialCropAtDrag.width + dx, 5, 100 - initialCropAtDrag.x);
                } else if (dragHandle === 'sw') {
                    const newX = clamp(initialCropAtDrag.x + dx, 0, initialCropAtDrag.x + initialCropAtDrag.width - 5);
                    nextCrop.width = initialCropAtDrag.width - (newX - initialCropAtDrag.x);
                    nextCrop.x = newX;
                    nextCrop.height = clamp(initialCropAtDrag.height + dy, 5, 100 - initialCropAtDrag.y);
                }

                currentCrop = nextCrop;
                renderEditorSvg();
            } else if (activeTool === 'arrow' && isDrawingArrow && activeArrow) {
                activeArrow.endX = coords.x;
                activeArrow.endY = coords.y;
                renderEditorSvg();
            }
        });

        const handlePointerUp = (e) => {
            if (activeTool === 'arrow' && isDrawingArrow && activeArrow) {
                const dist = Math.hypot(activeArrow.endX - activeArrow.startX, activeArrow.endY - activeArrow.startY);
                // Require at least 2% distance to prevent accidental tap dots
                if (dist >= 2) {
                    currentArrows.push({ ...activeArrow });
                }
                activeArrow = null;
                isDrawingArrow = false;
                renderEditorSvg();
            }

            dragHandle = null;
            dragStartCoords = null;
            initialCropAtDrag = null;

            try {
                if (svg.hasPointerCapture(e.pointerId)) {
                    svg.releasePointerCapture(e.pointerId);
                }
            } catch (_) {}
        };

        svg.addEventListener('pointerup', handlePointerUp);
        svg.addEventListener('pointercancel', handlePointerUp);
    }
}

/**
 * Opens the Image Editor Modal for a given image URL and existing annotations.
 */
export function openImageEditorModal({
    imageUrl,
    crop = null,
    arrows = [],
    defaultTool = 'crop',
    onSave = null,
    onCancel = null
}) {
    injectImageEditorModalHtml();

    const safeUrl = sanitizeImageUrl(imageUrl);
    if (!safeUrl) return;

    currentSaveCallback = onSave;
    currentCancelCallback = onCancel;
    currentCrop = crop ? { ...crop } : { x: 0, y: 0, width: 100, height: 100 };
    currentArrows = Array.isArray(arrows) ? JSON.parse(JSON.stringify(arrows)) : [];
    activeTool = defaultTool === 'arrow' ? 'arrow' : 'crop';
    activeArrow = null;
    isDrawingArrow = false;
    isPreviewActive = false;

    const modal = document.getElementById('image-editor-modal');
    const loader = document.getElementById('img-edit-loader');
    const errorState = document.getElementById('img-edit-error');
    const stage = document.getElementById('img-edit-stage');
    const previewStage = document.getElementById('img-edit-preview-stage');
    const sourceImg = document.getElementById('img-edit-source');
    const togglePreviewBtn = document.getElementById('img-edit-toggle-preview-btn');
    const previewLabel = document.getElementById('img-edit-preview-label');

    if (modal) modal.classList.remove('hidden');
    if (loader) loader.classList.remove('hidden');
    if (errorState) errorState.classList.add('hidden');
    if (stage) stage.classList.add('hidden');
    if (previewStage) previewStage.classList.add('hidden');
    if (togglePreviewBtn) {
        togglePreviewBtn.classList.remove('bg-blue-100', 'border-blue-400', 'text-blue-700');
    }
    if (previewLabel) previewLabel.textContent = t('preview_mode');

    // Reset toolbar according to activeTool
    const toolCropBtn = document.getElementById('img-tool-crop-btn');
    const toolArrowBtn = document.getElementById('img-tool-arrow-btn');
    const arrowColorBar = document.getElementById('img-arrow-color-bar');
    const hintText = document.getElementById('img-edit-hint-text');

    if (activeTool === 'arrow') {
        if (toolArrowBtn) toolArrowBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-[#3b82f7] text-white shadow-xs";
        if (toolCropBtn) toolCropBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-[var(--md-sys-color-on-surface-variant,#475569)] hover:text-black";
        if (arrowColorBar) {
            arrowColorBar.classList.remove('hidden');
            arrowColorBar.classList.add('flex');
        }
        if (hintText) hintText.textContent = t('arrow_instructions');
    } else {
        if (toolCropBtn) toolCropBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-[#3b82f7] text-white shadow-xs";
        if (toolArrowBtn) toolArrowBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-[var(--md-sys-color-on-surface-variant,#475569)] hover:text-black";
        if (arrowColorBar) {
            arrowColorBar.classList.add('hidden');
            arrowColorBar.classList.remove('flex');
        }
        if (hintText) hintText.textContent = t('crop_instructions');
    }

    // Load image
    sourceImg.onload = () => {
        loadedImageNaturalWidth = sourceImg.naturalWidth || 800;
        loadedImageNaturalHeight = sourceImg.naturalHeight || 600;

        if (loader) loader.classList.add('hidden');
        if (stage) stage.classList.remove('hidden');

        renderEditorSvg();
    };

    sourceImg.onerror = () => {
        if (loader) loader.classList.add('hidden');
        if (stage) stage.classList.add('hidden');
        if (errorState) {
            errorState.classList.remove('hidden');
            errorState.classList.add('flex');
        }
    };

    sourceImg.src = safeUrl;
    if (sourceImg.complete && sourceImg.naturalWidth > 0) {
        sourceImg.onload();
    }
}

/**
 * Closes the Image Editor Modal.
 */
export function closeImageEditorModal() {
    const modal = document.getElementById('image-editor-modal');
    if (modal) modal.classList.add('hidden');

    const sourceImg = document.getElementById('img-edit-source');
    if (sourceImg) sourceImg.src = '';

    currentSaveCallback = null;
    currentCancelCallback = null;
}
