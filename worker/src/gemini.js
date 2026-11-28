// SPDX-License-Identifier: GPL-2.0-only
/**
 * gemini.js - Secure Gemini AI proxy for Cloudflare Worker
 */

import AI_MODELS_CONFIG from './ai-models-loader.mjs';

export { AI_MODELS_CONFIG };

const AI_STUDIO_API_BASE = AI_MODELS_CONFIG.providers?.aistudioBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
const VERTEX_EXPRESS_API_BASE = AI_MODELS_CONFIG.providers?.vertexExpressBaseUrl || 'https://aiplatform.googleapis.com/v1/publishers/google';

function isForbiddenGemini2Model(name) {
  return typeof name === 'string' && /^gemini-2(\.|-|$)/i.test(name.trim());
}

/**
 * Resolves any requested model name or logical tier alias against `worker/src/ai-models.json`.
 * Strictly rejects any Gemini 2.x model and maps legacy aliases (e.g. `gemini-flash-latest`)
 * to the currently configured models.
 */
export function resolveModelConfig(requestedModel, fallbackTier = 'flashLite', { allowDecision = false } = {}) {
  const models = AI_MODELS_CONFIG.models || {};
  const aliases = AI_MODELS_CONFIG.aliases || {};
  const fallbacks = AI_MODELS_CONFIG.fallbacks || {};

  const resolveTier = (tierKey) => {
    if (tierKey === 'decision' && allowDecision) {
      const decisionModel = models.decision || 'gemini-decision-1';
      return { tier: 'decision', model: decisionModel, candidates: [decisionModel] };
    }
    const safeTier = tierKey === 'flash' ? 'flash' : 'flashLite';
    const primary = models[safeTier] || (safeTier === 'flash' ? 'gemini-3.8-flash' : 'gemini-3.5-flash-lite');
    const rawFallbacks = Array.isArray(fallbacks[safeTier]) && fallbacks[safeTier].length > 0
      ? fallbacks[safeTier]
      : [primary];
    const candidates = [...new Set([primary, ...rawFallbacks])]
      .filter(m => typeof m === 'string' && m.trim() && !isForbiddenGemini2Model(m));
    return { tier: safeTier, model: candidates[0] || primary, candidates };
  };

  if (typeof requestedModel === 'string') {
    const trimmed = requestedModel.trim();
    if (trimmed && !isForbiddenGemini2Model(trimmed)) {
      if (aliases[trimmed]) {
        const mappedTier = aliases[trimmed];
        if (mappedTier !== 'decision' || allowDecision) {
          return resolveTier(mappedTier);
        }
      }
      if (allowDecision && trimmed === models.decision) {
        return resolveTier('decision');
      }
      if (trimmed === models.flash) {
        return resolveTier('flash');
      }
      if (trimmed === models.flashLite) {
        return resolveTier('flashLite');
      }
      // Allow any explicitly listed fallback model from ai-models.json (never Gemini 2)
      for (const tierKey of ['flash', 'flashLite']) {
        const list = Array.isArray(fallbacks[tierKey]) ? fallbacks[tierKey] : [];
        if (list.includes(trimmed)) {
          const rest = list.filter(m => m !== trimmed && !isForbiddenGemini2Model(m));
          return { tier: tierKey, model: trimmed, candidates: [trimmed, ...rest] };
        }
      }
    }
  }

  // Fallback tier (supports passing either 'flash'/'flashLite' or an alias/model name)
  const normalizedFallbackTier = (fallbackTier === 'flash' || fallbackTier === 'gemini-flash-latest' || fallbackTier === models.flash)
    ? 'flash'
    : 'flashLite';
  return resolveTier(normalizedFallbackTier);
}

/**
 * Determines whether a Gemini call should target Google Cloud Vertex AI Express Mode
 * instead of Google AI Studio.
 */
export function isVertexExpressProvider(apiKey, provider = null) {
  if (provider === 'vertex') return true;
  if (provider === 'aistudio') return false;
  return typeof apiKey === 'string' && apiKey.trim().startsWith('AQ.');
}

/**
 * Resolves ordered model candidates from `worker/src/ai-models.json` for both AI Studio and Vertex AI.
 */
