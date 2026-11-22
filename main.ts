// push-solver 1.0.0: push-optimal Sokoban entry for sokoban-solver-01. Splits a level into the independent pieces its
// boxes can ever reach, solves each push-optimally by A* over pushes (box distance to nearest goal, 2x2 freeze deadlock),
// and writes the walk plus pushes as u d l r (capitals push). Writes an empty solution.txt for a level it gives up on.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const STATES = 600_000;

const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
const LETTER = ['u', 'd', 'l', 'r'];

/** XSB text of a level {w, h, wall, goals, boxes, player}. */
function formatLevel({ w, h, wall, goals, boxes, player }) {
  const g = new Set(goals);
  const b = new Set(boxes);
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (wall[i]) row += '#';
      else if (i === player) row += g.has(i) ? '+' : '@';
      else if (b.has(i)) row += g.has(i) ? '*' : '$';
      else row += g.has(i) ? '.' : ' ';
    }
    rows.push(row.replace(/\s+$/, ''));
  }
  return rows.join('\n') + '\n';
}

/** A level from XSB text, padded with a wall border so no walk or push leaves the board. */
function parseLevel(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const w = Math.max(...rows.map((r) => r.length)) + 2;
  const h = rows.length + 2;
  const wall = new Uint8Array(w * h).fill(1);
  const goals = [];
  const boxes = [];
  let player = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = (y + 1) * w + x + 1;
      if (ch === '#') continue;
      if (ch === ' ' || '.*+$@'.includes(ch)) wall[i] = 0;
      if ('.*+'.includes(ch)) goals.push(i);
      if ('$*'.includes(ch)) boxes.push(i);
      if ('@+'.includes(ch)) player = i;
    }
    // squares past a short row's end stay wall (outside the board)
  });
  return { w, h, wall, goals, boxes, player };
}

/** Pull distance of every square to its nearest goal (-1: a box there can never reach one). */
function pullDistance(w, wall, goals) {
  const dist = new Int32Array(wall.length).fill(-1);
  const queue = [];
  for (const g of goals) {
    dist[g] = 0;
    queue.push(g);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const y = queue[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const x = y - d;
      if (!wall[x] && !wall[y - 2 * d] && dist[x] < 0) {
        dist[x] = dist[y] + 1;
        queue.push(x);
      }
    }
  }
  return dist;
}

/** Walk (lowercase letters) from `from` to `to` around walls and boxes, shortest; null if it cannot. */
function walk(w, wall, boxSet, from, to) {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array(wall.length);
  prev[from] = from;
  const queue = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    for (let k = 0; k < 4; k++) {
      const q = p + DIRS[k][1] * w + DIRS[k][0];
      if (wall[q] || boxSet.has(q) || prev[q] >= 0) continue;
      prev[q] = p;
      how[q] = LETTER[k];
      if (q === to) {
        let s = '';
        for (let t = to; t !== from; t = prev[t]) s = how[t] + s;
        return s;
      }
      queue.push(q);
    }
  }
  return null;
}

function heapPush(heap, e) {
  let i = heap.length;
  heap.push(e);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!(heap[i][0] < heap[p][0] || (heap[i][0] === heap[p][0] && heap[i][1] > heap[p][1]))) break;
    [heap[i], heap[p]] = [heap[p], heap[i]];
    i = p;
  }
}
function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    const lt = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] > b[1]);
    for (let i = 0; ; ) {
      let c = 2 * i + 1;
      if (c >= heap.length) break;
      if (c + 1 < heap.length && lt(heap[c + 1], heap[c])) c++;
      if (!lt(heap[c], heap[i])) break;
      [heap[i], heap[c]] = [heap[c], heap[i]];
      i = c;
    }
  }
  return top;
}

/** A 2 x 2 block of walls and boxes holding a box off its goal: no push undoes it. */
function frozen(w, wall, goalMark, boxMark, t) {
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const a = t + oy * w + ox;
    const cells = [a, a + 1, a + w, a + w + 1];
    let ok = true;
    let loose = false;
    for (const c of cells) {
      if (wall[c]) continue;
      if (boxMark[c]) {
        if (!goalMark[c]) loose = true;
      } else ok = false;
    }
    if (ok && loose) return true;
  }
  return false;
}

/**
 * Push-optimal solution of one level {w, wall, goals, boxes, player}: {pushes, moves, player} (moves in u d l r, a push
 * in capitals), or null when none is found within `maxStates` expansions. Ties between push-optimal solutions go to
 * the one the A* meets first.
 */
