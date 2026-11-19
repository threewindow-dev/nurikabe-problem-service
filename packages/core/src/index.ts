import { makeRandom } from './random.js';
import { enumerateIslandShapes, findSharedIslandSpace, findWhiteConnections } from './island-reasoning.js';
import { RULE_PRIORITY, SolveTracer, type DeductionRule, type SolveTrace } from './solve-tracer.js';
export { SolveTracer, RULE_LEVELS, RULE_STAGES, RULE_PRIORITY } from './solve-tracer.js';
export type {
  SolveTrace, SolveTraceStep, SolveCheckpoint, ReviewScope, ReasoningStage, DeductionRule, TechniqueLevel
} from './solve-tracer.js';
import {
  checkGenerationProfile, getClueCountBounds, getClueValueLimit, getGenerationProfile,
  summarizeClues, type GenerationProfile
} from './generation-profile.js';

export {
  checkGenerationProfile, getAutoSaveProfile, getClueCountBounds, getGenerationProfile, getSupportedWidths, summarizeClues, SUPPORTED_WIDTHS
} from './generation-profile.js';
export type { GenerationProfile, GenerationProfileViolation, QualityConstraints } from './generation-profile.js';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type CellColor = 'white' | 'black';
export type PlayCell = CellColor | 'unknown';
export type Clue = number;

const MAX_ISLAND_SHAPES = 50;
const MAX_ASSUMPTION_ISLAND_SHAPES = 5000;
const MAX_ASSUMPTION_SEARCH_MS = 50;
const MAX_EASY_ATTEMPTS = 15;
const MAX_EASY_DEDUCTION_CHECKS = 8000;
const MAX_LARGE_EASY_ATTEMPTS = 30;
const MAX_LARGE_EASY_DEDUCTION_CHECKS = 20000;
const MAX_NORMAL_ATTEMPTS = 20;
const MAX_NORMAL_DEDUCTION_CHECKS = 16000;
const MAX_REFINEMENT_DEDUCTION_CHECKS = 300;
const MAX_SPREAD_DEDUCTION_CHECKS = 60;

class DeductionContradiction extends Error {}
class AssumptionSearchLimit extends Error {}

export interface PuzzleMetadata {
  id: string;
  title: string;
  difficulty: Difficulty;
  generationDurationMs?: number;
}

export interface Puzzle extends PuzzleMetadata {
  definition: PuzzleDefinition;
  solution: SolutionBoard;
}

export interface PuzzleDefinition {
  width: number;
  height: number;
  clues: Array<Array<Clue | null>>;
}

export interface SolutionBoard {
  readonly width: number;
  readonly height: number;
  readonly colors: ReadonlyArray<ReadonlyArray<CellColor>>;
}

export type NurikabeBoard = PuzzleDefinition & SolutionBoard;

export function combineNurikabeBoard(definition: PuzzleDefinition, solution: SolutionBoard): NurikabeBoard {
  if (definition.width !== solution.width || definition.height !== solution.height) {
    throw new Error('Puzzle definition and solution dimensions must match.');
  }
  return { ...definition, colors: solution.colors };
}

export function createPuzzle(metadata: PuzzleMetadata, board: NurikabeBoard): Puzzle {
  const { width, height, clues, colors } = board;
  return {
    ...metadata,
    definition: { width, height, clues },
    solution: { width, height, colors }
  };
}

export interface PlayState extends PuzzleDefinition {
  cells: PlayCell[][];
}

export interface ValidationIssue {
  code:
    | 'invalid-shape'
    | 'invalid-clue'
    | 'invalid-color'
    | 'clue-on-black-cell'
    | 'island-without-clue'
    | 'island-with-multiple-clues'
    | 'island-size-mismatch'
    | 'black-not-connected'
    | 'black-2x2';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface PlayEvaluation {
  status: 'playing' | 'completed';
  issues: ValidationIssue[] | null;
}

export interface PuzzleQualityMetrics {
  cellCount: number;
  clueCount: number;
  oneClueCount: number;
  clueDistribution: Array<{ value: number; count: number }>;
  clueDensity: number;
  oneClueRatio: number | null;
}

export interface DifficultyMetrics {
  solved: boolean;
  remainingCells: number;
  deductionRounds: number;
  techniqueLevel: 'basic' | 'intermediate' | 'advanced' | null;
  deductions: {
    islandReach: number;
    islandSeparation: number;
    islandExpansion: number;
    islandOverflow: number;
    islandShapeIntersection: number;
    islandShapeBoundary: number;
    whiteConnection: number;
    sharedIslandSpace: number;
    completedIsland: number;
    unreachable: number;
    blackSquare: number;
    seaBridge: number;
    assumptionContradiction: number;
  };
}

export interface PuzzleAnalysis extends PuzzleQualityMetrics, DifficultyMetrics {
  solveTrace: SolveTrace;
}

function neighbors4(width: number, height: number, row: number, col: number): Array<[number, number]> {
  const candidates: Array<[number, number]> = [
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
  ];
  return candidates.filter(([r, c]) => r >= 0 && r < height && c >= 0 && c < width);
}

function neighborsForBoard(width: number, height: number): Array<Array<Array<[number, number]>>> {
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => neighbors4(width, height, row, col))
  );
}

function collectComponent(
  board: NurikabeBoard,
  startRow: number,
  startCol: number,
  color: CellColor,
  visited: boolean[][]
): Array<[number, number]> {
  const queue: Array<[number, number]> = [[startRow, startCol]];
  visited[startRow][startCol] = true;
  for (let i = 0; i < queue.length; i += 1) {
    const [row, col] = queue[i];
    for (const [r, c] of neighbors4(board.width, board.height, row, col)) {
      if (!visited[r][c] && board.colors[r][c] === color) {
        visited[r][c] = true;
        queue.push([r, c]);
      }
    }
  }
  return queue;
}

function hasValidClueShape({ width, height, clues }: PuzzleDefinition): boolean {
  if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0 ||
      !Array.isArray(clues) || clues.length !== height) {
    return false;
  }
  for (let row = 0; row < height; row += 1) {
    if (!Array.isArray(clues[row]) || clues[row].length !== width) {
      return false;
    }
  }
  return true;
}

