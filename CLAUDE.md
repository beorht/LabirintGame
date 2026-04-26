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
GamePlatfrom/v1/
├── index.html              # Game UI markup and modals
├── styles/game.css         # All styling (light/dark theme support, responsive)
├── scripts/game.js         # Complete game logic (~676 lines)
├── server.js               # Optional Express backend for map persistence
├── maps/                   # Directory for storing custom map JSON files
├── package.json            # Dependencies (Express for backend)
└── docs/tz.md              # Full specification document
```

## Architecture

### Core Components

**1. Game State (`gameState` object)**
- Central state object storing: maze, player position, score, level, traps, coins, timer
- Manages execution flow (`isRunning`, `currentCommandIndex`)
- Updated after every action via `updateUI()`

**2. Canvas Rendering (`draw()` function)**
- Renders maze grid, walls, player, obstacles, coins
- Grid size: 14×14 cells, each cell 50px
- Supports custom player character (PNG image) loaded from localStorage
- Color scheme loaded dynamically from CSS variables (supports dark/light theme)

**3. Code Execution Engine (`executeCode()` async function)**
- Parses user code line-by-line, filters comments (lines starting with `//`)
- Validates command syntax using regex pattern `/hero\.(\w+)\(\)/`
- Executes matching commands with 300ms delay between steps for animation
- Handles `hero.up()`, `hero.down()`, `hero.left()`, `hero.right()`, `hero.finish()` methods via a `hero` object with corresponding functions
- Tracks execution state (`isRunning`, `currentCommandIndex`) for error highlighting
- Auto-detects victory when code ends on the finish tile or when `hero.finish()` is called on finish position

**4. Movement System (`movePlayer()` function)**
- Validates moves: bounds checking, wall collision detection
- Applies game mechanics: trap penalties (+5 steps), coin collection (+1 coin)
- Updates step counter and player position in gameState

**5. Pathfinding Engine (`bfs()` function)**
- Implements Breadth-First Search for optimal path calculation
- Used by hint system (5-step hints) and solve solution
- Returns direction sequence that `pathToCommands()` converts to `hero.xxx()` syntax

**6. Custom Character Support**
- Player can upload a custom PNG image (recommended 15×15px) to replace the default player character
- Image is stored in localStorage as base64 and persists across sessions
- File input: `characterInput` element, button: `uploadCharacterButton`
- If available, custom image is drawn instead of the default character in `draw()`

**7. Level Progression**
- Maze template changes per level (currently level 1 uses fixed snake-like maze)
- Victory modal shows stats: steps, time, coins collected, commands written
- Next level increments level counter and clears editor while respawning player
- Next level uses same maze template (maze difficulty increase not yet implemented)

### Key Functions

| Function | Purpose |
|----------|---------|
| `initGame()` | Reset maze, player position, traps, coins, timer; call when starting new level |
| `executeCode()` | Async: parse and execute user code line-by-line with 300ms delays |
| `movePlayer(dx, dy)` | Move player by (dx, dy), validate bounds/walls, apply trap/coin logic |
| `draw()` | Render to canvas: maze walls, obstacles, coins, player, finish flag |
| `bfs(startX, startY, endX, endY)` | Breadth-First Search; returns array of directions (0=up, 1=right, 2=down, 3=left) |
| `pathToCommands(directions, limit)` | Convert BFS directions array to hero command strings; limit to N commands if specified |
| `generateHint()` | Use BFS to get next 5 steps from player to finish, convert to code, insert at editor cursor |
| `showVictoryModal()` | Display modal with win stats: steps, time, coins, commands written; buttons for next level/restart |
| `updateUI()` | Update HUD: step count, timer, level, coin count, line count |
| `startTimer()` / `stopTimer()` | Begin/end interval that ticks gameState.timer every second |
| `updateLineNumbers(errorLineIndex)` | Render line numbers; highlight in red if errorLineIndex >= 0 |
| `getColor(cssVar)` | Get CSS variable value from document root (used for theme colors) |
| `addLog(message, type)` | Append timestamped log entry; type='info'/'success'/'error' affects styling |

## UI Features

**Button Controls:**
- **▶ Выполнить (Execute):** Calls `executeCode()` asynchronously, disables itself until execution completes
- **↻ Сброс (Reset):** Calls `initGame()` to reset maze/player position while preserving code and logs
- **💡 Подсказка (Hint):** Calls `generateHint()` which uses BFS to compute next 5 steps and insert them at cursor position
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

**Maze Layout:** Modify the `mazeTemplate` array in `generateMaze()` to change the maze shape per level. The template is a 2D array where `1 = wall`, `0 = path`.

**Obstacle Placement:** `placeObstacles()` randomly distributes traps and coins. Adjust trap count formula (`4 + (level × 2)`) or coin count (5 per level) here.

**Execution Speed:** Change `EXECUTION_DELAY` constant (milliseconds between command steps). Currently 300ms.

**Grid Size:** `GRID_SIZE` (14) and `CELL_SIZE` (50px) control maze dimensions. Adjust canvas initialization if changed.

**Command Syntax:** The command parser uses regex `/hero\.(\w+)\(\)/` to match commands — no eval() used. Commands must match `hero.METHOD();` format exactly. Add new commands by adding methods to the `hero` object in `executeCode()`.

