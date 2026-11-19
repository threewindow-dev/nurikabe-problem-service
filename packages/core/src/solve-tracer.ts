import type { CellColor, DifficultyMetrics } from './index.js';

export type DeductionRule =
  | 'completedIsland' | 'blackSquare' | 'islandReach'
  | 'unreachable' | 'islandSeparation' | 'islandExpansion' | 'islandOverflow'
  | 'islandShapeIntersection' | 'islandShapeBoundary' | 'seaBridge' | 'whiteConnection'
  | 'sharedIslandSpace' | 'assumptionContradiction';
export type TechniqueLevel = 'basic' | 'intermediate' | 'advanced';
export type ReasoningStage = 1 | 2 | 3;

export const RULE_STAGES: Readonly<Record<DeductionRule, ReasoningStage>> = {
  completedIsland: 1,
  blackSquare: 1,
  islandSeparation: 1,
  islandExpansion: 1,
  islandOverflow: 1,
  unreachable: 2,
  islandReach: 3,
  islandShapeIntersection: 3,
  islandShapeBoundary: 3,
  seaBridge: 3,
  whiteConnection: 3,
  sharedIslandSpace: 3,
  assumptionContradiction: 3
};

export const RULE_PRIORITY: Readonly<Record<DeductionRule, number>> = {
  completedIsland: 1,
  blackSquare: 2,
  islandSeparation: 3,
  islandExpansion: 4,
  islandOverflow: 5,
  unreachable: 6,
  islandReach: 7,
  islandShapeIntersection: 8,
  islandShapeBoundary: 9,
  whiteConnection: 10,
  sharedIslandSpace: 11,
  seaBridge: 12,
  assumptionContradiction: 13
};

export const RULE_LEVELS: Readonly<Record<DeductionRule, TechniqueLevel>> = {
  completedIsland: 'basic',
  blackSquare: 'basic',
  islandReach: 'intermediate',
  unreachable: 'intermediate',
  islandSeparation: 'intermediate',
  islandExpansion: 'intermediate',
  islandOverflow: 'basic',
  islandShapeIntersection: 'intermediate',
  islandShapeBoundary: 'intermediate',
  seaBridge: 'advanced',
  whiteConnection: 'advanced',
  sharedIslandSpace: 'advanced',
  assumptionContradiction: 'advanced'
};

export interface SolveTraceStep {
  readonly scan: number;
  readonly rule: DeductionRule;
  readonly row: number;
  readonly col: number;
  readonly color: CellColor;
  readonly review: ReviewScope;
}

export interface ReviewScope {
  readonly cells: number;
  readonly rows: number;
  readonly columns: number;
}

export interface SolveCheckpoint {
  readonly scan: number;
  readonly confirmedBefore: number;
  readonly remainingCells: number;
  readonly candidateCells: number;
  readonly byStage: Readonly<Record<ReasoningStage, number>>;
}

export interface SolveTrace {
  readonly version: 7;
  readonly policy: 'priority-first';
  readonly steps: readonly SolveTraceStep[];
  readonly checkpoints: readonly SolveCheckpoint[];
  readonly observations: DifficultyMetrics & {
    readonly confirmedCells: number;
    readonly highestUsedLevel: TechniqueLevel | null;
    readonly highestStage: ReasoningStage | null;
    readonly maxReview: ReviewScope | null;
    readonly minCandidateCells: number | null;
    readonly singleCandidateCheckpoints: number;
  };
}

export class SolveTracer {
  private readonly steps: SolveTraceStep[] = [];
  private scan = 0;
  private readonly checkpoints: SolveCheckpoint[] = [];
  private readonly candidates = new Map<string, ReasoningStage>();

  constructor(private readonly width: number) {}

  beginScan(): boolean {
    this.scan += 1;
    return this.checkpoints[this.checkpoints.length - 1]?.confirmedBefore !== this.steps.length;
  }

  recordCandidate(row: number, col: number, rule: DeductionRule): void {
    const key = `${row},${col}`;
    const stage = RULE_STAGES[rule];
    const previous = this.candidates.get(key);
    this.candidates.set(key, previous !== undefined && previous < stage ? previous : stage);
  }

  finishCheckpoint(remainingCells: number): void {
    const byStage = { 1: 0, 2: 0, 3: 0 };
    for (const stage of this.candidates.values()) byStage[stage] += 1;
    this.checkpoints.push({
      scan: this.scan,
      confirmedBefore: this.steps.length,
      remainingCells,
      candidateCells: this.candidates.size,
      byStage
    });
    this.candidates.clear();
  }

  record(row: number, col: number, color: CellColor, rule: DeductionRule, reviewed: Iterable<number>): void {
    const positions = new Set(reviewed);
    positions.add(row * this.width + col);
    let minRow = row;
    let maxRow = row;
    let minCol = col;
    let maxCol = col;
    for (const position of positions) {
      const r = Math.floor(position / this.width);
      const c = position % this.width;
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    }
    this.steps.push({
      scan: this.scan, rule, row, col, color,
      review: { cells: positions.size, rows: maxRow - minRow + 1, columns: maxCol - minCol + 1 }
    });
  }

  finish(metrics: DifficultyMetrics): SolveTrace {
    const levels = new Set(this.steps.map(({ rule }) => RULE_LEVELS[rule]));
    const stages = this.steps.map(({ rule }) => RULE_STAGES[rule]);
    const maxReview = this.steps.reduce<ReviewScope | null>((largest, { review }) =>
      largest === null || review.cells > largest.cells ? review : largest, null);
    const pending = this.checkpoints.filter(({ remainingCells }) => remainingCells > 0);
    return {
      version: 7,
      policy: 'priority-first',
      steps: this.steps.map((step) => ({ ...step, review: { ...step.review } })),
      checkpoints: this.checkpoints.map((checkpoint) => ({ ...checkpoint, byStage: { ...checkpoint.byStage } })),
      observations: {
        ...metrics,
        deductions: { ...metrics.deductions },
        confirmedCells: this.steps.length,
        highestStage: stages.includes(3) ? 3 : stages.includes(2) ? 2 : stages.includes(1) ? 1 : null,
        maxReview: maxReview === null ? null : { ...maxReview },
        minCandidateCells: pending.length === 0 ? null
          : pending.reduce((min, { candidateCells }) => Math.min(min, candidateCells), Infinity),
        singleCandidateCheckpoints: pending.filter(({ candidateCells }) => candidateCells === 1).length,
        highestUsedLevel: levels.has('advanced') ? 'advanced'
          : levels.has('intermediate') ? 'intermediate' : levels.has('basic') ? 'basic' : null
      }
    };
  }
}