function hasValidShape(board: NurikabeBoard): boolean {
  if (!hasValidClueShape(board) || !Array.isArray(board.colors) || board.colors.length !== board.height) {
    return false;
  }
  for (let row = 0; row < board.height; row += 1) {
    if (!Array.isArray(board.colors[row]) || board.colors[row].length !== board.width) return false;
  }
  return true;
}

function isValidClue(clue: number | null, width: number, height: number): boolean {
  return clue === null || (Number.isSafeInteger(clue) && clue > 0 && clue <= width * height);
}

export function validateNurikabeBoard(board: NurikabeBoard): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!hasValidShape(board)) {
    return { valid: false, issues: [{
      code: 'invalid-shape',
      message: 'Board dimensions must match the clue and color grids.'
    }] };
  }

  const { width, height, clues, colors } = board;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const clue = clues[row][col];
      if (!isValidClue(clue, width, height)) {
        issues.push({ code: 'invalid-clue', message: `Invalid clue at (${row}, ${col}).` });
      }
      if (colors[row][col] !== 'white' && colors[row][col] !== 'black') {
        issues.push({ code: 'invalid-color', message: `Invalid color at (${row}, ${col}).` });
      }
      if (clue !== null && colors[row][col] === 'black') {
        issues.push({ code: 'clue-on-black-cell', message: `Clue at (${row}, ${col}) cannot be on a black cell.` });
      }
    }
  }
  if (issues.some((issue) => issue.code === 'invalid-clue' || issue.code === 'invalid-color')) {
    return { valid: false, issues };
  }

  const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  let blackCount = 0;
  let connectedBlack = 0;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (colors[row][col] === 'black') {
        blackCount += 1;
        if (connectedBlack === 0) {
          connectedBlack = collectComponent(board, row, col, 'black', visited).length;
        }
        if (row + 1 < height && col + 1 < width &&
            colors[row + 1][col] === 'black' &&
            colors[row][col + 1] === 'black' &&
            colors[row + 1][col + 1] === 'black') {
          issues.push({ code: 'black-2x2', message: `2x2 black block found at top-left (${row}, ${col}).` });
        }
      } else if (!visited[row][col]) {
        const island = collectComponent(board, row, col, 'white', visited);
        const islandClues = island.map(([r, c]) => clues[r][c]).filter((value): value is number => value !== null);
        if (islandClues.length === 0) {
          issues.push({ code: 'island-without-clue', message: `Island including (${row}, ${col}) has no clue.` });
        } else if (islandClues.length > 1) {
          issues.push({ code: 'island-with-multiple-clues', message: `Island including (${row}, ${col}) has multiple clues.` });
        } else if (island.length !== islandClues[0]) {
          issues.push({ code: 'island-size-mismatch', message: `Island including (${row}, ${col}) has size ${island.length}, expected ${islandClues[0]}.` });
        }
      }
    }
  }
  if (blackCount !== connectedBlack) {
    issues.push({ code: 'black-not-connected', message: 'All black cells must form one connected component.' });
  }
  return { valid: issues.length === 0, issues };
}

export function createPlayState(puzzle: PuzzleDefinition): PlayState {
  if (!hasValidClueShape(puzzle)) throw new Error('Invalid puzzle dimensions or clue grid');
  for (let row = 0; row < puzzle.height; row += 1) {
    for (let col = 0; col < puzzle.width; col += 1) {
      if (!isValidClue(puzzle.clues[row][col], puzzle.width, puzzle.height)) {
        throw new Error('Invalid puzzle clue');
      }
    }
  }
  const clues = puzzle.clues.map((row) => [...row]);
  return {
    width: puzzle.width,
    height: puzzle.height,
    clues,
    cells: clues.map((row) => row.map((clue) => clue === null ? 'unknown' : 'white'))
  };
}

export function setPlayCell(state: PlayState, row: number, col: number, cell: PlayCell): PlayState {
  if (!Number.isInteger(row) || row < 0 || row >= state.height ||
      !Number.isInteger(col) || col < 0 || col >= state.width) {
    throw new Error('Cell coordinates are outside the board');
  }
  if (state.clues[row][col] !== null) throw new Error('Clue cells cannot be changed');
  if (cell !== 'unknown' && cell !== 'white' && cell !== 'black') throw new Error('Invalid play cell');
  const cells = state.cells.map((line, index) =>
    index === row ? line.map((value, column) => column === col ? cell : value) : line
  );
  return { ...state, cells };
}

export function evaluatePlayState(state: PlayState): PlayEvaluation {
  const colors: CellColor[][] = [];
  for (const row of state.cells) {
    const colorRow: CellColor[] = [];
    for (const cell of row) {
      if (cell === 'unknown') return { status: 'playing', issues: null };
      colorRow.push(cell);
    }
    colors.push(colorRow);
  }
  const result = validateNurikabeBoard({ ...state, colors });
  return { status: result.valid ? 'completed' : 'playing', issues: result.issues };
}

function cluesForColors(width: number, height: number, colors: CellColor[][], random: () => number): NurikabeBoard {
  const clues = Array.from({ length: height }, () => Array<number | null>(width).fill(null));
  const board = { width, height, clues, colors };
  const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (colors[row][col] === 'white' && !visited[row][col]) {
        const island = collectComponent(board, row, col, 'white', visited);
        const [r, c] = island[Math.floor(random() * island.length)];
        clues[r][c] = island.length;
      }
    }
  }
  return board;
}

