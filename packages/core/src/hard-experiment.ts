import {
  analyzePuzzle, createPuzzle, validateNurikabeBoard,
  type CellColor, type NurikabeBoard, type Puzzle
} from './index.js';
import { makeRandom } from './random.js';
import { provePuzzleUniqueness } from './solution-proof.js';
import {
  checkGenerationProfile, getClueCountBounds, getClueValueLimit,
  HARD_EXPERIMENT_PROFILE, summarizeClues
} from './generation-profile.js';

const { size: { width: WIDTH, height: HEIGHT }, quality: { minLargestClue: LARGEST_TARGET } } = HARD_EXPERIMENT_PROFILE;
const FULL_ROW = (1 << WIDTH) - 1;
const MAX_ATTEMPTS = 8;
const MAX_CONSTRUCTION_NODES = 2000;
const MAX_CLUE_TRIALS = 6;
const MAX_CLUES = getClueCountBounds(HARD_EXPERIMENT_PROFILE).max;

export interface HardExperimentDiagnostics {
  elapsedMs: number;
  attempts: number;
  constructionNodes: number;
  constructedBoards: number;
  constructedLayoutKeys: string[];
  constructionMs: number;
  uniquenessMs: number;
  clueTrials: number;
  multipleSolutions: number;
  inconclusiveProofs: number;
  lastPlan: number[];
  stopReason: 'success' | 'time-limit' | 'attempt-limit';
}

export type HardExperimentResult =
  | { status: 'success'; puzzle: Puzzle; proof: 'deduction' | 'exhaustive'; diagnostics: HardExperimentDiagnostics }
  | { status: 'failed'; diagnostics: HardExperimentDiagnostics };

interface Frontier {
  mask: number;
  labels: number[];
  sizes: number[];
  white: boolean[];
  remaining: number[];
}

let rowChoices: number[][] | undefined;

function getRowChoices(): number[][] {
  if (!rowChoices) {
    rowChoices = Array.from({ length: 1 << WIDTH }, (_, previous) =>
      Array.from({ length: FULL_ROW }, (_, mask) => mask).filter((mask) => {
        const commonBlack = (FULL_ROW ^ previous) & (FULL_ROW ^ mask);
        return (commonBlack & (commonBlack >> 1)) === 0;
      }));
  }
  return rowChoices;
}

function advance(previous: Frontier, mask: number, final: boolean): Frontier | null {
  const count = previous.sizes.length;
  const parent = Array.from({ length: count + WIDTH }, (_, i) => i);
  const sizes = [...previous.sizes, ...Array<number>(WIDTH).fill(1)];
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const join = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a !== b) {
      parent[b] = a;
      sizes[a] += sizes[b];
    }
  };
  for (let col = 0; col < WIDTH; col += 1) {
    const white = Boolean(mask & (1 << col));
    if (col > 0 && white === Boolean(mask & (1 << (col - 1)))) join(count + col, count + col - 1);
    if (previous.labels.length && white === Boolean(previous.mask & (1 << col))) {
      join(count + col, previous.labels[col]);
    }
  }
  const active = new Set(Array.from({ length: WIDTH }, (_, col) => find(count + col)));
  const remaining = [...previous.remaining];
  for (let i = 0; i < count; i += 1) {
    if (find(i) !== i || active.has(i)) continue;
    // A sea component leaving the frontier could never reach future rows.
    if (!previous.white[i] || !remaining[sizes[i]]) return null;
    remaining[sizes[i]] -= 1;
  }
  const ids = new Map<number, number>();
  const next: Frontier = { mask, labels: [], sizes: [], white: [], remaining };
  for (let col = 0; col < WIDTH; col += 1) {
    const root = find(count + col);
    if (!ids.has(root)) {
      ids.set(root, ids.size);
      next.sizes.push(sizes[root]);
      next.white.push(Boolean(mask & (1 << col)));
    }
    const id = ids.get(root);
    if (id === undefined) throw new Error('Missing frontier component');
    next.labels.push(id);
  }
  if (final) {
    if (next.white.filter((white) => !white).length !== 1) return null;
    for (let i = 0; i < next.sizes.length; i += 1) {
      if (!next.white[i]) continue;
      if (!remaining[next.sizes[i]]) return null;
      remaining[next.sizes[i]] -= 1;
    }
    if (remaining.some((count) => count !== 0)) return null;
  } else {
    const largestRemaining = remaining.reduce((largest, count, size) => count > 0 ? size : largest, 0);
    if (next.sizes.some((size, i) => next.white[i] && size > largestRemaining)) return null;
    // This construction heuristic reserves a separate target for each open island.
    // It may miss candidates requiring later merges; it is not a uniqueness proof.
    const pending = next.sizes.filter((_, i) => next.white[i]).sort((a, b) => b - a);
    const targets = remaining.flatMap((count, size) => Array<number>(count).fill(size)).sort((a, b) => b - a);
    if (pending.length > targets.length || pending.some((size, i) => size > targets[i])) return null;
  }
  return next;
}

