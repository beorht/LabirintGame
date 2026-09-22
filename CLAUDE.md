# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Maze Quest** is an educational code-execution game where players write JavaScript-like commands to navigate a character through procedurally-generated mazes. The game focuses on algorithmic thinking and pathfinding education.

**Key Concept:** Players solve mazes by writing sequences of commands (`hero.up()`, `hero.down()`, `hero.left()`, `hero.right()`, `hero.finish()`) in the code editor, which execute step-by-step with animation.

## Getting Started

### Running the Game

The project has two runtime options depending on your needs:

**Option 1: Browser-only (no backend, no custom maps feature)**
```bash
cd /home/thinklinux/Projects/GamePlatfrom/v1

# Python (recommended)
python3 -m http.server 8000

# Or Node.js
npx http-server -p 8000

# Open in browser
# http://localhost:8000/index.html
```

**Option 2: With Express backend (enables map persistence)**
```bash
cd /home/thinklinux/Projects/GamePlatfrom/v1
npm install
npm start

# Opens server on http://localhost:3000
# Frontend: http://localhost:3000/index.html
# API: http://localhost:3000/api/maps
```

The frontend runs entirely in the browser, but the optional Express backend enables saving and loading custom maps via REST API.

### Common Development Commands

```bash
# Run the game without backend (no map persistence)
python3 -m http.server 8000
# Then open http://localhost:8000/index.html

# Run with Express backend (enables map API)
npm install
npm start
# Then open http://localhost:3000/index.html

# Test the Maps API
curl http://localhost:3000/api/maps              # List all maps
curl http://localhost:3000/api/maps/map_123      # Get specific map
curl -X POST http://localhost:3000/api/maps -d '{"name":"Test","maze":[[...]]}' -H 'Content-Type: application/json'
```

### File Structure

```
├── index.html              # Game UI markup and modals (loads the scripts below in order)
├── styles/game.css         # All styling (light/dark theme tokens, responsive)
├── scripts/
│   ├── config.js           # Config layer: DEFAULT_SETTINGS, validateSettings() → ConfigError, levelGridSize()
│   ├── maze.js             # Domain layer (no DOM): generator, BFS, solvers, normalizeMap()
│   ├── program.js          # Player code (no DOM): parse commands + repeat blocks, expand, dry-run
│   ├── levels.js           # Campaign data (no DOM): 14 levels as ASCII maps + rules
│   ├── render.js           # View layer: palette, board view, drawing primitives, particles
│   ├── game.js             # UI: game state, code execution, demo mode, settings, HUD, logs
│   └── editor.js           # UI: level editor + saved-maps list (backend API)
├── tests/                  # node --test suites; levels.test.js holds 3-star reference solutions
├── server.js               # Optional Express backend for map persistence
├── maps/                   # Saved custom maps (JSON)
└── docs/tz.md              # Full specification document
```

Scripts are classic `<script>` tags sharing one global scope — **top-level `const` names must be unique across files**. `config.js`, `maze.js`, `program.js` and `levels.js` must stay DOM-free; they export via `module.exports` when loaded in Node so `npm test` can require them.

## Architecture

Layering follows `ARCHITECTURE.md` (config → domain → view → UI):

**Config (`config.js`)** — `validateSettings(raw)` returns clean `{ speed }` or throws `ConfigError` with a player-facing message. `game.js` catches it: in the settings modal the message is shown inline; broken stored settings fall back to defaults with a log entry.

**Campaign (`levels.js`)** — `LEVELS` is a fixed list of 14 levels (maps drawn with `# . S F T C`). `getLevel(n)` parses the map and adds rules: `maxLines` (line limit for ⭐⭐⭐, levels 5+), `allowRepeat` (n ≥ 5), `allowNesting` (n ≥ 10), `intro` (one-time explainer). Levels 2–4 were produced by the generator and frozen as maps. Every level has a reference solution in `tests/levels.test.js` that must reach the finish on the shortest path, avoid traps and fit `maxLines` exactly — **changing a map or limit means updating that solution**.