function solvePushOptimal(level, { maxStates = 2_000_000 } = {}) {
  const { w, wall, goals } = level;
  const n = wall.length;
  const dist = pullDistance(w, wall, goals);
  const goalMark = new Uint8Array(n);
  for (const g of goals) goalMark[g] = 1;
  const start = level.boxes.slice().sort((a, b) => a - b);
  if (start.some((b) => dist[b] < 0)) return null;
  const est = (bs) => bs.reduce((a, b) => a + dist[b], 0);
  const boxesAt = [start];
  const playerAt = [level.player];
  const gAt = [0];
  const parent = [-1];
  const pushed = [null]; // [from, directionIndex]
  const heap = [[est(start), 0, 0]];
  const closed = new Set();
  const mark = new Uint8Array(n);
  const reach = new Uint8Array(n);
  let expanded = 0;
  while (heap.length > 0 && expanded < maxStates) {
    const [, , s] = heapPop(heap);
    const bs = boxesAt[s];
    // the player's region, boxes as walls
    reach.fill(0);
    for (const b of bs) mark[b] = 1;
    const q = [playerAt[s]];
    reach[playerAt[s]] = 1;
    let rep = playerAt[s];
    for (let qi = 0; qi < q.length; qi++) {
      const p = q[qi];
      if (p < rep) rep = p;
      for (const [dx, dy] of DIRS) {
        const r = p + dy * w + dx;
        if (!wall[r] && !mark[r] && !reach[r]) {
          reach[r] = 1;
          q.push(r);
        }
      }
    }
    const key = String.fromCharCode(rep, ...bs);
    if (closed.has(key)) {
      for (const b of bs) mark[b] = 0;
      continue;
    }
    closed.add(key);
    if (est(bs) === 0) {
      for (const b of bs) mark[b] = 0;
      const pushList = [];
      for (let t = s; t > 0; t = parent[t]) pushList.push(pushed[t]);
      pushList.reverse();
      // turn the pushes into moves, walking between them
      let boxes = new Set(start);
      let player = level.player;
      let moves = '';
      for (const [from, k] of pushList) {
        const d = DIRS[k][1] * w + DIRS[k][0];
        const path = walk(w, wall, boxes, player, from - d);
        if (path === null) return null;
        moves += path + LETTER[k].toUpperCase();
        boxes.delete(from);
        boxes.add(from + d);
        player = from;
      }
      return { pushes: pushList.length, moves, player };
    }
    expanded++;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      for (let k = 0; k < 4; k++) {
        const d = DIRS[k][1] * w + DIRS[k][0];
        const t = b + d;
        if (wall[t] || mark[t] || dist[t] < 0 || !reach[b - d]) continue;
        const nb = bs.slice();
        nb[i] = t;
        nb.sort((x, y) => x - y);
        mark[b] = 0;
        mark[t] = 1;
        const dead = frozen(w, wall, goalMark, mark, t);
        mark[t] = 0;
        mark[b] = 1;
        if (dead) continue;
        const id = boxesAt.length;
        boxesAt.push(nb);
        playerAt.push(b);
        gAt.push(gAt[s] + 1);
        parent.push(s);
        pushed.push([b, k]);
        heapPush(heap, [gAt[s] + 1 + est(nb), gAt[s] + 1, id]);
      }
    }
    for (const b of bs) mark[b] = 0;
  }
  return null;
}

/** Plays `moves` on the level; true when it ends with every box on a goal. */
function verify(level, moves) {
  const { w, wall, goals } = level;
  const boxes = new Set(level.boxes);
  let p = level.player;
  for (const ch of moves) {
    const k = LETTER.indexOf(ch.toLowerCase());
    if (k < 0) return false;
    const d = DIRS[k][1] * w + DIRS[k][0];
    const q = p + d;
    if (wall[q]) return false;
    if (boxes.has(q)) {
      if (ch !== ch.toUpperCase() || wall[q + d] || boxes.has(q + d)) return false;
      boxes.delete(q);
      boxes.add(q + d);
    } else if (ch !== ch.toLowerCase()) return false;
    p = q;
  }
  return goals.every((g) => boxes.has(g));
}

/**
 * A whole level. Boxes can only ever stand on squares from which some goal is reachable ("alive" squares); the
 * connected pieces of those squares are independent subproblems (the rooms of a generated level), each solved
 * push-optimally on its own with every other box a wall, so the sum of the pieces' optima is the level's. A level that
 * will not split, or a piece that fails, is searched whole.
 */
function solveLevel(level, opts = {}) {
  const { w, wall, goals } = level;
  const dist = pullDistance(w, wall, goals);
  const comp = new Int32Array(wall.length).fill(-1);
  let count = 0;
  for (let i = 0; i < wall.length; i++) {
    if (dist[i] < 0 || comp[i] >= 0) continue;
    comp[i] = count;
    const q = [i];
    for (let qi = 0; qi < q.length; qi++) {
      for (const [dx, dy] of DIRS) {
        const r = q[qi] + dy * w + dx;
        if (dist[r] >= 0 && comp[r] < 0) {
          comp[r] = count;
          q.push(r);
        }
      }
    }
    count++;
  }
  const pieces = [];
  let split = level.boxes.every((b) => comp[b] >= 0);
  for (let c = 0; split && c < count; c++) {
    const bs = level.boxes.filter((b) => comp[b] === c);
    const gs = goals.filter((g) => comp[g] === c);
    if (bs.length !== gs.length) split = false;
    else if (bs.length > 0) pieces.push({ boxes: bs, goals: gs });
  }
  if (split && pieces.length > 1) {
    let boxes = level.boxes.slice();
    let player = level.player;
    let moves = '';
    let pushes = 0;
    const todo = pieces.slice();
    let ok = true;
    while (todo.length > 0 && ok) {
      const px = player % w;
      const py = Math.floor(player / w);
      todo.sort((a, b) => near(a) - near(b));
      function near(pc) {
        return Math.min(...pc.boxes.map((b) => Math.abs((b % w) - px) + Math.abs(Math.floor(b / w) - py)));
      }
      const pc = todo.shift();
      const sub = Uint8Array.from(wall);
      for (const b of boxes) if (!pc.boxes.includes(b)) sub[b] = 1;
      const r = solvePushOptimal({ w, wall: sub, goals: pc.goals, boxes: pc.boxes, player }, opts);
      if (r === null) {
        ok = false;
        break;
      }
      moves += r.moves;
      pushes += r.pushes;
      player = r.player;
      boxes = boxes.filter((b) => !pc.boxes.includes(b)).concat(pc.goals);
    }
    if (ok && verify(level, moves)) return { pushes, moves };
  }
  const whole = solvePushOptimal(level, opts);
  return whole === null ? null : { pushes: whole.pushes, moves: whole.moves };
}

for (const id of readdirSync(I).sort()) {
  const level = parseLevel(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  const r = solveLevel(level, { maxStates: STATES });
  const moves = r !== null && verify(level, r.moves) ? r.moves : '';
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