### Testing

No automated test suite exists. Manual testing approach:
1. Load game in browser
2. Try various code patterns (loops not supported, must be explicit commands)
3. Test hint/solve buttons
4. Verify error highlighting on invalid commands
5. Check mobile responsiveness (< 768px triggers mobile layout)

### Theme System

CSS variables in `game.css` control colors for light/dark themes. Game auto-detects system preference via `window.matchMedia('(prefers-color-scheme: dark)')` or reads from localStorage key `'theme'`. The theme is applied to the `data-theme` attribute on `<html>`. Use `getColor(cssVar)` function to fetch computed CSS variable values.

### localStorage & Persistence

- `'theme'` — stores 'light' or 'dark' preference
- `'customCharacter'` — stores base64-encoded PNG image of custom player character

### Performance Considerations

- Canvas drawing happens every 300ms during execution (tied to `EXECUTION_DELAY`)
- No animation frames (requestAnimationFrame) — simple setTimeout-based stepping
- BFS pathfinding is O(V+E) but maze is small (14×14), completes in <50ms
- No virtual DOM, no framework — direct DOM manipulation
- Frontend runs entirely in browser; optional Express backend (`server.js`) handles map persistence if enabled

## Game Mechanics

**Movement:** `movePlayer(dx, dy)` checks bounds and maze walls before updating position. Returns nothing unless `hero.finish()` is called on finish tile (returns 'finish').

**Traps:** Randomly placed by `placeObstacles()`. When stepped on, adds 5 to step counter and removes trap from `gameState.traps` set (no repeat triggering).

**Coins:** Randomly placed by `placeObstacles()`. When collected, adds 1 to `gameState.coins` and removes coin from `gameState.collectedCoins` set.

**Victory Condition:** Player calls `hero.finish()` while on finish tile, OR code execution ends naturally while player is on finish tile.

## Typical Workflows

**Add a new level variant:**
1. In `generateMaze()`, add a level-specific condition (e.g., `if (gameState.level === 2) { mazeTemplate = [...] }`)
2. Define maze as 2D array where `1 = wall`, `0 = path` — 14×14 grid required
3. In `placeObstacles()`, adjust trap count by level: `4 + (level × 2)` (can be made configurable)
4. Update finish position: set `gameState.finishX` and `gameState.finishY` if different from default (10, 3)
5. Test in browser: start game, advance to new level, verify maze renders and BFS hint works

**Fix a command execution bug:**
- Edit the command matching logic in `executeCode()` — the regex `/hero\.(\w+)\(\)/` extracts method names and calls them on the `hero` object
- Add/adjust error messages in the catch block (lines ~376-410 in game.js)
- Check `movePlayer()` for boundary/collision logic (handles bounds, walls, traps, coins)
- Verify the `hero` object definition within `executeCode()` includes all supported commands

**Improve UI responsiveness:**
- Modify `styles/game.css` media queries (breakpoint: 768px)
- Adjust grid layout in `game-area` and `editor-area` divs
- Test with mobile emulator or device

**Add custom map creation UI:**
1. Add a UI form in `index.html` to capture map name, maze layout, obstacle positions
2. On form submit, POST to `/api/maps` with map data (requires backend running)
3. Fetch existing maps via `GET /api/maps` and render as level selection menu
4. Update `initGame()` to accept a map ID parameter and load from backend instead of hardcoded template
5. Test with both `npm start` (backend) and Python server (browser-only fallback)

## Important Implementation Details

**Command Parsing:** The regex `/hero\.(\w+)\(\)/` is strict — extra whitespace, missing parentheses, or typos will error. Lines starting with `//` are filtered out before parsing.

**async/await in executeCode():** Uses `await new Promise(resolve => setTimeout(resolve, EXECUTION_DELAY))` between steps to maintain animation pacing without blocking.

**Maze Bounds:** Maze is always 14×14. Borders are walls (index 0 and 13). Walkable area is typically 1–12 on both axes.

**Error Handling:** `executeCode()` catches errors, logs them, highlights the error line in the editor, and stops execution. `movePlayer()` silently fails on invalid moves (bounds/wall).

**Canvas Rendering:** `draw()` is called after every move. It clears the canvas and redraws the entire maze state — no incremental updates.

**BFS Termination:** `bfs()` can return an empty array if finish is unreachable, but with current maze design this shouldn't happen.

## Known Limitations & TODOs

- **No loop support:** Players must write explicit commands, no `for` loops
- **Custom map UI not implemented:** Backend API exists (`server.js`) but frontend has no UI for creating/selecting custom maps yet
- **No leaderboard:** No persistent storage of scores
- **Mobile editing:** Mobile keyboards may be awkward for code entry — no mobile-optimized editor
- **Linear level progression:** Level just increments; no branching difficulty paths
- **No procedural maze generation:** All mazes in `generateMaze()` are hardcoded templates (though backend supports arbitrary map storage)

## Code Style Notes

- Global scope polluted (no modules) — all functions are top-level
- Heavy use of `gameState` object instead of class-based architecture
- DOM manipulation is direct (no virtual DOM or framework)
- CSS uses CSS custom properties (variables) for theming
- Express.js provides optional backend for map persistence (`server.js`); frontend works standalone via simple HTTP server