export function resolveModelCandidates(model, fallbackTier = 'flash') {
  return resolveModelConfig(model, fallbackTier).candidates;
}

function buildGeminiEndpointUrl({ model, action, stream = false, useVertex = false }) {
  const base = useVertex ? VERTEX_EXPRESS_API_BASE : AI_STUDIO_API_BASE;
  const queryString = stream ? '?alt=sse' : '';
  return `${base}/models/${encodeURIComponent(model)}:${action}${queryString}`;
}

function buildGeminiSuccessResponse(upstreamResponse, stream) {
  if (stream) {
    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
  return upstreamResponse.json().then(data => new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }));
}

/**
 * Proxies generateContent or streamGenerateContent to Google Gemini (AI Studio or Vertex AI Express Mode)
 * @param {object} params
 * @param {string} params.model - Logical tier ('flash' | 'flash-lite') or configured model ID
 * @param {object} params.contents - Gemini request body contents
 * @param {object} [params.systemInstruction]
 * @param {object} [params.generationConfig]
 * @param {boolean} [params.stream]
 * @param {string} params.apiKey - Internal server Gemini API key
 * @param {'aistudio'|'vertex'|null} [params.provider] - Explicit API provider (auto-detected from AQ. key if omitted)
 */
export async function callGemini({
  model = 'flash',
  contents,
  systemInstruction,
  generationConfig,
  tools,
  toolConfig,
  stream = false,
  apiKey,
  provider = null,
  fetchImpl = fetch
}) {
  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const useVertex = isVertexExpressProvider(apiKey, provider);
  const candidates = resolveModelCandidates(model, 'flash');

  // Normalize contents and parts so strings are cleanly wrapped in { text: string },
  // map 'function' roles to 'user', and guarantee explicit role for Vertex AI v1 compliance.
  const normalizedContents = (Array.isArray(contents) ? contents : [contents]).filter(Boolean).map(item => {
    if (typeof item === 'string') {
      return { role: 'user', parts: [{ text: item }] };
    }
    if (item && Array.isArray(item.parts)) {
      let role = item.role || 'user';
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

  const baseBody = {
    contents: normalizedContents
  };
  if (systemInstruction) {
    baseBody.systemInstruction = typeof systemInstruction === 'string'
      ? { parts: [{ text: systemInstruction }] }
      : systemInstruction;
  }
  if (generationConfig) baseBody.generationConfig = generationConfig;
  if (tools) baseBody.tools = tools;
  if (toolConfig) baseBody.toolConfig = toolConfig;

  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey || ''
  };

  let lastStatus = 500;
  let lastErrorText = '';

  for (let i = 0; i < candidates.length; i++) {
    const candidateModel = candidates[i];
    const url = buildGeminiEndpointUrl({ model: candidateModel, action, stream, useVertex });
    const reqBody = i === 0
      ? baseBody
      : (() => {
          const clean = { ...baseBody };
          if (clean.generationConfig?.thinkingConfig) {
            clean.generationConfig = { ...clean.generationConfig };
            delete clean.generationConfig.thinkingConfig;
          }
          return clean;
        })();

    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(reqBody)
    });

    if (response.ok) {
      return await buildGeminiSuccessResponse(response, stream);
    }

    lastStatus = response.status;
    lastErrorText = await response.text();
    console.error(`[Gemini API Error] (${response.status}) Provider: ${useVertex ? 'vertex' : 'aistudio'} Model: ${candidateModel}:`, lastErrorText);

    // Fallback 1: If HTTP 400 with thinkingConfig on this model, retry same model without thinkingConfig
    if (response.status === 400 && reqBody.generationConfig?.thinkingConfig) {
      console.warn(`[Gemini Fallback] Tentando novamente sem thinkingConfig para ${candidateModel}...`);
      const fallbackBody = { ...reqBody, generationConfig: { ...reqBody.generationConfig } };
      delete fallbackBody.generationConfig.thinkingConfig;
      const retryRes = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(fallbackBody)
      });
      if (retryRes.ok) {
        return await buildGeminiSuccessResponse(retryRes, stream);
      }
      lastStatus = retryRes.status;
      lastErrorText = await retryRes.text();
    }

    // Fallback 2: Only try next model candidate on 404 or 400 (model unavailable / unsupported param)
    if (lastStatus !== 404 && lastStatus !== 400) {
      break;
    }
  }

  throw new Error(`Erro na API do Gemini (${lastStatus}): ${lastErrorText}`);
}