**Player code (`program.js`)** — `compileProgram(source, { allowRepeat, allowNesting })` → `{ steps, lines, error }`. Grammar: one statement per line; `hero.cmd();`, `repeat(N) {` (N 1–20), `}`; `//` comments anywhere. Loops are unrolled into `steps` (each keeps `lineIndex` and `loops: [{ lineIndex, iteration, times }]`), capped at `MAX_STEPS`. `countCodeLines()` = non-blank, non-comment lines (braces count). `simulateSteps(level, steps)` dry-runs with trap penalties.

**Domain (`maze.js`)** — mazes are square 2D arrays (`1` wall, `0` path), any size 5–25.
- `generateMaze(size, rng)`: iterative recursive backtracker + a `loopFactor` share of extra openings (odd sizes only), seeded by `createRng()` (mulberry32). Not used at runtime by the campaign — it's the tool that produced levels 2–4.
- `bfs(maze, sx, sy, ex, ey)` → direction names or `null`; `bfsSearch()` also returns `explored` order and distances.
- Solver strategies in `SOLVERS` (`bfs`, `dfs`, `rightHand`): `solve(maze, start, finish)` → `{ moves, explored, solved, reason? }`. The right-hand rule detects repeated (cell, heading) states and reports a loop instead of hanging.
- `normalizeMap()` makes legacy maps (15-row, `[x, y]` items) usable.

