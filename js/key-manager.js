/**
 * key-manager.js
 * Gerenciador de persistência segura para a Google Gemini API Key.
 * Implementa a Abordagem 3: Web Cryptography API com CryptoKey não-exportável no IndexedDB.
 *
 * Características de Segurança:
 * - Chave AES-GCM (256 bits) gerada com `extractable: false` (o JavaScript não pode exportar a chave crua).
 * - A CryptoKey é preservada de forma isolada no IndexedDB do navegador.
 * - O segredo é cifrado com AES-GCM usando IV criptográfico de 12 bytes.
 * - Quando "Lembrar chave" estiver desmarcado, cifra em cofre efêmero de sessão (sessionStorage + IndexedDB) ou mantém na memória volátil.
 * - Nenhuma chave de API em texto puro é jamais gravada em localStorage ou sessionStorage.
 * - Elimina resíduos antigos em texto puro do localStorage e sessionStorage.
 */

const DB_NAME = 'flashcards_vault';
const DB_VERSION = 1;
const STORE_NAME = 'crypto_keys';
const KEY_RECORD_ID = 'gemini_persistent_key';
const KEY_RECORD_LEGACY_ID = 'gemini_non_exportable_key';
const SESSION_KEY_RECORD_ID = 'gemini_session_key';

const STORAGE_CIPHER_KEY = 'flashcards_persistent_vault';
const STORAGE_SESSION_CIPHER = 'flashcards_session_vault';
const STORAGE_REMEMBER_FLAG = 'flashcards_remember_flag';
const STORAGE_LEGACY_KEYS = [
    ['gemini', 'api', 'key', 'checker'].join('_'),
    ['gemini', 'api', 'key'].join('_')
];

function encodeVaultPayload(payload) {
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
}

// Cache em memória para evitar decifrações repetidas na mesma sessão
let inMemoryKey = '';

// Utilitários de codificação Base64
function bytesToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Abertura do cofre IndexedDB
function openVaultDb() {
    return new Promise((resolve, reject) => {
        const idb = typeof window !== 'undefined' ? (window.indexedDB || globalThis.indexedDB) : globalThis.indexedDB;
        if (!idb) {
            return reject(new Error('IndexedDB não suportado neste navegador.'));
        }
        try {
            const request = idb.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (err) {
            reject(err);
        }
    });
}

// Grava a CryptoKey não-exportável no IndexedDB
async function storeCryptoKey(cryptoKey, recordId = KEY_RECORD_ID) {
    try {
        const db = await openVaultDb();
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.put(cryptoKey, recordId);
                req.onsuccess = () => {
                    try { db.close(); } catch {}
                    resolve(true);
                };
                req.onerror = () => {
                    try { db.close(); } catch {}
                    resolve(false);
                };
            } catch {
                try { db.close(); } catch {}
                resolve(false);
            }
        });
    } catch {
        return false;
    }
}

// Recupera a CryptoKey do IndexedDB
async function retrieveCryptoKey(recordId = KEY_RECORD_ID) {
    try {
        const db = await openVaultDb();
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(recordId);
                req.onsuccess = () => {
                    try { db.close(); } catch {}
                    resolve(req.result || null);
                };
                req.onerror = () => {
                    try { db.close(); } catch {}
                    resolve(null);
                };
            } catch {
                try { db.close(); } catch {}
                resolve(null);
            }
        });
    } catch {
        return null;
    }
}

// Remove a CryptoKey do IndexedDB
async function removeCryptoKey(recordId = KEY_RECORD_ID) {
    try {
        const db = await openVaultDb();
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.delete(recordId);
                req.onsuccess = () => {
                    try { db.close(); } catch {}
                    resolve(true);
                };
                req.onerror = () => {
                    try { db.close(); } catch {}
                    resolve(false);
                };
            } catch {
                try { db.close(); } catch {}
                resolve(false);
            }
        });
    } catch {
        return false;
    }
}

// Limpa qualquer resíduo legado em texto puro do localStorage e sessionStorage
function purgeLegacyPlaintextStorage() {
    try {
        STORAGE_LEGACY_KEYS.forEach(k => {
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
        });
    } catch {}
}

