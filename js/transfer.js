/**
 * Session Transfer Logic (Bitset QR Optimization)
 * Uses a string of 1s and 0s to represent the deck state.
 * This makes the QR code extremely simple and easy to scan.
 */

import { t } from './i18n.js';
import { escapeHtml } from './utils.js';

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

function logSync(msg) {
    if (syncDebugLog) {
        syncDebugLog.innerHTML += `<br>> ${escapeHtml(msg || '')}`;
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

function openTransferModal() {
    transferModal.classList.remove('hidden');
    setTimeout(() => {
        transferModalContent.classList.remove('scale-95', 'opacity-0');
        transferModalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
    startSender();
}

function closeTransferModal() {
    transferModalContent.classList.remove('scale-100', 'opacity-100');
    transferModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => transferModal.classList.add('hidden'), 300);
}

/**
 * SENDER: Creates a Bitset (1s and 0s) of the deck state
 */
function getActiveStorageKey() {
    const mode = localStorage.getItem('flashcardsActiveMode');
    if (mode === 'notebook') return 'flashcardsNotebook';
    if (mode === 'exam') return 'flashcardsExam';
    return 'flashcardsSave';
}

function startSender() {
    transferStatus.textContent = t('optimizing_qr');
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

        transferStatus.textContent = t('ready_use_camera');
        transferStatus.classList.add('text-green-600');
        generateQR(currentCompressedState);
    } catch (err) {
        console.error(err);
    }
}

function generateQR(stateString) {
    const host = window.location.host;
    const protocol = window.location.protocol;
    const path = window.location.pathname;
    const fullUrl = `${protocol}//${host}${path}?prog=${stateString}`;

    QRCode.toCanvas(qrCanvas, fullUrl, { 
        width: 256, // Slightly larger for better scanning
        margin: 2,
        errorCorrectionLevel: 'M' 
    });
}

// --- RECEIVER LOGIC (SCANNER) ---

async function openScanner() {
    // Check for Secure Context (HTTPS)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        alert(t('camera_blocked_http_alert'));
        return;
    }

    scannerModal.classList.remove('hidden');
    html5QrCode = new Html5Qrcode("reader");
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    try {
        await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
    } catch (err) {
        alert(t('camera_error_permissions'));
        closeScanner();
    }
}

async function closeScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }
    scannerModal.classList.add('hidden');
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

        localStorage.setItem(storageKey, JSON.stringify(localData));
        
        logSync(t('synced_restarting'));
        setTimeout(() => {
            window.location.href = window.location.origin + window.location.pathname;
        }, 1000);
    } catch (err) {
        alert(err.message);
        window.location.search = '';
    }
}
