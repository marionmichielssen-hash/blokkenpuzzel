const SIZE = 10;
const boardEl = document.querySelector("#board");
const piecesEl = document.querySelector("#pieces");
const scoreEl = document.querySelector("#score");
const messageEl = document.querySelector("#message");
const newGameButton = document.querySelector("#new-game");
const restartGameButton = document.querySelector("#restart-game");
const gameOverEl = document.querySelector("#game-over");
const finalScoreEl = document.querySelector("#final-score");
const scoreFloatEl = document.querySelector("#score-float");
const levelLabelEl = document.querySelector("#level-label");
const levelDescriptionEl = document.querySelector("#level-description");
const levelToggleButton = document.querySelector("#level-toggle");

const state = {
  board: [],
  pieces: [],
  score: 0,
  moves: 0,
  dragging: null,
  clearing: false,
  clearingCells: new Set(),
  gameOver: false,
  level: 2,
};

const BASE_SHAPES = [
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
];

const EASY_SHAPES = BASE_SHAPES.slice(0, 5);

function normalize(cells) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort(([ax, ay], [bx, by]) => ay - by || ax - bx);
}

function shapeKey(cells) {
  return normalize(cells).map(([x, y]) => `${x},${y}`).join(";");
}

function rotate(cells) {
  return normalize(cells.map(([x, y]) => [y, -x]));
}

function variantsFor(shape) {
  const variants = [];
  let current = normalize(shape);

  for (let i = 0; i < 4; i += 1) {
    const key = shapeKey(current);
    if (!variants.some((variant) => shapeKey(variant) === key)) {
      variants.push(current);
    }
    current = rotate(current);
  }

  return variants;
}

const SHAPES = BASE_SHAPES.flatMap(variantsFor);
const EASY_VARIANTS = EASY_SHAPES.flatMap(variantsFor);

function dimensions(cells) {
  return {
    width: Math.max(...cells.map(([x]) => x)) + 1,
    height: Math.max(...cells.map(([, y]) => y)) + 1,
  };
}

function randomShape() {
  const pool = state.moves < 7 ? EASY_VARIANTS : SHAPES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function resetGame() {
  state.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  state.score = 0;
  state.moves = 0;
  dealNewPieces();
  state.dragging = null;
  state.clearing = false;
  state.clearingCells = new Set();
  state.gameOver = false;
  gameOverEl.hidden = true;
  scoreFloatEl.classList.remove("show");
  scoreFloatEl.textContent = "";
  updateLevelText();
  messageEl.textContent = "Begin rustig. Kies eerst een klein blok.";
  render();
}

function render() {
  renderBoard();
  renderPieces();
  scoreEl.textContent = state.score;
}

function renderBoard() {
  boardEl.innerHTML = "";

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = document.createElement("div");
      const classes = ["cell"];
      if (state.board[y][x]) classes.push("filled");
      if (state.clearingCells.has(cellKey(x, y))) classes.push("clearing");
      cell.className = classes.join(" ");
      cell.dataset.x = x;
      cell.dataset.y = y;
      boardEl.append(cell);
    }
  }
}

function renderPieces() {
  piecesEl.innerHTML = "";

  state.pieces.forEach((piece, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "piece-card";
    if (state.clearing || state.gameOver) card.classList.add("disabled");
    card.setAttribute("aria-label", `Blok ${index + 1}`);
    card.dataset.index = index;
    if (piece) {
      card.append(createMiniGrid(piece));
      card.addEventListener("pointerdown", startDrag);
    } else {
      card.classList.add("used");
      card.disabled = true;
      card.textContent = "Geplaatst";
    }
    piecesEl.append(card);
  });
}

function createMiniGrid(piece, ghost = false) {
  const box = document.createElement("div");
  const { width, height } = dimensions(piece);
  box.className = ghost ? "drag-ghost" : "mini-grid";
  const size = ghost ? "var(--ghost-cell-size)" : "var(--piece-cell-size)";
  box.style.gridTemplateColumns = `repeat(${width}, ${size})`;
  box.style.gridTemplateRows = `repeat(${height}, ${size})`;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const filled = piece.some(([px, py]) => px === x && py === y);
      const cell = document.createElement("div");
      cell.className = `${ghost ? "ghost-cell" : "mini-cell"}${filled ? " filled" : ""}`;
      box.append(cell);
    }
  }

  return box;
}