function construct(
  plan: number[], random: () => number, deadline: number, diagnostics: HardExperimentDiagnostics
): CellColor[][] | null {
  const choices = getRowChoices();
  const targetWhite = plan.reduce((sum, size) => sum + size, 0);
  const remaining = Array<number>(Math.max(...plan) + 1).fill(0);
  for (const size of plan) remaining[size] += 1;
  const rows: number[] = [];
  const failed = new Set<string>();
  let nodes = 0;
  const search = (previous: Frontier, row: number, usedWhite: number): boolean => {
    nodes += 1;
    diagnostics.constructionNodes += 1;
    if (nodes > MAX_CONSTRUCTION_NODES || performance.now() >= deadline) return false;
    if (row === HEIGHT) return true;
    const key = `${row}|${previous.mask}|${previous.labels}|${previous.sizes}|${previous.remaining}`;
    if (failed.has(key)) return false;
    const ranked = choices[previous.mask].map((mask) => {
      let count = 0;
      for (let bits = mask; bits; bits &= bits - 1) count += 1;
      return { mask, count, score: Math.abs(count - (targetWhite - usedWhite) / (HEIGHT - row)) + random() * 4 };
    }).sort((a, b) => a.score - b.score);
    for (const { mask, count } of ranked) {
      if (performance.now() >= deadline) return false;
      const white = usedWhite + count;
      if (white > targetWhite || white + (HEIGHT - row - 1) * WIDTH < targetWhite ||
          (row === HEIGHT - 1 && white !== targetWhite)) continue;
      const next = advance(previous, mask, row === HEIGHT - 1);
      if (!next) continue;
      rows.push(mask);
      if (search(next, row + 1, white)) return true;
      rows.pop();
      if (nodes > MAX_CONSTRUCTION_NODES) return false;
    }
    failed.add(key);
    return false;
  };
  if (!search({ mask: FULL_ROW, labels: [], sizes: [], white: [], remaining }, 0, 0)) return null;
  return rows.map((mask) => Array.from({ length: WIDTH }, (_, col): CellColor =>
    mask & (1 << col) ? 'white' : 'black'));
}

function whiteIslands(colors: CellColor[][]): number[][] {
  const visited = new Set<number>();
  const islands: number[][] = [];
  for (let cell = 0; cell < WIDTH * HEIGHT; cell += 1) {
    if (visited.has(cell) || colors[Math.floor(cell / WIDTH)][cell % WIDTH] !== 'white') continue;
    const island = [cell];
    visited.add(cell);
    for (let i = 0; i < island.length; i += 1) {
      const current = island[i];
      const row = Math.floor(current / WIDTH);
      const col = current % WIDTH;
      for (const next of [
        ...(row > 0 ? [current - WIDTH] : []), ...(row + 1 < HEIGHT ? [current + WIDTH] : []),
        ...(col > 0 ? [current - 1] : []), ...(col + 1 < WIDTH ? [current + 1] : [])
      ]) {
        if (!visited.has(next) && colors[Math.floor(next / WIDTH)][next % WIDTH] === 'white') {
          visited.add(next);
          island.push(next);
        }
      }
    }
    islands.push(island);
  }
  return islands;
}

