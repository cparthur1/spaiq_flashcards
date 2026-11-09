// SPDX-License-Identifier: GPL-2.0-only
/**
 * firestore.js - Firestore REST helper for Cloudflare Worker
 */
import { getGoogleAdminAccessToken } from './google-auth.js';

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';

/**
 * Extracts and parses Firebase Service Account from Worker environment
 */
export function getServiceAccount(env) {
  if (!env) throw new Error('Objeto env não fornecido');
  if (env.FIREBASE_SERVICE_ACCOUNT_OBJ) return env.FIREBASE_SERVICE_ACCOUNT_OBJ;
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('Configuração FIREBASE_SERVICE_ACCOUNT não definida');
  }
  return typeof env.FIREBASE_SERVICE_ACCOUNT === 'string'
    ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
    : env.FIREBASE_SERVICE_ACCOUNT;
}

/**
 * Convert plain JS object to Firestore field format
 */
function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) {
      continue;
    } else if (val === null) {
      fields[key] = { nullValue: null };
    } else if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        fields[key] = { integerValue: val.toString() };
      } else {
        fields[key] = { doubleValue: val };
      }
    } else if (typeof val === 'string') {
      fields[key] = { stringValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map(item => toFirestoreFields({ item }).item)
        }
      };
    } else if (typeof val === 'object') {
      fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
    }
  }
  return fields;
}

/**
 * Convert Firestore field format back to plain JS object
 */
function fromFirestoreFields(fields) {
  if (!fields) return {};
  const obj = {};
  for (const [key, val] of Object.entries(fields)) {
    if ('stringValue' in val) obj[key] = val.stringValue;
    else if ('booleanValue' in val) obj[key] = val.booleanValue;
    else if ('integerValue' in val) obj[key] = parseInt(val.integerValue, 10);
    else if ('doubleValue' in val) obj[key] = val.doubleValue;
    else if ('nullValue' in val) {
      if (key !== 'dueStep') {
        obj[key] = null;
      }
    }
    else if ('mapValue' in val) obj[key] = fromFirestoreFields(val.mapValue.fields);
    else if ('arrayValue' in val) {
      obj[key] = (val.arrayValue.values || []).map(v => fromFirestoreFields({ v }).v);
    }
  }
  return obj;
}

/**
 * Get user document from Firestore
 */
