# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Maze Quest** is an educational code-execution game where players write JavaScript-like commands to navigate a character through procedurally-generated mazes. The game focuses on algorithmic thinking and pathfinding education.

**Key Concept:** Players solve mazes by writing sequences of commands (`hero.up()`, `hero.down()`, `hero.left()`, `hero.right()`, `hero.finish()`) in the code editor, which execute step-by-step with animation.

## Getting Started

### Running the Game

```bash
# Start a simple HTTP server
cd /home/thinklinux/Projects/GamePlatfrom/v1
python3 -m http.server 8000

# Open in browser
# http://localhost:8000/index.html
```

The game runs entirely in the browser — no build step needed.

### File Structure

```
GamePlatfrom/v1/
├── index.html              # Game UI markup and modals
├── styles/game.css         # All styling (light/dark theme support, responsive)
├── scripts/game.js         # Complete game logic (~676 lines)
├── package.json            # Minimal deps (Express, unused in main game)
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

**3. Code Execution Engine (`executeCode()` function)**
- Parses user code line-by-line
- Executes commands with 300ms delay between steps for animation
- Handles `hero.up()`, `hero.down()`, `hero.left()`, `hero.right()`, `hero.finish()` methods
- Tracks error state and highlights error lines in editor
- Auto-detects victory when code ends on the finish tile

**4. Movement System (`movePlayer()` function)**
- Validates moves: bounds checking, wall collision detection
- Applies game mechanics: trap penalties (+5 steps), coin collection (+1 coin)
- Updates step counter and player position in gameState

**5. Pathfinding Engine (`bfs()` function)**
- Implements Breadth-First Search for optimal path calculation
- Used by hint system (5-step hints) and solve solution
- Returns direction sequence that `pathToCommands()` converts to `hero.xxx()` syntax

**6. Level Progression**
- Maze template changes per level (currently level 1 uses fixed snake-like maze)
- Victory modal shows stats: steps, time, coins collected, commands written
- Next level clears editor and respawns player with same level number (expected: maze difficulty increases)

### Key Functions

| Function | Purpose |
|----------|---------|
| `initGame()` | Reset state and redraw for a new level |
| `executeCode()` | Parse and execute user code line-by-line |
| `movePlayer(dx, dy)` | Move player, check collisions, apply traps/coins |
| `draw()` | Render maze, player, obstacles to canvas |
| `bfs()` | Find shortest path using Breadth-First Search |
| `generateHint()` | Insert next 5 steps of optimal path into code editor |
| `showVictoryModal()` | Display win stats and next level/restart options |
| `updateUI()` | Update HUD displays (steps, time, coins, level) |

## Development Guidelines

### Making Changes

**Maze Layout:** Modify the `mazeTemplate` array in `generateMaze()` to change the maze shape per level. The template is a 2D array where `1 = wall`, `0 = path`.

**Obstacle Placement:** `placeObstacles()` randomly distributes traps and coins. Adjust trap count formula (`4 + (level × 2)`) or coin count (5 per level) here.

**Execution Speed:** Change `EXECUTION_DELAY` constant (milliseconds between command steps).

**Grid Size:** `GRID_SIZE` (14) and `CELL_SIZE` (50px) control maze dimensions. Adjust canvas initialization if changed.

**Command Syntax:** The command parser uses simple regex + `eval()` in `executeCode()`. Commands must match `hero.METHOD();` format.

### Testing

No automated test suite exists. Manual testing approach:
1. Load game in browser
2. Try various code patterns (loops not supported, must be explicit commands)
3. Test hint/solve buttons
4. Verify error highlighting on invalid commands
5. Check mobile responsiveness (< 768px triggers mobile layout)

### Theme System

CSS variables in `game.css` control colors for light/dark themes. Game auto-detects system preference or reads from localStorage. Add new visual elements by using `getColor()` function which fetches CSS variable values.

### Performance Considerations

- Canvas drawing happens every 300ms during execution (tied to `EXECUTION_DELAY`)
- No animation frames (requestAnimationFrame) — simple setTimeout-based stepping
- BFS pathfinding is O(V+E) but maze is small (14×14), so completes in <50ms
- localStorage used for theme + custom character image (base64 PNG)

## Typical Workflows

**Add a new level variant:**
1. Add a new maze template in `generateMaze()` with level-specific condition
2. Adjust trap/coin counts in `placeObstacles()` by level
3. Update finish position if needed (`gameState.finishX/finishY`)

**Fix a command execution bug:**
- Edit the command matching logic in `executeCode()` where `eval(methodCall)` is called
- Add/adjust error messages in the catch block
- Check `movePlayer()` for boundary/collision logic

**Improve UI responsiveness:**
- Modify `styles/game.css` media queries (breakpoint: 768px)
- Adjust grid layout in `game-area` and `editor-area` divs
- Test with mobile emulator or device

## Known Limitations & TODOs

- **No loop support:** Players must write explicit commands, no `for` loops
- **Fixed mazes per level:** Recursive Backtracker algorithm not yet implemented — mazes are hardcoded templates
- **No leaderboard:** No persistent storage of scores
- **Mobile editing:** Mobile keyboards may be awkward for code entry — no mobile-optimized editor
- **Linear level progression:** Level just increments; no branching difficulty paths

## Code Style Notes

- Global scope polluted (no modules) — all functions are top-level
- Heavy use of `gameState` object instead of class-based architecture
- DOM manipulation is direct (no virtual DOM or framework)
- CSS uses CSS custom properties (variables) for theming
