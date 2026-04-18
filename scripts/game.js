// Game constants
const GRID_SIZE = 14;
const CELL_SIZE = 24;
const EXECUTION_DELAY = 300;

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
    traps: new Set(),
    collectedCoins: new Set(),
    isRunning: false,
    currentCommandIndex: 0,
    timer: 0,
    timerInterval: null
};

// DOM elements
let canvas, ctx, codeEditor, lineNumbers, copyButton, runButton, resetButton;
let hintButton, gameMessage, logsContent, victoryModal, tutorialModal;
let stepCountDisplay, timerDisplay, levelDisplay, coinCountDisplay, lineCountDisplay;
let uploadCharacterButton, characterInput;

// Custom character
let customCharacterImage = null;

// Initialize DOM elements
function initDOM() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    codeEditor = document.getElementById('codeEditor');
    lineNumbers = document.getElementById('lineNumbers');
    copyButton = document.getElementById('copyButton');
    runButton = document.getElementById('runButton');
    resetButton = document.getElementById('resetButton');
    hintButton = document.getElementById('hintButtonHUD');
    gameMessage = document.getElementById('gameMessage');
    logsContent = document.getElementById('logsContent');
    victoryModal = document.getElementById('victoryModal');
    tutorialModal = document.getElementById('tutorialModal');
    stepCountDisplay = document.getElementById('stepCount');
    timerDisplay = document.getElementById('timerDisplay');
    levelDisplay = document.getElementById('levelDisplay');
    coinCountDisplay = document.getElementById('coinCount');
    lineCountDisplay = document.getElementById('lineCount');

    uploadCharacterButton = document.getElementById('uploadCharacterButton');
    characterInput = document.getElementById('characterInput');

    canvas.width = GRID_SIZE * CELL_SIZE;
    canvas.height = GRID_SIZE * CELL_SIZE;

    // Load custom character from localStorage
    const savedCharacter = localStorage.getItem('customCharacter');
    if (savedCharacter) {
        customCharacterImage = new Image();
        customCharacterImage.src = savedCharacter;
    }
}

// Theme management
function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Game initialization
function initGame() {
    generateMaze();
    placeObstacles();
    gameState.steps = 0;
    gameState.coins = 0;
    gameState.playerX = gameState.startX;
    gameState.playerY = gameState.startY;
    gameState.traps.clear();
    gameState.collectedCoins.clear();
    gameState.timer = 0;
    gameState.isRunning = false;
    gameState.currentCommandIndex = 0;
    updateUI();
    draw();
    clearMessage();
}

function generateMaze() {
    const mazeTemplate = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    ];

    gameState.maze = mazeTemplate.map(row => [...row]);
}

function placeObstacles() {
    const trapCount = gameState.level === 1 ? 1 : 4 + (gameState.level * 2);
    const coinCount = gameState.level === 1 ? 2 : 5;
    const passableCells = [];

    for (let y = 1; y < GRID_SIZE - 1; y++) {
        for (let x = 1; x < GRID_SIZE - 1; x++) {
            if (gameState.maze[y][x] === 0 && !(x === gameState.startX && y === gameState.startY) && !(x === gameState.finishX && y === gameState.finishY)) {
                passableCells.push([x, y]);
            }
        }
    }

    passableCells.sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(trapCount, passableCells.length); i++) {
        const [x, y] = passableCells[i];
        gameState.traps.add(`${x},${y}`);
    }

    for (let i = trapCount; i < trapCount + Math.min(coinCount, passableCells.length - trapCount); i++) {
        const [x, y] = passableCells[i];
        gameState.collectedCoins.add(`${x},${y}`);
    }
}