// Each deduction is necessary in every solution; unresolved candidates are rejected.
function runDeductions(
  board: NurikabeBoard,
  mode: 'generation' | 'analysis' = 'generation',
  adjacent = neighborsForBoard(board.width, board.height),
  tracer?: SolveTracer
): DifficultyMetrics {
  const { width, height, clues, colors } = board;
  const cells: Array<Array<CellColor | null>> = clues.map((row) =>
    row.map((clue) => clue === null ? null : 'white')
  );
  const deductions: PuzzleAnalysis['deductions'] = {
    islandReach: 0, islandSeparation: 0, islandExpansion: 0, islandShapeIntersection: 0,
    completedIsland: 0, unreachable: 0, blackSquare: 0, seaBridge: 0,
    islandOverflow: 0, islandShapeBoundary: 0, whiteConnection: 0, sharedIslandSpace: 0,
    assumptionContradiction: 0
  };
  const islandState = { width, height, clues, cells, adjacent };
  const visited = new Uint32Array(width * height);
  let visitStamp = 0;
  let deductionRounds = 0;
  let probing = false;
  let trialing = false;
  const proposals = new Map<DeductionRule, {
    row: number; col: number; color: CellColor; reviewed?: Iterable<number>;
  }>();
  const wholeBoard = tracer ? Array.from({ length: width * height }, (_, i) => i) : undefined;
  const neighborhood = (positions: readonly number[]): number[] | undefined => tracer
    ? positions.flatMap((position) => [
      position, ...adjacent[Math.floor(position / width)][position % width].map(([r, c]) => r * width + c)
    ]) : undefined;
  const set = (
    row: number, col: number, color: CellColor, rule: keyof PuzzleAnalysis['deductions'],
    reviewed?: Iterable<number>
  ): boolean => {
    const current = cells[row][col];
    if (current === color) return false;
    if (current !== null) {
      if (trialing) throw new DeductionContradiction('Conflicting deduction');
      return false;
    }
    if (probing) {
      tracer?.recordCandidate(row, col, rule);
      if (!proposals.has(rule)) proposals.set(rule, { row, col, color, reviewed });
      return false;
    }
    if (tracer && !trialing) {
      if (!reviewed) throw new Error(`Missing review scope for ${rule}`);
      tracer.record(row, col, color, rule, reviewed);
    }
    cells[row][col] = color;
    if (!trialing) deductions[rule] += 1;
    return true;
  };

  const assertLogicalState = (): void => {
    for (let row = 0; row + 1 < height; row += 1) {
      for (let col = 0; col + 1 < width; col += 1) {
        if ([[row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]]
          .every(([r, c]) => cells[r][c] === 'black')) {
          throw new DeductionContradiction('Black 2x2');
        }
      }
    }
    const owner = new Int32Array(width * height).fill(-1);
    const components: number[][] = [];
    for (let start = 0; start < width * height; start += 1) {
      const row = Math.floor(start / width);
      const col = start % width;
      if (cells[row][col] !== 'white' || owner[start] !== -1) continue;
      const positions = [start];
      owner[start] = components.length;
      for (let i = 0; i < positions.length; i += 1) {
        for (const [r, c] of adjacent[Math.floor(positions[i] / width)][positions[i] % width]) {
          const next = r * width + c;
          if (cells[r][c] === 'white' && owner[next] === -1) {
            owner[next] = components.length;
            positions.push(next);
          }
        }
      }
      components.push(positions);
    }
    for (const positions of components) {
      const values = positions.flatMap((position) => {
        const value = clues[Math.floor(position / width)][position % width];
        return value === null ? [] : [value];
      });
      if (values.length > 1 || (values.length === 1 && positions.length > values[0])) {
        throw new DeductionContradiction('Invalid white component');
      }
    }
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const clue = clues[row][col];
        if (clue === null) continue;
        const candidate = enumerateIslandShapes(islandState, row * width + col, MAX_ISLAND_SHAPES, false);
        if (candidate !== null && candidate.shapes.length === 0) {
          throw new DeductionContradiction('Island has no shape');
        }
      }
    }
    const black = [];
    for (let position = 0; position < width * height; position += 1) {
      if (cells[Math.floor(position / width)][position % width] === 'black') black.push(position);
    }
    if (black.length > 1) {
      const reached = new Set([black[0]]);
      const queue = [black[0]];
      for (let i = 0; i < queue.length; i += 1) {
        for (const [r, c] of adjacent[Math.floor(queue[i] / width)][queue[i] % width]) {
          const next = r * width + c;
          if (cells[r][c] !== 'white' && !reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }
      if (black.some((position) => !reached.has(position))) {
        throw new DeductionContradiction('Sea cannot connect');
      }
    }
  };
  const preventIslandOverflow = (): boolean => {
    const owner = new Int32Array(width * height).fill(-1);
    const components: Array<{ positions: number[]; clue: number | null }> = [];
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const start = row * width + col;
        if (cells[row][col] !== 'white' || owner[start] !== -1) continue;
        const id = components.length;
        const positions = [start];
        let clue: number | null = null;
        owner[start] = id;
        for (let i = 0; i < positions.length; i += 1) {
          const r = Math.floor(positions[i] / width);
          const c = positions[i] % width;
          if (clues[r][c] !== null) {
            if (clue !== null) throw new Error('Contradiction in island capacity deduction');
            clue = clues[r][c];
          }
          for (const [nr, nc] of adjacent[r][c]) {
            const next = nr * width + nc;
            if (cells[nr][nc] === 'white' && owner[next] === -1) {
              owner[next] = id;
              positions.push(next);
            }
          }
        }
        components.push({ positions, clue });
      }
    }
    let updated = false;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (cells[row][col] !== null) continue;
        const ids = new Set(adjacent[row][col].map(([r, c]) => owner[r * width + c]).filter((id) => id !== -1));
        const connected = [...ids].map((id) => components[id]);
        const clued = connected.filter(({ clue }) => clue !== null);
        if (clued.length !== 1) continue;
        const limit = clued[0].clue;
        if (limit !== null && 1 + connected.reduce((size, { positions }) => size + positions.length, 0) > limit) {
          updated = set(row, col, 'black', 'islandOverflow',
            tracer ? neighborhood([row * width + col, ...connected.flatMap(({ positions }) => positions)]) : undefined
          ) || updated;
        }
      }
    }
    return updated;
  };
  const separateAndExpandIslands = (): boolean => {
    const owner = new Int32Array(width * height).fill(-1);
    const islands: Array<{ clue: number; size: number; frontier: number[]; component: number[] }> = [];
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const clue = clues[row][col];
        if (clue === null) continue;
        const id = islands.length;
        const start = row * width + col;
        if (owner[start] !== -1) throw new Error('Contradiction in island deduction');
        const component = [start];
        owner[start] = id;
        for (let i = 0; i < component.length; i += 1) {
          const position = component[i];
          for (const [r, c] of adjacent[Math.floor(position / width)][position % width]) {
            const next = r * width + c;
            if (cells[r][c] === 'white' && owner[next] === -1) {
              owner[next] = id;
              component.push(next);
            }
          }
        }
        islands.push({ clue, size: component.length, frontier: [], component });
      }
    }
    let updated = false;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (cells[row][col] !== null) continue;
        const neighboringIslands = new Set(adjacent[row][col]
          .map(([r, c]) => owner[r * width + c]).filter((id) => id !== -1));
        if (neighboringIslands.size > 1) {
          updated = set(row, col, 'black', 'islandSeparation',
            tracer ? neighborhood([row * width + col, ...[...neighboringIslands].flatMap((id) => islands[id].component)]) : undefined
          ) || updated;
        } else if (neighboringIslands.size === 1) {
          const id = neighboringIslands.values().next().value;
          if (id !== undefined) islands[id].frontier.push(row * width + col);
        }
      }
    }
    for (const island of islands) {
      if (island.size < island.clue && island.frontier.length === 1) {
        const position = island.frontier[0];
        updated = set(Math.floor(position / width), position % width, 'white', 'islandExpansion',
          neighborhood(island.component)) || updated;
      }
    }
    return updated;
  };
  // Every valid shape contains the confirmed part of its island and cannot touch another clue.
  const intersectIslandShapes = (): boolean => {
    let updated = false;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const clue = clues[row][col];
        if (clue === null || clue < (mode === 'analysis' ? 2 : 3)) continue;
        const start = row * width + col;
        const candidates = enumerateIslandShapes(islandState, start, MAX_ISLAND_SHAPES, Boolean(tracer));
        if (candidates === null || candidates.confirmed.size === clue) continue;
        const { shapes: valid, reviewed } = candidates;
        const boundaries = mode === 'analysis' ? valid.map((shape) => {
          const boundary = new Set<number>();
          for (const position of shape) {
            for (const [r, c] of adjacent[Math.floor(position / width)][position % width]) {
              const next = r * width + c;
              reviewed?.add(next);
              if (!shape.includes(next)) boundary.add(next);
            }
          }
          return boundary;
        }) : [];
        for (const position of valid[0]) {
          if (valid.every((shape) => shape.includes(position))) {
            updated = set(Math.floor(position / width), position % width, 'white', 'islandShapeIntersection', reviewed) || updated;
          }
        }
        for (const position of boundaries[0] ?? []) {
          if (boundaries.every((boundary) => boundary.has(position))) {
            updated = set(Math.floor(position / width), position % width, 'black', 'islandShapeBoundary', reviewed) || updated;
          }
        }
      }
    }
    return updated;
  };
  const connectWhite = (): boolean => {
    let updated = false;
    for (const position of findWhiteConnections(islandState)) {
      updated = set(Math.floor(position / width), position % width, 'white', 'whiteConnection', wholeBoard) || updated;
    }
    return updated;
  };
  const fillSharedIslandSpace = (): boolean => {
    let updated = false;
    for (const { positions, reviewed } of findSharedIslandSpace(islandState, MAX_ISLAND_SHAPES)) {
      for (const position of positions) {
        updated = set(Math.floor(position / width), position % width, 'white', 'sharedIslandSpace', reviewed) || updated;
      }
    }
    return updated;
  };
  // An unknown cell is sea if removing it disconnects already confirmed sea cells.
  const connectSea = (): boolean => {
    const black: number[] = [];
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (cells[row][col] === 'black') black.push(row * width + col);
      }
    }
    if (black.length < 2) return false;
    const discovery = new Int32Array(width * height).fill(-1);
    const low = new Int32Array(width * height);
    const blackCount = new Int32Array(width * height);
    let time = 0;
    let updated = false;
    const first = black[0];
    discovery[first] = low[first] = time++;
    blackCount[first] = 1;
    const stack: Array<{ position: number; parent: number; neighbors: number[]; next: number }> = [{
      position: first, parent: -1,
      neighbors: adjacent[Math.floor(first / width)][first % width].map(([r, c]) => r * width + c),
      next: 0
    }];
    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      if (current.next < current.neighbors.length) {
        const next = current.neighbors[current.next++];
        if (next === current.parent || cells[Math.floor(next / width)][next % width] === 'white') continue;
        if (discovery[next] !== -1) {
          low[current.position] = Math.min(low[current.position], discovery[next]);
          continue;
        }
        discovery[next] = low[next] = time++;
        if (cells[Math.floor(next / width)][next % width] === 'black') blackCount[next] = 1;
        stack.push({
          position: next, parent: current.position,
          neighbors: adjacent[Math.floor(next / width)][next % width].map(([r, c]) => r * width + c),
          next: 0
        });
      } else {
        stack.pop();
        if (current.parent === -1) continue;
        const parent = current.parent;
        blackCount[parent] += blackCount[current.position];
        low[parent] = Math.min(low[parent], low[current.position]);
        if (low[current.position] >= discovery[parent] && blackCount[current.position] > 0 &&
            cells[Math.floor(parent / width)][parent % width] === null) {
          updated = set(Math.floor(parent / width), parent % width, 'black', 'seaBridge', wholeBoard) || updated;
        }
      }
    }
    if (black.some((position) => discovery[position] === -1)) throw new Error('Contradiction in sea connectivity deduction');
    return updated;
  };
  const propagateAssumption = (row: number, col: number, color: CellColor): boolean => {
    const snapshot = cells.map((boardRow) => [...boardRow]);
    trialing = true;
    try {
      cells[row][col] = color;
      assertLogicalState();
      let changed = true;
      while (changed) {
        changed = scanCluesAndCells(true, true);
        changed = separateAndExpandIslands() || changed;
        changed = preventIslandOverflow() || changed;
        changed = connectWhite() || changed;
        changed = intersectIslandShapes() || changed;
        changed = fillSharedIslandSpace() || changed;
        changed = connectSea() || changed;
        assertLogicalState();
      }
      return true;
    } catch (error) {
      if (error instanceof DeductionContradiction ||
          (error instanceof Error && /Contradiction/.test(error.message))) return false;
      throw error;
    } finally {
      for (let r = 0; r < height; r += 1) cells[r].splice(0, width, ...snapshot[r]);
      trialing = false;
    }
  };
  const canCompleteAssumption = (row: number, col: number, color: CellColor): boolean | null => {
    const previous = cells[row][col];
    const deadline = performance.now() + MAX_ASSUMPTION_SEARCH_MS;
    cells[row][col] = color;
    try {
      type ShapeChoice = { mask: bigint; blocked: bigint };
      const choices: ShapeChoice[][] = [];
      for (let r = 0; r < height; r += 1) {
        for (let c = 0; c < width; c += 1) {
          if (clues[r][c] === null) continue;
          const result = enumerateIslandShapes(islandState, r * width + c, MAX_ASSUMPTION_ISLAND_SHAPES, false);
          if (result === null) return null;
          const shapes = result.shapes.map((positions) => {
            let mask = 0n;
            let blocked = 0n;
            for (const position of positions) {
              mask |= 1n << BigInt(position);
              blocked |= 1n << BigInt(position);
              for (const [nr, nc] of adjacent[Math.floor(position / width)][position % width]) {
                blocked |= 1n << BigInt(nr * width + nc);
              }
            }
            return { mask, blocked };
          });
          if (shapes.length === 0) return false;
          choices.push(shapes);
        }
      }
      let white = 0n;
      let black = 0n;
      for (let position = 0; position < width * height; position += 1) {
        const value = cells[Math.floor(position / width)][position % width];
        if (value === 'white') white |= 1n << BigInt(position);
        if (value === 'black') black |= 1n << BigInt(position);
      }
      const full = (1n << BigInt(width * height)) - 1n;
      const connectedSea = (sea: bigint): boolean => {
        if (sea === 0n) return true;
        let reached = sea & -sea;
        while (true) {
          if (performance.now() > deadline) throw new AssumptionSearchLimit();
          let expanded = reached;
          for (let position = 0; position < width * height; position += 1) {
            if (!(reached & (1n << BigInt(position)))) continue;
            for (const [r, c] of adjacent[Math.floor(position / width)][position % width]) {
              const bit = 1n << BigInt(r * width + c);
              if (sea & bit) expanded |= bit;
            }
          }
          if (expanded === reached) return reached === sea;
          reached = expanded;
        }
      };
      const validSea = (occupied: bigint): boolean => {
        if ((occupied & white) !== white || (occupied & black) !== 0n) return false;
        const sea = full ^ occupied;
        for (let r = 0; r + 1 < height; r += 1) {
          for (let c = 0; c + 1 < width; c += 1) {
            const position = r * width + c;
            const square = (1n << BigInt(position)) |
              (1n << BigInt(position + 1)) |
              (1n << BigInt(position + width)) |
              (1n << BigInt(position + width + 1));
            if ((sea & square) === square) return false;
          }
        }
        return connectedSea(sea);
      };
      const search = (remaining: typeof choices, occupied: bigint, blocked: bigint): boolean => {
        if (performance.now() > deadline) throw new AssumptionSearchLimit();
        if (remaining.length === 0) {
          if (!validSea(occupied)) return false;
          const colors = Array.from({ length: height }, (_, r) =>
            Array.from({ length: width }, (_, c): CellColor =>
              occupied & (1n << BigInt(r * width + c)) ? 'white' : 'black'));
          return validateNurikabeBoard({ width, height, clues, colors }).valid;
        }
        const filtered = remaining.map((shapes) => shapes.filter((shape) => !(shape.mask & blocked)));
        if (filtered.some((shapes) => shapes.length === 0)) return false;
        let possible = occupied;
        for (const shapes of filtered) {
          for (const shape of shapes) possible |= shape.mask;
        }
        if ((possible & white) !== white) return false;
        for (let r = 0; r + 1 < height; r += 1) {
          for (let c = 0; c + 1 < width; c += 1) {
            const position = r * width + c;
            const square = (1n << BigInt(position)) |
              (1n << BigInt(position + 1)) |
              (1n << BigInt(position + width)) |
              (1n << BigInt(position + width + 1));
            if ((possible & square) === 0n) return false;
          }
        }
        const nextIndex = filtered.reduce((best, shapes, index) =>
          shapes.length < filtered[best].length ? index : best, 0);
        const rest = filtered.filter((_, index) => index !== nextIndex);
        for (const shape of filtered[nextIndex]) {
          if (search(rest, occupied | shape.mask, blocked | shape.blocked)) return true;
        }
        return false;
      };
      return search(choices.sort((a, b) => a.length - b.length), 0n, 0n);
    } catch (error) {
      if (error instanceof AssumptionSearchLimit) return null;
      if (error instanceof DeductionContradiction ||
          (error instanceof Error && /Contradiction/.test(error.message))) return false;
      throw error;
    } finally {
      cells[row][col] = previous;
    }
  };
  const testAssumptions = (): { row: number; col: number; color: CellColor } | null => {
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (cells[row][col] !== null) continue;
        propagateAssumption(row, col, 'white');
        propagateAssumption(row, col, 'black');
        const whiteCompletes = canCompleteAssumption(row, col, 'white');
        const blackCompletes = canCompleteAssumption(row, col, 'black');
        if (whiteCompletes === false && blackCompletes !== null) return { row, col, color: 'black' };
        if (blackCompletes === false && whiteCompletes !== null) return { row, col, color: 'white' };
      }
    }
    return null;
  };
  const scanCluesAndCells = (useBasic: boolean, useIntermediate: boolean): boolean => {
    let changed = false;
    const reachable = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const clue = clues[row][col];
        if (clue === null) continue;
        if (useIntermediate) {
          if (clue === 1) {
            reachable[row][col] = true;
          } else {
            const stamp = ++visitStamp;
            const queue: Array<[number, number, number]> = [[row, col, 0]];
            visited[row * width + col] = stamp;
            for (let i = 0; i < queue.length; i += 1) {
              const [r, c, distance] = queue[i];
              reachable[r][c] = true;
              if (distance + 1 >= clue) continue;
              for (const [nr, nc] of adjacent[r][c]) {
                if (visited[nr * width + nc] !== stamp && cells[nr][nc] !== 'black' && clues[nr][nc] === null) {
                  visited[nr * width + nc] = stamp;
                  queue.push([nr, nc, distance + 1]);
                }
              }
            }
            if (queue.length === clue) {
              const reviewed = tracer ? neighborhood(queue.map(([r, c]) => r * width + c)) : undefined;
              for (const [r, c] of queue) changed = set(r, c, 'white', 'islandReach', reviewed) || changed;
            }
          }
        }
        if (useBasic) {
          if (clue === 1) {
            const reviewed = neighborhood([row * width + col]);
            for (const [nr, nc] of adjacent[row][col]) {
              changed = set(nr, nc, 'black', 'completedIsland', reviewed) || changed;
            }
          } else {
            const stamp = ++visitStamp;
            const component: Array<[number, number]> = [[row, col]];
            visited[row * width + col] = stamp;
            for (let i = 0; i < component.length; i += 1) {
              const [r, c] = component[i];
              for (const [nr, nc] of adjacent[r][c]) {
                if (visited[nr * width + nc] !== stamp && cells[nr][nc] === 'white') {
                  visited[nr * width + nc] = stamp;
                  component.push([nr, nc]);
                }
              }
            }
            if (component.length === clue) {
              const reviewed = tracer ? neighborhood(component.map(([r, c]) => r * width + c)) : undefined;
              for (const [r, c] of component) {
                for (const [nr, nc] of adjacent[r][c]) {
                  if (visited[nr * width + nc] !== stamp) changed = set(nr, nc, 'black', 'completedIsland', reviewed) || changed;
                }
              }
            }
          }
        }
      }
    }
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        if (useIntermediate && !reachable[row][col]) changed = set(row, col, 'black', 'unreachable', wholeBoard) || changed;
        if (useBasic && row + 1 < height && col + 1 < width) {
          const square: Array<[number, number]> = [[row, col], [row + 1, col], [row, col + 1], [row + 1, col + 1]];
          if (square.filter(([r, c]) => cells[r][c] === 'black').length === 3) {
            const reviewed = tracer ? square.map(([r, c]) => r * width + c) : undefined;
            for (const [r, c] of square) changed = set(r, c, 'white', 'blackSquare', reviewed) || changed;
          }
        }
      }
    }
    return changed;
  };
  let changed = true;
  while (changed) {
    if (mode === 'analysis') {
      tracer?.beginScan();
      proposals.clear();
      // Observe all candidates on one snapshot, then apply only the first-priority move.
      probing = true;
      scanCluesAndCells(true, true);
      preventIslandOverflow();
      separateAndExpandIslands();
      connectWhite();
      intersectIslandShapes();
      fillSharedIslandSpace();
      connectSea();
      probing = false;
      tracer?.finishCheckpoint(cells.reduce((total, row) => total + row.filter((cell) => cell === null).length, 0));
      const next = [...proposals].sort(([a], [b]) => RULE_PRIORITY[a] - RULE_PRIORITY[b])[0];
      if (!next) {
        const assumption = testAssumptions();
        if (assumption === null) {
          changed = false;
          continue;
        }
        if (!set(assumption.row, assumption.col, assumption.color, 'assumptionContradiction', wholeBoard)) {
          throw new Error('Assumption deduction did not confirm a new cell');
        }
        deductionRounds += 1;
        continue;
      }
      const [rule, { row, col, color, reviewed }] = next;
      if (!set(row, col, color, rule, reviewed)) throw new Error('Priority deduction did not confirm a new cell');
      deductionRounds += 1;
      continue;
    }
    changed = scanCluesAndCells(true, true);
    if (!changed) changed = separateAndExpandIslands();
    if (!changed) changed = intersectIslandShapes();
    if (!changed) changed = connectSea();
    if (changed) deductionRounds += 1;
  }
  const remainingCells = cells.reduce((total, row) =>
    total + row.filter((cell) => cell === null).length, 0
  );
  const solved = remainingCells === 0;
  const techniqueLevel = solved
    ? deductions.seaBridge > 0 || deductions.whiteConnection > 0 || deductions.sharedIslandSpace > 0 ||
        deductions.assumptionContradiction > 0 ? 'advanced'
      : deductions.islandReach > 0 || deductions.islandSeparation > 0 || deductions.islandExpansion > 0 ||
        deductions.islandShapeIntersection > 0 || deductions.islandShapeBoundary > 0 ||
        deductions.unreachable > 0 ? 'intermediate' : 'basic'
    : null;
  return { solved, remainingCells, deductionRounds, techniqueLevel, deductions };
}