export async function getUserDocument(serviceAccountConfig, uid) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/users/${uid}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao buscar usuário no Firestore: ${err}`);
  }

  const data = await res.json();
  return fromFirestoreFields(data.fields);
}

/**
 * Update or patch user document in Firestore
 */
export async function updateUserDocument(serviceAccountConfig, uid, fieldsToUpdate) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;

  const updateMask = Object.keys(fieldsToUpdate)
    .map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');

  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/users/${uid}?${updateMask}`;
  const firestoreFields = toFirestoreFields(fieldsToUpdate);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: firestoreFields })
  });

  if (res.status === 404) {
    // Document does not exist yet; create it directly
    return await setDocument(serviceAccountConfig, 'users', uid, fieldsToUpdate);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao atualizar usuário no Firestore: ${err}`);
  }

  return await res.json();
}

/**
 * Delete user document and associated decks/shares from Firestore
 */
export async function deleteUserDocument(serviceAccountConfig, uid) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  const userUrl = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/users/${uid}`;

  // First fetch user doc to find deck IDs and API keys
  const userDoc = await getUserDocument(serviceAccountConfig, uid);
  const cleanupTasks = [
    deleteDeckDocument(serviceAccountConfig, `notebook_${uid}`).catch(() => {})
  ];

  if (userDoc?.deckSlots && Array.isArray(userDoc.deckSlots)) {
    for (const slot of userDoc.deckSlots) {
      if (slot.deckId) {
        cleanupTasks.push(deleteDeckDocument(serviceAccountConfig, slot.deckId).catch(() => {}));
      }
    }
  }

  // Delete API key if present
  if (userDoc?.apiKey) {
    cleanupTasks.push(deleteDocument(serviceAccountConfig, 'api_keys', userDoc.apiKey).catch(() => {}));
  }

  await Promise.all(cleanupTasks);

  // Delete the user doc
  await fetch(userUrl, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  return true;
}

/**
 * Wipe all saved cloud decks, notebook, and cloud slot metadata for non-Pro users
 */
export async function clearUserCloudData(serviceAccountConfig, uid) {
  try {
    const userDoc = await getUserDocument(serviceAccountConfig, uid);
    const cleanupTasks = [
      deleteDeckDocument(serviceAccountConfig, `notebook_${uid}`).catch(() => {})
    ];

    if (userDoc?.deckSlots && Array.isArray(userDoc.deckSlots)) {
      for (const slot of userDoc.deckSlots) {
        if (slot.deckId) {
          cleanupTasks.push(deleteDeckDocument(serviceAccountConfig, slot.deckId).catch(() => {}));
        }
      }
    }

    // Delete API key if present
    if (userDoc?.apiKey) {
      cleanupTasks.push(deleteDocument(serviceAccountConfig, 'api_keys', userDoc.apiKey).catch(() => {}));
    }

    await Promise.all(cleanupTasks);

    // Clear cloud slots and data on user document
    await updateUserDocument(serviceAccountConfig, uid, {
      deckSlots: [],
      notebookSlot: null,
      stats: null,
      settings: null,
      dailyStreak: null,
      activeMode: null,
      apiKey: null,
      apiKeyCreatedAt: null,
      lastSyncedAt: 0
    });
    return true;
  } catch (err) {
    console.warn(`[Firestore] Erro ao limpar dados de nuvem do usuário ${uid}:`, err);
    return false;
  }
}

/**
 * Get any document from Firestore
 */
export async function getDocument(serviceAccountConfig, collectionName, docId) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao buscar documento no Firestore (${collectionName}/${docId}): ${err}`);
  }

  const data = await res.json();
  return fromFirestoreFields(data.fields);
}

/**
 * Set or replace any document in Firestore
 */
export async function setDocument(serviceAccountConfig, collectionName, docId, fieldsToSet) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  
  // In Firestore REST API, updateMask is required for PATCH to create/upsert a document if it doesn't already exist.
  // Without updateMask, Firestore requires the document to already exist and returns 404 NOT_FOUND.
  const updateMask = Object.keys(fieldsToSet)
    .map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');
  const querySuffix = updateMask ? `?${updateMask}` : '';
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}${querySuffix}`;
  const firestoreFields = toFirestoreFields(fieldsToSet);

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: firestoreFields })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao gravar documento no Firestore (${collectionName}/${docId}): ${err}`);
  }

  return await res.json();
}

/**
 * Find user document by apiKey using runQuery
 */
export async function findUserByApiKey(serviceAccountConfig, apiKey) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents:runQuery`;

  const query = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'apiKey' },
          op: 'EQUAL',
          value: { stringValue: apiKey }
        }
      },
      limit: 1
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });

  if (!res.ok) {
    const err = await res.text();
    console.warn(`[Firestore] Erro ao buscar usuário por apiKey: ${err}`);
    return null;
  }

  const results = await res.json();
  if (Array.isArray(results) && results.length > 0 && results[0].document) {
    const doc = results[0].document;
    const fields = fromFirestoreFields(doc.fields);
    const parts = doc.name.split('/');
    const uid = parts[parts.length - 1];
    return { uid, ...fields };
  }
  return null;
}

/**
 * Delete any document from Firestore
 */
export async function deleteDocument(serviceAccountConfig, collectionName, docId) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${collectionName}/${docId}`;

  return await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * Delete a specific deck document
 */
export async function deleteDeckDocument(serviceAccountConfig, deckId) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/decks/${deckId}`;

  return await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

/**
 * Mark a share as deleted or delete it
 */
export async function markShareDeleted(serviceAccountConfig, shareSlug) {
  const token = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;
  const url = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/shares/${shareSlug}`;

  // Mark as deleted: true so client can display "Este baralho foi apagado pelo proprietário"
  const firestoreFields = toFirestoreFields({
    deleted: true,
    deletedAt: Date.now()
  });

  return await fetch(`${url}?updateMask.fieldPaths=deleted&updateMask.fieldPaths=deletedAt`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields: firestoreFields })
  });
}

