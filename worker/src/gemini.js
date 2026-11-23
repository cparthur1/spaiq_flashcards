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
  apiKey,
  fetchImpl = fetch
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
    console.error(`[Gemini API Error] (${response.status}) Model: ${model}:`, errorText);

    // Fallback 1: Se erro 400 com thinkingConfig, retenta sem thinkingConfig
    if (response.status === 400 && body.generationConfig?.thinkingConfig) {
      console.warn(`[Gemini Fallback] Tentando novamente sem thinkingConfig para ${model}...`);
      const fallbackBody = { ...body, generationConfig: { ...body.generationConfig } };
      delete fallbackBody.generationConfig.thinkingConfig;
      const retryRes = await fetchImpl(url, {
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
      const retryRes = await fetchImpl(fallbackUrl, {
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

/**
 * Proxies Decisions API requests (gemini-decision-1) to Google Gemini
 * @param {object} params
 * @param {string} [params.model] - Defaults to "gemini-decision-1"
 * @param {string|object|Array} params.input - Shared context input
 * @param {object} params.questions - Decision questions map (noul, choice, score)
 * @param {string} params.apiKey - Internal server Gemini API key
 */
export async function callGeminiDecision({
  model = 'gemini-decision-1',
  input,
  questions,
  apiKey
}) {
  const url = `${GEMINI_API_BASE}/decisions`;
  const body = {
    model: model || 'gemini-decision-1',
    input,
    questions
  };

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
    model: 'gemini-flash-lite-latest',
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
            if (part?.text) onChunkText(part.text);
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
  model = 'gemini-flash-latest',
  contents,
  systemInstruction,
  generationConfig,
  tools,
  toolConfig,
  targetLanguagePrompt = '',
  apiKey,
  fetchImpl = fetch
}) {
  const phase1Res = await callGemini({
    model,
    contents,
    systemInstruction,
    generationConfig,
    tools,
    toolConfig,
    stream: true,
    apiKey,
    fetchImpl
  });

  const encoder = new TextEncoder();
  const emitMeta = (controller, meta) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ spaiqMeta: meta })}\n\n`));
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let initialFullText = '';
        await forwardGeminiSseBody({
          body: phase1Res.body,
          controller,
          encoder,
          onChunkText: (txt) => {
            initialFullText += txt;
          }
        });

        const initialCards = extractBalancedJsonObjects(initialFullText);
        const playableCount = initialCards.filter(isPlayableGeneratedCard).length;

        if (playableCount > 0 && playableCount < 100) {
          try {
            const firstUserParts = Array.isArray(contents) && Array.isArray(contents[0]?.parts)
              ? contents[0].parts
              : [];
            const materialParts = firstUserParts.slice(1);

            emitMeta(controller, { phase: 'auditing', playableCount });
            const audit = await auditMaterialCoverageWithFlashLite({
              materialParts,
              cards: initialCards,
              apiKey,
              fetchImpl
            });

            if (!audit.sufficient && audit.missingTopics.length > 0) {
              emitMeta(controller, {
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

              const baseTurns = Array.isArray(contents) ? contents : [contents];
              const phase3Res = await callGemini({
                model: 'gemini-flash-latest',
                contents: [
                  ...baseTurns,
                  { role: 'model', parts: [{ text: initialFullText }] },
                  { role: 'user', parts: [{ text: complementPrompt }] }
                ],
                systemInstruction,
                generationConfig,
                tools,
                toolConfig,
                stream: true,
                apiKey,
                fetchImpl
              });

              await forwardGeminiSseBody({
                body: phase3Res.body,
                controller,
                encoder
              });
            }
          } catch (auditErr) {
            console.warn('[Gemini Audit] Falha na etapa de auditoria/complementação (mantendo cards iniciais):', auditErr?.message || auditErr);
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        console.error('[Gemini Stream Pipeline Error]:', err);
        controller.error(err);
      }
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