export function analyzePuzzle(board: NurikabeBoard): PuzzleAnalysis {
  const validation = validateNurikabeBoard(board);
  if (!validation.valid) {
    throw new Error(`Cannot analyze invalid board: ${validation.issues.map((issue) => issue.code).join(', ')}`);
  }
  const cellCount = board.width * board.height;
  const clues = board.clues.flat().filter((clue): clue is number => clue !== null);
  const oneClueCount = clues.filter((clue) => clue === 1).length;
  const { clueDistribution } = summarizeClues(clues);
  clueDistribution.sort((a, b) => a.value - b.value);
  const tracer = new SolveTracer(board.width);
  const difficulty = runDeductions(board, 'analysis', neighborsForBoard(board.width, board.height), tracer);
  return {
    cellCount,
    clueCount: clues.length,
    oneClueCount,
    clueDistribution,
    clueDensity: clues.length / cellCount,
    oneClueRatio: clues.length === 0 ? null : oneClueCount / clues.length,
    ...difficulty,
    solveTrace: tracer.finish(difficulty)
  };
}

function refineBalancedBoard(
  initial: NurikabeBoard,
  positions: number[],
  adjacent: Array<Array<Array<[number, number]>>>,
  profile: GenerationProfile
): NurikabeBoard {
  const { width, height } = initial;
  const whiteTarget = Math.ceil(width * height / 2);
  let result = initial;
  let whiteCount = result.colors.flat().filter((color) => color === 'white').length;
  let checks = 0;
  const isEdge = (row: number, col: number): boolean =>
    row === 0 || row === height - 1 || col === 0 || col === width - 1;
  const gapsAt = (row: number, col: number, oldRow: number, oldCol: number): number =>
    [[row - 2, col], [row + 2, col], [row, col - 2], [row, col + 2]]
      .filter(([r, c]) => r >= 0 && r < height && c >= 0 && c < width &&
        (r !== oldRow || c !== oldCol) && result.clues[r][c] !== null).length;
  const placement = (board: NurikabeBoard): { edges: number; gaps: number } => {
    let edges = 0;
    let gaps = 0;
    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) {
        if (board.clues[r][c] === null) continue;
        if (isEdge(r, c)) edges += 1;
        if (r + 2 < height && board.clues[r + 2][c] !== null) gaps += 1;
        if (c + 2 < width && board.clues[r][c + 2] !== null) gaps += 1;
      }
    }
    return { edges, gaps };
  };
  while (whiteCount < whiteTarget && checks < MAX_REFINEMENT_DEDUCTION_CHECKS) {
    let improved = false;
    const previousPlacement = placement(result);
    for (const position of positions) {
      const row = Math.floor(position / width);
      const col = position % width;
      if (result.colors[row][col] !== 'black' ||
          !adjacent[row][col].some(([r, c]) => result.colors[r][c] === 'white')) continue;
      const colors = result.colors.map((line) => [...line]);
      colors[row][col] = 'white';
      const candidate: NurikabeBoard = {
        width, height,
        clues: result.clues.map((line) => [...line]),
        colors
      };
      const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
      const island = collectComponent(candidate, row, col, 'white', visited);
      const oldPositions = island.filter(([r, c]) => candidate.clues[r][c] !== null);
      if (oldPositions.length === 0) continue;
      for (const [r, c] of oldPositions) candidate.clues[r][c] = null;
      const [firstRow, firstCol] = oldPositions[0];
      candidate.clues[firstRow][firstCol] = island.length;
      const clues = candidate.clues.flat().filter((clue): clue is number => clue !== null);
      if (checkGenerationProfile(profile, summarizeClues(clues)).length !== 0 ||
          !validateNurikabeBoard(candidate).valid) continue;
      candidate.clues[firstRow][firstCol] = null;
      const cluePositions = [...oldPositions, ...island.filter(([r, c]) =>
        !oldPositions.some(([oldRow, oldCol]) => r === oldRow && c === oldCol)
      )];
      for (const [clueRow, clueCol] of cluePositions) {
        if (checks >= MAX_REFINEMENT_DEDUCTION_CHECKS) break;
        candidate.clues[clueRow][clueCol] = island.length;
        const nextPlacement = placement(candidate);
        if (nextPlacement.edges > previousPlacement.edges || nextPlacement.gaps > previousPlacement.gaps) {
          candidate.clues[clueRow][clueCol] = null;
          continue;
        }
        checks += 1;
        if (runDeductions(candidate, 'generation', adjacent).solved) {
          result = candidate;
          whiteCount += 1;
          improved = true;
          break;
        }
        candidate.clues[clueRow][clueCol] = null;
      }
      if (improved || checks >= MAX_REFINEMENT_DEDUCTION_CHECKS) break;
    }
    if (!improved) break;
  }

  const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  for (let row = 0; row < height && checks < MAX_REFINEMENT_DEDUCTION_CHECKS; row += 1) {
    for (let col = 0; col < width && checks < MAX_REFINEMENT_DEDUCTION_CHECKS; col += 1) {
      if (result.colors[row][col] !== 'white' || visited[row][col]) continue;
      const island = collectComponent(result, row, col, 'white', visited);
      const cluePosition = island.find(([r, c]) => result.clues[r][c] !== null);
      if (!cluePosition) throw new Error('Missing clue in generated island');
      const [oldRow, oldCol] = cluePosition;
      const clue = result.clues[oldRow][oldCol];
      if (clue === null) throw new Error('Missing clue in generated island');
      const oldGaps = gapsAt(oldRow, oldCol, oldRow, oldCol);
      for (const [r, c] of island) {
        if (r === oldRow && c === oldCol) continue;
        const oldEdge = Number(isEdge(oldRow, oldCol));
        const newEdge = Number(isEdge(r, c));
        const newGaps = gapsAt(r, c, oldRow, oldCol);
        if (newEdge > oldEdge || newGaps > oldGaps ||
            (newEdge === oldEdge && newGaps === oldGaps)) continue;
        const clues = result.clues.map((line) => [...line]);
        clues[oldRow][oldCol] = null;
        clues[r][c] = clue;
        const candidate = { ...result, clues };
        checks += 1;
        if (runDeductions(candidate, 'generation', adjacent).solved) {
          result = candidate;
          break;
        }
        if (checks >= MAX_REFINEMENT_DEDUCTION_CHECKS) break;
      }
    }
  }
  return result;
}