/**
 * Proxies Decisions API requests (gemini-decision-1) to Google Gemini
 * @param {object} params
 * @param {string} [params.model] - Defaults to "gemini-decision-1"
 * @param {string|object|Array} params.input - Shared context input
 * @param {object} params.questions - Decision questions map (noul, choice, score)
 * @param {string} params.apiKey - Internal server Gemini API key
 */
export async function callGeminiDecision({
  model = AI_MODELS_CONFIG.models?.decision || 'gemini-decision-1',
  input,
  questions,
  apiKey,
  fetchImpl = fetch
}) {
  const decisionModel = AI_MODELS_CONFIG.models?.decision || 'gemini-decision-1';
  const url = `${AI_STUDIO_API_BASE}/decisions`;
  const body = {
    model: model || decisionModel,
    input,
    questions
  };

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey || ''
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gemini Decisions API Error] (${response.status}) Model: ${model}:`, errorText);
    return new Response(JSON.stringify({
      error: 'gemini_decision_error',
      status: response.status,
      message: errorText
    }), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json'
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


/**
 * Extracts balanced JSON card objects from streamed/raw Gemini JSON text.
 */
export function extractBalancedJsonObjects(text) {
  const results = [];
  if (!text || typeof text !== 'string') return results;

  let scanText = text;
  const wrapperMatch = text.match(/["'](?:cards|flashcards|questoes|perguntas|deck|items)["']\s*:\s*\[/i);
  if (wrapperMatch) {
    scanText = text.substring(wrapperMatch.index + wrapperMatch[0].length);
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;

  for (let i = 0; i < scanText.length; i++) {
    const c = scanText[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const block = scanText.substring(start, i + 1);
          try {
            const parsed = JSON.parse(block);
            if (parsed && typeof parsed === 'object') {
              const arr = parsed.cards || parsed.flashcards || parsed.questoes || parsed.perguntas;
              if (Array.isArray(arr)) {
                for (const item of arr) {
                  if (item && typeof item === 'object') results.push(item);
                }
              } else {
                results.push(parsed);
              }
            }
          } catch (_) {}
          start = -1;
        }
      }
    }
  }
  return results;
}

export function isPlayableGeneratedCard(card) {
  if (!card || typeof card !== 'object') return false;
  return card.type !== 'divisor' && card.type !== 'divider' && card.type !== 'note';
}

export function buildDeckCoverageSummary(cards) {
  return (cards || []).map((c, idx) => {
    if (!c || typeof c !== 'object') return '';
    if (!isPlayableGeneratedCard(c)) {
      return `#${idx + 1} [divisor] ${c.text || c.description || ''}`;
    }
    const desc = String(c.description || '').replace(/\s+/g, ' ').slice(0, 140);
    const ans = String(c.answer || '').replace(/\s+/g, ' ').slice(0, 100);
    const topic = [c.subject, c.topic].filter(Boolean).join(' / ');
    return `#${idx + 1} [${c.type || 'open'}]${topic ? ` (${topic})` : ''}: ${desc} -> ${ans}`;
  }).filter(Boolean).join('\n');
}

/**
 * Audits whether generated flashcards sufficiently cover all concepts in the source materials
 * using gemini-flash-lite-latest.
 */