function draw() {
    ctx.fillStyle = getColor('--path-color');
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw maze
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (gameState.maze[y][x] === 1) {
                ctx.fillStyle = getColor('--wall-color');
                ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }
    }

    // Draw traps
    gameState.traps.forEach(trap => {
        const [x, y] = trap.split(',').map(Number);
        ctx.fillStyle = getColor('--trap-color');
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        ctx.fillStyle = getColor('--text-primary');
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2);
    });

    // Draw coins
    gameState.collectedCoins.forEach(coin => {
        const [x, y] = coin.split(',').map(Number);
        ctx.fillStyle = getColor('--coin-color');
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        ctx.fillStyle = getColor('--text-primary');
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2);
    });

    // Draw start
    ctx.fillStyle = getColor('--start-color');
    ctx.fillRect(gameState.startX * CELL_SIZE, gameState.startY * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    ctx.fillStyle = getColor('--bg-secondary');
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', gameState.startX * CELL_SIZE + CELL_SIZE / 2, gameState.startY * CELL_SIZE + CELL_SIZE / 2);

    // Draw finish
    ctx.fillStyle = getColor('--finish-color');
    ctx.fillRect(gameState.finishX * CELL_SIZE, gameState.finishY * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    ctx.fillStyle = getColor('--bg-secondary');
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚩', gameState.finishX * CELL_SIZE + CELL_SIZE / 2, gameState.finishY * CELL_SIZE + CELL_SIZE / 2);

    // Draw player
    const playerX = gameState.playerX * CELL_SIZE;
    const playerY = gameState.playerY * CELL_SIZE;

    if (customCharacterImage && customCharacterImage.complete) {
        // Draw custom character image
        const padding = CELL_SIZE / 6;
        ctx.drawImage(customCharacterImage, playerX + padding, playerY + padding, CELL_SIZE - padding * 2, CELL_SIZE - padding * 2);
    } else {
        // Draw default circle
        ctx.fillStyle = getColor('--player-color');
        ctx.beginPath();
        ctx.arc(playerX + CELL_SIZE / 2, playerY + CELL_SIZE / 2, CELL_SIZE / 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw grid lines
    ctx.strokeStyle = getColor('--border-color');
    ctx.lineWidth = 1;

    for (let x = 0; x <= GRID_SIZE; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL_SIZE, 0);
        ctx.lineTo(x * CELL_SIZE, GRID_SIZE * CELL_SIZE);
        ctx.stroke();
    }

    for (let y = 0; y <= GRID_SIZE; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL_SIZE);
        ctx.lineTo(GRID_SIZE * CELL_SIZE, y * CELL_SIZE);
        ctx.stroke();
    }
}

function getColor(cssVar) {
    return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

function updateUI() {
    stepCountDisplay.textContent = gameState.steps;
    levelDisplay.textContent = gameState.level;
    coinCountDisplay.textContent = gameState.coins;
    lineCountDisplay.textContent = codeEditor.value.split('\n').filter(l => l.trim()).length;
}

function showMessage(text, type = 'info') {
    gameMessage.textContent = text;
    gameMessage.className = `game-message ${type}`;
}

function clearMessage() {
    gameMessage.textContent = '';
    gameMessage.className = 'game-message';
}

function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;

    if (type === 'error') {
        logEntry.textContent = `[${timestamp}] ❌ ${message}`;
    } else if (type === 'success') {
        logEntry.textContent = `[${timestamp}] ✓ ${message}`;
    } else {
        logEntry.textContent = `[${timestamp}] ℹ ${message}`;
    }

    logsContent.appendChild(logEntry);
    logsContent.scrollTop = logsContent.scrollHeight;
}

function clearLogs() {
    logsContent.innerHTML = '';
}

function updateLineNumbers(errorLineIndex = -1) {
    const lines = codeEditor.value.split('\n');
    lineNumbers.innerHTML = '';

    lines.forEach((line, index) => {
        const lineNum = document.createElement('div');
        lineNum.className = 'line-number';
        lineNum.id = `line-${index + 1}`;

        if (errorLineIndex === index) {
            lineNum.classList.add('error');
            lineNum.innerHTML = `❌ ${index + 1}`;
        } else if (index === gameState.currentCommandIndex) {
            lineNum.classList.add('executing');
            lineNum.innerHTML = `▶ ${index + 1}`;
        } else {
            lineNum.textContent = index + 1;
        }

        lineNumbers.appendChild(lineNum);
    });
}

function copyCode() {
    const code = codeEditor.value;
    if (!code) {
        showMessage('Нет кода для копирования', 'error');
        return;
    }

    navigator.clipboard.writeText(code).then(() => {
        showMessage('✓ Код скопирован в буфер обмена', 'success');
        addLog('Код скопирован в буфер обмена', 'success');
    }).catch(() => {
        showMessage('Ошибка копирования', 'error');
        addLog('Error: Не удалось скопировать код', 'error');
    });
}

function showTutorial() {
    tutorialModal.classList.remove('hidden');
}

function hideTutorial() {
    tutorialModal.classList.add('hidden');
    localStorage.setItem('tutorialSeen', 'true');
}

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

function updateTimerDisplay() {
    const minutes = Math.floor(gameState.timer / 60);
    const seconds = gameState.timer % 60;
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function executeCode() {
    const code = codeEditor.value;
    const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

    if (lines.length === 0) {
        addLog('Нет команд для выполнения', 'error');
        showMessage('Нет команд для выполнения', 'error');
        return;
    }

    gameState.isRunning = true;
    runButton.disabled = true;
    clearMessage();
    clearLogs();
    startTimer();

    addLog(`Начато выполнение программы (${lines.length} команд)`, 'info');

    const hero = {
        up: () => movePlayer(0, -1),
        down: () => movePlayer(0, 1),
        left: () => movePlayer(-1, 0),
        right: () => movePlayer(1, 0),
        finish: () => checkFinish()
    };

    for (let i = 0; i < lines.length && gameState.isRunning; i++) {
        gameState.currentCommandIndex = i;
        updateLineNumbers();
        const line = lines[i];

        try {
            const match = line.match(/hero\.(\w+)\(\)/);
            if (!match) {
                throw new Error(`Невалидная команда: ${line}`);
            }

            const command = match[1];
            if (hero[command]) {
                const result = hero[command]();
                if (result === 'finish') {
                    addLog(`Команда ${i + 1}: ${line} - Финиш достигнут! 🎉`, 'success');
                    stopTimer();
                    gameState.isRunning = false;
                    gameState.currentCommandIndex = -1;
                    updateLineNumbers(-1);
                    showVictoryModal();
                    break;
                } else {
                    addLog(`Команда ${i + 1}: ${line}`, 'success');
                }
            } else {
                throw new Error(`Неизвестная команда: ${command}()`);
            }

            draw();
            await new Promise(resolve => setTimeout(resolve, EXECUTION_DELAY));
        } catch (error) {
            const errorMsg = `Ошибка на строке ${i + 1}: ${error.message}`;
            addLog(`Error: ${errorMsg}`, 'error');
            showMessage(errorMsg, 'error');
            gameState.isRunning = false;
            gameState.currentCommandIndex = -1;
            updateLineNumbers(i);
            break;
        }
    }

    // Проверяем финиш после выполнения всех команд
    if (gameState.isRunning === true && gameState.currentCommandIndex >= lines.length) {
        if (gameState.playerX === gameState.finishX && gameState.playerY === gameState.finishY) {
            addLog('Программа завершена - Финиш достигнут! 🎉', 'success');
            stopTimer();
            gameState.isRunning = false;
            gameState.currentCommandIndex = -1;
            updateLineNumbers(-1);
            showVictoryModal();
        } else {
            addLog('Error: Программа завершена, но герой не на финише!', 'error');
            showMessage('Программа закончилась, но вы не достигли финиша 🚩', 'error');
            gameState.isRunning = false;
            gameState.currentCommandIndex = -1;
            updateLineNumbers(-1);
        }
    }

    if (gameState.isRunning === false && !victoryModal.classList.contains('active')) {
        gameState.isRunning = false;
        runButton.disabled = false;
    }
}

function movePlayer(dx, dy) {
    const newX = gameState.playerX + dx;
    const newY = gameState.playerY + dy;

    if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
        throw new Error('Выход за границы поля');
    }

    if (gameState.maze[newY][newX] === 1) {
        throw new Error('Столкновение со стеной');
    }

    gameState.playerX = newX;
    gameState.playerY = newY;
    gameState.steps++;
    updateUI();

    const cellKey = `${newX},${newY}`;
    if (gameState.traps.has(cellKey)) {
        gameState.steps += 5;
        gameState.traps.delete(cellKey);
        showMessage('⚠️ Ловушка! +5 шагов', 'error');
        updateUI();
    }

    if (gameState.collectedCoins.has(cellKey)) {
        gameState.coins++;
        gameState.collectedCoins.delete(cellKey);
        showMessage('💰 Монета собрана!', 'success');
        updateUI();
    }

    if (newX === gameState.finishX && newY === gameState.finishY) {
        showMessage('🚩 Вы достигли финиша!', 'success');
    }
}

function checkFinish() {
    if (gameState.playerX === gameState.finishX && gameState.playerY === gameState.finishY) {
        return 'finish';
    } else {
        throw new Error('Вы не на финише');
    }
}

function stopExecution() {
    gameState.isRunning = false;
    stopTimer();
    gameState.currentCommandIndex = -1;
    updateLineNumbers(-1);
    runButton.disabled = false;
    addLog('Выполнение остановлено пользователем', 'info');
}

function showVictoryModal() {
    document.getElementById('modalSteps').textContent = gameState.steps;
    document.getElementById('modalTime').textContent = timerDisplay.textContent;
    document.getElementById('modalCoins').textContent = gameState.coins;
    document.getElementById('modalCommands').textContent = codeEditor.value.split('\n').filter(l => l.trim()).length;
    victoryModal.classList.add('active');
}

function nextLevel() {
    gameState.level++;
    victoryModal.classList.remove('active');
    codeEditor.value = '';
    lineCountDisplay.textContent = '0';
    gameState.currentCommandIndex = -1;
    initGame();
    updateLineNumbers(-1);
}

function restartLevel() {
    victoryModal.classList.remove('active');
    codeEditor.value = '';
    lineCountDisplay.textContent = '0';
    gameState.currentCommandIndex = -1;
    initGame();
    updateLineNumbers(-1);
}

// BFS for pathfinding
function bfs(startX, startY, endX, endY) {
    const queue = [[startX, startY, []]];
    const visited = new Set();
    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
        const [x, y, path] = queue.shift();

        if (x === endX && y === endY) {
            return path;
        }

        const directions = [
            [0, -1, 'up'],
            [0, 1, 'down'],
            [1, 0, 'right'],
            [-1, 0, 'left']
        ];

        for (const [dx, dy, dir] of directions) {
            const nx = x + dx, ny = y + dy;
            const key = `${nx},${ny}`;

            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE &&
                !visited.has(key) && gameState.maze[ny][nx] === 0) {
                visited.add(key);
                queue.push([nx, ny, [...path, dir]]);
            }
        }
    }

    return null;
}

