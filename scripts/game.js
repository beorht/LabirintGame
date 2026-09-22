// UI layer: players and campaign progress, HUD, code execution, demo (auto-solve) mode, settings.
// Depends on config.js, maze.js, program.js, levels.js and render.js.

const BOARD_MAX_PX = 700;
const MOVE_ANIMATION_MS = 180;
const SHAKE_MS = 320;
const HINT_LENGTH = 5;
const MAX_LOG_ENTRIES = 200;
const DEMO_MAX_WALK_MS = 20000;         // long solver walks are sped up to fit this
const MAX_NAME_LENGTH = 20;
const PLAYERS_KEY = 'mazeQuestPlayers';
const CURRENT_PLAYER_KEY = 'mazeQuestPlayer';

// One-time explanations shown when a level unlocks a new idea
const INTROS = {
    repeat: {
        title: '🔁 Новое: циклы',
        body: `
            <p>Когда нужно повторить одно и то же, не пишите команду много раз — используйте <code>repeat</code>:</p>
            <div class="tutorial-code"><span class="tk-kw">repeat</span>(<span class="tk-num">8</span>) {
    <span class="tk-obj">hero</span>.<span class="tk-fn">right</span>();
}</div>
            <p>Число в скобках — сколько раз повторить. Всё, что внутри <code>{ }</code>, выполнится столько раз.
            Внутри цикла может быть несколько команд.</p>
            <p>⭐⭐⭐ теперь дают, только если код <b>не длиннее лимита строк</b> — он показан над полем.</p>`
    },
    nesting: {
        title: '🪆 Новое: цикл в цикле',
        body: `
            <p>Внутрь <code>repeat</code> можно поместить другой <code>repeat</code>. Так повторяется целый узор:</p>
            <div class="tutorial-code"><span class="tk-kw">repeat</span>(<span class="tk-num">3</span>) {
    <span class="tk-kw">repeat</span>(<span class="tk-num">4</span>) {
        <span class="tk-obj">hero</span>.<span class="tk-fn">right</span>();
    }
    <span class="tk-obj">hero</span>.<span class="tk-fn">down</span>();
}</div>
            <p>Внутренний цикл выполнится полностью на каждом витке внешнего: здесь 3 × (4 шага вправо + 1 вниз).</p>`
    }
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Game state
const gameState = {
    maze: [],
    playerX: 1,
    playerY: 1,
    startX: 1,
    startY: 1,
    finishX: 10,
    finishY: 3,
    steps: 0,
    coins: 0,
    level: 1,
    levelInfo: null,            // rules of the current level: title, goal, maxLines, allowRepeat…
    traps: new Set(),
    coinCells: new Set(),       // coins still on the board
    initialTraps: [],           // layout restored on every run / reset
    initialCoins: [],
    visited: new Set(),         // hero trail
    optimalSteps: 0,
    isRunning: false,
    runId: 0,                   // invalidates a stopped run still waiting on its delay
    timer: 0,
    timerInterval: null,
    customLevel: null,          // map data while playing a custom map
    player: null,               // { name, progress: { level, stars, intros } }
    settings: { ...DEFAULT_SETTINGS }
};

// Visual effects state (never affects game logic)
const fx = {
    moveFrom: null,
    moveStart: 0,
    moveDuration: MOVE_ANIMATION_MS,
    facing: 'right',
    shakeStart: -Infinity,
    particles: [],
    explored: { cells: [], count: 0 },
    frameId: null
};

const dom = {};
let boardView;
let customCharacterImage = null;
let lineHighlight = { index: -1, kind: '', loops: [] };
let editorMetrics = { lineHeight: 24, padTop: 12 };

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const isHidden = el => el.classList.contains('hidden');

// Initialize DOM elements
function initDOM() {
    [
        'gameCanvas', 'codeEditor', 'lineNumbers', 'execHighlight', 'copyButton', 'runButton',
        'resetButton', 'hintButton', 'helpButton', 'themeButton', 'settingsButton', 'clearLogsButton',
        'gameMessage', 'logsContent', 'victoryModal', 'tutorialModal', 'stepCount', 'timerDisplay',
        'levelDisplay', 'levelSize', 'coinCount', 'coinTotal', 'lineCount', 'lineLimit', 'codeCounter',
        'uploadCharacterButton', 'characterInput', 'solverSelect', 'demoButton',
        'levelTitle', 'levelGoal', 'levelTags', 'playerButton',
        'playerModal', 'playerNameInput', 'playerNameList', 'playerMessage', 'playerStartBtn',
        'introModal', 'introTitle', 'introBody', 'introCloseBtn',
        'finishModal', 'finishTitle', 'finishStars', 'finishGrid', 'finishRestartBtn', 'finishSwitchBtn',
        'settingsModal', 'settingSpeed', 'settingSpeedValue', 'settingsMessage',
        'settingsSaveBtn', 'settingsCancelBtn',
        'modalSteps', 'modalOptimal', 'modalTime', 'modalCoins', 'modalLines', 'modalStars', 'modalNote',
        'nextLevelButton', 'restartButton', 'startGameButton'
    ].forEach(id => { dom[id] = document.getElementById(id); });

    boardView = createBoardView(dom.gameCanvas, BOARD_MAX_PX);

    const editorStyle = getComputedStyle(dom.codeEditor);
    editorMetrics = {
        lineHeight: parseFloat(editorStyle.lineHeight) || 24,
        padTop: parseFloat(editorStyle.paddingTop) || 12
    };

    dom.solverSelect.innerHTML = Object.entries(SOLVERS)
        .map(([key, solver]) => `<option value="${key}">${solver.name}</option>`)
        .join('');
    dom.settingSpeed.min = SETTINGS_LIMITS.speedMin;
    dom.settingSpeed.max = SETTINGS_LIMITS.speedMax;

    const savedCharacter = localStorage.getItem('customCharacter');
    if (savedCharacter) {
        const img = new Image();
        img.onload = () => {
            customCharacterImage = img;
            requestRender();
        };
        img.src = savedCharacter;
    }
}

// ---------- Theme ----------

function initTheme() {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(localStorage.getItem('theme') || (systemDark.matches ? 'dark' : 'light'));
    systemDark.addEventListener('change', e => {
        if (!localStorage.getItem('theme')) applyTheme(e.matches ? 'dark' : 'light');
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    dom.themeButton.textContent = theme === 'dark' ? '☀️' : '🌙';
    refreshPalette();
    if (gameState.maze.length) {
        buildBoardLayer(boardView, gameState);
        requestRender();
    }
    if (editorState.initialized) drawEditorMaze();
}

function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
}

// ---------- Settings ----------

// Broken stored settings never break the game: defaults are used and the player is told why
function loadSettings() {
    try {
        const stored = localStorage.getItem('settings');
        gameState.settings = stored ? validateSettings(JSON.parse(stored)) : { ...DEFAULT_SETTINGS };
    } catch (err) {
        gameState.settings = { ...DEFAULT_SETTINGS };
        localStorage.removeItem('settings');
        const reason = err instanceof ConfigError ? err.message : 'данные повреждены';
        addLog(`Настройки сброшены по умолчанию: ${reason}`, 'error');
    }
}

function openSettings() {
    dom.settingSpeed.value = gameState.settings.speed;
    dom.settingSpeedValue.textContent = `${gameState.settings.speed} мс`;
    dom.settingsMessage.textContent = '';
    dom.settingsModal.classList.remove('hidden');
}

function closeSettings() {
    dom.settingsModal.classList.add('hidden');
}

function saveSettings() {
    try {
        gameState.settings = validateSettings({ speed: Number(dom.settingSpeed.value) });
    } catch (err) {
        if (!(err instanceof ConfigError)) throw err;
        dom.settingsMessage.textContent = `⚠️ ${err.message}`;
        return;
    }
    localStorage.setItem('settings', JSON.stringify(gameState.settings));
    closeSettings();
    addLog('Настройки сохранены', 'success');
}

// ---------- Players & progress ----------

function readPlayers() {
    try {
        return JSON.parse(localStorage.getItem(PLAYERS_KEY)) || {};
    } catch (err) {
        return {};
    }
}

function savePlayer() {
    if (!gameState.player) return;
    const players = readPlayers();
    players[gameState.player.name] = gameState.player.progress;
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
}

function openPlayerModal() {
    const names = Object.keys(readPlayers());
    dom.playerNameList.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
    dom.playerNameInput.value = gameState.player ? gameState.player.name : '';
    dom.playerMessage.textContent = '';
    dom.playerModal.classList.remove('hidden');
    dom.playerNameInput.focus();
}

function submitPlayerName() {
    const name = dom.playerNameInput.value.trim().replace(/\s+/g, ' ');
    if (!name) {
        dom.playerMessage.textContent = 'Введите имя';
        return;
    }
    if (name.length > MAX_NAME_LENGTH) {
        dom.playerMessage.textContent = `Имя не длиннее ${MAX_NAME_LENGTH} символов`;
        return;
    }
    selectPlayer(name);
}

// Loads (or creates) a player's progress and continues from their level
function selectPlayer(name) {
    const players = readPlayers();
    const isNew = !players[name];
    const progress = { level: 1, stars: {}, intros: [], ...players[name] };
    gameState.player = { name, progress };
    dom.playerModal.classList.add('hidden');
    localStorage.setItem(CURRENT_PLAYER_KEY, name);
    savePlayer();
    dom.playerButton.textContent = `👤 ${name}`;

    gameState.customLevel = null;
    gameState.level = Math.min(progress.level, LEVELS.length);
    setEditorCode('');
    initGame();
    clearLogs();
    addLog(isNew ? `Привет, ${name}! Впереди ${LEVELS.length} уровней` : `С возвращением, ${name}! Уровень ${gameState.level}`, 'info');

    if (progress.level > LEVELS.length) showCampaignComplete();
    else if (isNew) showTutorial();
}

function recordVictory(stars) {
    if (gameState.customLevel || !gameState.player) return;
    const { progress } = gameState.player;
    progress.stars[gameState.level] = Math.max(progress.stars[gameState.level] || 0, stars);
    progress.level = Math.max(progress.level, gameState.level + 1);
    savePlayer();
}

function totalStars() {
    return Object.values(gameState.player.progress.stars).reduce((sum, s) => sum + s, 0);
}

function showCampaignComplete() {
    const { name, progress } = gameState.player;
    dom.finishTitle.textContent = `🏆 Кампания пройдена, ${name}!`;
    dom.finishStars.textContent = `★ ${totalStars()} из ${LEVELS.length * 3}`;
    dom.finishGrid.innerHTML = LEVELS.map((level, i) => {
        const stars = progress.stars[i + 1] || 0;
        return `<div class="finish-level" title="${escapeHtml(level.title)}">
            <span class="finish-level-num">${i + 1}</span>
            <span class="finish-level-stars">${'★'.repeat(stars)}<span class="dim">${'★'.repeat(3 - stars)}</span></span>
        </div>`;
    }).join('');
    dom.finishModal.classList.remove('hidden');
}

// Starts the campaign over; best stars are kept
function restartCampaign() {
    gameState.player.progress.level = 1;
    savePlayer();
    dom.finishModal.classList.add('hidden');
    gameState.customLevel = null;
    gameState.level = 1;
    setEditorCode('');
    initGame();
    addLog('Кампания начата заново — лучшие звёзды сохранены', 'info');
}

function maybeShowIntro() {
    const intro = gameState.levelInfo.intro;
    if (!intro || !gameState.player || gameState.player.progress.intros.includes(intro)) return;
    gameState.player.progress.intros.push(intro);
    savePlayer();
    dom.introTitle.textContent = INTROS[intro].title;
    dom.introBody.innerHTML = INTROS[intro].body;
    dom.introModal.classList.remove('hidden');
    dom.introCloseBtn.focus();
}

// ---------- Game initialization ----------

function initGame() {
    stopTimer();
    gameState.timer = 0;
    updateTimerDisplay();
    gameState.runId++;
    setRunning(false);

    const level = gameState.customLevel
        ? { ...gameState.customLevel, title: gameState.customLevel.name || 'Своя карта', goal: 'Карта из конструктора',
            maxLines: null, allowRepeat: true, allowNesting: true, intro: null }
        : getLevel(gameState.level);
    gameState.levelInfo = level;
    gameState.maze = level.maze.map(row => [...row]);
    gameState.startX = level.startX;
    gameState.startY = level.startY;
    gameState.finishX = level.finishX;
    gameState.finishY = level.finishY;
    gameState.initialTraps = [...level.traps];
    gameState.initialCoins = [...level.coins];

    const bestPath = bfs(gameState.maze, gameState.startX, gameState.startY, gameState.finishX, gameState.finishY);
    gameState.optimalSteps = bestPath ? bestPath.length : 0;

    resizeBoardView(boardView, gameState.maze.length);
    buildBoardLayer(boardView, gameState);
    resetHero();
    updateLevelBanner();
    updateLineCount();
    clearMessage();
    clearLineHighlight();
    maybeShowIntro();
}

// Put the hero back on start and restore the level's traps and coins
function resetHero() {
    gameState.playerX = gameState.startX;
    gameState.playerY = gameState.startY;
    gameState.steps = 0;
    gameState.coins = 0;
    gameState.traps = new Set(gameState.initialTraps);
    gameState.coinCells = new Set(gameState.initialCoins);
    gameState.visited = new Set([cellKey(gameState.startX, gameState.startY)]);
    fx.moveFrom = null;
    fx.facing = 'right';
    fx.particles = [];
    fx.explored = { cells: [], count: 0 };
    updateUI();
    requestRender();
}

function updateLevelBanner() {
    const info = gameState.levelInfo;
    dom.levelTitle.textContent = gameState.customLevel
        ? `★ ${info.title}`
        : `Уровень ${gameState.level} из ${LEVELS.length} · ${info.title}`;
    dom.levelGoal.textContent = info.goal;

    const tags = [];
    if (info.maxLines) tags.push(`<span class="tag tag-limit">⭐⭐⭐ ≤ ${info.maxLines} строк</span>`);
    if (info.allowRepeat) tags.push('<span class="tag">🔁 repeat</span>');
    if (info.allowNesting) tags.push('<span class="tag">🪆 цикл в цикле</span>');
    dom.levelTags.innerHTML = tags.join('');
}

// ---------- Rendering ----------

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

// Draws one frame; returns true while an animation still needs more frames
function draw(now = performance.now()) {
    if (!boardView.layer) return false;
    const { ctx, cellSize: cs, size } = boardView;
    let animating = false;

    ctx.clearRect(0, 0, size, size);
    ctx.save();

    const shake = (now - fx.shakeStart) / SHAKE_MS;
    if (shake < 1) {
        ctx.translate(Math.sin(now / 18) * 6 * (1 - shake), 0);
        animating = true;
    }

    ctx.drawImage(boardView.layer, 0, 0, size, size);
    drawExplored(ctx, cs, fx.explored.cells, fx.explored.count);
    drawTrail(ctx, cs, gameState.visited);
    drawItems(ctx, cs, gameState.traps, gameState.coinCells);

    let heroX = gameState.playerX;
    let heroY = gameState.playerY;
    if (fx.moveFrom) {
        const t = Math.min(1, Math.max(0, (now - fx.moveStart) / fx.moveDuration));
        const e = easeOutCubic(t);
        heroX = fx.moveFrom.x + (heroX - fx.moveFrom.x) * e;
        heroY = fx.moveFrom.y + (heroY - fx.moveFrom.y) * e;
        if (t < 1) animating = true;
        else fx.moveFrom = null;
    }
    drawHero(ctx, heroX * cs + cs / 2, heroY * cs + cs / 2, cs, fx.facing, customCharacterImage);

    if (fx.particles.length) {
        fx.particles = drawParticles(ctx, fx.particles, now);
        if (fx.particles.length) animating = true;
    }

    ctx.restore();
    return animating;
}

// Render on demand: frames are only requested while something changes
function requestRender() {
    if (fx.frameId === null) fx.frameId = requestAnimationFrame(renderFrame);
}

// Uses performance.now() rather than the rAF timestamp: the latter is the frame start and can
// precede the moveStart/born times recorded by game logic, which would extrapolate backwards
function renderFrame() {
    fx.frameId = null;
    if (draw(performance.now())) requestRender();
}

function spawnParticles(cellX, cellY, colors, count, options) {
    if (reducedMotion.matches) return;
    const cs = boardView.cellSize;
    fx.particles.push(...createParticles((cellX + 0.5) * cs, (cellY + 0.5) * cs, colors, count, {
        speed: cs * 2.8,
        ...options
    }));
    requestRender();
}

// ---------- HUD, messages, logs ----------

function setStat(el, value) {
    const text = String(value);
    if (el.textContent === text) return;
    el.textContent = text;
    if (reducedMotion.matches) return;
    el.classList.remove('bump');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('bump');
}

function updateUI() {
    const n = gameState.maze.length;
    setStat(dom.stepCount, gameState.steps);
    setStat(dom.coinCount, gameState.coins);
    dom.levelDisplay.textContent = gameState.customLevel ? '★' : `${gameState.level}/${LEVELS.length}`;
    dom.levelSize.textContent = `${n}×${n}`;
    dom.coinTotal.textContent = gameState.initialCoins.length;
}

function updateLineCount() {
    const lines = countCodeLines(dom.codeEditor.value);
    const limit = gameState.levelInfo && gameState.levelInfo.maxLines;
    dom.lineCount.textContent = lines;
    dom.lineLimit.textContent = limit ? ` / ${limit}` : '';
    dom.codeCounter.classList.toggle('over', Boolean(limit && lines > limit));
}

function showMessage(text, type = 'info') {
    dom.gameMessage.textContent = text;
    dom.gameMessage.className = `game-message ${type}`;
}

function clearMessage() {
    dom.gameMessage.textContent = '';
    dom.gameMessage.className = 'game-message';
}

const LOG_ICONS = { info: 'ℹ', success: '✓', error: '✕' };

function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = timestamp;
    const icon = document.createElement('span');
    icon.className = 'log-icon';
    icon.textContent = LOG_ICONS[type] || LOG_ICONS.info;
    const text = document.createElement('span');
    text.textContent = message;
    entry.append(time, icon, text);

    dom.logsContent.appendChild(entry);
    while (dom.logsContent.childElementCount > MAX_LOG_ENTRIES) {
        dom.logsContent.firstElementChild.remove();
    }
    dom.logsContent.scrollTop = dom.logsContent.scrollHeight;
}

function clearLogs() {
    dom.logsContent.replaceChildren();
}

// ---------- Code editor ----------

// Rebuilds the gutter only when the number of lines changes
function updateLineNumbers() {
    const count = dom.codeEditor.value.split('\n').length;
    if (count !== dom.lineNumbers.childElementCount) {
        const { index, kind, loops } = lineHighlight;
        clearLineHighlight();
        let html = '';
        for (let i = 1; i <= count; i++) html += `<div class="line-number">${i}</div>`;
        dom.lineNumbers.innerHTML = html;
        if (index >= 0 && index < count) highlightLine(index, kind, loops);
    }
    syncEditorScroll();
}

// Marks the running (or failing) line; enclosing repeat lines show their iteration, e.g. "2/8"
function highlightLine(index, kind, loops = []) {
    clearLineHighlight();
    const gutter = dom.lineNumbers.children;
    if (gutter[index]) gutter[index].classList.add(kind);
    for (const loop of loops) {
        const el = gutter[loop.lineIndex];
        if (!el) continue;
        el.classList.add('loop');
        el.textContent = `${loop.iteration}/${loop.times}`;
    }
    lineHighlight = { index, kind, loops };

    // Keep the highlighted line visible inside the textarea
    const { lineHeight, padTop } = editorMetrics;
    const top = padTop + index * lineHeight;
    const editor = dom.codeEditor;
    if (top < editor.scrollTop) editor.scrollTop = top - padTop;
    else if (top + lineHeight > editor.scrollTop + editor.clientHeight) {
        editor.scrollTop = top + lineHeight - editor.clientHeight + padTop;
    }

    dom.execHighlight.className = `exec-highlight ${kind}`;
    syncEditorScroll();
}

function clearLineHighlight() {
    const gutter = dom.lineNumbers.children;
    if (lineHighlight.index >= 0 && gutter[lineHighlight.index]) {
        gutter[lineHighlight.index].classList.remove('executing', 'error');
    }
    for (const loop of lineHighlight.loops) {
        const el = gutter[loop.lineIndex];
        if (!el) continue;
        el.classList.remove('loop');
        el.textContent = loop.lineIndex + 1;
    }
    lineHighlight = { index: -1, kind: '', loops: [] };
    dom.execHighlight.className = 'exec-highlight';
}

function syncEditorScroll() {
    dom.lineNumbers.scrollTop = dom.codeEditor.scrollTop;
    if (lineHighlight.index >= 0) {
        const y = editorMetrics.padTop + lineHighlight.index * editorMetrics.lineHeight - dom.codeEditor.scrollTop;
        dom.execHighlight.style.left = `${dom.lineNumbers.offsetWidth}px`;
        dom.execHighlight.style.transform = `translateY(${y}px)`;
    }
}

function setEditorCode(code) {
    dom.codeEditor.value = code;
    clearLineHighlight();
    updateLineNumbers();
    updateLineCount();
}

// Tab indents with 4 spaces; Enter after "{" keeps the indent and adds one level
function handleEditorKeys(e) {
    const editor = dom.codeEditor;
    if (editor.readOnly) return;
    const { selectionStart: start, selectionEnd: end, value } = editor;

    if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        editor.setRangeText('    ', start, end, 'end');
        editor.dispatchEvent(new Event('input'));
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const line = value.slice(lineStart, start);
        let indent = line.match(/^\s*/)[0];
        if (stripComment(line).endsWith('{')) indent += '    ';
        if (!indent) return;
        e.preventDefault();
        editor.setRangeText(`\n${indent}`, start, end, 'end');
        editor.dispatchEvent(new Event('input'));
    } else if (e.key === '}') {
        // Typing "}" on an indented empty line removes one indent level
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const before = value.slice(lineStart, start);
        if (start === end && /^ {4,}$/.test(before)) {
            e.preventDefault();
            editor.setRangeText(`${before.slice(4)}}`, lineStart, start, 'end');
            editor.dispatchEvent(new Event('input'));
        }
    }
}

