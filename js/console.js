
(function () {
    const consoleContainer = document.createElement('div');
    consoleContainer.id = 'custom-console-overlay';
    consoleContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        color: #00ff00;
        font-family: monospace;
        font-size: 12px;
        z-index: 10000;
        display: none;
        flex-direction: column;
        padding: 10px;
        box-sizing: border-box;
        overflow: hidden;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #333;
        padding-bottom: 5px;
        margin-bottom: 10px;
        flex-shrink: 0;
    `;
    const isSubpage = window.location.pathname.includes('/pages/');
    const assetsPath = isSubpage ? '../assets/img/' : 'assets/img/';
    header.innerHTML = `<span style="font-weight:bold">CONSOLE LOG</span><button id="close-console-btn" style="background:none; border:none; color:white; cursor:pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;"><img src="${assetsPath}close.svg" style="width:20px; height:20px;" alt="Fechar"></button>`;
    consoleContainer.appendChild(header);

    const logArea = document.createElement('div');
    logArea.id = 'console-log-area';
    logArea.style.cssText = `
        flex: 1;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-all;
    `;
    consoleContainer.appendChild(logArea);

    const footer = document.createElement('div');
    footer.style.cssText = `
        margin-top: 10px;
        border-top: 1px solid #333;
        padding-top: 5px;
        display: flex;
        gap: 10px;
    `;
    footer.innerHTML = '<button id="clear-console-btn" style="background:#333; color:white; border:none; padding:5px 10px; cursor:pointer; border-radius:4px;">Limpar</button>';
    consoleContainer.appendChild(footer);



    let isConsoleOpen = false;
    const pendingLogs = [];
    const MAX_LOG_ENTRIES = 150;

    function formatTimestamp(ms) {
        const d = new Date(ms);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    function formatArgs(args) {
        return args.map(a => {
            if (typeof a === 'object' && a !== null) {
                try { return JSON.stringify(a, null, 2); } catch (_) { return String(a); }
            }
            return String(a);
        }).join(' ');
    }

    function createLogNode(ts, args, type) {
        const entry = document.createElement('div');
        entry.style.marginBottom = '5px';
        entry.style.borderLeft = `3px solid ${type === 'error' ? 'red' : (type === 'warn' ? 'orange' : '#00ff00')}`;
        entry.style.paddingLeft = '5px';
        entry.textContent = `[${formatTimestamp(ts)}] ${formatArgs(args)}`;
        return entry;
    }

    function flushPendingLogs() {
        if (!isConsoleOpen || pendingLogs.length === 0) return;
        const frag = document.createDocumentFragment();
        while (pendingLogs.length > 0) {
            const item = pendingLogs.shift();
            frag.appendChild(createLogNode(item.ts, item.args, item.type));
        }
        logArea.appendChild(frag);
        while (logArea.childNodes.length > MAX_LOG_ENTRIES) {
            logArea.removeChild(logArea.firstChild);
        }
        logArea.scrollTop = logArea.scrollHeight;
    }

    function enqueueLog(args, type = 'log') {
        pendingLogs.push({ ts: Date.now(), args, type });
        if (pendingLogs.length > MAX_LOG_ENTRIES) {
            pendingLogs.shift();
        }
        if (isConsoleOpen) {
            flushPendingLogs();
        }
    }

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
        originalLog.apply(console, args);
        enqueueLog(args, 'log');
    };

    console.warn = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com should not be used in production')) {
            return;
        }
        originalWarn.apply(console, args);
        enqueueLog(args, 'warn');
    };

    console.error = (...args) => {
        originalError.apply(console, args);
        enqueueLog(args, 'error');
    };

    function toggleConsole() {
        if (consoleContainer.style.display === 'none') {
            isConsoleOpen = true;
            consoleContainer.style.display = 'flex';
            flushPendingLogs();
        } else {
            isConsoleOpen = false;
            consoleContainer.style.display = 'none';
        }
    }

    window.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            toggleConsole();
        }
    });

    function initConsole() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', initConsole);
            return;
        }
        document.body.appendChild(consoleContainer);
        document.getElementById('close-console-btn').onclick = toggleConsole;
        document.getElementById('clear-console-btn').onclick = () => { logArea.innerHTML = ''; };

        // Triple-click on titles to toggle console
        let clickCount = 0;
        let lastClickTime = 0;
        const handleTripleClick = () => {
            const now = Date.now();
            if (now - lastClickTime < 500) {
                clickCount++;
                if (clickCount >= 3) {
                    toggleConsole();
                    clickCount = 0;
                }
            } else {
                clickCount = 1;
            }
            lastClickTime = now;
        };

        // Target common title elements across different pages
        const targets = [
            document.getElementById('deck-title'),
            document.getElementById('deck-title-display'),
            document.querySelector('#upload-screen h1'),
            document.querySelector('header h1')
        ];

        targets.forEach(el => {
            if (el) {
                el.addEventListener('click', handleTripleClick);
                el.style.userSelect = 'none'; // Prevent text selection on triple click
            }
        });
    }

    initConsole();

    console.log("Custom console initialized. Press Alt+C or triple-click the deck title to view.");
})();
