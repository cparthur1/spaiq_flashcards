/**
 * js/engine/apkg-importer.js
 * Importador e conversor de pacotes Anki (.apkg) para o formato nativo de flashcards do Spaiq.
 *
 * Suporta:
 * - Formatos collection.anki2 (clássico), collection.anki21 e collection.anki21b (Zstd + schema normalizado)
 * - Notas Cloze ({{c1::...}} -> tipo 'fill' ou 'anki') e notas Padrão/Invertidas (-> 'anki' ou 'open')
 * - Detecção de imagens incorporadas: adiciona comentário solicitando inserção como link (sem embutir imagens no deck)
 * - Preservação de sub-baralhos (divisores + subject/topic), tags e fórmulas LaTeX/MathJax
 */

import { sanitizeImageUrl } from '../utils.js';

const VENDOR_ASSETS = {
    jszip: {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        sri: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG'
    },
    sqlJs: {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js',
        sri: 'sha384-1fHJox8K973mCCD3PTAOc0ljrAGXD2VeK8zf+vNIdx55pWPULNlpxKMkU8bF4nUd'
    },
    sqlWasm: {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm',
        sri: 'sha384-R/MwdqDq6/VfWyY+p8u2RAFr+3gVOgzxeJqDeDxCnpQaVqOc9tEFLu4wdQfoDpb5'
    },
    fzstd: {
        url: 'https://cdn.jsdelivr.net/npm/fzstd@0.1.1/umd/index.js',
        sri: 'sha384-j11FJIL1HatEZOwEloCeZcNzDESMGs1ncTc2Kt0LgG0QpBU7lZHgyGU0Mif1OHeH'
    }
};

let cachedSqlPromise = null;