/**
 * Retorna a chave se já estiver carregada na memória da sessão atual (síncrono).
 * Ideal para verificações imediatas no ciclo de vida de renderização.
 */
export function getCachedApiKey() {
    purgeLegacyPlaintextStorage();
    return inMemoryKey || '';
}

/**
 * Verifica se a opção "Lembrar chave" está ativada no dispositivo.
 */
export function isKeyRemembered() {
    try {
        return localStorage.getItem(STORAGE_REMEMBER_FLAG) === 'true' &&
            Boolean(localStorage.getItem(STORAGE_CIPHER_KEY));
    } catch {
        return false;
    }
}

/**
 * Decifra um payload AES-GCM { iv, ciphertext } com uma CryptoKey do IndexedDB.
 */
async function decryptPayload(rawJson, recordId) {
    if (!rawJson || !window.crypto?.subtle) return '';
    try {
        const parsed = JSON.parse(rawJson);
        if (!parsed.iv || !parsed.ciphertext) return '';
        let cryptoKey = await retrieveCryptoKey(recordId);
        // Fallback para chave persistente de esquema anterior se aplicável
        if (!cryptoKey && recordId === KEY_RECORD_ID) {
            cryptoKey = await retrieveCryptoKey(KEY_RECORD_LEGACY_ID);
        }
        if (!cryptoKey) return '';

        const iv = base64ToBytes(parsed.iv);
        const ciphertext = base64ToBytes(parsed.ciphertext);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            ciphertext
        );
        return new TextDecoder().decode(decryptedBuffer).trim();
    } catch (err) {
        console.warn(`[KeyManager] Falha ao decifrar vault (${recordId}):`, err);
        return '';
    }
}

/**
 * Cifra um payload em texto puro gerando uma CryptoKey não-exportável e payload AES-GCM.
 */
async function encryptPayload(rawInput, recordId) {
    if (!rawInput || !window.crypto?.subtle) return null;
    const cryptoKey = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // NÃO EXPORTÁVEL via JavaScript
        ['encrypt', 'decrypt']
    );

    await storeCryptoKey(cryptoKey, recordId);

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedBytes = new TextEncoder().encode(rawInput);
    const cipherBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encodedBytes
    );

    return {
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
        updatedAt: Date.now()
    };
}

/**
 * Obtém a chave de API assincronamente:
 * 1. Verifica cache em memória (inMemoryKey).
 * 2. Verifica cofre de sessão cifrado (sessionStorage).
 * 3. Se configurado para lembrar, decifra chave persistida do localStorage.
 * 4. Migra automaticamente e purga eventuais chaves em texto puro legadas.
 */
export async function getApiKeyAsync() {
    if (inMemoryKey) return inMemoryKey;

    // 1. Tentar decifrar da sessão atual (sessionStorage cifrado)
    try {
        const sessionVault = sessionStorage.getItem(STORAGE_SESSION_CIPHER);
        if (sessionVault) {
            const sessionDecrypted = await decryptPayload(sessionVault, SESSION_KEY_RECORD_ID);
            if (sessionDecrypted) {
                inMemoryKey = sessionDecrypted;
                purgeLegacyPlaintextStorage();
                return inMemoryKey;
            }
        }
    } catch (err) {
        console.warn('[KeyManager] Falha ao ler vault de sessão:', err);
    }

    // 2. Tentar decifrar chave persistida (localStorage cifrado com chave do IndexedDB)
    try {
        const isRemembered = localStorage.getItem(STORAGE_REMEMBER_FLAG) === 'true';
        const persistentCipher = localStorage.getItem(STORAGE_CIPHER_KEY);

        if (isRemembered && persistentCipher) {
            const persistentDecrypted = await decryptPayload(persistentCipher, KEY_RECORD_ID);
            if (persistentDecrypted) {
                inMemoryKey = persistentDecrypted;
                purgeLegacyPlaintextStorage();
                return inMemoryKey;
            }
        }
    } catch (err) {
        console.warn('[KeyManager] Não foi possível decifrar chave persistida:', err);
    }

    // 3. Fallback de migração suave de chaves legadas em texto puro (purga imediatamente após migrar)
    try {
        for (const legacyKeyName of STORAGE_LEGACY_KEYS) {
            const legacyVal = localStorage.getItem(legacyKeyName) || sessionStorage.getItem(legacyKeyName);
            if (legacyVal && legacyVal.trim()) {
                const trimmed = legacyVal.trim();
                inMemoryKey = trimmed;
                const shouldRemember = localStorage.getItem(STORAGE_REMEMBER_FLAG) !== 'false';
                await saveApiKey(trimmed, shouldRemember);
                purgeLegacyPlaintextStorage();
                return trimmed;
            }
        }
    } catch (e) {
        console.warn('[KeyManager] Erro ao verificar chave legada:', e);
    }

    purgeLegacyPlaintextStorage();
    return '';
}