function spreadClues(
  initial: NurikabeBoard,
  adjacent: Array<Array<Array<[number, number]>>>
): NurikabeBoard {
  const { width, height } = initial;
  const rowCounts = initial.clues.map((row) => row.filter((clue) => clue !== null).length);
  const colCounts = initial.clues[0].map((_, col) =>
    initial.clues.filter((row) => row[col] !== null).length);
  const isEdge = (row: number, col: number) =>
    row === 0 || row === height - 1 || col === 0 || col === width - 1;
  let result = initial;
  let checks = 0;
  while (checks < MAX_SPREAD_DEDUCTION_CHECKS) {
    const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
    const moves: { fromRow: number; fromCol: number; toRow: number; toCol: number; gain: number }[] = [];
    for (let fromRow = 0; fromRow < height; fromRow++) {
      for (let fromCol = 0; fromCol < width; fromCol++) {
        const clue = result.clues[fromRow][fromCol];
        if (clue === null || clue === 1) continue;
        const island = collectComponent(result, fromRow, fromCol, 'white', visited);
        for (const [toRow, toCol] of island) {
          if (!isEdge(fromRow, fromCol) && isEdge(toRow, toCol)) continue;
          // Gain is the reduction in pairs of clues sharing a row or column.
          const gain = (fromRow === toRow ? 0 : rowCounts[fromRow] - 1 - rowCounts[toRow]) +
            (fromCol === toCol ? 0 : colCounts[fromCol] - 1 - colCounts[toCol]);
          if (gain > 0) moves.push({ fromRow, fromCol, toRow, toCol, gain });
        }
      }
    }

    let improved = false;
    for (const { fromRow, fromCol, toRow, toCol } of moves.sort((a, b) => b.gain - a.gain)) {
      if (checks >= MAX_SPREAD_DEDUCTION_CHECKS) break;
      const clues = result.clues.map((row) => [...row]);
      clues[toRow][toCol] = clues[fromRow][fromCol];
      clues[fromRow][fromCol] = null;
      const candidate = { ...result, clues };
      checks += 1;
      if (!runDeductions(candidate, 'generation', adjacent).solved) continue;
      result = candidate;
      rowCounts[fromRow]--;
      rowCounts[toRow]++;
      colCounts[fromCol]--;
      colCounts[toCol]++;
      improved = true;
      break;
    }
    if (!improved) break;
  }
  return result;
}