function pathToCommands(directions, limit = null) {
    let commands = directions.map(dir => `hero.${dir}();`);
    if (limit && commands.length > limit) {
        commands = commands.slice(0, limit);
    }
    return commands;
}

function generateHint() {
    const path = bfs(gameState.playerX, gameState.playerY, gameState.finishX, gameState.finishY);
    if (!path) {
        showMessage('Нет пути до финиша', 'error');
        addLog('Error: Нет пути до финиша', 'error');
        return;
    }

    const commands = pathToCommands(path, 5);
    const text = commands.join('\n');
    insertCodeIntoEditor(text);
    showMessage('💡 Подсказка добавлена в конец кода', 'info');
    addLog(`Подсказка добавлена (${commands.length} команд)`, 'info');
}

function insertCodeIntoEditor(code) {
    if (codeEditor.value && !codeEditor.value.endsWith('\n')) {
        codeEditor.value += '\n';
    }
    codeEditor.value += code;
    const codeLines = codeEditor.value.split('\n').filter(l => l.trim()).length;
    lineCountDisplay.textContent = codeLines;
    updateLineNumbers(-1);
}

// Event listeners setup
function setupEventListeners() {
    runButton.addEventListener('click', executeCode);
    resetButton.addEventListener('click', () => {
        gameState.playerX = gameState.startX;
        gameState.playerY = gameState.startY;
        gameState.steps = 0;
        gameState.timer = 0;
        gameState.isRunning = false;
        if (gameState.timerInterval) stopTimer();
        runButton.disabled = false;
        stopButton.disabled = true;
        clearLogs();
        clearMessage();
        gameState.currentCommandIndex = -1;
        updateLineNumbers(-1);
        updateUI();
        draw();
        addLog('Персонаж сброшен на стартовую позицию', 'info');
    });

    // Keyboard shortcut for stopping execution (Escape key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && gameState.isRunning) {
            stopExecution();
        }
    });
    document.getElementById('nextLevelButton').addEventListener('click', nextLevel);
    document.getElementById('restartButton').addEventListener('click', restartLevel);

    codeEditor.addEventListener('input', () => {
        const totalLines = codeEditor.value.split('\n').length;
        const codeLines = codeEditor.value.split('\n').filter(l => l.trim()).length;
        lineCountDisplay.textContent = codeLines;
        updateLineNumbers(-1);
    });

    codeEditor.addEventListener('scroll', () => {
        lineNumbers.scrollTop = codeEditor.scrollTop;
    });

    hintButton.addEventListener('click', () => {
        if (!tutorialModal.classList.contains('hidden')) {
            // Туториал открыт - закрываем его и добавляем подсказку пути
            hideTutorial();
            generateHint();
        } else {
            // Туториал закрыт - открываем его
            showTutorial();
        }
    });
    copyButton.addEventListener('click', copyCode);
    document.getElementById('startGameButton').addEventListener('click', hideTutorial);

    // Character upload
    uploadCharacterButton.addEventListener('click', () => {
        characterInput.click();
    });

    characterInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                customCharacterImage = img;
                localStorage.setItem('customCharacter', event.target.result);
                draw();
                showMessage('✓ Персонаж загружен!', 'success');
                addLog('Персонаж успешно загружен', 'success');
            };
            img.onerror = () => {
                showMessage('Ошибка загрузки изображения', 'error');
                addLog('Error: Не удалось загрузить изображение', 'error');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initTheme();
    initGame();
    updateLineNumbers(-1);
    setupEventListeners();

    // Всегда показываем туториал при входе
    showTutorial();
});