/**
 * Alias de conveniência para getApiKeyAsync
 */
export const getApiKey = getApiKeyAsync;

/**
 * Salva a API Key:
 * @param {string} key - Chave do Gemini fornecida pelo usuário.
 * @param {boolean} remember - Se verdadeiro, cifra com AES-GCM (chave não-exportável) no IndexedDB e persiste no localStorage.
 *                             Se falso, cifra em cofre efêmero de sessão (sessionStorage) com limpeza ao fechar a aba.
 */
export async function saveApiKey(key, remember = false) {
    const cleanKey = (key || '').trim();

    if (!cleanKey) {
        await clearApiKey();
        return;
    }

    inMemoryKey = cleanKey;
    purgeLegacyPlaintextStorage();

    if (remember && window.crypto?.subtle) {
        try {
            // 1. Cifra para persistência de longo prazo
            const payload = await encryptPayload(cleanKey, KEY_RECORD_ID);
            if (payload) {
                localStorage.setItem(STORAGE_CIPHER_KEY, encodeVaultPayload(payload));
                localStorage.setItem(STORAGE_REMEMBER_FLAG, 'true');
            }

            // 2. Remove cofre efêmero de sessão anterior
            try {
                sessionStorage.removeItem(STORAGE_SESSION_CIPHER);
            } catch {}
            await removeCryptoKey(SESSION_KEY_RECORD_ID);
        } catch (err) {
            console.error('[KeyManager] Falha ao persistir chave cifrada:', err);
        }
    } else {
        // Modo efêmero: remove chave persistente do localStorage e IndexedDB
        try {
            localStorage.removeItem(STORAGE_CIPHER_KEY);
            localStorage.setItem(STORAGE_REMEMBER_FLAG, 'false');
        } catch {}
        await removeCryptoKey(KEY_RECORD_ID);
        await removeCryptoKey(KEY_RECORD_LEGACY_ID);

        // Cifra em cofre de sessão efêmero no sessionStorage via Web Crypto
        if (window.crypto?.subtle) {
            try {
                const sessionPayload = await encryptPayload(cleanKey, SESSION_KEY_RECORD_ID);
                if (sessionPayload) {
                    sessionStorage.setItem(STORAGE_SESSION_CIPHER, encodeVaultPayload(sessionPayload));
                }
            } catch (err) {
                console.warn('[KeyManager] Falha ao gravar cofre de sessão cifrado:', err);
            }
        }
    }
}

/**
 * Remove a API Key de todas as camadas (memória, sessionStorage, IndexedDB e localStorage).
 */
export async function clearApiKey() {
    inMemoryKey = '';
    try {
        sessionStorage.removeItem(STORAGE_SESSION_CIPHER);
    } catch {}
    try {
        localStorage.removeItem(STORAGE_CIPHER_KEY);
        localStorage.removeItem(STORAGE_REMEMBER_FLAG);
    } catch {}
    purgeLegacyPlaintextStorage();
    await removeCryptoKey(KEY_RECORD_ID);
    await removeCryptoKey(KEY_RECORD_LEGACY_ID);
    await removeCryptoKey(SESSION_KEY_RECORD_ID);
}
