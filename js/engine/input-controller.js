/**
 * js/engine/input-controller.js
 * Módulo de gerenciamento de periféricos e atalhos:
 * Teclado (Active Recall, Anki, Múltipla Escolha e Marca-texto) e
 * Gamepad API orientada a eventos para economia de bateria e CPU.
 */

let lastGamepadButtonState = {};
let gamepadRafId = null;
let controllerHandlers = null;
let isInitialized = false;

function isTextInputElement(el) {
    if (!el) return false;
    return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
    );
}

function handleKeyDown(e) {
    if (!controllerHandlers) return;

    // Atalhos rápidos de marca-texto (1: Amarelo, 2: Verde, 3: Azul, 4: Roxo)
    // Tenta aplicar o marca-texto com prioridade quando há texto do cartão selecionado ou popup de marca-texto ativo
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        let hlColor = null;
        if (e.key === '1' || e.code === 'Numpad1') hlColor = 'yellow';
        else if (e.key === '2' || e.code === 'Numpad2') hlColor = 'green';
        else if (e.key === '3' || e.code === 'Numpad3') hlColor = 'blue';
        else if (e.key === '4' || e.code === 'Numpad4') hlColor = 'purple';

        if (hlColor && controllerHandlers.onHighlightShortcut) {
            const handled = controllerHandlers.onHighlightShortcut(hlColor);
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
    }

    const activeEl = document.activeElement;
    const targetEl = e.target;
    if (isTextInputElement(activeEl) || isTextInputElement(targetEl)) {
        return;
    }

    // Ignora quando modais ou menu hambúrguer estão visíveis
    if (controllerHandlers.isModalOrDrawerOpen && controllerHandlers.isModalOrDrawerOpen()) {
        return;
    }

    const isSpaceKey = (evt) => Boolean(
        evt.code === 'Space' ||
        evt.key === ' ' ||
        evt.key === 'Spacebar' ||
        evt.keyCode === 32 ||
        evt.which === 32
    );

    const isEnterKey = (evt) => Boolean(
        evt.key === 'Enter' ||
        evt.code === 'Enter' ||
        evt.code === 'NumpadEnter' ||
        evt.keyCode === 13 ||
        evt.which === 13
    );

    const currentQuestion = controllerHandlers.getCurrentQuestion ? controllerHandlers.getCurrentQuestion() : null;
    const isAnkiFlipped = controllerHandlers.getIsAnkiFlipped ? controllerHandlers.getIsAnkiFlipped() : false;

    // Prioridade máxima para cards Anki: espaço ou enter NUNCA devem pular card não-virado
    if (currentQuestion && currentQuestion.type === 'anki') {
        if (!isAnkiFlipped) {
            if (isSpaceKey(e) || isEnterKey(e)) {
                e.preventDefault();
                console.log("[Game] Atalho Espaço/Enter para virar card Anki.");
                if (controllerHandlers.onFlipAnki) controllerHandlers.onFlipAnki();
                return;
            }
        } else {
            if (e.key === '1' || e.code === 'Numpad1') {
                e.preventDefault();
                if (controllerHandlers.onAnkiRating) controllerHandlers.onAnkiRating('again');
                return;
            } else if (e.key === '2' || e.code === 'Numpad2') {
                e.preventDefault();
                if (controllerHandlers.onAnkiRating) controllerHandlers.onAnkiRating('hard');
                return;
            } else if (e.key === '3' || e.code === 'Numpad3' || isSpaceKey(e) || isEnterKey(e)) {
                e.preventDefault();
                if (controllerHandlers.onAnkiRating) controllerHandlers.onAnkiRating('good');
                return;
            } else if (e.key === '4' || e.code === 'Numpad4') {
                e.preventDefault();
                if (controllerHandlers.onAnkiRating) controllerHandlers.onAnkiRating('easy');
                return;
            }
        }
    }

    // Prioridade para cards de Voz (Explicar em voz alta):
    if (currentQuestion && currentQuestion.type === 'voice') {
        const isVoiceEvaluated = controllerHandlers.getIsVoiceEvaluated ? controllerHandlers.getIsVoiceEvaluated() : false;
        if (isVoiceEvaluated) {
            if (e.key === '1' || e.code === 'Numpad1') {
                e.preventDefault();
                if (controllerHandlers.onVoiceRating) controllerHandlers.onVoiceRating('again');
                return;
            } else if (e.key === '2' || e.code === 'Numpad2') {
                e.preventDefault();
                if (controllerHandlers.onVoiceRating) controllerHandlers.onVoiceRating('hard');
                return;
            } else if (e.key === '3' || e.code === 'Numpad3') {
                e.preventDefault();
                if (controllerHandlers.onVoiceRating) controllerHandlers.onVoiceRating('good');
                return;
            } else if (e.key === '4' || e.code === 'Numpad4') {
                e.preventDefault();
                if (controllerHandlers.onVoiceRating) controllerHandlers.onVoiceRating('easy');
                return;
            } else if (isSpaceKey(e) || isEnterKey(e)) {
                e.preventDefault();
                if (controllerHandlers.onVoiceContinue) controllerHandlers.onVoiceContinue();
                return;
            }
        }
    }

    const isChatOpen = controllerHandlers.isChatOpen ? controllerHandlers.isChatOpen() : false;

    // Quando o chatbot estiver aberto (e o campo de texto NÃO estiver focado):
    // permite pular/avançar o card com a barra de espaço (Space) para cards não-Anki
    if (isChatOpen) {
        if (isSpaceKey(e)) {
            e.preventDefault();
            console.log("[Game] Atalho Espaço com chatbot aberto para pular card.");
            const isAnimating = controllerHandlers.getIsAnimating ? controllerHandlers.getIsAnimating() : false;
            if (!isAnimating && controllerHandlers.onNextQuestion) {
                controllerHandlers.onNextQuestion();
            }
        }
        return;
    }

    // Se o botão de próxima questão estiver visível (após erro/correção), avança com Enter/Espaço
    const isAnimating = controllerHandlers.getIsAnimating ? controllerHandlers.getIsAnimating() : false;
    if (controllerHandlers.isNextQuestionBtnVisible && controllerHandlers.isNextQuestionBtnVisible() && !isAnimating) {
        if (isEnterKey(e) || isSpaceKey(e)) {
            e.preventDefault();
            console.log("[Game] Atalho Enter/Espaço para avançar card após correção.");
            if (controllerHandlers.onNextQuestion) controllerHandlers.onNextQuestion();
            return;
        }
    }

    if (currentQuestion && currentQuestion.type === 'multiple_choice') {
        let keyNum = parseInt(e.key);
        if (isNaN(keyNum) && e.code && e.code.startsWith('Numpad')) {
            keyNum = parseInt(e.code.replace('Numpad', ''));
        }
        if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 6) {
            if (controllerHandlers.onSelectMcOption) {
                const handled = controllerHandlers.onSelectMcOption(keyNum);
                if (handled) e.preventDefault();
            }
        }
    }
}

function pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let hasActiveGamepad = false;

    for (const gp of gamepads) {
        if (!gp) continue;
        hasActiveGamepad = true;
        
        const isPressed = (btnIndex) => {
            const b = gp.buttons[btnIndex];
            if (!b) return false;
            return typeof b === 'object' ? b.pressed : b > 0.5;
        };

        const justPressed = (btnIndex) => {
            const pressed = isPressed(btnIndex);
            const key = `${gp.index}_${btnIndex}`;
            const wasPressed = !lastGamepadButtonState[key];
            lastGamepadButtonState[key] = pressed;
            return pressed && !wasPressed;
        };

        if (controllerHandlers && (
            (controllerHandlers.isModalOrDrawerOpen && controllerHandlers.isModalOrDrawerOpen()) ||
            (controllerHandlers.isChatOpen && controllerHandlers.isChatOpen())
        )) {
            continue;
        }

        const currentQuestion = controllerHandlers?.getCurrentQuestion ? controllerHandlers.getCurrentQuestion() : null;
        const isAnkiFlipped = controllerHandlers?.getIsAnkiFlipped ? controllerHandlers.getIsAnkiFlipped() : false;

        if (currentQuestion && currentQuestion.type === 'anki') {
            if (!isAnkiFlipped) {
                // Qualquer botão frontal ou de ombro vira o cartão
                if (justPressed(0) || justPressed(1) || justPressed(2) || justPressed(3) || justPressed(4) || justPressed(5)) {
                    if (controllerHandlers?.onFlipAnki) controllerHandlers.onFlipAnki();
                }
            } else {
                // Layout Gamepad:
                // Errei (Left / red): X (btn 2), Dpad Left (btn 14), L1 (btn 4)
                if (justPressed(2) || justPressed(14) || justPressed(4)) {
                    if (controllerHandlers?.onAnkiRating) controllerHandlers.onAnkiRating('again');
                }
                // Difícil (Top / orange): Y (btn 3), Dpad Up (btn 12)
                else if (justPressed(3) || justPressed(12)) {
                    if (controllerHandlers?.onAnkiRating) controllerHandlers.onAnkiRating('hard');
                }
                // Médio/Bom (Bottom / green): A (btn 0), Dpad Down (btn 13), R1 (btn 5)
                else if (justPressed(0) || justPressed(13) || justPressed(5)) {
                    if (controllerHandlers?.onAnkiRating) controllerHandlers.onAnkiRating('good');
                }
                // Fácil (Right / blue): B (btn 1), Dpad Right (btn 15)
                else if (justPressed(1) || justPressed(15)) {
                    if (controllerHandlers?.onAnkiRating) controllerHandlers.onAnkiRating('easy');
                }
            }
        }
    }

    if (hasActiveGamepad) {
        gamepadRafId = requestAnimationFrame(pollGamepad);
    } else {
        stopGamepadLoop();
    }
}

export function startGamepadLoop() {
    if (!gamepadRafId) {
        console.log("[Gamepad] Controle físico detectado. Polling iniciado.");
        gamepadRafId = requestAnimationFrame(pollGamepad);
    }
}

export function stopGamepadLoop() {
    if (gamepadRafId) {
        cancelAnimationFrame(gamepadRafId);
        gamepadRafId = null;
        console.log("[Gamepad] Nenhum controle físico ativo. Polling pausado para poupar bateria e CPU.");
    }
}

function handleGamepadConnected(e) {
    console.log("[Gamepad] Conectado:", e.gamepad.id);
    startGamepadLoop();
}

function handleGamepadDisconnected(e) {
    console.log("[Gamepad] Desconectado:", e.gamepad.id);
    const active = (navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
    if (active.length === 0) {
        stopGamepadLoop();
    }
}

export function initInputController(options = {}) {
    controllerHandlers = options;
    if (isInitialized) return;

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    isInitialized = true;
}

export function destroyInputController() {
    if (!isInitialized) return;
    document.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('gamepadconnected', handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    stopGamepadLoop();
    isInitialized = false;
    controllerHandlers = null;
}