function generateBalancedBoard(profile: GenerationProfile, seed: number): NurikabeBoard {
  const { size: { width, height }, difficulty, quality: { minLargestClue: largestTarget } } = profile;
  const { max: maximumClues } = getClueCountBounds(profile);
  const random = makeRandom(seed, difficulty);
  const adjacent = neighborsForBoard(width, height);
  const maxAttempts = difficulty === 'easy'
    ? width === 12 ? MAX_LARGE_EASY_ATTEMPTS : MAX_EASY_ATTEMPTS
    : MAX_NORMAL_ATTEMPTS;
  const maxChecks = difficulty === 'easy'
    ? width === 12 ? MAX_LARGE_EASY_DEDUCTION_CHECKS : MAX_EASY_DEDUCTION_CHECKS
    : MAX_NORMAL_DEDUCTION_CHECKS;
  const growthThreshold = difficulty === 'normal' && width === 12 ? 0.8 : 0.7;
  const failureMessage = `Failed to generate ${difficulty === 'easy' ? 'an' : 'a'} ${difficulty} puzzle meeting the quality and uniqueness targets`;
  let checks = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rowOffset = Math.floor(random() * 2);
    const colOffset = Math.floor(random() * 2);
    const colors: CellColor[][] = Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, col) =>
        row % 2 === rowOffset && col % 2 === colOffset ? 'white' : 'black'
      )
    );
    let result = cluesForColors(width, height, colors, random);
    const positions = Array.from({ length: width * height }, (_, index) => index);
    for (let i = positions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let pass = 0; pass < width * height; pass += 1) {
      const clues = result.clues.flat().filter((clue): clue is number => clue !== null);
      const largest = Math.max(...clues);
      const summary = summarizeClues(clues);
      if (checkGenerationProfile(profile, summary).length === 0 &&
          validateNurikabeBoard(result).valid && runDeductions(result, 'generation', adjacent).solved) {
        const refined = refineBalancedBoard(result, positions, adjacent, profile);
        return difficulty === 'normal' && width === 12 ? spreadClues(refined, adjacent) : refined;
      }
      const valueLimit = getClueValueLimit(profile, clues.length);
      const excess = summary.clueDistribution.filter(({ count }) => count > valueLimit).map(({ value }) => value);
      const oneCount = summary.clueDistribution.find(({ value }) => value === 1)?.count ?? 0;
      const growing = largest < largestTarget && oneCount <= clues.length * growthThreshold;
      let improved = false;
      for (const position of positions) {
        const row = Math.floor(position / width);
        const col = position % width;
        if (result.colors[row][col] !== 'black' ||
            !adjacent[row][col].some(([r, c]) => result.colors[r][c] === 'white')) continue;
        const colors = result.colors.map((line) => [...line]);
        colors[row][col] = 'white';
        const candidate: NurikabeBoard = {
          width, height,
          clues: result.clues.map((line) => [...line]),
          colors
        };
        const visited = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
        const island = collectComponent(candidate, row, col, 'white', visited);
        const old = island.map(([r, c]) => candidate.clues[r][c])
          .filter((clue): clue is number => clue !== null);
        const nextClues = [...clues];
        for (const clue of old) nextClues.splice(nextClues.indexOf(clue), 1);
        nextClues.push(island.length);
        if (nextClues.length < 4 || (growing && island.length <= largest)) continue;
        if (!growing) {
          if (excess.length && !old.some((value) => excess.includes(value))) continue;
          if (excess.length === 0 && clues.length > maximumClues && old.length < 2) continue;
          if (excess.length === 0 && clues.length <= maximumClues &&
              (new Set(nextClues).size <= summary.clueDistribution.length || Math.max(...nextClues) > largest)) continue;
        }
        for (const [r, c] of island) candidate.clues[r][c] = null;
        const cluePositions = [...island];
        for (let i = cluePositions.length - 1; i > 0; i -= 1) {
          const j = Math.floor(random() * (i + 1));
          [cluePositions[i], cluePositions[j]] = [cluePositions[j], cluePositions[i]];
        }
        const [firstRow, firstCol] = cluePositions[0];
        candidate.clues[firstRow][firstCol] = island.length;
        if (!validateNurikabeBoard(candidate).valid) continue;
        candidate.clues[firstRow][firstCol] = null;
        for (const [clueRow, clueCol] of cluePositions) {
          candidate.clues[clueRow][clueCol] = island.length;
          checks += 1;
          if (checks > maxChecks) {
            throw new Error(failureMessage);
          }
          if (runDeductions(candidate, 'generation', adjacent).solved) {
            result = candidate;
            improved = true;
            break;
          }
          candidate.clues[clueRow][clueCol] = null;
        }
        if (improved) break;
      }
      if (!improved) break;
    }
  }
  throw new Error(failureMessage);
}

export function generateNurikabeBoard(width: number, seed: number, difficulty: Difficulty = 'normal'): NurikabeBoard {
  const profile = getGenerationProfile(width, difficulty);
  if (!Number.isSafeInteger(seed)) throw new Error('seed must be a safe integer');
  return generateBalancedBoard(profile, seed);
}

export function createSeededPuzzle(width: number, seed: number, difficulty: Difficulty = 'normal'): Puzzle {
  const board = generateNurikabeBoard(width, seed, difficulty);
  return createPuzzle({
    id: `p-${width}x${board.height}-${difficulty}-${seed}`,
    title: `Nurikabe ${difficulty} #${seed}`,
    difficulty
  }, board);
}
