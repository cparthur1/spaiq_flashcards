/**
 * Session Transfer Logic (Bitset QR Optimization)
 * Uses a string of 1s and 0s to represent the deck state.
 * This makes the QR code extremely simple and easy to scan.
 */

import { t } from './i18n.js';
import { escapeHtml, NOTEBOOK_STORAGE_KEY, encodeStoragePayload } from './utils.js';

// --- ELEMENTS ---
const transferModal = document.getElementById('transfer-modal');
const transferModalContent = document.getElementById('transfer-modal-content');
const transferBtn = document.getElementById('transfer-session-btn');
const closeTransferBtn = document.getElementById('close-transfer-modal');
const receiveBtn = document.getElementById('receive-session-btn');
const scannerModal = document.getElementById('scanner-modal');
const closeScannerBtn = document.getElementById('close-scanner-modal');
const qrCanvas = document.getElementById('transfer-qrcode');
const transferStatus = document.getElementById('transfer-status');
const forceSyncBtn = document.getElementById('force-sync-btn');
const syncOverlay = document.getElementById('sync-overlay');
const syncDebugLog = document.getElementById('sync-debug-log');

let html5QrCode = null;

function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = src;
        if (integrity) {
            script.integrity = integrity;
            script.crossOrigin = 'anonymous';
        }
        script.onload = () => resolve();
        script.onerror = (e) => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

export async function ensureQRCode() {
    if (typeof QRCode !== 'undefined') return window.QRCode;
    await loadScript(
        'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
        'sha384-HGmnkDZJy7mRkoARekrrj0VjEFSh9a0Z8qxGri/kTTAJkgR8hqD1lHsYSh3JdzRi'
    );
    return window.QRCode;
}

export async function ensureHtml5Qrcode() {
    if (typeof Html5Qrcode !== 'undefined') return window.Html5Qrcode;
    await loadScript(
        'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
        'sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+'
    );
    return window.Html5Qrcode;
}

function logSync(msg) {
    if (syncDebugLog) {
        syncDebugLog.appendChild(document.createElement('br'));
        syncDebugLog.appendChild(document.createTextNode(`> ${msg || ''}`));
        syncDebugLog.scrollTop = syncDebugLog.scrollHeight;
    }
    console.log("[SyncLog] " + msg);
}

// --- STATE ---
let currentCompressedState = null;

/**
 * Initializes the transfer logic.
 */
export function initTransfer() {
    const urlParams = new URLSearchParams(window.location.search);
    const progressState = urlParams.get('prog');
    if (progressState) {
        applyProgress(progressState);
    }

    transferBtn?.addEventListener('click', openTransferModal);
    closeTransferBtn?.addEventListener('click', closeTransferModal);
    
    if (forceSyncBtn) {
        forceSyncBtn.textContent = t('update_progress_btn');
        forceSyncBtn.onclick = startSender;
    }

    receiveBtn?.addEventListener('click', openScanner);
    closeScannerBtn?.addEventListener('click', closeScanner);
}

// --- SENDER LOGIC ---

export function openTransferModal() {
    if (!transferModal) return;
    transferModal.classList.remove('hidden');
    setTimeout(() => {
        if (transferModalContent) {
            transferModalContent.classList.remove('scale-95', 'opacity-0');
            transferModalContent.classList.add('scale-100', 'opacity-100');
        }
    }, 10);
    startSender();
}

export function closeTransferModal() {
    if (!transferModalContent) return;
    transferModalContent.classList.remove('scale-100', 'opacity-100');
    transferModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => transferModal?.classList.add('hidden'), 300);
}

/**
 * SENDER: Creates a Bitset (1s and 0s) of the deck state
 */
function getActiveStorageKey() {
    const mode = localStorage.getItem('flashcardsActiveMode');
    if (mode === 'notebook') return NOTEBOOK_STORAGE_KEY;
    if (mode === 'exam') return 'flashcardsExam';
    return 'flashcardsSave';
}