export async function auditMaterialCoverageWithFlashLite({
  materialParts = [],
  cards = [],
  apiKey,
  provider = null,
  fetchImpl = fetch
}) {
  const playableCount = cards.filter(isPlayableGeneratedCard).length;
  const deckSummary = buildDeckCoverageSummary(cards);

  const auditPrompt = `Você é um auditor pedagógico rigoroso. Compare os materiais enviados pelo estudante com o baralho gerado abaixo (${playableCount} flashcards).\n` +
    `Avalie se TODOS os conceitos, termos técnicos, classificações, critérios, fórmulas, tabelas comparativas, dosagens/parâmetros, cascatas/fisiopatologias e exemplos aplicados presentes nos materiais foram abordados de forma suficiente.\n\n` +
    `BARALHO ATUAL (${playableCount} cards):\n${deckSummary}\n\n` +
    `Responda EXCLUSIVAMENTE em JSON válido no formato:\n` +
    `{\n  "sufficient": true | false,\n  "missing_topics": ["conteúdo ou conceito mal abordado/ausente 1", "conteúdo 2"]\n}\n` +
    `Regras:\n` +
    `- Se houver lacunas conceituais, tópicos omitidos, tabelas/cascatas incompletas ou temas abordados superficialmente, defina "sufficient": false e liste objetivamente cada conteúdo faltante ou mal abordado em "missing_topics" (máximo 20 itens claros e específicos).\n` +
    `- Só defina "sufficient": true quando praticamente todo o conteúdo relevante dos materiais já estiver adequadamente coberto.`;

  const res = await callGemini({
    model: AI_MODELS_CONFIG.models?.flashLite || 'gemini-3.5-flash-lite',
    contents: [{ role: 'user', parts: [...materialParts, { text: auditPrompt }] }],
    systemInstruction: {
      parts: [{ text: 'Você é um auditor objetivo de cobertura conceitual entre materiais de estudo e flashcards gerados. Responda exclusivamente em JSON válido.' }]
    },
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    },
    stream: false,
    apiKey,
    provider,
    fetchImpl
  });

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.find(p => p?.text)?.text || '';
  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  const missingTopics = Array.isArray(parsed?.missing_topics)
    ? parsed.missing_topics.map(item => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    sufficient: Boolean(parsed?.sufficient) || missingTopics.length === 0,
    missingTopics
  };
}

/**
 * Forwards SSE lines from a Gemini stream while optionally capturing emitted text.
 */
async function forwardGeminiSseBody({ body, controller, encoder, onChunkText }) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed === 'data: [DONE]') return;
    controller.enqueue(encoder.encode(`${trimmed}\n\n`));
    if (onChunkText && trimmed.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const parts = parsed?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part?.text && !part?.thought) onChunkText(part.text);
          }
        }
      } catch (_) {}
    }
  };

  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      processLine(line);
    }
  }
  if (buffer.trim()) {
    processLine(buffer);
  }
}

/**
 * Runs streaming deck generation with gemini-flash-latest and, when < 100 playable cards,
 * audits material coverage with gemini-flash-lite-latest and continues the same
 * gemini-flash-latest chat to complement any missing/under-covered topics.
 */