function startDrag(event) {
  if (state.clearing || state.gameOver) return;
  event.preventDefault();
  const index = Number(event.currentTarget.dataset.index);
  const piece = state.pieces[index];
  if (!piece) return;
  const ghost = createMiniGrid(piece, true);
  document.body.append(ghost);
  event.currentTarget.classList.add("dragging-source");
  const { width, height } = dimensions(piece);
  const ghostBox = ghost.getBoundingClientRect();
  const ghostWidth = ghostBox.width;
  const ghostHeight = ghostBox.height;
  const anchorX = Math.floor(width / 2);
  const anchorY = Math.floor(height / 2);
  state.dragging = { index, piece, ghost, ghostWidth, ghostHeight, anchorX, anchorY, source: event.currentTarget, pointerId: event.pointerId };
  event.currentTarget.setPointerCapture(event.pointerId);
  moveGhost(event.clientX, event.clientY);
  showPreview(event.clientX, event.clientY);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", cancelDrag);
}

function onPointerMove(event) {
  if (!state.dragging) return;
  moveGhost(event.clientX, event.clientY);
  showPreview(event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (!state.dragging) return;
  const point = placementPoint(event.clientX, event.clientY);
  const cell = anchorCellFromPoint(point.x, point.y);

  if (cell && canPlace(state.dragging.piece, cell.x, cell.y)) {
    placePiece(state.dragging.index, cell.x, cell.y);
  } else {
    messageEl.textContent = "Dat past daar niet. Probeer een andere plek.";
  }

  cancelDrag();
}

function cancelDrag() {
  clearPreview();
  if (state.dragging?.source) state.dragging.source.classList.remove("dragging-source");
  if (state.dragging?.ghost) state.dragging.ghost.remove();
  state.dragging = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", cancelDrag);
}

function moveGhost(x, y) {
  if (!state.dragging) return;
  state.dragging.ghost.style.left = `${x - state.dragging.ghostWidth / 2}px`;
  state.dragging.ghost.style.top = `${y - state.dragging.ghostHeight / 2}px`;
}

function placementPoint(x, y) {
  return { x, y };
}

function cellFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  const cell = element?.closest(".cell");
  if (!cell) return null;
  return {
    x: Number(cell.dataset.x),
    y: Number(cell.dataset.y),
  };
}

function anchorCellFromPoint(x, y) {
  const cell = cellFromPoint(x, y);
  if (!cell || !state.dragging) return null;
  return {
    x: cell.x - state.dragging.anchorX,
    y: cell.y - state.dragging.anchorY,
  };
}

function showPreview(x, y) {
  clearPreview();
  const point = placementPoint(x, y);
  const cell = anchorCellFromPoint(point.x, point.y);
  if (!cell || !state.dragging) return;
  const ok = canPlace(state.dragging.piece, cell.x, cell.y);
  state.dragging.piece.forEach(([px, py]) => {
    const target = boardEl.querySelector(`[data-x="${cell.x + px}"][data-y="${cell.y + py}"]`);
    if (target) target.classList.add(ok ? "preview-good" : "preview-bad");
  });
  boardEl.classList.toggle("bad-placement", !ok);
  boardEl.classList.toggle("good-placement", ok);
}

function clearPreview() {
  boardEl.querySelectorAll(".preview-good, .preview-bad").forEach((cell) => {
    cell.classList.remove("preview-good", "preview-bad");
  });
  boardEl.classList.remove("good-placement", "bad-placement");
}

function canPlace(piece, x, y) {
  return piece.every(([px, py]) => {
    const bx = x + px;
    const by = y + py;
    return bx >= 0 && bx < SIZE && by >= 0 && by < SIZE && !state.board[by][bx];
  });
}

