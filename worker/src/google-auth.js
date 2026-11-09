// SPDX-License-Identifier: GPL-2.0-only
/**
 * google-auth.js - Cloudflare Worker helper for Google Firebase Authentication & Admin Token Minting
 * Implemented using Web Cryptography API (crypto.subtle) without external dependencies.
 */

// Cached Google JWKS for verifying client Firebase ID Tokens
let cachedJwks = null;
let jwksExpiry = 0;
const cachedPublicCryptoKeys = new Map();

// Cached Google OAuth2 Admin access token & private CryptoKey
let cachedAdminToken = null;
let adminTokenExpiry = 0;
let cachedPrivateKey = null;
let cachedPrivateKeyPem = null;

function base64UrlEncode(strOrBuffer) {
  let base64;
  if (typeof strOrBuffer === 'string') {
    base64 = btoa(strOrBuffer);
  } else {
    const bytes = new Uint8Array(strOrBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeUtf8(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  const binary = atob(str);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlDecodeBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  const binary = atob(str);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

/**
 * Fetch and cache Google Firebase Auth JWKS
 */
async function getGoogleJwks(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedJwks && now < jwksExpiry) {
    return cachedJwks;
  }

  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!res.ok) {
    throw new Error('Falha ao obter chaves públicas do Firebase');
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
  jwksExpiry = now + maxAge * 1000;

  const data = await res.json();
  cachedJwks = data.keys || [];
  cachedPublicCryptoKeys.clear();
  return cachedJwks;
}

/**
 * Verify a Firebase ID Token
 * @param {string} token
 * @param {string} projectId
 * @returns {Promise<object>} Decoded payload
 */
export async function verifyFirebaseIdToken(token, projectId) {
  if (!token) throw new Error('Token ausente');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Formato JWT inválido');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecodeUtf8(headerB64));
  const payload = JSON.parse(base64UrlDecodeUtf8(payloadB64));

  // Check timing & claims
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token expirado');
  }
  if (payload.aud !== projectId) {
    throw new Error('Audience do token inválida');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Emissor (iss) do token inválido');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Subject (sub) do token inválido');
  }

  let cryptoKey = cachedPublicCryptoKeys.get(header.kid);
  if (!cryptoKey) {
    let jwks = await getGoogleJwks(false);
    let jwk = jwks.find(k => k.kid === header.kid);
    if (!jwk) {
      // Key rotation fallback: force refresh JWKS once
      jwks = await getGoogleJwks(true);
      jwk = jwks.find(k => k.kid === header.kid);
    }
    if (!jwk) {
      throw new Error('Chave pública do Firebase não encontrada para o kid fornecido');
    }

    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    );
    cachedPublicCryptoKeys.set(header.kid, cryptoKey);
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecodeBytes(signatureB64);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature,
    data
  );

  if (!valid) {
    throw new Error('Assinatura do token inválida');
  }

  return payload;
}

/**
 * Convert PEM private key (PKCS#8) to CryptoKey (cached in isolate memory)
 */
async function importPrivateKey(pem) {
  if (cachedPrivateKey && cachedPrivateKeyPem === pem) {
    return cachedPrivateKey;
  }
  const cleanPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binaryDer = Uint8Array.from(atob(cleanPem), c => c.charCodeAt(0));

  cachedPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
  cachedPrivateKeyPem = pem;
  return cachedPrivateKey;
}

/**
 * Mint Google OAuth2 access token for Service Account
 * @param {object} serviceAccountConfig
 * @returns {Promise<string>} Bearer access token
 */
export async function getGoogleAdminAccessToken(serviceAccountConfig) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAdminToken && now < adminTokenExpiry) {
    return cachedAdminToken;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountConfig.client_email,
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKey = await importPrivateKey(serviceAccountConfig.private_key);
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signedJwt = `${unsignedToken}.${base64UrlEncode(signatureBuffer)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Falha ao obter token OAuth2 do Google: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  cachedAdminToken = tokenData.access_token;
  adminTokenExpiry = now + (tokenData.expires_in || 3600) - 120; // 2 min buffer
  return cachedAdminToken;
}

/**
 * Assign Pro custom claim to a Firebase User
 */
export async function setFirebaseUserProClaim(serviceAccountConfig, uid, isPro = true) {
  const accessToken = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;

  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      localId: uid,
      customAttributes: JSON.stringify({ pro: isPro })
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao definir claim Pro no Firebase Auth: ${err}`);
  }

  return true;
}

/**
 * Look up a Firebase User by email
 */
export async function getFirebaseUserByEmail(serviceAccountConfig, email) {
  if (!email) return null;
  const accessToken = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;

  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: [email] })
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  if (data.users && data.users.length > 0) {
    return {
      uid: data.users[0].localId,
      email: data.users[0].email,
      displayName: data.users[0].displayName
    };
  }
  return null;
}

/**
 * Permanently delete a Firebase Auth User
 */
export async function deleteFirebaseUser(serviceAccountConfig, uid) {
  const accessToken = await getGoogleAdminAccessToken(serviceAccountConfig);
  const projectId = serviceAccountConfig.project_id;

  const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ localId: uid })
  });

  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Erro ao excluir usuário no Firebase Auth: ${err}`);
  }

  return true;
}