export async function callGeminiWithCoverageAudit({
  model = AI_MODELS_CONFIG.models?.flash || 'gemini-3.8-flash',
  contents,
  systemInstruction,
  generationConfig,
  tools,
  toolConfig,
  targetLanguagePrompt = '',
  apiKey,
  provider = null,
  fetchImpl = fetch,
  keepaliveIntervalMs = 8000
}) {
  const encoder = new TextEncoder();
  let keepaliveTimer = null;
  let streamClosed = false;

  const stopKeepalive = () => {
    if (keepaliveTimer !== null) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (chunk) => {
        if (streamClosed) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch (_) {
          streamClosed = true;
          stopKeepalive();
          return false;
        }
      };

      const safeController = {
        enqueue: (chunk) => safeEnqueue(chunk)
      };

      const emitMeta = (meta) => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ spaiqMeta: meta })}\n\n`));
      };

      const startKeepalive = () => {
        stopKeepalive();
        if (streamClosed || !(keepaliveIntervalMs > 0)) return;
        keepaliveTimer = setInterval(() => {
          if (streamClosed) {
            stopKeepalive();
            return;
          }
          safeEnqueue(encoder.encode(': keepalive\n\n'));
        }, keepaliveIntervalMs);
      };

      // Flush initial SSE comment immediately (TTFB ~0ms) and keep connection alive during thinking/audit pauses
      safeEnqueue(encoder.encode(': keepalive\n\n'));
      startKeepalive();

      try {
        const phase1Res = await callGemini({
          model,
          contents,
          systemInstruction,
          generationConfig,
          tools,
          toolConfig,
          stream: true,
          apiKey,
          provider,
          fetchImpl
        });

        let initialFullText = '';
        await forwardGeminiSseBody({
          body: phase1Res.body,
          controller: safeController,
          encoder,
          onChunkText: (txt) => {
            initialFullText += txt;
          }
        });

        const initialCards = extractBalancedJsonObjects(initialFullText);
        const playableCount = initialCards.filter(isPlayableGeneratedCard).length;

        if (playableCount > 0 && playableCount < 100 && !streamClosed) {
          try {
            const firstUserParts = Array.isArray(contents) && Array.isArray(contents[0]?.parts)
              ? contents[0].parts
              : [];
            const materialParts = firstUserParts.slice(1);

            emitMeta({ phase: 'auditing', playableCount });
            const audit = await auditMaterialCoverageWithFlashLite({
              materialParts,
              cards: initialCards,
              apiKey,
              provider,
              fetchImpl
            });

            if (!audit.sufficient && audit.missingTopics.length > 0 && !streamClosed) {
              emitMeta({
                phase: 'complementing',
                missingTopics: audit.missingTopics
              });

              const topicsListText = audit.missingTopics.map((topic, i) => `${i + 1}. ${topic}`).join('\n');
              let complementPrompt = `A revisão de cobertura detectou que o baralho atual (${playableCount} cards) ainda não abordou de forma suficiente todos os conceitos dos materiais enviados.\n\n` +
                `Lista de conteúdos ausentes ou mal abordados que você DEVE complementar agora:\n${topicsListText}\n\n` +
                `Instruções obrigatórias:\n` +
                `- Gere flashcards adicionais completos e aprofundados cobrindo cada item dessa lista (buscando alcançar cerca de 100 ou mais flashcards no baralho total quando o conteúdo comportar).\n` +
                `- NÃO repita nem reformule flashcards que você já gerou na resposta anterior.\n` +
                `- Mantenha os mesmos padrões de qualidade, tipos ("open", "open_double", "fill", "multiple_choice", "anki", "flowchart"), taxonomia ('subject' e 'topic') e regras de formatação.\n` +
                `- Retorne EXCLUSIVAMENTE o array JSON ([]) apenas com os NOVOS flashcards complementares.`;

              if (targetLanguagePrompt && typeof targetLanguagePrompt === 'string') {
                complementPrompt += `\n\n${targetLanguagePrompt.trim()}`;
              }

              const phase3GenerationConfig = {
                ...(generationConfig && typeof generationConfig === 'object' ? generationConfig : {}),
                thinkingConfig: {
                  ...(generationConfig?.thinkingConfig && typeof generationConfig.thinkingConfig === 'object'
                    ? generationConfig.thinkingConfig
                    : {}),
                  thinkingLevel: 'LOW'
                }
              };

              const baseTurns = Array.isArray(contents) ? contents : [contents];
              const phase3Res = await callGemini({
                model: AI_MODELS_CONFIG.models?.flash || 'gemini-3.8-flash',
                contents: [
                  ...baseTurns,
                  { role: 'model', parts: [{ text: initialFullText }] },
                  { role: 'user', parts: [{ text: complementPrompt }] }
                ],
                systemInstruction,
                generationConfig: phase3GenerationConfig,
                tools,
                toolConfig,
                stream: true,
                apiKey,
                provider,
                fetchImpl
              });

              await forwardGeminiSseBody({
                body: phase3Res.body,
                controller: safeController,
                encoder
              });
            }
          } catch (auditErr) {
            console.warn('[Gemini Audit] Falha na etapa de auditoria/complementação (mantendo cards iniciais):', auditErr?.message || auditErr);
          }
        }

        stopKeepalive();
        safeEnqueue(encoder.encode('data: [DONE]\n\n'));
        if (!streamClosed) {
          streamClosed = true;
          controller.close();
        }
      } catch (err) {
        stopKeepalive();
        console.error('[Gemini Stream Pipeline Error]:', err);
        if (!streamClosed) {
          emitMeta({
            phase: 'error',
            message: err?.message || 'Erro na API do Gemini'
          });
          streamClosed = true;
          try {
            controller.close();
          } catch (_) {}
        }
      } finally {
        stopKeepalive();
      }
    },
    cancel() {
      streamClosed = true;
      stopKeepalive();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
