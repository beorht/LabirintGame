const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const MAPS_DIR = path.join(__dirname, 'maps');

if (!fs.existsSync(MAPS_DIR)) {
    fs.mkdirSync(MAPS_DIR);
}

app.use(express.json());
app.use(express.static(__dirname));

// GET /api/maps — список всех карт отсортированный по дате (новые сверху)
app.get('/api/maps', (req, res) => {
    try {
        const files = fs.readdirSync(MAPS_DIR).filter(f => f.endsWith('.json'));
        const maps = files.map(f => {
            const data = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, f), 'utf8'));
            return { id: data.id, name: data.name, createdAt: data.createdAt };
        });
        maps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(maps);
    } catch (err) {
        console.error('Error reading maps:', err);
        res.status(500).json({ error: 'Failed to read maps' });
    }
});

// GET /api/maps/:id — получить полные данные карты
app.get('/api/maps/:id', (req, res) => {
    try {
        const file = path.join(MAPS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(file)) {
            return res.status(404).json({ error: 'Map not found' });
        }
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        res.json(data);
    } catch (err) {
        console.error('Error reading map:', err);
        res.status(500).json({ error: 'Failed to read map' });
    }
});

// POST /api/maps — сохранить новую карту
app.post('/api/maps', (req, res) => {
    try {
        const id = `map_${Date.now()}`;
        const data = {
            id,
            name: req.body.name,
            maze: req.body.maze,
            startX: req.body.startX,
            startY: req.body.startY,
            finishX: req.body.finishX,
            finishY: req.body.finishY,
            traps: req.body.traps,
            coins: req.body.coins,
            createdAt: new Date().toISOString()
        };
        fs.writeFileSync(path.join(MAPS_DIR, `${id}.json`), JSON.stringify(data, null, 2));
        res.json({ id, name: data.name, createdAt: data.createdAt });
    } catch (err) {
        console.error('Error saving map:', err);
        res.status(500).json({ error: 'Failed to save map' });
    }
});

// DELETE /api/maps/:id — удалить карту
app.delete('/api/maps/:id', (req, res) => {
    try {
        const file = path.join(MAPS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(file)) {
            return res.status(404).json({ error: 'Map not found' });
        }
        fs.unlinkSync(file);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting map:', err);
        res.status(500).json({ error: 'Failed to delete map' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🎮 Maze Quest сервер запущен на http://localhost:${PORT}`);
    console.log(`📂 Карты сохраняются в: ${MAPS_DIR}`);
});