function loadVendorScript(url, sri) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${url}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') return resolve();
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${url}`)), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.integrity = sri;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'no-referrer';
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`Falha ao carregar biblioteca externa: ${url}`));
        document.head.appendChild(script);
    });
}

async function getJSZipConstructor() {
    if (typeof window !== 'undefined' && typeof window.JSZip !== 'undefined') {
        return window.JSZip;
    }
    await loadVendorScript(VENDOR_ASSETS.jszip.url, VENDOR_ASSETS.jszip.sri);
    return window.JSZip;
}

async function getFzstdDecompressor() {
    if (typeof window !== 'undefined' && typeof window.fzstd !== 'undefined') {
        return window.fzstd;
    }
    await loadVendorScript(VENDOR_ASSETS.fzstd.url, VENDOR_ASSETS.fzstd.sri);
    return window.fzstd;
}

async function getSqlJsModule() {
    if (cachedSqlPromise) return cachedSqlPromise;
    cachedSqlPromise = (async () => {
        if (typeof window.initSqlJs === 'undefined') {
            await loadVendorScript(VENDOR_ASSETS.sqlJs.url, VENDOR_ASSETS.sqlJs.sri);
        }
        const wasmResponse = await fetch(VENDOR_ASSETS.sqlWasm.url, {
            integrity: VENDOR_ASSETS.sqlWasm.sri,
            mode: 'cors',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        });
        if (!wasmResponse.ok) {
            throw new Error(`HTTP ${wasmResponse.status} ao baixar sql-wasm.wasm`);
        }
        const wasmBinary = await wasmResponse.arrayBuffer();
        return await window.initSqlJs({ wasmBinary });
    })().catch((err) => {
        cachedSqlPromise = null;
        throw err;
    });
    return cachedSqlPromise;
}

/**
 * Verifica cabeçalho mágico de frame Zstandard (0x28 0xB5 0x2F 0xFD).
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function isZstdCompressed(bytes) {
    return Boolean(
        bytes &&
        bytes.length >= 4 &&
        bytes[0] === 0x28 &&
        bytes[1] === 0xB5 &&
        bytes[2] === 0x2F &&
        bytes[3] === 0xFD
    );
}

/**
 * Verifica cabeçalho mágico de banco SQLite 3 ("SQLite format 3\0").
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function isSqliteHeader(bytes) {
    if (!bytes || bytes.length < 16) return false;
    const expected = 'SQLite format 3\0';
    for (let i = 0; i < expected.length; i++) {
        if (bytes[i] !== expected.charCodeAt(i)) return false;
    }
    return true;
}

// Leitor leve de wire format Protobuf (varint + length-delimited) para .anki21b
function readProtoVarint(bytes, state) {
    let result = 0;
    let shift = 0;
    while (state.pos < bytes.length) {
        const b = bytes[state.pos++];
        result += (b & 0x7f) * (2 ** shift);
        if ((b & 0x80) === 0) break;
        shift += 7;
        if (shift > 49) break;
    }
    return result;
}

function skipProtoField(bytes, state, wireType) {
    if (wireType === 0) {
        readProtoVarint(bytes, state);
    } else if (wireType === 1) {
        state.pos += 8;
    } else if (wireType === 2) {
        const len = readProtoVarint(bytes, state);
        state.pos += len;
    } else if (wireType === 5) {
        state.pos += 4;
    } else {
        state.pos = bytes.length;
    }
}

/**
 * Decodifica protobuf MediaEntries (Anki >= 23.10) para mapa { "0": "nome.png", ... }.
 * Schema Anki: message MediaEntries { repeated MediaEntry entries = 1; }
 *              message MediaEntry { string name = 1; uint32 size = 2; bytes sha1 = 3; }
 * @param {Uint8Array} bytes
 * @returns {Object<string, string>}
 */
export function parseAnkiMediaProtobuf(bytes) {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const map = {};
    if (!bytes || bytes.length === 0) return map;

    const state = { pos: 0 };
    let idx = 0;
    while (state.pos < bytes.length) {
        const tag = readProtoVarint(bytes, state);
        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;
        if (fieldNum === 1 && wireType === 2) {
            const len = readProtoVarint(bytes, state);
            const end = Math.min(bytes.length, state.pos + len);
            const sub = { pos: state.pos };
            let entryName = '';
            while (sub.pos < end) {
                const subTag = readProtoVarint(bytes, sub);
                const subField = subTag >>> 3;
                const subWire = subTag & 0x07;
                if (subField === 1 && subWire === 2) {
                    const strLen = readProtoVarint(bytes, sub);
                    const strEnd = Math.min(end, sub.pos + strLen);
                    entryName = decoder.decode(bytes.subarray(sub.pos, strEnd));
                    sub.pos = strEnd;
                } else {
                    skipProtoField(bytes, sub, subWire);
                }
            }
            if (entryName) {
                map[String(idx)] = entryName;
            }
            idx++;
            state.pos = end;
        } else {
            skipProtoField(bytes, state, wireType);
        }
    }
    return map;
}

function parseTemplateConfigProtobuf(bytes) {
    const out = { qfmt: '', afmt: '' };
    if (!bytes || bytes.length === 0) return out;
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const state = { pos: 0 };
    while (state.pos < bytes.length) {
        const tag = readProtoVarint(bytes, state);
        const fieldNum = tag >>> 3;
        const wireType = tag & 0x07;
        if ((fieldNum === 1 || fieldNum === 2) && wireType === 2) {
            const len = readProtoVarint(bytes, state);
            const end = Math.min(bytes.length, state.pos + len);
            const text = decoder.decode(bytes.subarray(state.pos, end));
            if (fieldNum === 1) out.qfmt = text;
            if (fieldNum === 2) out.afmt = text;
            state.pos = end;
        } else {
            skipProtoField(bytes, state, wireType);
        }
    }
    return out;
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    const named = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&ndash;': '–',
        '&mdash;': '—',
        '&hellip;': '…',
        '&times;': '×',
        '&divide;': '÷',
        '&plusmn;': '±',
        '&rarr;': '→',
        '&larr;': '←',
        '&harr;': '↔'
    };
    return str
        .replace(/&(?:nbsp|amp|lt|gt|quot|apos|ndash|mdash|hellip|times|divide|plusmn|rarr|larr|harr|#39);/gi, (m) => named[m.toLowerCase()] ?? m)
        .replace(/&#(\d+);/g, (_, dec) => {
            const code = parseInt(dec, 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        })
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            const code = parseInt(hex, 16);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        });
}

function extractImageRefsAndCleanMedia(html) {
    if (!html || typeof html !== 'string') return { cleanedHtml: '', imageRefs: [] };
    const imageRefs = [];
    const cleanedHtml = html
        .replace(/<img\b[^>]*>/gi, (tag) => {
            const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
            const rawSrc = (srcMatch && (srcMatch[1] || srcMatch[2] || srcMatch[3])) || '';
            if (rawSrc) {
                imageRefs.push(decodeHtmlEntities(rawSrc.trim()));
            }
            return '';
        })
        .replace(/\[sound:[^\]]+\]/gi, '');
    return { cleanedHtml, imageRefs };
}

/**
 * Converte HTML de campos do Anki para texto/Markdown compatível com renderMathAndMarkdown do Spaiq.
 * Preserva fórmulas MathJax/LaTeX (\(...\), \[...\], $...$, $$...$$) e converte tags [latex].
 *
 * @param {string} rawHtml
 * @param {boolean} [preserveMarkdown=true]
 * @returns {string}
 */
export function convertAnkiHtmlToText(rawHtml, preserveMarkdown = true) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';

    let text = rawHtml;
    // Remove blocos perigosos ou estilização interna de templates
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    // Normaliza tags [latex] e [$] do Anki para KaTeX
    text = text.replace(/\[latex\]([\s\S]*?)\[\/latex\]/gi, (_, m) => `$$${m.trim()}$$`);
    text = text.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/gi, (_, m) => `$$${m.trim()}$$`);
    text = text.replace(/\[\$\]([\s\S]*?)\[\/\$\]/gi, (_, m) => `$${m.trim()}$`);

    // Separa quebras estruturais
    text = text.replace(/<hr\b[^>]*>/gi, '\n---\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(?:p|div|tr|h[1-6]|blockquote)>/gi, '\n');
    text = text.replace(/<(?:p|div|h[1-6])\b[^>]*>/gi, '\n');
    text = text.replace(/<t[dh]\b[^>]*>/gi, ' ');
    text = text.replace(/<\/t[dh]>/gi, ' | ');

    // Listas
    text = text.replace(/<li\b[^>]*>/gi, '\n- ');
    text = text.replace(/<\/li>/gi, '');

    if (preserveMarkdown) {
        text = text.replace(/<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, (_, inner) => {
            const cleaned = inner.trim();
            return cleaned ? `**${cleaned}**` : '';
        });
        text = text.replace(/<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, (_, inner) => {
            const cleaned = inner.trim();
            return cleaned ? `*${cleaned}*` : '';
        });
        text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => {
            const cleaned = inner.trim();
            return cleaned ? `\`${cleaned}\`` : '';
        });
    }

    // Remove qualquer tag HTML restante com segurança (iterativamente contra aninhamento)
    let prev;
    do {
        prev = text;
        text = text.replace(/<[^<>]*>/g, '');
    } while (text !== prev);

    text = decodeHtmlEntities(text);
    // Limpa espaços horizontais excessivos e linhas em branco repetidas
    text = text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text;
}