function copyCode() {
    const code = dom.codeEditor.value;
    if (!code) {
        showMessage('Нет кода для копирования', 'error');
        return;
    }

    navigator.clipboard.writeText(code).then(() => {
        showMessage('✓ Код скопирован в буфер обмена', 'success');
        addLog('Код скопирован в буфер обмена', 'success');
    }).catch(() => {
        showMessage('Ошибка копирования', 'error');
        addLog('Не удалось скопировать код', 'error');
    });
}

// ---------- Modals ----------

function showTutorial() {
    dom.tutorialModal.classList.remove('hidden');
    dom.startGameButton.focus();
}

function hideTutorial() {
    dom.tutorialModal.classList.add('hidden');
}

// ---------- Timer ----------

function startTimer() {
    if (gameState.timerInterval) return;
    gameState.timerInterval = setInterval(() => {
        gameState.timer++;
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}

function formatTime(seconds) {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
    dom.timerDisplay.textContent = formatTime(gameState.timer);
}

// ---------- Code execution ----------

function compileCurrentCode() {
    return compileProgram(dom.codeEditor.value, gameState.levelInfo);
}

function reportError(lineIndex, message) {
    const text = `Ошибка на строке ${lineIndex + 1}: ${message}`;
    addLog(text, 'error');
    showMessage(text, 'error');
    highlightLine(lineIndex, 'error');
}

function setRunning(running) {
    gameState.isRunning = running;
    dom.runButton.textContent = running ? '■ Стоп' : '▶ Выполнить';
    dom.runButton.classList.toggle('is-running', running);
    dom.codeEditor.readOnly = running;
    dom.hintButton.disabled = running;
    dom.demoButton.disabled = running;
    dom.solverSelect.disabled = running;
}

const isCurrentRun = runId => runId === gameState.runId && gameState.isRunning;

function describeStep(step, index) {
    const loop = step.loops[step.loops.length - 1];
    return `Шаг ${index + 1}: ${step.text}${loop ? ` · виток ${loop.iteration}/${loop.times}` : ''}`;
}

async function executeCode() {
    if (gameState.isRunning) {
        stopExecution();
        return;
    }

    clearLogs();
    clearMessage();
    clearLineHighlight();

    // The whole program is checked up front so the hero never moves on broken code
    const { steps, error } = compileCurrentCode();
    if (error) {
        reportError(error.lineIndex, error.message);
        return;
    }
    if (steps.length === 0) {
        addLog('Нет команд для выполнения', 'error');
        showMessage('Нет команд для выполнения', 'error');
        return;
    }

    const runId = ++gameState.runId;
    const stepDelay = gameState.settings.speed;
    fx.moveDuration = Math.min(MOVE_ANIMATION_MS, stepDelay * 0.6);
    resetHero();
    setRunning(true);
    startTimer();
    addLog(`Начато выполнение программы (${steps.length} шагов)`, 'info');

    let outcome = 'incomplete';
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        highlightLine(step.lineIndex, 'executing', step.loops);

        try {
            if (runCommand(step.command) === 'finish') {
                addLog(`${describeStep(step, i)} — финиш достигнут! 🎉`, 'success');
                outcome = 'victory';
                break;
            }
            addLog(describeStep(step, i), 'success');
        } catch (err) {
            reportError(step.lineIndex, err.message);
            outcome = 'error';
            break;
        }

        await delay(stepDelay);
        if (!isCurrentRun(runId)) return;
    }

    if (outcome === 'incomplete') {
        if (isOnFinish()) {
            addLog('Программа завершена — финиш достигнут! 🎉', 'success');
            outcome = 'victory';
        } else {
            addLog('Программа завершена, но герой не на финише', 'error');
            showMessage('Программа закончилась, но вы не достигли финиша 🚩', 'error');
        }
    }

    setRunning(false);
    if (outcome !== 'error') clearLineHighlight();
    if (outcome === 'victory') winLevel();
}

function runCommand(command) {
    if (command === 'finish') return checkFinish();
    const [dx, dy] = MOVES[command];
    movePlayer(dx, dy);
}

function getMoveError(x, y, maze = gameState.maze) {
    if (!isInside(maze, x, y)) return 'Выход за границы поля';
    if (maze[y][x] === 1) return 'Столкновение со стеной';
    return null;
}

function movePlayer(dx, dy) {
    const newX = gameState.playerX + dx;
    const newY = gameState.playerY + dy;
    fx.facing = Object.keys(MOVES).find(dir => MOVES[dir][0] === dx && MOVES[dir][1] === dy);

    const error = getMoveError(newX, newY);
    if (error) {
        fx.shakeStart = reducedMotion.matches ? -Infinity : performance.now();
        requestRender();
        throw new Error(error);
    }

    if (!reducedMotion.matches) {
        fx.moveFrom = { x: gameState.playerX, y: gameState.playerY };
        fx.moveStart = performance.now();
    }
    gameState.playerX = newX;
    gameState.playerY = newY;
    gameState.steps++;

    const key = cellKey(newX, newY);
    gameState.visited.add(key);

    if (gameState.traps.has(key)) {
        gameState.steps += TRAP_PENALTY;
        gameState.traps.delete(key);
        showMessage(`⚠️ Ловушка! +${TRAP_PENALTY} шагов`, 'error');
        spawnParticles(newX, newY, [palette.trap], 14);
    }

    if (gameState.coinCells.has(key)) {
        gameState.coins++;
        gameState.coinCells.delete(key);
        showMessage('💰 Монета собрана!', 'success');
        spawnParticles(newX, newY, [palette.coin, palette.coinLight], 16);
    }

    if (isOnFinish()) {
        showMessage('🚩 Вы достигли финиша!', 'success');
    }

    updateUI();
    requestRender();
}

function isOnFinish() {
    return gameState.playerX === gameState.finishX && gameState.playerY === gameState.finishY;
}

function checkFinish() {
    if (!isOnFinish()) throw new Error('Вы не на финише');
    return 'finish';
}

function stopExecution() {
    gameState.runId++;
    setRunning(false);
    stopTimer();
    clearLineHighlight();
    addLog('Выполнение остановлено пользователем', 'info');
}

function resetLevel() {
    if (gameState.isRunning) {
        gameState.runId++;
        setRunning(false);
    }
    stopTimer();
    gameState.timer = 0;
    updateTimerDisplay();
    resetHero();
    clearMessage();
    clearLineHighlight();
    addLog('Персонаж сброшен на стартовую позицию', 'info');
}

// Stars: 3 for the shortest path, 2 within 1.5×, else 1; exceeding the line limit caps at 2
function calcStars(lines) {
    const { steps, optimalSteps, levelInfo } = gameState;
    let stars = 1;
    if (steps <= optimalSteps) stars = 3;
    else if (steps <= Math.ceil(optimalSteps * 1.5)) stars = 2;
    if (levelInfo.maxLines && lines > levelInfo.maxLines) stars = Math.min(stars, 2);
    return stars;
}

function winLevel() {
    stopTimer();
    const lines = countCodeLines(dom.codeEditor.value);
    const stars = calcStars(lines);
    recordVictory(stars);
    spawnParticles(gameState.finishX, gameState.finishY, CONFETTI_COLORS, 90, {
        speed: boardView.cellSize * 6.4, gravity: 420, life: 1500
    });
    setTimeout(() => showVictoryModal(stars, lines), reducedMotion.matches ? 0 : 650);
}

function showVictoryModal(stars, lines) {
    const { maxLines } = gameState.levelInfo;
    dom.modalSteps.textContent = gameState.steps;
    dom.modalOptimal.textContent = gameState.optimalSteps;
    dom.modalTime.textContent = formatTime(gameState.timer);
    dom.modalCoins.textContent = `${gameState.coins} / ${gameState.initialCoins.length}`;
    dom.modalLines.textContent = maxLines ? `${lines} / ${maxLines}` : lines;
    [...dom.modalStars.children].forEach((star, i) => star.classList.toggle('earned', i < stars));

    const notes = [];
    if (gameState.steps > gameState.optimalSteps) notes.push('Есть путь короче — попробуйте найти его.');
    if (maxLines && lines > maxLines) notes.push(`Уложитесь в ${maxLines} строк с помощью repeat — и получите ⭐⭐⭐.`);
    dom.modalNote.textContent = notes.join(' ');

    const isLast = !gameState.customLevel && gameState.level >= LEVELS.length;
    dom.nextLevelButton.textContent = gameState.customLevel ? 'К кампании' : isLast ? '🏆 Завершить' : 'Следующий уровень';
    dom.victoryModal.classList.remove('hidden');
    dom.nextLevelButton.focus();
}

function nextLevel() {
    dom.victoryModal.classList.add('hidden');
    if (gameState.customLevel) {
        gameState.customLevel = null;
        gameState.level = Math.min(gameState.player.progress.level, LEVELS.length);
    } else if (gameState.level >= LEVELS.length) {
        showCampaignComplete();
        return;
    } else {
        gameState.level++;
    }
    setEditorCode('');
    initGame();
    const n = gameState.maze.length;
    addLog(`Уровень ${gameState.level}: ${gameState.levelInfo.title} (${n}×${n})`, 'info');
}

function restartLevel() {
    dom.victoryModal.classList.add('hidden');
    initGame();
}

// ---------- Demo (auto-solve) mode ----------

// Animates a solver strategy: first the cells it examined, then the hero walking its route
async function runDemo() {
    if (gameState.isRunning) return;

    const solver = SOLVERS[dom.solverSelect.value];
    const result = solver.solve(
        gameState.maze,
        { x: gameState.startX, y: gameState.startY },
        { x: gameState.finishX, y: gameState.finishY }
    );

    const runId = ++gameState.runId;
    clearLogs();
    clearMessage();
    clearLineHighlight();
    resetHero();
    setRunning(true);
    addLog(`Демо: ${solver.name}`, 'info');

    // Phase 1: exploration wave, about a second long regardless of maze size
    fx.explored = { cells: result.explored, count: 0 };
    const batch = Math.max(1, Math.ceil(result.explored.length / 50));
    for (let i = 0; i < result.explored.length; i += batch) {
        fx.explored.count = Math.min(result.explored.length, i + batch);
        requestRender();
        await delay(reducedMotion.matches ? 0 : 20);
        if (!isCurrentRun(runId)) return;
    }
    addLog(`Исследовано клеток: ${result.explored.length}`, 'info');

    // Phase 2: the hero walks the route, sped up for very long routes
    const stepDelay = Math.max(25, Math.min(gameState.settings.speed / 2, DEMO_MAX_WALK_MS / Math.max(1, result.moves.length)));
    fx.moveDuration = Math.min(MOVE_ANIMATION_MS, stepDelay * 0.8);
    for (const dir of result.moves) {
        movePlayer(...MOVES[dir]);
        await delay(stepDelay);
        if (!isCurrentRun(runId)) return;
    }

    setRunning(false);
    if (result.solved) {
        const summary = `${solver.name}: шагов — ${result.moves.length}, исследовано клеток — ${result.explored.length}`;
        addLog(summary, 'success');
        addLog(`Кратчайший путь: ${gameState.optimalSteps}`, 'info');
        showMessage(`🤖 ${summary}`, 'info');
    } else {
        addLog(`${solver.name}: ${result.reason}`, 'error');
        showMessage(`🤖 ${result.reason}`, 'error');
    }
}

// ---------- Hints ----------

function pathToCommands(directions, limit = null) {
    const commands = directions.map(dir => `hero.${dir}();`);
    return limit ? commands.slice(0, limit) : commands;
}

function generateHint() {
    if (gameState.isRunning) return;

    const { steps, error } = compileCurrentCode();
    if (error) {
        reportError(error.lineIndex, error.message);
        return;
    }

    // Dry-run the current code (loops included) to continue from where it ends
    const end = simulateSteps({ ...gameState, traps: gameState.initialTraps }, steps);
    if (end.error) {
        reportError(end.error.lineIndex, `${end.error.message} — исправьте, чтобы получить подсказку`);
        return;
    }
    if (end.finished) {
        showMessage('Ваш код уже проходит уровень — нажмите «Выполнить»', 'info');
        return;
    }

    const path = bfs(gameState.maze, end.x, end.y, gameState.finishX, gameState.finishY);
    if (!path) {
        showMessage('Нет пути до финиша', 'error');
        addLog('Нет пути до финиша', 'error');
        return;
    }

    const commands = pathToCommands(path, HINT_LENGTH);
    if (path.length <= HINT_LENGTH) commands.push('hero.finish();');
    insertCodeIntoEditor(commands.join('\n'));
    const tip = gameState.levelInfo.allowRepeat ? ' Повторы можно свернуть в repeat.' : '';
    showMessage(`💡 Подсказка добавлена в конец кода.${tip}`, 'info');
    addLog(`Подсказка добавлена (${commands.length} команд)`, 'info');
}

function insertCodeIntoEditor(code) {
    let value = dom.codeEditor.value;
    if (value && !value.endsWith('\n')) value += '\n';
    setEditorCode(value + code);
    dom.codeEditor.scrollTop = dom.codeEditor.scrollHeight;
    syncEditorScroll();
}

// Starts a map from the level editor or the server
function startCustomLevel(data) {
    const level = normalizeMap(data);
    localStorage.setItem('customLevel', JSON.stringify(level));
    gameState.customLevel = level;
    closeLevelEditor();
    setEditorCode('');
    initGame();
    addLog(`Загружена карта «${level.name || 'без названия'}» — прогресс кампании не меняется`, 'info');
}

// ---------- Character upload ----------

function handleCharacterUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => {
            customCharacterImage = img;
            localStorage.setItem('customCharacter', event.target.result);
            requestRender();
            showMessage('✓ Персонаж загружен!', 'success');
            addLog('Персонаж успешно загружен', 'success');
        };
        img.onerror = () => {
            showMessage('Ошибка загрузки изображения', 'error');
            addLog('Не удалось загрузить изображение', 'error');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

// Event listeners setup
function setupEventListeners() {
    dom.runButton.addEventListener('click', executeCode);
    dom.resetButton.addEventListener('click', resetLevel);
    dom.demoButton.addEventListener('click', runDemo);
    dom.nextLevelButton.addEventListener('click', nextLevel);
    dom.restartButton.addEventListener('click', restartLevel);
    dom.hintButton.addEventListener('click', generateHint);
    dom.helpButton.addEventListener('click', showTutorial);
    dom.startGameButton.addEventListener('click', hideTutorial);
    dom.copyButton.addEventListener('click', copyCode);
    dom.clearLogsButton.addEventListener('click', clearLogs);
    dom.themeButton.addEventListener('click', toggleTheme);

    dom.playerButton.addEventListener('click', openPlayerModal);
    dom.playerStartBtn.addEventListener('click', submitPlayerName);
    dom.playerNameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitPlayerName();
    });
    dom.introCloseBtn.addEventListener('click', () => dom.introModal.classList.add('hidden'));
    dom.finishRestartBtn.addEventListener('click', restartCampaign);
    dom.finishSwitchBtn.addEventListener('click', () => {
        dom.finishModal.classList.add('hidden');
        openPlayerModal();
    });

    dom.settingsButton.addEventListener('click', openSettings);
    dom.settingsCancelBtn.addEventListener('click', closeSettings);
    dom.settingsSaveBtn.addEventListener('click', saveSettings);
    dom.settingSpeed.addEventListener('input', () => {
        dom.settingSpeedValue.textContent = `${dom.settingSpeed.value} мс`;
    });

    dom.codeEditor.addEventListener('keydown', handleEditorKeys);
    dom.codeEditor.addEventListener('input', () => {
        if (lineHighlight.kind === 'error') clearLineHighlight();
        updateLineNumbers();
        updateLineCount();
    });
    dom.codeEditor.addEventListener('scroll', syncEditorScroll);

    const blockingModals = [dom.playerModal, dom.introModal, dom.finishModal, dom.victoryModal];
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (blockingModals.every(isHidden)) executeCode();
            return;
        }
        if (e.key !== 'Escape') return;
        if (!isHidden(dom.editorModal)) closeLevelEditor();
        else if (!isHidden(dom.settingsModal)) closeSettings();
        else if (!isHidden(dom.introModal)) dom.introModal.classList.add('hidden');
        else if (!isHidden(dom.tutorialModal)) hideTutorial();
        else if (!isHidden(dom.playerModal) && gameState.player) dom.playerModal.classList.add('hidden');
        else if (gameState.isRunning) stopExecution();
    });

    // Character upload
    dom.uploadCharacterButton.addEventListener('click', () => dom.characterInput.click());
    dom.characterInput.addEventListener('change', handleCharacterUpload);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initEditorDOM();
    loadSettings();
    initTheme();
    initGame();
    updateLineNumbers();
    setupEventListeners();
    setupEditorListeners();

    // Continue as the last player, or ask for a name first
    const lastPlayer = localStorage.getItem(CURRENT_PLAYER_KEY);
    if (lastPlayer && readPlayers()[lastPlayer]) selectPlayer(lastPlayer);
    else openPlayerModal();
});
