// SPDX-License-Identifier: GPL-2.0-only
/**
 * gemini.js - Secure Gemini AI proxy for Cloudflare Worker
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Proxies generateContent or streamGenerateContent to Google Gemini
 * @param {object} params
 * @param {string} params.model - e.g. "gemini-2.5-flash"
 * @param {object} params.contents - Gemini request body contents
 * @param {object} [params.systemInstruction]
 * @param {object} [params.generationConfig]
 * @param {boolean} [params.stream]
 * @param {string} params.apiKey - Internal server Gemini API key
 */
export async function callGemini({
  model = 'gemini-flash-latest',
  contents,
  systemInstruction,
  generationConfig,
  tools,
  toolConfig,
  stream = false,
  apiKey
}) {
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const queryParams = new URLSearchParams();
  if (stream) {
    queryParams.set('alt', 'sse');
  }
  if (apiKey) {
    queryParams.set('key', apiKey);
  }
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const url = `${GEMINI_API_BASE}/models/${model}:${action}${queryString}`;

  // Normalize contents and parts so strings are cleanly wrapped in { text: string }
  // and map any 'function' roles to 'user' as strictly required by Google Gemini API
  const normalizedContents = (Array.isArray(contents) ? contents : [contents]).filter(Boolean).map(item => {
    if (typeof item === 'string') {
      return { role: 'user', parts: [{ text: item }] };
    }
    if (item && Array.isArray(item.parts)) {
      let role = item.role;
      if (role === 'function' || item.parts.some(p => p && !!p.functionResponse)) {
        role = 'user';
      }
      return {
        ...item,
        role,
        parts: item.parts.map(part => {
          if (typeof part === 'string') {
            return { text: part };
          }
          return part;
        })
      };
    }
    return item;
  });

  const body = {
    contents: normalizedContents
  };
  if (systemInstruction) {
    body.systemInstruction = typeof systemInstruction === 'string'
      ? { parts: [{ text: systemInstruction }] }
      : systemInstruction;
  }
  if (generationConfig) body.generationConfig = generationConfig;
  if (tools) body.tools = tools;
  if (toolConfig) body.toolConfig = toolConfig;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey || ''
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini API Error] (${response.status}) Model: ${model}:`, errorText);

    // Fallback 1: Se erro 400 com thinkingConfig, retenta sem thinkingConfig
    if (response.status === 400 && body.generationConfig?.thinkingConfig) {
      console.warn(`[Gemini Fallback] Tentando novamente sem thinkingConfig para ${model}...`);
      const fallbackBody = { ...body, generationConfig: { ...body.generationConfig } };
      delete fallbackBody.generationConfig.thinkingConfig;
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey || ''
        },
        body: JSON.stringify(fallbackBody)
      });
      if (retryRes.ok) {
        if (stream) {
          return new Response(retryRes.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            }
          });
        }
        return new Response(JSON.stringify(await retryRes.json()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Fallback 2: Se erro 404 ou 400 persistir, tenta fallback para gemini-flash-latest
    if ((response.status === 404 || response.status === 400) && model !== 'gemini-flash-latest') {
      console.warn(`[Gemini Fallback] Tentando fallback para gemini-flash-latest...`);
      const fallbackUrl = `${GEMINI_API_BASE}/models/gemini-flash-latest:${action}${queryString}`;
      const cleanBody = { ...body };
      if (cleanBody.generationConfig?.thinkingConfig) {
        cleanBody.generationConfig = { ...cleanBody.generationConfig };
        delete cleanBody.generationConfig.thinkingConfig;
      }
      const retryRes = await fetch(fallbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey || ''
        },
        body: JSON.stringify(cleanBody)
      });
      if (retryRes.ok) {
        if (stream) {
          return new Response(retryRes.body, {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            }
          });
        }
        return new Response(JSON.stringify(await retryRes.json()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    throw new Error(`Erro na API do Gemini (${response.status}): ${errorText}`);
  }

  if (stream) {
    // Return readable stream with SSE headers
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
