const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const MAPS_DIR = path.join(__dirname, 'maps');
const MIN_GRID_SIZE = 5;
const MAX_GRID_SIZE = 25;
const MAP_ID_PATTERN = /^map_\d+$/;

app.use(express.json({ limit: '100kb' }));

// Serve only the frontend, not server.js / node_modules / maps
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

// Resolves a map id to its file; rejects anything that could escape MAPS_DIR
function mapFile(id) {
    return MAP_ID_PATTERN.test(id) ? path.join(MAPS_DIR, `${id}.json`) : null;
}

function validateMap(body) {
    if (!body || typeof body !== 'object') return 'Invalid body';
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 40) return 'Invalid name';
    const size = Array.isArray(body.maze) ? body.maze.length : 0;
    const mazeOk = size >= MIN_GRID_SIZE && size <= MAX_GRID_SIZE &&
        body.maze.every(row => Array.isArray(row) && row.length === size && row.every(c => c === 0 || c === 1));
    if (!mazeOk) return `Invalid maze: expected a square grid ${MIN_GRID_SIZE}..${MAX_GRID_SIZE} of 0/1`;

    const isCell = v => Number.isInteger(v) && v >= 0 && v < size;
    const isCellKey = key => typeof key === 'string' && /^\d+,\d+$/.test(key) && key.split(',').map(Number).every(isCell);
    if (![body.startX, body.startY, body.finishX, body.finishY].every(isCell)) return 'Invalid start/finish';
    if (!Array.isArray(body.traps) || !body.traps.every(isCellKey)) return 'Invalid traps';
    if (!Array.isArray(body.coins) || !body.coins.every(isCellKey)) return 'Invalid coins';
    return null;
}

async function readMap(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

// GET /api/maps — список всех карт отсортированный по дате (новые сверху)
app.get('/api/maps', async (req, res) => {
    try {
        const files = (await fs.readdir(MAPS_DIR)).filter(f => f.endsWith('.json'));
        const maps = await Promise.all(files.map(async f => {
            const data = await readMap(path.join(MAPS_DIR, f));
            return { id: data.id, name: data.name, createdAt: data.createdAt };
        }));
        maps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(maps);
    } catch (err) {
        console.error('Error reading maps:', err);
        res.status(500).json({ error: 'Failed to read maps' });
    }
});

// GET /api/maps/:id — получить полные данные карты
app.get('/api/maps/:id', async (req, res) => {
    const file = mapFile(req.params.id);
    if (!file) return res.status(400).json({ error: 'Invalid map id' });
    try {
        res.json(await readMap(file));
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Map not found' });
        console.error('Error reading map:', err);
        res.status(500).json({ error: 'Failed to read map' });
    }
});

// POST /api/maps — сохранить новую карту
app.post('/api/maps', async (req, res) => {
    const error = validateMap(req.body);
    if (error) return res.status(400).json({ error });
    try {
        const { name, maze, startX, startY, finishX, finishY, traps, coins } = req.body;
        const id = `map_${Date.now()}`;
        const data = { id, name: name.trim(), maze, startX, startY, finishX, finishY, traps, coins, createdAt: new Date().toISOString() };
        await fs.writeFile(path.join(MAPS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
        res.json({ id, name: data.name, createdAt: data.createdAt });
    } catch (err) {
        console.error('Error saving map:', err);
        res.status(500).json({ error: 'Failed to save map' });
    }
});

// DELETE /api/maps/:id — удалить карту
app.delete('/api/maps/:id', async (req, res) => {
    const file = mapFile(req.params.id);
    if (!file) return res.status(400).json({ error: 'Invalid map id' });
    try {
        await fs.unlink(file);
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Map not found' });
        console.error('Error deleting map:', err);
        res.status(500).json({ error: 'Failed to delete map' });
    }
});

const PORT = process.env.PORT || 3000;
fs.mkdir(MAPS_DIR, { recursive: true }).then(() => {
    app.listen(PORT, () => {
        console.log(`🎮 Maze Quest сервер запущен на http://localhost:${PORT}`);
        console.log(`📂 Карты сохраняются в: ${MAPS_DIR}`);
    });
});