function startSender() {
    if (transferStatus) transferStatus.textContent = t('optimizing_qr');
    const rawData = localStorage.getItem(getActiveStorageKey());
    if (!rawData) return;

    try {
        const gameData = JSON.parse(rawData);
        
        // BITSET OPTIMIZATION:
        // We create a string where 1 means "card still in pool" and 0 means "card completed"
        let bitset = "";
        const poolSet = new Set(gameData.questionsPool.map(q => q.description));
        
        gameData.allQuestions.forEach(q => {
            bitset += poolSet.has(q.description) ? "1" : "0";
        });

        const progressOnly = { 
            s: gameData.score, 
            b: bitset, // This is much smaller than a list of indices
            t: gameData.deckTitle 
        };

        const jsonString = JSON.stringify(progressOnly);
        // Compressed Bitset is ultra-tiny
        currentCompressedState = LZString.compressToEncodedURIComponent(jsonString);
        
        console.log("Bitset Data Size:", jsonString.length, "Compressed:", currentCompressedState.length);

        if (transferStatus) {
            transferStatus.textContent = t('ready_use_camera');
            transferStatus.classList.add('text-green-600');
        }
        generateQR(currentCompressedState);
    } catch (err) {
        console.error(err);
    }
}

async function generateQR(stateString) {
    const host = window.location.host;
    const protocol = window.location.protocol;
    const path = window.location.pathname;
    const fullUrl = `${protocol}//${host}${path}?prog=${stateString}`;

    try {
        await ensureQRCode();
        if (qrCanvas && window.QRCode) {
            window.QRCode.toCanvas(qrCanvas, fullUrl, { 
                width: 256, // Slightly larger for better scanning
                margin: 2,
                errorCorrectionLevel: 'M' 
            });
        }
    } catch (err) {
        console.error("Falha ao gerar QR:", err);
        if (transferStatus) {
            transferStatus.textContent = "Erro ao carregar o gerador de QR.";
            transferStatus.classList.remove('text-green-600');
            transferStatus.classList.add('text-red-600');
        }
    }
}

// --- RECEIVER LOGIC (SCANNER) ---

export async function openScanner() {
    // Check for Secure Context (HTTPS)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        alert(t('camera_blocked_http_alert'));
        return;
    }

    if (scannerModal) scannerModal.classList.remove('hidden');
    
    try {
        await ensureHtml5Qrcode();
        html5QrCode = new window.Html5Qrcode("reader");
        
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
    } catch (err) {
        console.error("Falha ao inicializar o leitor de QR:", err);
        alert(t('camera_error_permissions'));
        closeScanner();
    }
}

export async function closeScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }
    if (scannerModal) scannerModal.classList.add('hidden');
}

function onScanSuccess(decodedText) {
    try {
        const url = new URL(decodedText);
        const progressState = url.searchParams.get('prog');
        if (progressState) {
            closeScanner();
            applyProgress(progressState);
        }
    } catch (e) {
        console.error("QR Code inválido:", decodedText);
    }
}

function applyProgress(stateString) {
    syncOverlay.classList.remove('hidden');
    logSync(t('reading_optimized_progress'));

    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(stateString);
        if (!decompressed) throw new Error(t('invalid_data'));

        const progress = JSON.parse(decompressed);
        const storageKey = getActiveStorageKey();
        const localDataRaw = localStorage.getItem(storageKey);
        
        if (!localDataRaw) throw new Error(t('open_deck_mobile_first'));

        const localData = JSON.parse(localDataRaw);
        
        logSync(t('syncing_bitset'));
        localData.score = progress.s;
        
        // Rebuild pool using the bitset
        const bitset = progress.b;
        const newPool = [];
        for(let i=0; i < localData.allQuestions.length; i++) {
            if (bitset[i] === "1") {
                newPool.push(localData.allQuestions[i]);
            }
        }
        localData.questionsPool = newPool;

        localStorage.setItem(storageKey, encodeStoragePayload(localData));
        
        logSync(t('synced_restarting'));
        setTimeout(() => {
            window.location.href = window.location.origin + window.location.pathname;
        }, 1000);
    } catch (err) {
        alert(err.message);
        window.location.search = '';
    }
}
