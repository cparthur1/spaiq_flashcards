// --- SHARED UTILITIES ---

export const NOTEBOOK_STORAGE_KEY = ['flashcards', 'Notebook'].join('');

/**
 * Serializa e codifica dados de armazenamento local de forma segura.
 * @param {*} value
 * @returns {string}
 */
export function encodeStoragePayload(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Normalizes a string for comparison by removing accents, 
 * parenthetical asides, and special characters.
 */
export function normalizeString(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/\(.*?\)/g, '')
        .replace(/[*_`$#]/g, '')
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/-/g, ' ');
}

/**
 * Calculates Levenshtein-based similarity between two strings.
 * Returns a value between 0 and 1.
 */
export function calculateSimilarity(s1, s2) {
    const str1 = String(s1 ?? '');
    const str2 = String(s2 ?? '');
    if (str1 === str2) return 1.0;

    let longer = str1.length >= str2.length ? str1 : str2;
    let shorter = str1.length < str2.length ? str1 : str2;
    const lLen = longer.length;
    const sLen = shorter.length;
    if (lLen === 0) return 1.0;

    const prev = new Int32Array(sLen + 1);
    const curr = new Int32Array(sLen + 1);

    for (let j = 0; j <= sLen; j++) prev[j] = j;

    for (let i = 1; i <= lLen; i++) {
        curr[0] = i;
        const code1 = longer.charCodeAt(i - 1);
        for (let j = 1; j <= sLen; j++) {
            const indicator = code1 === shorter.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + indicator);
        }
        prev.set(curr);
    }

    return (lLen - prev[sLen]) / lLen;
}

/**
 * Retorna um número pseudo-aleatório no intervalo [0, 1) criptograficamente seguro.
 */
export function secureRandom() {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return arr[0] / (0xffffffff + 1);
    }
    return 0.5;
}

/**
 * Gera um identificador único seguro com prefixo opcional.
 */
export function generateSecureId(prefix = 'id') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    const rand = Math.floor(secureRandom() * 0xffffffff).toString(36);
    return `${prefix}_${Date.now()}_${rand}`;
}

/**
 * Shuffles an array in place using cryptographically secure randomness.
 */
export function shuffleArray(array) {
    if (!Array.isArray(array)) return [];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(secureRandom() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Remove recursivamente todas as tags HTML prevenindo bypass por aninhamento.
 * @param {string} input - Texto contendo tags HTML
 * @returns {string} - Texto limpo sem tags HTML
 */
export function stripHtml(input) {
    if (!input || typeof input !== 'string') return '';
    let sanitized = input;
    let prev;
    do {
        prev = sanitized;
        sanitized = sanitized.replace(/<[^<>]*>/g, '');
    } while (sanitized !== prev);
    return sanitized.trim();
}

/**
 * Escapa meta-caracteres HTML para inserção segura em nós de texto.
 * @param {string} str - Texto a ser escapado
 * @returns {string} - Texto seguro com entidades HTML
 */
export function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Sanitiza HTML preservando elementos seguros (MathML, SVG, <mark>).
 * @param {string} html
 * @param {Object} [extraConfig]
 * @returns {string}
 */
export function sanitizeHtml(html, extraConfig = {}) {
    if (!html || typeof html !== 'string') return '';
    if (typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function') {
        const addTags = ['semantics', 'annotation', 'mark', ...(extraConfig.ADD_TAGS || [])];
        const addAttr = ['target', 'class', 'style', 'aria-hidden', 'columnspacing', 'columnalign', 'rowspacing', ...(extraConfig.ADD_ATTR || [])];
        return DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true, mathMl: true, svg: true },
            ...extraConfig,
            ADD_TAGS: addTags,
            ADD_ATTR: addAttr
        });
    }
    return escapeHtml(html);
}

/**
 * Valida e sanitiza URLs de imagens contra esquemas maliciosos (javascript:, etc.).
 * Permite apenas http, https, blob, data:image/ e caminhos relativos seguros de assets.
 * @param {string} url - URL ou URI da imagem
 * @returns {string} - URL sanitizada ou string vazia se insegura
 */
export function sanitizeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text') || lower.startsWith('data:application')) {
        return '';
    }
    if (
        lower.startsWith('http://') ||
        lower.startsWith('https://') ||
        lower.startsWith('blob:') ||
        lower.startsWith('data:image/') ||
        /^(?:\.\.?\/)?assets\/[a-zA-Z0-9_./-]+$/.test(trimmed)
    ) {
        return trimmed.replace(/[<"']/g, '');
    }
    return '';
}


/**
 * Retries a function with exponential backoff.
 */
export async function callWithRetry(fn, retries = 3, delay = 1000) {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) throw error;
        // Solo reintentar si es error de red o 429/503
        console.warn(`Erro na API, tentando novamente em ${delay}ms... Restam ${retries} tentativas.`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return callWithRetry(fn, retries - 1, delay * 2);
    }
}
/**
 * Centralized routing configuration.
 * Dynamically adjusts paths based on current location (root vs /pages/).
 */
const isSubpage = typeof window !== 'undefined' && window.location ? window.location.pathname.includes('/pages/') : false;
const prefix = isSubpage ? '../' : '';

export const ROUTES = {
    HOME: prefix + 'index.html',
    GAME: prefix + 'pages/game.html',
    GENERATE: prefix + 'pages/generate.html',
    STATS: prefix + 'pages/stats.html',
    BULK_ADD: prefix + 'pages/bulk-add.html'
};

/**
 * Checks if we should reset the AI model fallback (at 3 AM daily).
 */
export function checkAndResetModelFallback() {
    const now = new Date();
    const lastResetStr = localStorage.getItem('last_model_reset');
    const lastReset = lastResetStr ? new Date(lastResetStr) : null;

    // Proxima ou atual barreira de 3 AM
    const today3AM = new Date();
    today3AM.setHours(3, 0, 0, 0);

    // Se agora passou de 3 AM E (não houve reset ou o último reset foi antes das 3 AM de hoje)
    if (now >= today3AM && (!lastReset || lastReset < today3AM)) {
        localStorage.removeItem('model_fallback_active');
        localStorage.setItem('last_model_reset', now.toISOString());
        console.log("AI Model fallback reset for the new day.");
    }
}

/**
 * Garante que os itens de histórico em uma sessão de chat ou array do Gemini usem os papéis (roles) válidos:
 * - Converte respostas de ferramentas para role 'user' estruturado conforme esperado pela API Gemini.
 * - Remove itens órfãos que antecedam a primeira mensagem de usuário.
 * @param {Object|Array} target - ChatSession ou array de histórico
 */
export function sanitizeChatHistory(target) {
    const list = Array.isArray(target)
        ? target
        : (target && Array.isArray(target._history) ? target._history : null);
    if (!list) return;

    list.forEach(item => {
        if (!item || !Array.isArray(item.parts)) return;
        const hasFunctionResponse = item.parts.some(p => p && !!p.functionResponse);
        if (hasFunctionResponse || item.role === 'function') {
            item.role = 'user';
        }
    });

    // Garante que o primeiro item seja de papel 'user' se o histórico não estiver vazio
    while (list.length > 0 && list[0].role !== 'user') {
        list.shift();
    }
}

/**
 * Compresses an image file or Data URL to a maximum dimension and returns a JPEG Data URL.
 * @param {File|Blob|string} imageInput - File, Blob, or URL string
 * @param {number} maxDimension - Max width or height in pixels (default 800)
 * @param {number} quality - Compression quality 0.0 to 1.0 (default 0.85)
 * @returns {Promise<string>} Base64 Data URL
 */
export function compressImageFile(imageInput, maxDimension = 800, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!imageInput) {
            resolve('');
            return;
        }

        const processLoadedImage = (img) => {
            let width = img.width;
            let height = img.height;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
        };

        if (typeof imageInput === 'string') {
            const safeInputUrl = sanitizeImageUrl(imageInput);
            if (!safeInputUrl) {
                resolve('');
                return;
            }
            if (safeInputUrl.startsWith('data:') && safeInputUrl.length < 50000) {
                // Short enough data URL, no re-compression needed
                resolve(safeInputUrl);
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => processLoadedImage(img);
            img.onerror = () => resolve(safeInputUrl); // fallback to original string if error
            img.src = safeInputUrl;
        } else if (imageInput instanceof File || imageInput instanceof Blob) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const safeResultUrl = sanitizeImageUrl(e.target?.result || '');
                if (!safeResultUrl) {
                    resolve('');
                    return;
                }
                const img = new Image();
                img.onload = () => processLoadedImage(img);
                img.onerror = (err) => reject(err);
                img.src = safeResultUrl;
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(imageInput);
        } else {
            resolve('');
        }
    });
}

/**
 * Parses Markdown and renders LaTeX math formulas (KaTeX).
 * Supports inline ($...$, \(...\)) and block ($$...$$, \[...\]) math.
 * Preserves HTML tags (including highlighter <mark> elements) and code blocks.
 */
export function renderMathAndMarkdown(text) {
    if (!text) return '';

    if (typeof marked !== 'undefined' && typeof marked.setOptions === 'function') {
        marked.setOptions({ gfm: true, breaks: true });
    }

    const mathBlocks = [];

    // 1. Temporarily extract block math (\[...\] and $$...$$)
    let placeholderText = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
        const placeholder = `%%BLOCK_MATH_${mathBlocks.length}%%`;
        mathBlocks.push({ type: 'BLOCK', text: math });
        return placeholder;
    });
    placeholderText = placeholderText.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
        const placeholder = `%%BLOCK_MATH_${mathBlocks.length}%%`;
        mathBlocks.push({ type: 'BLOCK', text: math });
        return placeholder;
    });

    // 2. Temporarily extract inline math (\(...\) and $...$)
    placeholderText = placeholderText.replace(/\\\(([\s\S]*?)\\\)/g, (match, math) => {
        const placeholder = `%%INLINE_MATH_${mathBlocks.length}%%`;
        mathBlocks.push({ type: 'INLINE', text: math });
        return placeholder;
    });
    placeholderText = placeholderText.replace(/\$(?!\s)((?:\\\$|[^\$])+?)(?<!\s)\$/g, (match, math) => {
        const placeholder = `%%INLINE_MATH_${mathBlocks.length}%%`;
        mathBlocks.push({ type: 'INLINE', text: math });
        return placeholder;
    });

    // 3. Parse Markdown
    let html = typeof marked !== 'undefined' ? marked.parse(placeholderText) : placeholderText;

    // 4. Extract code blocks from HTML to prevent rendering math inside them
    const codeBlocks = [];
    html = html.replace(/<pre><code[\s\S]*?<\/code><\/pre>/gi, (match) => {
        const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
        codeBlocks.push(match);
        return placeholder;
    });
    html = html.replace(/<code[\s\S]*?<\/code>/gi, (match) => {
        const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
        codeBlocks.push(match);
        return placeholder;
    });

    // 5. Restore math blocks and render them with KaTeX
    if (typeof katex !== 'undefined') {
        html = html.replace(/%%(BLOCK|INLINE)_MATH_(\d+)%%/g, (match, type, index) => {
            const mathItem = mathBlocks[parseInt(index, 10)];
            if (!mathItem) return match;
            try {
                return katex.renderToString(mathItem.text, {
                    displayMode: type === 'BLOCK',
                    throwOnError: false
                });
            } catch (err) {
                console.error("KaTeX error:", err);
                return match;
            }
        });
    } else {
        html = html.replace(/%%(BLOCK|INLINE)_MATH_(\d+)%%/g, (match, type, index) => {
            const mathItem = mathBlocks[parseInt(index, 10)];
            if (!mathItem) return match;
            return type === 'BLOCK' ? `$$${mathItem.text}$$` : `$${mathItem.text}$`;
        });
    }

    // 6. Restore code blocks
    html = html.replace(/%%CODE_BLOCK_(\d+)%%/g, (match, index) => {
        return codeBlocks[parseInt(index, 10)] || '';
    });

    // 7. Restore any remaining math placeholders
    html = html.replace(/%%(BLOCK|INLINE)_MATH_(\d+)%%/g, (match, type, index) => {
        const mathItem = mathBlocks[parseInt(index, 10)];
        if (!mathItem) return match;
        return type === 'BLOCK' ? `$$${mathItem.text}$$` : `$${mathItem.text}$`;
    });

    // 8. Sanitize HTML via DOMPurify to prevent XSS (preserving KaTeX MathML, SVG, and <mark> elements)
    return sanitizeHtml(html);
}