async function placePiece(index, x, y) {
  const piece = state.pieces[index];
  piece.forEach(([px, py]) => {
    state.board[y + py][x + px] = true;
  });

  state.moves += 1;

  const lines = findFullLines();
  const cleared = lines.rows.length + lines.columns.length;

  if (cleared > 0) {
    const points = cleared * 10 * cleared;
    state.clearing = true;
    state.clearingCells = cellsForLines(lines);
    messageEl.textContent = "Mooi. Deze volle lijn verdwijnt zo meteen.";
    renderBoard();
    renderPieces();
    showScoreFloat(cleared);
    await wait(1000);
    clearLines(lines);
    state.score += points;
    scoreEl.textContent = state.score;
    state.clearingCells = new Set();
    state.clearing = false;
  }

  if (state.level === 1) {
    state.pieces[index] = nextFittingShape();
  } else {
    state.pieces[index] = null;
  }
  if (state.level === 2 && state.pieces.every((pieceSlot) => pieceSlot === null)) {
    dealNewPieces();
  }
  messageEl.textContent = cleared > 0 ? "Mooi. Een volle lijn is verdwenen." : "Goed geplaatst.";
  render();
  checkGameOver();
}

function dealNewPieces() {
  state.pieces = [nextFittingShape(), nextFittingShape(), nextFittingShape()];
}

function switchLevel() {
  state.level = state.level === 1 ? 2 : 1;
  resetGame();
}

function updateLevelText() {
  levelLabelEl.textContent = `Level ${state.level}`;
  levelDescriptionEl.textContent = state.level === 1
    ? "Elk geplaatst blok wordt meteen vervangen."
    : "Speel eerst de drie blokken. Daarna verschijnen er drie nieuwe.";
  levelToggleButton.textContent = state.level === 1 ? "Level 2" : "Level 1";
  levelToggleButton.setAttribute("aria-label", `Schakel naar ${levelToggleButton.textContent}`);
}

function findFullLines() {
  const rows = [];
  const columns = [];

  state.board.forEach((row, index) => {
    if (row.every(Boolean)) rows.push(index);
  });

  for (let x = 0; x < SIZE; x += 1) {
    let filled = true;
    for (let y = 0; y < SIZE; y += 1) {
      if (!state.board[y][x]) {
        filled = false;
        break;
      }
    }
    if (filled) columns.push(x);
  }

  return { rows, columns };
}

function clearLines(lines) {
  lines.rows.forEach((rowIndex) => {
    state.board[rowIndex] = Array(SIZE).fill(false);
  });

  lines.columns.forEach((columnIndex) => {
    for (let y = 0; y < SIZE; y += 1) {
      state.board[y][columnIndex] = false;
    }
  });
}

function cellsForLines(lines) {
  const cells = new Set();
  lines.rows.forEach((rowIndex) => {
    for (let x = 0; x < SIZE; x += 1) cells.add(cellKey(x, rowIndex));
  });
  lines.columns.forEach((columnIndex) => {
    for (let y = 0; y < SIZE; y += 1) cells.add(cellKey(columnIndex, y));
  });
  return cells;
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function showScoreFloat(cleared) {
  scoreFloatEl.textContent = cleared === 1 ? "10" : `x${cleared}`;
  scoreFloatEl.classList.remove("show");
  void scoreFloatEl.offsetWidth;
  scoreFloatEl.classList.add("show");
}

function nextFittingShape() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const shape = randomShape();
    if (hasPlace(shape)) return shape;
  }
  return [[0, 0]];
}

function hasPlace(piece) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (canPlace(piece, x, y)) return true;
    }
  }
  return false;
}

function checkGameOver() {
  const activePieces = state.pieces.filter(Boolean);
  const playable = activePieces.some(hasPlace);
  piecesEl.querySelectorAll(".piece-card").forEach((card, index) => {
    const piece = state.pieces[index];
    card.classList.toggle("disabled", !piece || !hasPlace(piece));
  });

  if (!playable) {
    state.gameOver = true;
    finalScoreEl.textContent = state.score;
    gameOverEl.hidden = false;
    messageEl.textContent = "Geen zetten meer mogelijk.";
    renderPieces();
  }
}

newGameButton.addEventListener("click", resetGame);
restartGameButton.addEventListener("click", resetGame);
levelToggleButton.addEventListener("click", switchLevel);
resetGame();