export function generateExperimentalHardPuzzle(
  seed: number, options: { maxDurationMs?: number } = {}
): HardExperimentResult {
  if (!Number.isSafeInteger(seed)) throw new Error('seed must be a safe integer');
  const maxDurationMs = options.maxDurationMs ?? 5000;
  if (!Number.isFinite(maxDurationMs) || maxDurationMs < 0) throw new Error('Invalid experiment duration');
  const start = performance.now();
  const deadline = start + maxDurationMs;
  const random = makeRandom(seed, 'hard');
  const diagnostics: HardExperimentDiagnostics = {
    elapsedMs: 0, attempts: 0, constructionNodes: 0, constructedBoards: 0,
    constructedLayoutKeys: [], constructionMs: 0, uniquenessMs: 0,
    clueTrials: 0, multipleSolutions: 0, inconclusiveProofs: 0,
    lastPlan: [], stopReason: 'attempt-limit'
  };
  for (let attempt = 0; attempt < MAX_ATTEMPTS && performance.now() < deadline; attempt += 1) {
    diagnostics.attempts += 1;
    const plan = Array.from({ length: MAX_CLUES }, (_, i) => i % 4 + 1);
    plan[plan.length - 1] = LARGEST_TARGET;
    if (attempt > 0) {
      const index = Math.floor(random() * plan.length);
      const value = Math.floor(random() * LARGEST_TARGET) + 1;
      if (plan[index] !== LARGEST_TARGET &&
          plan.filter((size) => size === value).length < getClueValueLimit(HARD_EXPERIMENT_PROFILE, plan.length)) {
        plan[index] = value;
      }
    }
    const planIssues = checkGenerationProfile(HARD_EXPERIMENT_PROFILE, summarizeClues(plan));
    if (planIssues.length > 0) throw new Error(`Invalid experimental plan: ${planIssues.map(({ code }) => code).join(', ')}`);
    diagnostics.lastPlan = plan;
    const constructionStart = performance.now();
    const colors = construct(plan, random, deadline, diagnostics);
    diagnostics.constructionMs += performance.now() - constructionStart;
    if (!colors) continue;
    diagnostics.constructedBoards += 1;
    diagnostics.constructedLayoutKeys.push(colors.map((row) =>
      row.map((color) => color === 'white' ? '1' : '0').join('')).join('/'));
    const islands = whiteIslands(colors);
    if (islands.map((island) => island.length).sort((a, b) => a - b).join(',') !==
        [...plan].sort((a, b) => a - b).join(',')) throw new Error('Constructed board does not match its plan');
    const positions = islands.map((island) => island[Math.floor(random() * island.length)]);
    for (let trial = 0; trial < MAX_CLUE_TRIALS && performance.now() < deadline; trial += 1) {
      diagnostics.clueTrials += 1;
      const clues = Array.from({ length: HEIGHT }, () => Array<number | null>(WIDTH).fill(null));
      islands.forEach((island, id) => {
        const cell = positions[id];
        clues[Math.floor(cell / WIDTH)][cell % WIDTH] = island.length;
      });
      const board: NurikabeBoard = { width: WIDTH, height: HEIGHT, colors, clues };
      if (!validateNurikabeBoard(board).valid) throw new Error('Invalid experimental construction');
      const proofStart = performance.now();
      const analysis = analyzePuzzle(board);
      const issues = checkGenerationProfile(HARD_EXPERIMENT_PROFILE, analysis);
      if (issues.length > 0) throw new Error(`Invalid experimental clue distribution: ${issues.map(({ code }) => code).join(', ')}`);
      const proof = analysis.solved ? 'deduction' : provePuzzleUniqueness(board, {
        maxOperations: 1000000, maxDurationMs: Math.max(0, Math.min(350, deadline - performance.now()))
      });
      diagnostics.uniquenessMs += performance.now() - proofStart;
      if (proof === 'deduction' || proof.status === 'unique') {
        diagnostics.stopReason = 'success';
        diagnostics.elapsedMs = performance.now() - start;
        return {
          status: 'success', diagnostics, proof: proof === 'deduction' ? 'deduction' : 'exhaustive',
          puzzle: createPuzzle({
            id: `experimental-10x15-hard-${seed}`, title: `Experimental Nurikabe hard #${seed}`,
            difficulty: 'hard'
          }, board)
        };
      }
      if (proof.status === 'multiple') {
        diagnostics.multipleSolutions += 1;
        const alternativeSizes = new Map<number, number>();
        for (const island of whiteIslands(proof.alternative)) {
          for (const cell of island) alternativeSizes.set(cell, island.length);
        }
        const changes = islands.flatMap((island, id) =>
          island.filter((cell) => alternativeSizes.get(cell) !== island.length).map((cell) => ({ id, cell })));
        if (changes.length > 0) {
          const change = changes[Math.floor(random() * changes.length)];
          positions[change.id] = change.cell;
          continue;
        }
      } else {
        diagnostics.inconclusiveProofs += 1;
      }
      positions.forEach((_, id) => {
        positions[id] = islands[id][Math.floor(random() * islands[id].length)];
      });
    }
  }
  diagnostics.elapsedMs = performance.now() - start;
  diagnostics.stopReason = performance.now() >= deadline ? 'time-limit' : 'attempt-limit';
  return { status: 'failed', diagnostics };
}
