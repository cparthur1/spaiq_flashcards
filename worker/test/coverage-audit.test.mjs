import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  extractBalancedJsonObjects,
  callGeminiWithCoverageAudit
} from '../src/gemini.js';

function createSseStream(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const evt of events) {
        controller.enqueue(encoder.encode(`data: ${typeof evt === 'string' ? evt : JSON.stringify(evt)}\n\n`));
      }
      controller.close();
    }
  });
}

function makeGeminiTextChunk(text) {
  return {
    candidates: [{ content: { parts: [{ text }] } }]
  };
}

async function readAllSseEvents(response) {
  const text = await response.text();
  return text
    .split('\n\n')
    .map(block => block.trim())
    .filter(block => block.startsWith('data: '))
    .map(block => {
      const payload = block.slice(6).trim();
      if (payload === '[DONE]') return '[DONE]';
      return JSON.parse(payload);
    });
}

test('callGeminiWithCoverageAudit audits with flash-lite and complements in same flash-latest chat when <100 cards', async () => {
  const calls = [];
  const initialCards = [
    { type: 'open', subject: 'Fisiologia', topic: 'Renal', description: 'O que é TFG?', answer: 'Taxa de filtração glomerular' },
    { type: 'open', subject: 'Fisiologia', topic: 'Renal', description: 'Qual o principal néfron?', answer: 'Cortical' }
  ];
  const complementCards = [
    { type: 'anki', subject: 'Fisiologia', topic: 'SRAA', description: 'Como funciona o SRAA?', answer: 'Renina -> Angiotensina I -> II -> Aldosterona' }
  ];

  const mockFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });

    if (calls.length === 1) {
      assert.ok(url.includes('/models/gemini-3.8-flash:streamGenerateContent'));
      return new Response(createSseStream([
        makeGeminiTextChunk(JSON.stringify(initialCards)),
        '[DONE]'
      ]), { status: 200 });
    }

    if (calls.length === 2) {
      assert.ok(url.includes('/models/gemini-3.5-flash-lite:generateContent'));
      // Verify material part was forwarded to flash-lite audit alongside summary
      const parts = body.contents[0].parts;
      assert.equal(parts[0].text, 'Material sobre SRAA e nefrologia');
      assert.ok(parts[1].text.includes('BARALHO ATUAL (2 cards)'));
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ sufficient: false, missing_topics: ['Sistema Renina-Angiotensina-Aldosterona'] }) }]
          }
        }]
      }), { status: 200 });
    }

    if (calls.length === 3) {
      assert.ok(url.includes('/models/gemini-3.8-flash:streamGenerateContent'));
      // Verify continuation in same chat history: user(materials), model(initialJson), user(complementPrompt)
      assert.equal(body.contents.length, 3);
      assert.equal(body.contents[0].role, 'user');
      assert.equal(body.contents[1].role, 'model');
      assert.equal(body.contents[2].role, 'user');
      assert.ok(body.contents[2].parts[0].text.includes('Sistema Renina-Angiotensina-Aldosterona'));
      assert.ok(body.contents[2].parts[0].text.includes('Gere em English'));
      return new Response(createSseStream([
        makeGeminiTextChunk(JSON.stringify(complementCards)),
        '[DONE]'
      ]), { status: 200 });
    }

    throw new Error(`Unexpected fetch call #${calls.length}`);
  };

  const res = await callGeminiWithCoverageAudit({
    model: 'gemini-flash-latest',
    contents: [{ role: 'user', parts: [{ text: 'Prompt inicial' }, { text: 'Material sobre SRAA e nefrologia' }] }],
    systemInstruction: { parts: [{ text: 'SYS' }] },
    generationConfig: { responseMimeType: 'application/json' },
    targetLanguagePrompt: 'Gere em English',
    apiKey: 'test-key',
    fetchImpl: mockFetch
  });

  const events = await readAllSseEvents(res);
  assert.equal(calls.length, 3);
  assert.ok(events.some(e => e?.spaiqMeta?.phase === 'auditing' && e.spaiqMeta.playableCount === 2));
  assert.ok(events.some(e => e?.spaiqMeta?.phase === 'complementing' && e.spaiqMeta.missingTopics[0] === 'Sistema Renina-Angiotensina-Aldosterona'));
  assert.equal(events[events.length - 1], '[DONE]');

  const streamedTexts = events
    .filter(e => e?.candidates?.[0]?.content?.parts?.[0]?.text)
    .map(e => e.candidates[0].content.parts[0].text);
  assert.equal(streamedTexts.length, 2);
  assert.equal(extractBalancedJsonObjects(streamedTexts[0]).length, 2);
  assert.equal(extractBalancedJsonObjects(streamedTexts[1]).length, 1);
});

test('callGeminiWithCoverageAudit skips audit when >= 100 playable cards are generated', async () => {
  const calls = [];
  const hundredCards = Array.from({ length: 100 }, (_, i) => ({
    type: 'open',
    description: `Pergunta ${i + 1}`,
    answer: `Resposta ${i + 1}`
  }));

  const mockFetch = async (url, init) => {
    calls.push(url);
    return new Response(createSseStream([
      makeGeminiTextChunk(JSON.stringify(hundredCards)),
      '[DONE]'
    ]), { status: 200 });
  };

  const res = await callGeminiWithCoverageAudit({
    model: 'gemini-flash-latest',
    contents: [{ role: 'user', parts: [{ text: 'Prompt' }, { text: 'Material' }] }],
    apiKey: 'test-key',
    fetchImpl: mockFetch
  });

  const events = await readAllSseEvents(res);
  assert.equal(calls.length, 1);
  assert.equal(events.some(e => e?.spaiqMeta), false);
  assert.equal(events[events.length - 1], '[DONE]');
});

test('worker /api/ai/generate allows unauthenticated free trial with isNewDeck=true and requires auth for isNewDeck=false', async () => {
  const unauthChatRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isNewDeck: false, contents: [] })
  }), {}, { waitUntil: () => {} });
  assert.equal(unauthChatRes.status, 401);

  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, body: JSON.parse(init.body) });
    if (fetchCalls.length === 1) {
      return new Response(createSseStream([
        makeGeminiTextChunk(JSON.stringify([{ type: 'open', description: 'Q1', answer: 'A1' }])),
        '[DONE]'
      ]), { status: 200 });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ sufficient: true, missing_topics: [] }) }] } }]
    }), { status: 200 });
  };

  try {
    const freeTrialRes = await worker.fetch(new Request('https://flashcards.camblu.org/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-flash-latest',
        isNewDeck: true,
        stream: true,
        enableCoverageAudit: true,
        contents: [{ role: 'user', parts: [{ text: 'Prompt' }, { text: 'Material gratuito' }] }]
      })
    }), { GEMINI_API_KEY: 'fake-key' }, { waitUntil: () => {} });

    assert.equal(freeTrialRes.status, 200);
    const events = await readAllSseEvents(freeTrialRes);
    assert.equal(fetchCalls.length, 2);
    assert.ok(events.some(e => e?.spaiqMeta?.phase === 'auditing'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
