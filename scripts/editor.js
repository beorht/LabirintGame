// UI layer: level editor and the saved-maps list (optional Express backend).

const EDITOR_MAX_PX = 520;
const EDITOR_DEFAULT_SIZE = 14;

// Editor state
const editorState = {
    maze: [],
    traps: new Set(),
    coins: new Set(),
    startX: 1,
    startY: 1,
    finishX: 10,
    finishY: 3,
    currentTool: 'path',
    isDrawing: false,
    lastCell: null,
    initialized: false
};

let editorView;

function initEditorDOM() {
    [
        'editorModal', 'editorCanvas', 'editorMessage', 'editorButton', 'editorCloseBtn',
        'editorPlayBtn', 'editorSaveBtn', 'editorClearBtn', 'editorSizeSelect', 'mapNameInput', 'mapsList'
    ].forEach(id => { dom[id] = document.getElementById(id); });

    editorView = createBoardView(dom.editorCanvas, EDITOR_MAX_PX);

    let options = '';
    for (let n = MIN_GRID_SIZE; n <= MAX_GRID_SIZE; n++) options += `<option value="${n}">${n}×${n}</option>`;
    dom.editorSizeSelect.innerHTML = options;
    dom.editorSizeSelect.value = EDITOR_DEFAULT_SIZE;
}

function openLevelEditor() {
    dom.editorModal.classList.remove('hidden');
    if (!editorState.initialized) {
        initEditorCanvas();
        editorState.initialized = true;
        if (localStorage.getItem('customLevel')) loadCustomLevelIntoEditor();
        else clearEditorMaze();
    }
    loadMapsFromServer();
}

function closeLevelEditor() {
    dom.editorModal.classList.add('hidden');
}

