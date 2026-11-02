// SPDX-License-Identifier: GPL-2.0-only
/**
 * js/pending-generation.js
 * Persists pending AI deck generation materials and instructions across Stripe Checkout redirects.
 */

const DB_NAME = 'spaiq_flashcards_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_generations';
const PENDING_KEY = 'active_pending_generation';
const PENDING_STORAGE_FLAG = 'spaiq_has_pending_generation';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB não suportado neste navegador'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Serializes files into ArrayBuffers for IndexedDB storage
 * @param {File[]} fileList
 * @returns {Promise<Array<{ name: string, type: string, lastModified: number, size: number, buffer: ArrayBuffer }>>}
 */
async function serializeFiles(fileList) {
  const serialized = [];
  if (!fileList || !Array.isArray(fileList)) return serialized;

  for (const file of fileList) {
    if (!file) continue;
    try {
      const buffer = await file.arrayBuffer();
      serialized.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified || Date.now(),
        size: file.size,
        buffer
      });
    } catch (e) {
      console.warn('[PendingGen] Erro ao serializar arquivo:', file.name, e);
    }
  }
  return serialized;
}

/**
 * Reconstructs native File objects from ArrayBuffers
 * @param {Array<{ name: string, type: string, lastModified: number, buffer: ArrayBuffer }>} serializedList
 * @returns {File[]}
 */
function deserializeFiles(serializedList) {
  if (!Array.isArray(serializedList)) return [];
  return serializedList.map(item => {
    const blob = new Blob([item.buffer], { type: item.type });
    return new File([blob], item.name, {
      type: item.type,
      lastModified: item.lastModified
    });
  });
}

/**
 * Saves pending generation state to IndexedDB and localStorage flag
 * @param {Object} data
 * @param {'2.1'|'2.2'} [data.mode='2.1']
 * @param {File[]} [data.files=[]]
 * @param {string} [data.prompt='']
 * @param {string} [data.language='Inglês']
 * @param {string} [data.customLanguage='']
 * @returns {Promise<boolean>}
 */
export async function savePendingGeneration(data) {
  try {
    const db = await openDatabase();
    const serializedFiles = await serializeFiles(data.files || []);
    const record = {
      id: PENDING_KEY,
      mode: data.mode || '2.1',
      prompt: data.prompt || '',
      language: data.language || 'Inglês',
      customLanguage: data.customLanguage || '',
      files: serializedFiles,
      timestamp: Date.now()
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });

    try {
      localStorage.setItem(PENDING_STORAGE_FLAG, 'true');
      localStorage.setItem('spaiq_pending_gen_mode', data.mode || '2.1');
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn('[PendingGen] Erro ao salvar geração pendente:', err);
    return false;
  }
}

/**
 * Retrieves and deserializes pending generation
 * @returns {Promise<{ mode: string, prompt: string, language: string, customLanguage: string, files: File[] } | null>}
 */
export async function getPendingGeneration() {
  try {
    const hasPending = localStorage.getItem(PENDING_STORAGE_FLAG) === 'true';
    if (!hasPending) return null;

    const db = await openDatabase();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(PENDING_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });

    if (!record) {
      await clearPendingGeneration();
      return null;
    }

    // Discard drafts older than 24 hours
    if (Date.now() - record.timestamp > 24 * 60 * 60 * 1000) {
      await clearPendingGeneration();
      return null;
    }

    const files = deserializeFiles(record.files);
    return {
      mode: record.mode || '2.1',
      prompt: record.prompt || '',
      language: record.language || 'Inglês',
      customLanguage: record.customLanguage || '',
      files
    };
  } catch (err) {
    console.warn('[PendingGen] Erro ao recuperar geração pendente:', err);
    return null;
  }
}

/**
 * Clears pending generation from IndexedDB and localStorage
 */
export async function clearPendingGeneration() {
  try {
    localStorage.removeItem(PENDING_STORAGE_FLAG);
    localStorage.removeItem('spaiq_pending_gen_mode');
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(PENDING_KEY);
  } catch (e) {}
}

/**
 * Quick synchronous check if a pending generation flag is present in localStorage
 * @returns {boolean}
 */
export function hasPendingGenerationFlag() {
  try {
    return localStorage.getItem(PENDING_STORAGE_FLAG) === 'true';
  } catch (e) {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.savePendingGeneration = savePendingGeneration;
  window.getPendingGeneration = getPendingGeneration;
  window.clearPendingGeneration = clearPendingGeneration;
  window.hasPendingGenerationFlag = hasPendingGenerationFlag;
}