**View (`render.js`)** — `createBoardView(canvas, maxPx)` + `resizeBoardView(view, gridSize)` compute the cell size to fit; `buildBoardLayer()` pre-renders the static board offscreen. Colors come from `palette` (refreshed on theme change by `refreshPalette()`; don't call `getColor()` in draw loops).

**UI (`game.js`, `editor.js`)** — `gameState` holds the current level and run state; `fx` holds visual-only state. `draw()` composites layer + explored overlay + trail + items + hero + particles; frames are requested on demand via `requestRender()` only while something animates.

### Key Functions

| Function | Purpose |
|----------|---------|
| `selectPlayer(name)` | Load/create progress (localStorage `mazeQuestPlayers`) and continue from the player's level |
| `initGame()` | Build the current level (`customLevel` or `getLevel`), resize the canvas, reset hero/timer, show intro |
| `executeCode()` | `compileProgram()` the whole code, then run the unrolled steps with `settings.speed` ms delays; gutter shows loop iterations |
| `winLevel()` / `calcStars(lines)` | Stars by steps vs `optimalSteps`, capped at 2 if over `maxLines`; `recordVictory()` saves progress |
| `runDemo()` | Auto-solve with the selected `SOLVERS` strategy: animate `explored`, then walk `moves` |
| `movePlayer(dx, dy)` | Move hero, throw on wall/bounds (with shake), apply traps/coins |
| `generateHint()` | `simulateProgram()` the current code, BFS from where it ends, append ≤5 commands |
| `saveSettings()` / `loadSettings()` | Settings modal ↔ `validateSettings()` ↔ localStorage `'settings'` |
| `startCustomLevel(data)` | Play a map from the editor or server (normalized, kept in localStorage) |

## UI Features

**Button Controls:**
- **▶ Выполнить (Execute):** Calls `executeCode()` asynchronously, disables itself until execution completes
- **↻ Сброс (Reset):** `resetLevel()` — hero back to start, traps/coins restored, code kept
- **💡 Подсказка (Hint):** `generateHint()` appends up to 5 commands continuing the current code
- **🤖 Демо:** `runDemo()` with the selected solver
- **⚙️ Настройки:** field size (auto/fixed) and delay between commands
- **📋 Копировать (Copy):** Copies code editor contents to clipboard via `copyCode()`
- **🎨 Персонаж (Character):** Opens file input to upload custom PNG image

**Logging System:**
- All actions logged to `logsContent` via `addLog(message, type)` with types: 'info', 'success', 'error'
- Logs cleared when code execution starts
- `clearLogs()` also available as button action

## Backend API (Optional)

The optional Express backend (`server.js`) provides REST endpoints for persistent map storage. Only required if custom map creation/loading features are implemented in the frontend.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/maps` | List all saved maps (sorted by creation date, newest first) |
| `GET` | `/api/maps/:id` | Fetch full data for a specific map |
| `POST` | `/api/maps` | Save a new map; returns map metadata with timestamp |
| `DELETE` | `/api/maps/:id` | Delete a map by ID |

### Map Data Structure

Maps are stored as JSON files in `maps/` directory with this structure:

```json
{
  "id": "map_1776961766592",
  "name": "Custom Level 1",
  "maze": [[1,1,1,...],[1,0,0,...],[...]],
  "startX": 1,
  "startY": 1,
  "finishX": 10,
  "finishY": 3,
  "traps": [[3,4], [5,6]],
  "coins": [[2,3], [4,5]],
  "createdAt": "2026-04-23T21:29:32.592Z"
}
```

### Running the Backend

```bash
npm install  # Install Express dependency
npm start    # Starts server on port 3000
```

Backend is completely optional — game functions without it using only browser-based gameplay.

## Development Guidelines

### Making Changes

**Solvers:** add an entry to `SOLVERS` in `maze.js` returning `{ moves, explored, solved, reason? }`; it appears in the demo select automatically. Add a test in `tests/maze.test.js`.

**Levels:** edit `LEVELS` in `levels.js` and the matching entry in `SOLUTIONS` (`tests/levels.test.js`); run `npm test`.

**Language:** new statements go into `parseProgram()`/`expandProgram()` in `program.js` with tests in `tests/program.test.js`.

**Settings:** add a field to `DEFAULT_SETTINGS` + `validateSettings()` (throw `ConfigError` with a readable message), then wire the control in the settings modal.

**Commands:** no `eval()`. Add commands to `HERO_COMMANDS` (`program.js`) and `runCommand()` (`game.js`).

### Testing

`npm test` runs `node --test` over `tests/*.test.js` (generator connectivity, determinism, solver correctness, settings validation). The UI has no automated tests — check in a browser: run code, hints, demo for each solver, settings, level editor sizes, both themes, < 768px layout.

### localStorage

- `'theme'` — `'light'` / `'dark'`
- `'settings'` — `{ speed }` (validated on load)
- `'mazeQuestPlayers'` — `{ [name]: { level, stars: { [n]: 1..3 }, intros: [...] } }`; `level` 15 = campaign complete
- `'mazeQuestPlayer'` — last player name (auto-continue on load)
- `'customCharacter'` — base64 PNG
- `'customLevel'` — last map played/saved from the editor

## Game Mechanics

**Movement:** `movePlayer(dx, dy)` throws on bounds/walls (error line highlighted, board shakes).

**Traps / Coins:** drawn into the level maps (`T` / `C`). A trap adds 5 steps once; coins move from `gameState.coinCells` to `gameState.coins`.

**Runs always start from start:** `executeCode()` and `runDemo()` call `resetHero()`, restoring `initialTraps`/`initialCoins`.

**Victory:** `hero.finish()` on the finish tile, or the program ends on it. Stars compare steps (incl. trap penalties) with `optimalSteps`; over `maxLines` caps at 2. Demo runs and custom maps never change campaign progress. After level 14 the campaign-complete screen offers a restart (best stars kept).

## Important Implementation Details

**Hints:** `generateHint()` dry-runs the current code with `simulateProgram()` and runs BFS from where the code ends, so hints continue the existing program.

**Stopping runs:** every run captures `runId`; `stopExecution()`/`initGame()` bump it so a run waiting on its delay exits (`isCurrentRun()`).

**Animation clock:** `renderFrame()` uses `performance.now()`, not the rAF timestamp (which can precede `moveStart` and make the tween extrapolate backwards).

**Map sizes:** maps are square, 5–25. The server validates this; old 15-row maps are cropped by `normalizeMap()`.

## Known Limitations & TODOs

- **Only `repeat`:** no conditions or variables in the player language
- **Progress is per browser:** players live in localStorage, not on the server
- **No leaderboard:** No persistent storage of scores
- **Mobile editing:** Mobile keyboards may be awkward for code entry
- **Right-hand rule on braided mazes:** may fail by design (loops) — shown as a teaching point in the demo

## Code Style Notes

- No modules/bundler — classic scripts, global functions, `gameState`/`editorState`/`fx` objects
- Domain and config code stay pure (no DOM) so they remain testable in Node
- CSS custom properties for theming; canvas colors read through `palette`