function initEditorCanvas() {
    const canvas = dom.editorCanvas;
    canvas.addEventListener('pointerdown', e => {
        editorState.isDrawing = true;
        editorState.lastCell = null;
        canvas.setPointerCapture(e.pointerId);
        paintAt(e);
    });
    canvas.addEventListener('pointermove', e => {
        if (editorState.isDrawing) paintAt(e);
    });
    const stop = () => { editorState.isDrawing = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
}

function setEditorMessage(text, type = '') {
    dom.editorMessage.textContent = text;
    dom.editorMessage.className = `editor-message ${type}`;
}

// Resizes the editor canvas when the grid size changes
function setEditorGrid(maze) {
    editorState.maze = maze;
    const size = maze.length;
    if (editorView.gridSize !== size) {
        resizeBoardView(editorView, size);
        dom.editorCanvas.style.width = `${editorView.size}px`;
    }
    dom.editorSizeSelect.value = size;
}

function clearEditorMaze() {
    const size = Number(dom.editorSizeSelect.value) || EDITOR_DEFAULT_SIZE;
    setEditorGrid(createEmptyMaze(size));
    editorState.startX = 1;
    editorState.startY = 1;
    editorState.finishX = size - 2;
    editorState.finishY = size - 2;
    editorState.traps = new Set();
    editorState.coins = new Set();
    setEditorMessage('');
    drawEditorMaze();
}

function drawEditorMaze() {
    if (!editorState.maze.length) return;
    drawStaticBoard(editorView.ctx, editorView.cellSize, editorState);
    drawItems(editorView.ctx, editorView.cellSize, editorState.traps, editorState.coins);
}

// Maps a pointer position to a cell; works regardless of CSS scaling or scroll
function getCellFromEvent(e) {
    const rect = dom.editorCanvas.getBoundingClientRect();
    const size = editorState.maze.length;
    return {
        x: Math.floor((e.clientX - rect.left) / rect.width * size),
        y: Math.floor((e.clientY - rect.top) / rect.height * size)
    };
}

function paintAt(e) {
    const { x, y } = getCellFromEvent(e);
    const key = cellKey(x, y);
    if (key === editorState.lastCell) return;
    editorState.lastCell = key;
    applyEditorTool(x, y);
}

function applyEditorTool(x, y) {
    const s = editorState;
    if (!isInside(s.maze, x, y)) return;

    const size = s.maze.length;
    const key = cellKey(x, y);
    const isStart = x === s.startX && y === s.startY;
    const isFinish = x === s.finishX && y === s.finishY;
    const clearItems = () => {
        s.traps.delete(key);
        s.coins.delete(key);
    };

    switch (s.currentTool) {
        case 'wall':
            if (isStart || isFinish) return;
            s.maze[y][x] = 1;
            clearItems();
            break;
        case 'path':
            s.maze[y][x] = 0;
            clearItems();
            break;
        case 'start':
        case 'finish':
            if (isBorder(size, x, y) || (s.currentTool === 'start' ? isFinish : isStart)) return;
            s[`${s.currentTool}X`] = x;
            s[`${s.currentTool}Y`] = y;
            s.maze[y][x] = 0;
            clearItems();
            break;
        case 'trap':
        case 'coin': {
            if (isBorder(size, x, y) || s.maze[y][x] !== 0 || isStart || isFinish) return;
            const [add, remove] = s.currentTool === 'trap' ? [s.traps, s.coins] : [s.coins, s.traps];
            add.add(key);
            remove.delete(key);
            break;
        }
    }

    drawEditorMaze();
}

function validateEditorMaze() {
    const s = editorState;
    const path = bfs(s.maze, s.startX, s.startY, s.finishX, s.finishY);
    return path !== null && path.length > 0;
}

function buildEditorMapData() {
    const s = editorState;
    return {
        name: dom.mapNameInput.value.trim() || `Map ${new Date().toLocaleString('ru')}`,
        maze: s.maze.map(row => [...row]),
        startX: s.startX,
        startY: s.startY,
        finishX: s.finishX,
        finishY: s.finishY,
        traps: Array.from(s.traps),
        coins: Array.from(s.coins)
    };
}

async function saveCustomLevel() {
    if (!validateEditorMaze()) {
        setEditorMessage('❌ Нет пути от старта до финиша!', 'error');
        return;
    }

    const data = buildEditorMapData();
    localStorage.setItem('customLevel', JSON.stringify(data));

    try {
        const res = await fetch('/api/maps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(res.statusText);
        dom.mapNameInput.value = data.name;
        setEditorMessage('✅ Карта сохранена!', 'success');
        loadMapsFromServer();
    } catch (err) {
        setEditorMessage('💾 Сохранено локально (сервер недоступен)', 'error');
    }
}

function loadMapIntoEditor(data) {
    const map = normalizeMap(data);
    setEditorGrid(map.maze);
    editorState.startX = map.startX;
    editorState.startY = map.startY;
    editorState.finishX = map.finishX;
    editorState.finishY = map.finishY;
    editorState.traps = new Set(map.traps);
    editorState.coins = new Set(map.coins);
    if (map.name) dom.mapNameInput.value = map.name;
    drawEditorMaze();
}

function loadCustomLevelIntoEditor() {
    const saved = localStorage.getItem('customLevel');
    if (!saved) {
        clearEditorMaze();
        return;
    }
    loadMapIntoEditor(JSON.parse(saved));
    setEditorMessage('✅ Уровень загружен!', 'success');
}

async function fetchMap(id) {
    const res = await fetch(`/api/maps/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
}

async function loadMapsFromServer() {
    dom.mapsList.innerHTML = '<div class="maps-loading">Загрузка...</div>';
    try {
        const res = await fetch('/api/maps');
        if (!res.ok) throw new Error(res.statusText);
        const maps = await res.json();
        if (maps.length === 0) {
            dom.mapsList.innerHTML = '<div class="maps-empty">Нет сохранённых карт</div>';
            return;
        }
        dom.mapsList.innerHTML = maps.map(m => `
            <div class="map-item">
                <div class="map-item-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
                <div class="map-item-date">${new Date(m.createdAt).toLocaleString('ru')}</div>
                <div class="map-item-actions">
                    <button class="btn-tertiary" data-action="load" data-id="${escapeHtml(m.id)}">📂 Загр.</button>
                    <button class="btn-tertiary" data-action="play" data-id="${escapeHtml(m.id)}">▶ Играть</button>
                    <button class="btn-tertiary" data-action="delete" data-id="${escapeHtml(m.id)}">🗑 Удал.</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        dom.mapsList.innerHTML = '<div class="maps-empty">Сервер карт недоступен</div>';
    }
}

async function loadMapFromServer(id) {
    try {
        const data = await fetchMap(id);
        loadMapIntoEditor(data);
        setEditorMessage(`✅ Карта «${data.name}» загружена!`, 'success');
    } catch (err) {
        setEditorMessage('❌ Ошибка загрузки карты', 'error');
    }
}

async function playMapFromServer(id) {
    try {
        startCustomLevel(await fetchMap(id));
    } catch (err) {
        setEditorMessage('❌ Ошибка запуска карты', 'error');
    }
}

async function deleteMapFromServer(id) {
    if (!confirm('Удалить карту?')) return;
    try {
        const res = await fetch(`/api/maps/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(res.statusText);
        loadMapsFromServer();
    } catch (err) {
        setEditorMessage('❌ Ошибка удаления карты', 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
}

// Playing does not require the backend: the map is kept in localStorage
function playCustomLevel() {
    if (!validateEditorMaze()) {
        setEditorMessage('❌ Нет пути от старта до финиша!', 'error');
        return;
    }
    startCustomLevel(buildEditorMapData());
}

function setupEditorListeners() {
    dom.editorButton.addEventListener('click', openLevelEditor);
    dom.editorCloseBtn.addEventListener('click', closeLevelEditor);
    dom.editorPlayBtn.addEventListener('click', playCustomLevel);
    dom.editorSaveBtn.addEventListener('click', saveCustomLevel);
    dom.editorClearBtn.addEventListener('click', clearEditorMaze);
    dom.editorSizeSelect.addEventListener('change', () => {
        clearEditorMaze();
        setEditorMessage(`Новое поле ${dom.editorSizeSelect.value}×${dom.editorSizeSelect.value}`, 'success');
    });

    const mapActions = { load: loadMapFromServer, play: playMapFromServer, delete: deleteMapFromServer };
    dom.mapsList.addEventListener('click', e => {
        const button = e.target.closest('button[data-action]');
        if (button) mapActions[button.dataset.action](button.dataset.id);
    });

    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toolButtons.forEach(b => b.classList.toggle('active', b === btn));
            editorState.currentTool = btn.dataset.tool;
        });
    });
}