function containsMathOrComplexMarkup(str) {
    if (!str) return false;
    return /\$\$|\\\[|\\\(|\$(?!\s)[^$]+\$|\\(?:frac|sqrt|int|sum|prod|alpha|beta|gamma|delta|approx|leq|geq)\b|\*\*|`|\n- /.test(str);
}

function stripTypedAnswerDecorations(str) {
    if (!str) return '';
    return str
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderAnkiTemplate(template, fieldMap, { frontSideHtml = '', tags = '', deck = '', clozeTarget = null } = {}) {
    if (!template || typeof template !== 'string') return '';

    let out = template
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    // Condicionais positivas {{#Campo}}...{{/Campo}} e negativas {{^Campo}}...{{/Campo}}
    for (let pass = 0; pass < 3; pass++) {
        out = out.replace(/\{\{#([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
            const val = getFieldValueByToken(key, fieldMap, tags, deck);
            return val && val.trim().length > 0 ? body : '';
        });
        out = out.replace(/\{\{\^([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
            const val = getFieldValueByToken(key, fieldMap, tags, deck);
            return !val || val.trim().length === 0 ? body : '';
        });
    }

    if (frontSideHtml) {
        out = out.replace(/\{\{FrontSide\}\}/gi, '');
    }

    // Substitui {{prefix:Field}} e {{Field}}
    out = out.replace(/\{\{([^{}]+)\}\}/g, (_, rawToken) => {
        const token = rawToken.trim();
        if (token.toLowerCase() === 'frontside') return '';
        const colonIdx = token.indexOf(':');
        if (colonIdx !== -1) {
            const modifier = token.slice(0, colonIdx).toLowerCase();
            const fieldName = token.slice(colonIdx + 1).trim();
            if (modifier === 'type') return ''; // Evita duplicar caixa de digitação na frente
            const rawVal = getFieldValueByToken(fieldName, fieldMap, tags, deck);
            if (modifier === 'text') return convertAnkiHtmlToText(rawVal, false);
            if (modifier === 'cloze' && clozeTarget !== null) {
                return rawVal;
            }
            return rawVal;
        }
        return getFieldValueByToken(token, fieldMap, tags, deck);
    });

    return out;
}

function getFieldValueByToken(token, fieldMap, tags = '', deck = '') {
    const clean = token.trim();
    const lower = clean.toLowerCase();
    if (lower === 'tags') return tags;
    if (lower === 'deck' || lower === 'subdeck') return deck;
    if (Object.prototype.hasOwnProperty.call(fieldMap, clean)) return fieldMap[clean];
    for (const [k, v] of Object.entries(fieldMap)) {
        if (k.toLowerCase() === lower) return v;
    }
    return '';
}

const DEFAULT_APKG_STRINGS = {
    apkg_image_link_comment: 'Imagem do card ({details}): decks do Spaiq não armazenam imagens internas; edite o card abaixo e adicione a imagem como link.',
    apkg_image_side_front: 'Pergunta: {name}',
    apkg_image_side_back: 'Resposta: {name}',
    apkg_image_embedded_label: 'imagem incorporada',
    apkg_image_placeholder: '[Imagem ({name}) — adicione como link no card]'
};

function createApkgTranslator(customTranslate) {
    return (key, params = {}) => {
        if (typeof customTranslate === 'function') {
            const translated = customTranslate(key, params);
            if (translated && translated !== key) return translated;
        }
        let template = DEFAULT_APKG_STRINGS[key] || key;
        for (const [k, v] of Object.entries(params)) {
            template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? ''));
        }
        return template;
    };
}

function classifyImageRefs(imageRefs, translate) {
    const externalLinks = [];
    const embeddedNames = [];

    for (const rawRef of imageRefs || []) {
        if (!rawRef || typeof rawRef !== 'string') continue;
        const trimmed = rawRef.trim();
        if (!trimmed) continue;

        if (/^https?:\/\//i.test(trimmed)) {
            const safeUrl = sanitizeImageUrl(trimmed);
            if (safeUrl) {
                externalLinks.push(safeUrl);
            }
            continue;
        }

        if (/^data:/i.test(trimmed)) {
            embeddedNames.push(translate('apkg_image_embedded_label'));
            continue;
        }

        let cleanName = trimmed.split('?')[0].split('#')[0].trim();
        try {
            cleanName = decodeURIComponent(cleanName);
        } catch (_) { /* keep raw filename */ }
        embeddedNames.push(cleanName || translate('apkg_image_embedded_label'));
    }

    return { externalLinks, embeddedNames };
}

function parseClozeCard(rawClozeField, clozeNum, extraHtml = '', conversionMode = 'anki') {
    const clozePattern = /\{\{c(\d+)::([\s\S]*?)\}\}/gi;
    const targetAnswers = [];
    const hints = [];

    let hasTarget = false;
    const processed = rawClozeField.replace(clozePattern, (full, numStr, body) => {
        const idx = parseInt(numStr, 10);
        // Suporte a ::hint no último separador "::" dentro da cloze
        const hintSplitIdx = body.indexOf('::');
        const ansRaw = hintSplitIdx !== -1 ? body.slice(0, hintSplitIdx) : body;
        const hintRaw = hintSplitIdx !== -1 ? body.slice(hintSplitIdx + 2) : '';

        if (idx === clozeNum) {
            hasTarget = true;
            const { cleanedHtml } = extractImageRefsAndCleanMedia(ansRaw);
            const cleanAns = convertAnkiHtmlToText(cleanedHtml, false);
            targetAnswers.push(cleanAns);
            hints.push(convertAnkiHtmlToText(hintRaw, false));
            return `%%CLOZE_SLOT_${targetAnswers.length - 1}%%`;
        }
        // Outras lacunas ficam visíveis no enunciado
        return ansRaw;
    });

    if (!hasTarget) return null;

    const cleanAnswers = targetAnswers.map(stripTypedAnswerDecorations).filter(Boolean);
    if (cleanAnswers.length === 0) return null;

    const canBeFillCard =
        cleanAnswers.length >= 1 &&
        cleanAnswers.length <= 6 &&
        cleanAnswers.every(a => a.length > 0 && a.length <= 55 && !a.includes('\n') && !a.includes(';')) &&
        !targetAnswers.some(containsMathOrComplexMarkup);

    const { cleanedHtml: extraCleaned } = extractImageRefsAndCleanMedia(extraHtml);
    const explanation = convertAnkiHtmlToText(extraCleaned, true);

    if (canBeFillCard) {
        let description = convertAnkiHtmlToText(processed, true);
        description = description.replace(/%%CLOZE_SLOT_(\d+)%%/g, (_, i) => {
            const h = hints[parseInt(i, 10)];
            return h ? `_ (${h})` : '_';
        });
        return {
            type: 'fill',
            description,
            answers: cleanAnswers,
            answer: cleanAnswers.join('; '),
            ...(explanation ? { explanation } : {})
        };
    }

    // Cloze longo/complexo ou com fórmula -> Frente/Verso estilo Anki
    let frontDesc = convertAnkiHtmlToText(processed, true);
    frontDesc = frontDesc.replace(/%%CLOZE_SLOT_(\d+)%%/g, (_, i) => {
        const h = hints[parseInt(i, 10)];
        return h ? `**[... (${h})]**` : '**[...]**';
    });
    let fullAnswer = targetAnswers.map((a, idx) => `${targetAnswers.length > 1 ? `${idx + 1}. ` : ''}**${a}**`).join('\n');
    if (explanation && conversionMode) {
        fullAnswer = `${fullAnswer}\n\n${explanation}`;
    }
    return {
        type: 'anki',
        description: frontDesc,
        answer: fullAnswer
    };
}

/**
 * Converte um arquivo .apkg (ArrayBuffer ou File/Blob) para uma lista de cards no formato Spaiq.
 * Imagens incorporadas do Anki nunca são salvas em base64 no baralho; em vez disso, um comentário
 * é adicionado junto do card solicitando ao usuário que insira a imagem como link.
 *
 * @param {File|Blob|ArrayBuffer} input
 * @param {Object} [options]
 * @param {'anki'|'auto'} [options.conversionMode='anki'] - 'anki' usa frente/verso para notas padrão; 'auto' usa 'open' quando a resposta for curta e simples.
 * @param {function(string):void} [options.onProgress] - Callback textual de progresso.
 * @param {function(string, Object=):string} [options.translate] - Função i18n opcional (ex.: `t`).
 * @param {Object} [options.deps] - Injeção de dependências para testes ({ JSZip, initSqlJs, fzstd }).
 * @returns {Promise<{ deckTitle: string, cards: Array<Object>, stats: Object }>}
 */
export async function importApkgFile(input, options = {}) {
    const {
        conversionMode = 'anki',
        onProgress = null,
        translate: translateOpt = null,
        deps = {}
    } = options;

    const translate = createApkgTranslator(translateOpt);
    const report = (msg) => {
        if (typeof onProgress === 'function') onProgress(msg);
    };

    const arrayBuffer = input instanceof ArrayBuffer
        ? input
        : await input.arrayBuffer();

    const fileName = (typeof File !== 'undefined' && input instanceof File && input.name)
        ? input.name
        : 'anki_deck.apkg';

    report('Carregando leitor ZIP e SQLite...');
    const JSZipCtor = deps.JSZip || await getJSZipConstructor();
    const SQL = deps.initSqlJs ? await deps.initSqlJs() : await getSqlJsModule();

    const zip = await JSZipCtor.loadAsync(arrayBuffer);

    // 1. Escolhe o banco SQLite mais novo disponível (.anki21b > .anki21 > .anki2)
    let dbEntryName = null;
    if (zip.file('collection.anki21b')) {
        dbEntryName = 'collection.anki21b';
    } else if (zip.file('collection.anki21')) {
        dbEntryName = 'collection.anki21';
    } else if (zip.file('collection.anki2')) {
        dbEntryName = 'collection.anki2';
    }

    if (!dbEntryName) {
        throw new Error('Arquivo .apkg inválido: banco de coleção do Anki não encontrado.');
    }

    report(`Descompactando ${dbEntryName}...`);
    let dbBytes = await zip.file(dbEntryName).async('uint8array');

    if (isZstdCompressed(dbBytes)) {
        const zstd = deps.fzstd || await getFzstdDecompressor();
        dbBytes = zstd.decompress(dbBytes);
    }

    if (!isSqliteHeader(dbBytes)) {
        throw new Error('O banco interno do arquivo .apkg não está em formato SQLite válido.');
    }

    const db = new SQL.Database(dbBytes);
    const cards = [];
    const stats = {
        totalCards: 0,
        ankiCount: 0,
        fillCount: 0,
        openCount: 0,
        divisorCount: 0,
        embeddedImagesDetected: 0,
        imageCommentsAdded: 0,
        externalImageLinksKept: 0,
        sourceDb: dbEntryName
    };

    try {
        // 2. Lê tabelas existentes no SQLite
        const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = new Set((tablesRes[0]?.values || []).map(row => String(row[0])));

        const decksMap = new Map();
        const modelsMap = new Map();

        if (tableNames.has('decks') && tableNames.has('notetypes')) {
            // Schema moderno Anki >= 23.10
            const deckRows = db.exec('SELECT id, name FROM decks');
            for (const [id, name] of (deckRows[0]?.values || [])) {
                const normalizedName = String(name || 'Default').replace(/\x1f/g, '::');
                decksMap.set(String(id), normalizedName);
            }

            const ntRows = db.exec('SELECT id, name, config FROM notetypes');
            for (const [id, name, config] of (ntRows[0]?.values || [])) {
                const mid = String(id);
                modelsMap.set(mid, {
                    name: String(name || 'Basic'),
                    isCloze: /cloze/i.test(String(name || '')),
                    fields: [],
                    templates: [],
                    _config: config
                });
            }

            if (tableNames.has('fields')) {
                const fldRows = db.exec('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord');
                for (const [ntid, , fname] of (fldRows[0]?.values || [])) {
                    const m = modelsMap.get(String(ntid));
                    if (m) m.fields.push(String(fname || 'Campo'));
                }
            }

            if (tableNames.has('templates')) {
                const colsInfo = db.exec('PRAGMA table_info(templates)');
                const colSet = new Set((colsInfo[0]?.values || []).map(r => String(r[1])));
                const selectCols = ['ntid', 'ord', 'name'];
                if (colSet.has('qfmt')) selectCols.push('qfmt');
                if (colSet.has('afmt')) selectCols.push('afmt');
                if (colSet.has('config')) selectCols.push('config');

                const tmplRows = db.exec(`SELECT ${selectCols.join(', ')} FROM templates ORDER BY ntid, ord`);
                for (const row of (tmplRows[0]?.values || [])) {
                    const rowObj = {};
                    selectCols.forEach((col, i) => { rowObj[col] = row[i]; });
                    const m = modelsMap.get(String(rowObj.ntid));
                    if (!m) continue;
                    let qfmt = rowObj.qfmt ? String(rowObj.qfmt) : '';
                    let afmt = rowObj.afmt ? String(rowObj.afmt) : '';
                    if ((!qfmt || !afmt) && rowObj.config instanceof Uint8Array) {
                        const parsed = parseTemplateConfigProtobuf(rowObj.config);
                        if (!qfmt) qfmt = parsed.qfmt;
                        if (!afmt) afmt = parsed.afmt;
                    }
                    if (/\{\{cloze:/i.test(qfmt)) m.isCloze = true;
                    m.templates.push({
                        ord: Number(rowObj.ord) || 0,
                        name: String(rowObj.name || ''),
                        qfmt,
                        afmt
                    });
                }
            }
        } else if (tableNames.has('col')) {
            // Schema clássico Anki 2.0 / 2.1
            const colRows = db.exec('SELECT models, decks FROM col LIMIT 1');
            const [modelsJson, decksJson] = colRows[0]?.values?.[0] || ['{}', '{}'];

            try {
                const parsedDecks = JSON.parse(String(decksJson || '{}'));
                for (const [id, d] of Object.entries(parsedDecks)) {
                    decksMap.set(String(id), String(d?.name || 'Default'));
                }
            } catch (_) { /* ignore malformed deck json */ }

            try {
                const parsedModels = JSON.parse(String(modelsJson || '{}'));
                for (const [id, m] of Object.entries(parsedModels)) {
                    const fields = Array.isArray(m?.flds)
                        ? [...m.flds].sort((a, b) => (a.ord || 0) - (b.ord || 0)).map(f => String(f?.name || 'Campo'))
                        : [];
                    const templates = Array.isArray(m?.tmpls)
                        ? [...m.tmpls].sort((a, b) => (a.ord || 0) - (b.ord || 0)).map((t, i) => ({
                            ord: Number(t?.ord ?? i),
                            name: String(t?.name || ''),
                            qfmt: String(t?.qfmt || ''),
                            afmt: String(t?.afmt || '')
                        }))
                        : [];
                    modelsMap.set(String(id), {
                        name: String(m?.name || 'Basic'),
                        isCloze: Number(m?.type) === 1 || templates.some(t => /\{\{cloze:/i.test(t.qfmt)),
                        fields,
                        templates
                    });
                }
            } catch (_) { /* ignore malformed models json */ }
        } else {
            throw new Error('Estrutura SQLite não reconhecida neste arquivo .apkg.');
        }

        // 3. Lê notas e cartões (sem incorporar mídias binárias ao deck)
        report('Extraindo notas e convertendo cartões...');
        const notesRes = db.exec('SELECT id, mid, tags, flds FROM notes');
        const notesMap = new Map();
        for (const [id, mid, tags, flds] of (notesRes[0]?.values || [])) {
            notesMap.set(String(id), {
                id: String(id),
                mid: String(mid),
                tags: String(tags || '').trim().split(/\s+/).filter(Boolean),
                fields: String(flds || '').split('\x1f')
            });
        }

        const cardRows = [];
        if (tableNames.has('cards')) {
            const cardsRes = db.exec('SELECT id, nid, did, ord FROM cards ORDER BY did ASC, due ASC, id ASC');
            for (const [id, nid, did, ord] of (cardsRes[0]?.values || [])) {
                cardRows.push({ id: String(id), nid: String(nid), did: String(did), ord: Number(ord) || 0 });
            }
        }
        if (cardRows.length === 0) {
            for (const [nid] of notesMap.entries()) {
                cardRows.push({ id: nid, nid, did: '1', ord: 0 });
            }
        }

        // Determina nome raiz e se há múltiplos sub-baralhos
        const activeDeckNames = Array.from(new Set(
            cardRows.map(c => decksMap.get(c.did) || 'Default').filter(Boolean)
        ));
        const hasMultipleDecks = activeDeckNames.length > 1;
        let lastDeckInserted = null;

        let rootSubject = '';
        for (const dName of activeDeckNames) {
            if (dName && dName !== 'Default') {
                rootSubject = dName.split('::')[0].trim();
                break;
            }
        }
        const deckTitle = rootSubject || fileName.replace(/\.apkg$/i, '') || 'Baralho Anki';

        for (let i = 0; i < cardRows.length; i++) {
            const row = cardRows[i];
            const note = notesMap.get(row.nid);
            if (!note) continue;

            // Ignora card placeholder caso um .apkg corrompido caia no stub
            if (note.fields[0] && /please update to the latest anki version/i.test(note.fields[0])) {
                continue;
            }

            const model = modelsMap.get(note.mid) || { name: 'Basic', isCloze: false, fields: [], templates: [] };
            const fullDeckName = decksMap.get(row.did) || deckTitle;
            const deckParts = fullDeckName.split('::').map(s => s.trim()).filter(Boolean);
            const subdeckLabel = deckParts.length > 1 ? deckParts.slice(1).join(' › ') : (deckParts[0] || deckTitle);
            const topicLabel = (deckParts[deckParts.length - 1] && deckParts[deckParts.length - 1] !== 'Default')
                ? deckParts[deckParts.length - 1]
                : (note.tags[0] ? note.tags[0].replace(/::/g, ' › ') : '');

            const fieldMap = {};
            note.fields.forEach((val, idx) => {
                const fname = model.fields[idx] || `Field${idx + 1}`;
                fieldMap[fname] = val || '';
            });

            const tmpl = model.templates.find(t => t.ord === row.ord) || model.templates[row.ord] || model.templates[0] || null;
            const joinedFields = note.fields.join(' ');
            const isCloze = model.isCloze || /\{\{c\d+::/i.test(joinedFields) || (tmpl && /\{\{cloze:/i.test(tmpl.qfmt));

            let builtCard = null;
            let frontImgRefs = [];
            let backImgRefs = [];

            if (isCloze) {
                const clozeNum = (row.ord || 0) + 1;
                const clozeField = note.fields.find(f => /\{\{c\d+::/i.test(f)) || note.fields[0] || '';
                const extraFields = note.fields.filter(f => f !== clozeField && f.trim()).join('\n\n');

                const { cleanedHtml: clozeCleanHtml, imageRefs: cFrontImgs } = extractImageRefsAndCleanMedia(clozeField);
                const { cleanedHtml: extraCleanHtml, imageRefs: cBackImgs } = extractImageRefsAndCleanMedia(extraFields);
                frontImgRefs = cFrontImgs;
                backImgRefs = cBackImgs;

                builtCard = parseClozeCard(clozeCleanHtml, clozeNum, extraCleanHtml, conversionMode);
            } else {
                let frontHtml = '';
                let backHtml = '';

                if (tmpl && tmpl.qfmt) {
                    const renderedQ = renderAnkiTemplate(tmpl.qfmt, fieldMap, { tags: note.tags.join(' '), deck: fullDeckName });
                    const renderedA = renderAnkiTemplate(tmpl.afmt, fieldMap, { frontSideHtml: renderedQ, tags: note.tags.join(' '), deck: fullDeckName });
                    frontHtml = renderedQ;
                    backHtml = renderedA;
                }

                // Fallback robusto aos campos crus caso template customizado gere vazio
                if (!convertAnkiHtmlToText(extractImageRefsAndCleanMedia(frontHtml).cleanedHtml, false) && extractImageRefsAndCleanMedia(frontHtml).imageRefs.length === 0) {
                    frontHtml = note.fields[0] || '';
                }
                if (!convertAnkiHtmlToText(extractImageRefsAndCleanMedia(backHtml).cleanedHtml, false) && extractImageRefsAndCleanMedia(backHtml).imageRefs.length === 0) {
                    backHtml = note.fields[1] || note.fields.slice(2).filter(Boolean).join('\n\n') || '';
                }

                const qExtracted = extractImageRefsAndCleanMedia(frontHtml);
                const aExtracted = extractImageRefsAndCleanMedia(backHtml);
                frontImgRefs = qExtracted.imageRefs;
                backImgRefs = aExtracted.imageRefs;

                const frontText = convertAnkiHtmlToText(qExtracted.cleanedHtml, true);
                const backTextMd = convertAnkiHtmlToText(aExtracted.cleanedHtml, true);
                const backTextPlain = stripTypedAnswerDecorations(convertAnkiHtmlToText(aExtracted.cleanedHtml, false));

                if (!frontText && frontImgRefs.length === 0) continue;
                if (!backTextMd && backImgRefs.length === 0) continue;

                const canAutoOpen =
                    conversionMode === 'auto' &&
                    backImgRefs.length === 0 &&
                    backTextPlain.length > 0 &&
                    backTextPlain.length <= 40 &&
                    !backTextPlain.includes('\n') &&
                    !containsMathOrComplexMarkup(backTextMd);

                const frontClassified = classifyImageRefs(frontImgRefs, translate);
                const backClassified = classifyImageRefs(backImgRefs, translate);

                builtCard = {
                    type: canAutoOpen ? 'open' : 'anki',
                    description: frontText || translate('apkg_image_placeholder', { name: frontClassified.embeddedNames[0] || frontClassified.externalLinks[0] || translate('apkg_image_embedded_label') }),
                    answer: canAutoOpen ? backTextPlain : (backTextMd || translate('apkg_image_placeholder', { name: backClassified.embeddedNames[0] || backClassified.externalLinks[0] || translate('apkg_image_embedded_label') }))
                };
            }

            if (!builtCard) continue;

            const frontMedia = classifyImageRefs(frontImgRefs, translate);
            const backMedia = classifyImageRefs(backImgRefs, translate);

            // Mantém apenas links http(s) externos; nunca armazena imagens incorporadas/base64 no baralho
            if (frontMedia.externalLinks.length > 0) {
                builtCard.image = frontMedia.externalLinks[0];
                stats.externalImageLinksKept += 1;
            }
            if (backMedia.externalLinks.length > 0) {
                builtCard.answerImage = backMedia.externalLinks[0];
                stats.externalImageLinksKept += 1;
            }

            if (note.tags.length > 0) {
                builtCard.tags = note.tags.slice(0, 12);
            }
            if (topicLabel) {
                builtCard.topic = topicLabel;
                builtCard.aiTopic = topicLabel;
            }
            if (rootSubject) {
                builtCard.subject = rootSubject;
                builtCard.aiSubject = rootSubject;
            }

            if (hasMultipleDecks && fullDeckName !== lastDeckInserted) {
                lastDeckInserted = fullDeckName;
                cards.push({
                    type: 'divisor',
                    text: subdeckLabel,
                    description: subdeckLabel,
                    answer: ''
                });
                stats.divisorCount += 1;
            }

            // Se o card possuía imagens incorporadas no .apkg, adiciona um comentário junto ao card solicitando link
            if (frontMedia.embeddedNames.length > 0 || backMedia.embeddedNames.length > 0) {
                stats.embeddedImagesDetected += frontMedia.embeddedNames.length + backMedia.embeddedNames.length;
                const detailParts = [];
                if (frontMedia.embeddedNames.length > 0) {
                    detailParts.push(translate('apkg_image_side_front', { name: frontMedia.embeddedNames.join(', ') }));
                }
                if (backMedia.embeddedNames.length > 0) {
                    detailParts.push(translate('apkg_image_side_back', { name: backMedia.embeddedNames.join(', ') }));
                }
                const commentText = translate('apkg_image_link_comment', { details: detailParts.join(' | ') });
                cards.push({
                    type: 'divisor',
                    text: commentText,
                    description: commentText,
                    answer: ''
                });
                stats.imageCommentsAdded += 1;
            }

            cards.push(builtCard);
            stats.totalCards += 1;
            if (builtCard.type === 'fill') stats.fillCount += 1;
            else if (builtCard.type === 'open') stats.openCount += 1;
            else stats.ankiCount += 1;

            if (i > 0 && i % 250 === 0) {
                report(`Convertendo cards (${i}/${cardRows.length})...`);
            }
        }

        return {
            deckTitle,
            cards,
            stats
        };
    } finally {
        db.close();
    }
}
