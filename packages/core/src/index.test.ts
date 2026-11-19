import { describe, expect, it, vi } from 'vitest';
import {
  analyzePuzzle,
  combineNurikabeBoard,
  createSeededPuzzle,
  createPlayState,
  evaluatePlayState,
  generateNurikabeBoard,
  RULE_STAGES,
  setPlayCell,
  type NurikabeBoard,
  validateNurikabeBoard
} from './index';

function board(input: NurikabeBoard): NurikabeBoard {
  return input;
}

// Enumerate possible island shapes independently of the generator's deductions.
function countSolutions(input: NurikabeBoard): number {
  const { width, height, clues } = input;
  const neighbors = (cell: number) => {
    const row = Math.floor(cell / width);
    const col = cell % width;
    return [
      ...(row > 0 ? [cell - width] : []),
      ...(row + 1 < height ? [cell + width] : []),
      ...(col > 0 ? [cell - 1] : []),
      ...(col + 1 < width ? [cell + 1] : [])
    ];
  };
  const clueCells = clues.flat().flatMap((value, cell) => value === null ? [] : [{ value, cell }]);
  const choices = clueCells.map(({ value, cell }) => {
    const others = clueCells.filter((other) => other.cell !== cell).map((other) => other.cell);
    const forbidden = new Set(others.flatMap((other) => [other, ...neighbors(other)]));
    let shapes = new Map<string, number[]>([[String(cell), [cell]]]);
    for (let size = 1; size < value; size += 1) {
      const next = new Map<string, number[]>();
      for (const shape of shapes.values()) {
        for (const candidate of shape.flatMap(neighbors)) {
          if (shape.includes(candidate) || forbidden.has(candidate)) continue;
          const expanded = [...shape, candidate].sort((a, b) => a - b);
          next.set(expanded.join(','), expanded);
        }
      }
      shapes = next;
    }
    return [...shapes.values()];
  }).sort((a, b) => a.length - b.length);

  let solutions = 0;
  const occupied = new Set<number>();
  const fixedClues = new Set(clueCells.map(({ cell }) => cell));
  const search = (choicesLeft: number[][][]) => {
    if (solutions >= 2) return;
    if (choicesLeft.length === 0) {
      const colors = Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, col) =>
          occupied.has(row * width + col) ? 'white' as const : 'black' as const
        )
      );
      if (validateNurikabeBoard({ width, height, clues, colors }).valid) solutions += 1;
      return;
    }
    const remaining = choicesLeft.map((shapes) => shapes.filter((shape) =>
      !shape.some((cell) => occupied.has(cell) || neighbors(cell).some((n) => occupied.has(n)))
    ));
    if (remaining.some((shapes) => shapes.length === 0)) return;
    const possibleWhite = new Set(occupied);
    for (const shapes of remaining) {
      for (const shape of shapes) {
        for (const cell of shape) possibleWhite.add(cell);
      }
    }
    for (let row = 0; row < height - 1; row += 1) {
      for (let col = 0; col < width - 1; col += 1) {
        const topLeft = row * width + col;
        if ([topLeft, topLeft + 1, topLeft + width, topLeft + width + 1]
          .every((cell) => !possibleWhite.has(cell))) return;
      }
    }
    const forcedBlack = Array.from({ length: width * height }, (_, cell) => cell)
      .filter((cell) => !possibleWhite.has(cell));
    if (forcedBlack.length > 1) {
      const reachable = new Set<number>([forcedBlack[0]]);
      const queue = [forcedBlack[0]];
      for (let i = 0; i < queue.length; i += 1) {
        for (const cell of neighbors(queue[i])) {
          if (!reachable.has(cell) && !occupied.has(cell) && !fixedClues.has(cell)) {
            reachable.add(cell);
            queue.push(cell);
          }
        }
      }
      if (forcedBlack.some((cell) => !reachable.has(cell))) return;
    }
    const nextIndex = remaining.reduce(
      (best, shapes, i) => shapes.length < remaining[best].length ? i : best, 0
    );
    const nextChoices = remaining.filter((_, i) => i !== nextIndex);
    for (const shape of remaining[nextIndex]) {
      shape.forEach((cell) => occupied.add(cell));
      search(nextChoices);
      shape.forEach((cell) => occupied.delete(cell));
    }
  };
  search(choices);
  return solutions;
}

describe('validateNurikabeBoard', () => {
  it('returns valid for a well-formed Nurikabe board', () => {
    const sample = board({
      width: 2, height: 2,
      clues: [
        [4, null],
        [null, null]
      ],
      colors: [
        ['white', 'white'],
        ['white', 'white']
      ]
    });

    const result = validateNurikabeBoard(sample);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports invalid-shape when board dimensions do not match size', () => {
    const result = validateNurikabeBoard({
      width: 2, height: 2,
      clues: [[1, null]],
      colors: [
        ['white', 'white'],
        ['white', 'white']
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'invalid-shape')).toBe(true);
  });

  it('validates rectangular boards', () => {
    expect(validateNurikabeBoard({
      width: 3, height: 2,
      clues: [[6, null, null], [null, null, null]],
      colors: [['white', 'white', 'white'], ['white', 'white', 'white']]
    }).valid).toBe(true);
  });

  it('accepts a single clue cell as a completed board', () => {
    expect(validateNurikabeBoard({
      width: 1, height: 1, clues: [[1]], colors: [['white']]
    })).toEqual({ valid: true, issues: [] });
  });

  it.each([0, -1, 1.5, 2, NaN, Infinity])('rejects invalid clue value %s', (clue) => {
    const result = validateNurikabeBoard({
      width: 1, height: 1, clues: [[clue]], colors: [['white']]
    });
    expect(result.issues.some((issue) => issue.code === 'invalid-clue')).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid dimensions %s', (width) => {
    expect(validateNurikabeBoard({
      width, height: 1, clues: [[1]], colors: [['white']]
    }).issues[0].code).toBe('invalid-shape');
  });

  it('rejects invalid runtime cell colors', () => {
    const invalid = 'red' as NurikabeBoard['colors'][number][number];
    expect(validateNurikabeBoard({
      width: 1, height: 1, clues: [[1]], colors: [[invalid]]
    }).issues[0].code).toBe('invalid-color');
  });

  it('reports clue-on-black-cell when a clue is placed on black', () => {
    const result = validateNurikabeBoard({
      width: 2, height: 2,
      clues: [
        [1, null],
        [null, null]
      ],
      colors: [
        ['black', 'white'],
        ['white', 'white']
      ]
    });

    expect(result.issues.some((issue) => issue.code === 'clue-on-black-cell')).toBe(true);
  });

  it('reports island-without-clue when a white island has no clue', () => {
    const result = validateNurikabeBoard({
      width: 2, height: 2,
      clues: [
        [null, null],
        [null, null]
      ],
      colors: [
        ['white', 'black'],
        ['black', 'black']
      ]
    });

    expect(result.issues.some((issue) => issue.code === 'island-without-clue')).toBe(true);
  });

  it('reports island-with-multiple-clues when one island contains multiple clues', () => {
    const result = validateNurikabeBoard({
      width: 2, height: 2,
      clues: [
        [1, 1],
        [null, null]
      ],
      colors: [
        ['white', 'white'],
        ['black', 'black']
      ]
    });

    expect(result.issues.some((issue) => issue.code === 'island-with-multiple-clues')).toBe(true);
  });

  it('reports island-size-mismatch when an island size differs from its clue', () => {
    const result = validateNurikabeBoard({
      width: 2, height: 2,
      clues: [
        [1, null],
        [null, null]
      ],
      colors: [
        ['white', 'white'],
        ['black', 'black']
      ]
    });

    expect(result.issues.some((issue) => issue.code === 'island-size-mismatch')).toBe(true);
  });

  it('reports black-2x2 when black cells form a 2x2 block', () => {
    const result = validateNurikabeBoard({
      width: 2, height: 2,
      clues: [
        [null, null],
        [null, null]
      ],
      colors: [
        ['black', 'black'],
        ['black', 'black']
      ]
    });

    expect(result.issues.some((issue) => issue.code === 'black-2x2')).toBe(true);
  });

  it('reports black-not-connected when black cells are disconnected', () => {
    const result = validateNurikabeBoard({
      width: 3, height: 3,
      clues: [
        [null, 7, null],
        [null, null, null],
        [null, null, null]
      ],
      colors: [
        ['black', 'white', 'white'],
        ['white', 'white', 'white'],
        ['white', 'white', 'black']
      ]
    });

    expect(result.issues.some((issue) => issue.code === 'black-not-connected')).toBe(true);
  });
});

describe('play state', () => {
  const puzzle: NurikabeBoard = {
    width: 2, height: 2,
    clues: [[2, null], [null, null]],
    colors: [['white', 'white'], ['black', 'black']]
  };

  it('initializes clues as white and other cells as unknown without revealing the solution', () => {
    const state = createPlayState(puzzle);
    expect(state.cells).toEqual([['white', 'unknown'], ['unknown', 'unknown']]);
    expect(evaluatePlayState(state)).toEqual({ status: 'playing', issues: null });
    expect(state.clues).not.toBe(puzzle.clues);
    expect(state.clues[0]).not.toBe(puzzle.clues[0]);
  });

  it('rejects invalid clue grids and values', () => {
    expect(() => createPlayState({ width: 2, height: 2, clues: [[1, null]] })).toThrow();
    expect(() => createPlayState({ width: 1, height: 1, clues: [[0]] })).toThrow();
  });

  it('updates immutably and rejects clue and out-of-bounds edits', () => {
    const state = createPlayState(puzzle);
    const updated = setPlayCell(state, 0, 1, 'black');
    expect(state.cells[0][1]).toBe('unknown');
    expect(updated.cells[0][1]).toBe('black');
    expect(() => setPlayCell(state, 0, 0, 'black')).toThrow();
    expect(() => setPlayCell(state, -1, 0, 'white')).toThrow();
    expect(() => setPlayCell(state, 0.5, 0, 'white')).toThrow();
  });

  it('does not validate until all cells are marked, then reports incorrect and completed boards', () => {
    let state = createPlayState(puzzle);
    state = setPlayCell(state, 0, 1, 'white');
    state = setPlayCell(state, 1, 0, 'white');
    expect(evaluatePlayState(state)).toEqual({ status: 'playing', issues: null });
    state = setPlayCell(state, 1, 1, 'black');
    expect(evaluatePlayState(state).status).toBe('playing');
    expect(evaluatePlayState(state).issues?.length).toBeGreaterThan(0);
    state = setPlayCell(state, 1, 0, 'black');
    expect(evaluatePlayState(state)).toEqual({ status: 'completed', issues: [] });
    state = setPlayCell(state, 0, 1, 'unknown');
    expect(evaluatePlayState(state)).toEqual({ status: 'playing', issues: null });
  });

  it('accepts a valid solution even if it differs from the supplied board colors', () => {
    let state = createPlayState(puzzle);
    state = setPlayCell(state, 0, 1, 'black');
    state = setPlayCell(state, 1, 0, 'white');
    state = setPlayCell(state, 1, 1, 'black');
    expect(evaluatePlayState(state).status).toBe('completed');
  });
});

describe('puzzle analysis', () => {
  it('restarts from the highest-priority rule after every confirmed cell', () => {
    const analysis = analyzePuzzle({
      width: 6, height: 9,
      clues: [
        [null, null, 3, null, null, null],
        [null, 1, null, null, null, 1],
        [null, null, null, null, null, null],
        [null, null, null, null, null, 6],
        [null, null, 4, null, null, null],
        [null, 2, null, 3, null, null],
        [null, null, null, null, null, null],
        [2, null, null, null, null, null],
        [null, null, null, null, null, null]
      ],
      colors: [
        'bbwwbb', 'bwbwbw', 'bbbbbb', 'bwwwbw', 'bbwbbw',
        'wwbwbw', 'bbbwbw', 'wwbwbw', 'bbbbbw'
      ].map((row) => [...row].map((cell) => cell === 'w' ? 'white' : 'black'))
    });
    const { steps, checkpoints } = analysis.solveTrace;
    expect(analysis.solved).toBe(true);
    for (const [row, col, color, rule] of [
      [6, 0, 'black', 'completedIsland'],
      [5, 0, 'white', 'islandExpansion'],
      [7, 5, 'white', 'islandShapeIntersection'],
      [8, 5, 'white', 'islandExpansion']
    ] as const) {
      expect(steps.find((step) => step.row === row && step.col === col)).toMatchObject({ color, rule });
    }
    expect(checkpoints).toHaveLength(steps.length + 1);
    for (const [index, step] of steps.entries()) {
      const checkpoint = checkpoints[index];
      expect(checkpoint.confirmedBefore).toBe(index);
      const firstStage = checkpoint.byStage[1] > 0 ? 1 : checkpoint.byStage[2] > 0 ? 2
        : checkpoint.byStage[3] > 0 ? 3 : 4;
      expect(RULE_STAGES[step.rule]).toBe(firstStage);
    }
  });

  it('measures clue density and deductions for a known solution', () => {
    const analysis = analyzePuzzle({
      width: 2, height: 2,
      clues: [[1, null], [null, null]],
      colors: [['white', 'black'], ['black', 'black']]
    });

    expect(analysis).toMatchObject({
      cellCount: 4,
      clueCount: 1,
      oneClueCount: 1,
      clueDistribution: [{ value: 1, count: 1 }],
      clueDensity: 0.25,
      oneClueRatio: 1,
      solved: true,
      remainingCells: 0,
      deductionRounds: 3,
      techniqueLevel: 'intermediate',
      deductions: {
        islandReach: 0, islandSeparation: 0, islandExpansion: 0, islandShapeIntersection: 0,
        completedIsland: 2, unreachable: 1, blackSquare: 0, seaBridge: 0
      }
    });
    expect(analysis.solveTrace.steps).toMatchObject([
      { scan: 1, rule: 'completedIsland', row: 1, col: 0, color: 'black' },
      { scan: 2, rule: 'completedIsland', row: 0, col: 1, color: 'black' },
      { scan: 3, rule: 'unreachable', row: 1, col: 1, color: 'black' }
    ]);
    expect(analysis.solveTrace.observations).toMatchObject({
      confirmedCells: 3, highestUsedLevel: 'intermediate', solved: true,
      highestStage: 2, minCandidateCells: 1, singleCandidateCheckpoints: 1
    });
    expect(analysis.solveTrace.steps.map(({ review }) => review)).toEqual([
      { cells: 3, rows: 2, columns: 2 },
      { cells: 3, rows: 2, columns: 2 },
      { cells: 4, rows: 2, columns: 2 }
    ]);
    expect(analysis.solveTrace.checkpoints.map(({ candidateCells, remainingCells }) => [candidateCells, remainingCells]))
      .toEqual([[3, 3], [2, 2], [1, 1], [0, 0]]);
    expect(analysis.solveTrace.checkpoints[0].byStage).toEqual({ 1: 2, 2: 1, 3: 0, 4: 0 });
  });

  it('reports an unresolved puzzle without claiming it is invalid or non-unique', () => {
    const puzzle: NurikabeBoard = {
      width: 2, height: 2,
      clues: [[2, null], [null, null]],
      colors: [['white', 'white'], ['black', 'black']]
    };
    const analysis = analyzePuzzle(puzzle);
    expect(analysis.solved).toBe(false);
    expect(analysis.techniqueLevel).toBeNull();
    expect(analysis.remainingCells).toBe(2);
    expect(analysis.deductions.unreachable).toBe(1);
    expect(analysis.solveTrace.observations).toMatchObject({
      solved: false, confirmedCells: 1, highestUsedLevel: 'intermediate', techniqueLevel: null,
      minCandidateCells: 0
    });
    expect(analysis.oneClueRatio).toBe(0);
    expect(analyzePuzzle({
      ...puzzle,
      colors: [['white', 'black'], ['white', 'black']]
    })).toEqual(analysis);
  });

  it('uses basic rules before intermediate rules', () => {
    const analysis = analyzePuzzle({
      width: 3, height: 1,
      clues: [[1, null, 1]],
      colors: [['white', 'black', 'white']]
    });

    expect(analysis.solved).toBe(true);
    expect(analysis.techniqueLevel).toBe('basic');
    expect(analysis.deductions.completedIsland).toBe(1);
    expect(analysis.deductions.unreachable).toBe(0);
    expect(analysis.solveTrace.checkpoints[0]).toMatchObject({
      candidateCells: 1, byStage: { 1: 1, 2: 0, 3: 0, 4: 0 }
    });
    expect(analysis.solveTrace.observations.highestStage).toBe(1);
  });

  it('prevents an island from growing through a clue-less white component beyond its clue size', () => {
    const analysis = analyzePuzzle({
      width: 8, height: 12,
      clues: [
        [null, null, null, 5, null, null, null, 3],
        [null, null, null, null, null, null, null, null],
        [1, null, null, null, null, null, 1, null],
        [null, null, null, 8, null, null, null, null],
        [3, null, null, null, null, null, 2, null],
        [null, null, null, null, null, null, null, null],
        [5, null, null, null, null, null, 2, null],
        [null, null, null, null, null, null, null, null],
        [4, null, null, null, 3, null, null, null],
        [null, null, null, 4, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, 2, null]
      ],
      colors: [
        'wwwwwbww', 'bbbbbbbw', 'wbwwwbwb', 'bbbwwbbb',
        'wwwbwbww', 'bbbbwbbb', 'wwwbwbww', 'bbwbbbbb',
        'wbwbwwwb', 'wbbwbbbb', 'wbwwwbwb', 'wbbbbbwb'
      ].map((row) => [...row].map((cell) => cell === 'w' ? 'white' : 'black'))
    });
    expect(analysis.solved).toBe(true);
    expect(analysis.deductions.islandOverflow).toBeGreaterThan(0);
    expect(analysis.solveTrace.steps).toContainEqual(expect.objectContaining({
      rule: 'islandOverflow', row: 7, col: 6, color: 'black'
    }));
  });

  it('marks a boundary shared by all island shapes before assumption reasoning finishes the puzzle', () => {
    const puzzle: NurikabeBoard = {
      width: 4, height: 4,
      clues: [
        [3, null, 4, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null]
      ],
      colors: ['wbww', 'wbwb', 'wbwb', 'bbbb']
        .map((row) => [...row].map((cell) => cell === 'w' ? 'white' : 'black'))
    };
    const analysis = analyzePuzzle(puzzle);
    expect(countSolutions(puzzle)).toBe(1);
    expect(analysis.solved).toBe(true);
    expect(analysis.deductions.islandShapeBoundary).toBeGreaterThan(0);
    expect(analysis.deductions.assumptionContradiction).toBeGreaterThan(0);
    expect(analysis.solveTrace.steps).toContainEqual(expect.objectContaining({
      rule: 'islandShapeBoundary', row: 2, col: 1, color: 'black'
    }));
  });

  it('does not infer common shape boundaries from a truncated enumeration', () => {
    const analysis = analyzePuzzle({
      width: 5, height: 5,
      clues: Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => r === 2 && c === 2 ? 20 : null)),
      colors: Array.from({ length: 5 }, () =>
        ['white', 'white', 'white', 'white', 'black'])
    });
    expect(analysis.solved).toBe(false);
    expect(analysis.solveTrace.steps).toEqual([]);
    expect(analysis.deductions.islandShapeBoundary).toBe(0);
    expect(analysis.solveTrace.checkpoints[0].candidateCells).toBe(0);
  });

  it('solves the 11x8 puzzle with bounded assumption contradictions', () => {
    const puzzle: NurikabeBoard = {
      width: 8,
      height: 11,
      clues: [
        [null, null, 2, null, null, 5, null, null],
        [null, null, null, null, 2, null, null, null],
        [null, 3, null, null, null, null, null, null],
        [null, null, null, 3, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, 5, null, null, null, null, 3],
        [4, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, 2, null, 3, null, null, null],
        [null, null, null, null, null, 5, null, null]
      ],
      colors: [
        '#oo##oo#', '####o#o#', '#oo#o#o#', '#o#o##o#', '###oo###',
        'o#o###oo', 'o#ooo#o#', 'o#o#####', 'o###oo#o', '#oo#o##o', '#####ooo'
      ].map((row) => [...row].map((cell): 'white' | 'black' =>
        cell === 'o' ? 'white' : 'black'))
    };

    const analysis = analyzePuzzle(puzzle);

    expect(analysis.solved).toBe(true);
    expect(analysis.remainingCells).toBe(0);
    expect(analysis.techniqueLevel).toBe('advanced');
    expect(analysis.deductions.assumptionContradiction).toBe(2);
    expect(analysis.solveTrace.observations.highestStage).toBe(4);
    expect(analysis.solveTrace.steps.filter(({ rule }) => rule === 'assumptionContradiction'))
      .toMatchObject([
        { row: 0, col: 1, color: 'white' },
        { row: 0, col: 7, color: 'black' }
      ]);
  }, 120000);

  it('does not report a bottleneck or review scope when no undecided cells exist', () => {
    const { solveTrace } = analyzePuzzle({
      width: 1, height: 1, clues: [[1]], colors: [['white']]
    });
    expect(solveTrace.observations).toMatchObject({
      solved: true, confirmedCells: 0, highestStage: null, maxReview: null,
      minCandidateCells: null, singleCandidateCheckpoints: 0
    });
    expect(solveTrace.checkpoints).toHaveLength(1);
    expect(solveTrace.checkpoints[0]).toMatchObject({ remainingCells: 0, candidateCells: 0 });
  });

  it('uses stage-1 expansion rather than stage-3 reach when both can complete an island', () => {
    const analysis = analyzePuzzle({
      width: 2, height: 1,
      clues: [[2, null]],
      colors: [['white', 'white']]
    });
    expect(analysis.solved).toBe(true);
    expect(analysis.techniqueLevel).toBe('intermediate');
    expect(analysis.deductions.islandExpansion).toBe(1);
    expect(analysis.deductions.islandReach).toBe(0);
    expect(analysis.solveTrace.observations.highestStage).toBe(1);
  });

  it('uses sea connectivity when basic and intermediate rules stall', () => {
    const puzzle: NurikabeBoard = {
      width: 4, height: 4,
      clues: [
        [null, null, null, 2],
        [2, null, null, null],
        [null, null, 1, null],
        [null, 1, null, null]
      ],
      colors: [
        ['white', 'black', 'white', 'white'],
        ['white', 'black', 'black', 'black'],
        ['black', 'black', 'white', 'black'],
        ['black', 'white', 'black', 'black']
      ]
    };
    const analysis = analyzePuzzle(puzzle);
    expect(countSolutions(puzzle)).toBe(1);
    expect(analysis.solved).toBe(true);
    expect(analysis.techniqueLevel).toBe('advanced');
    expect(analysis.deductions.seaBridge).toBeGreaterThan(0);
  });

  it('solves a unique puzzle by separating and expanding islands', () => {
    const puzzle: NurikabeBoard = {
      width: 4, height: 4,
      clues: [
        [null, 2, null, 2],
        [null, null, null, null],
        [null, 4, null, null],
        [null, null, null, 1]
      ],
      colors: [
        ['white', 'white', 'black', 'white'],
        ['black', 'black', 'black', 'white'],
        ['white', 'white', 'black', 'black'],
        ['white', 'white', 'black', 'white']
      ]
    };
    expect(countSolutions(puzzle)).toBe(1);
    const analysis = analyzePuzzle(puzzle);
    expect(analysis.solved).toBe(true);
    expect(analysis.deductions.islandSeparation).toBeGreaterThan(0);
    expect(analysis.deductions.islandExpansion).toBeGreaterThan(0);
    expect(analysis.solveTrace.steps.filter(({ rule }) => rule === 'islandSeparation'))
      .toHaveLength(analysis.deductions.islandSeparation);
    expect(analysis.solveTrace.steps.filter(({ rule }) => rule === 'islandExpansion'))
      .toHaveLength(analysis.deductions.islandExpansion);
  });

  it('only declares a solution unique for every valid 3x3 board and clue placement', () => {
    const width = 3;
    const height = 3;
    for (let mask = 0; mask < 2 ** (width * height); mask += 1) {
      const colors = Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, col) =>
          mask & (1 << (row * width + col)) ? 'white' as const : 'black' as const
        )
      );
      const visited = new Set<number>();
      const islands: number[][] = [];
      for (let cell = 0; cell < width * height; cell += 1) {
        if (colors[Math.floor(cell / width)][cell % width] !== 'white' || visited.has(cell)) continue;
        const island = [cell];
        visited.add(cell);
        for (let i = 0; i < island.length; i += 1) {
          const current = island[i];
          const row = Math.floor(current / width);
          const col = current % width;
          const neighbors = [
            ...(row > 0 ? [current - width] : []),
            ...(row + 1 < height ? [current + width] : []),
            ...(col > 0 ? [current - 1] : []),
            ...(col + 1 < width ? [current + 1] : [])
          ];
          for (const neighbor of neighbors) {
            if (colors[Math.floor(neighbor / width)][neighbor % width] === 'white' && !visited.has(neighbor)) {
              visited.add(neighbor);
              island.push(neighbor);
            }
          }
        }
        islands.push(island);
      }
      const clues = Array.from({ length: height }, () => Array<number | null>(width).fill(null));
      const checkPlacements = (index: number): void => {
        if (index === islands.length) {
          const puzzle = { width, height, clues, colors };
          if (validateNurikabeBoard(puzzle).valid) {
            const analysis = analyzePuzzle(puzzle);
            if (!analysis.solved) return;
            expect(countSolutions(puzzle)).toBe(1);
          }
          return;
        }
        for (const cell of islands[index]) {
          const row = Math.floor(cell / width);
          const col = cell % width;
          clues[row][col] = islands[index].length;
          checkPlacements(index + 1);
          clues[row][col] = null;
        }
      };
      checkPlacements(0);
    }
  });

  it('rejects invalid completed boards instead of producing misleading metrics', () => {
    expect(() => analyzePuzzle({
      width: 1, height: 1, clues: [[1]], colors: [['black']]
    })).toThrow('invalid board');
  });

  it('uses a null ratio when a valid board has no clues', () => {
    const analysis = analyzePuzzle({
      width: 1, height: 1, clues: [[null]], colors: [['black']]
    });
    expect(analysis.clueCount).toBe(0);
    expect(analysis.clueDensity).toBe(0);
    expect(analysis.oneClueRatio).toBeNull();
    expect(analysis.clueDistribution).toEqual([]);
  });

  it('counts each clue value in numeric order', () => {
    const analysis = analyzePuzzle({
      width: 4, height: 3,
      clues: [
        [null, 2, null, 1],
        [null, null, null, null],
        [2, null, null, 1]
      ],
      colors: [
        ['white', 'white', 'black', 'white'],
        ['black', 'black', 'black', 'black'],
        ['white', 'white', 'black', 'white']
      ]
    });
    expect(analysis.clueDistribution).toEqual([
      { value: 1, count: 2 },
      { value: 2, count: 2 }
    ]);
  });

  it('solves a uniquely solvable puzzle requiring island-shape deductions', () => {
    const puzzle: NurikabeBoard = {
      width: 6, height: 9,
      clues: [
        [5, null, null, null, null, null],
        [null, null, null, null, null, null],
        [1, null, 1, null, null, 2],
        [null, null, null, null, null, null],
        [3, null, 3, null, 1, null],
        [null, null, null, null, null, null],
        [null, null, null, null, 1, null],
        [null, null, null, null, null, null],
        [3, null, null, null, 1, null]
      ],
      colors: [
        'wwwwwb', 'bbbbbb', 'wbwbww', 'bbbbbb', 'wbwbwb',
        'wbwbbb', 'wbwbwb', 'bbbbbb', 'wwwbwb'
      ].map((row) => [...row].map((cell) => cell === 'w' ? 'white' : 'black'))
    };
    expect(countSolutions(puzzle)).toBe(1);
    const analysis = analyzePuzzle(puzzle);
    expect(analysis.solved).toBe(true);
    expect(analysis.deductions.islandShapeIntersection).toBeGreaterThan(0);
    expect(analysis.solveTrace.steps.filter(({ rule }) => rule === 'islandShapeIntersection'))
      .toHaveLength(analysis.deductions.islandShapeIntersection);
  });

  it('uses all clues as the denominator for the 1-clue ratio', () => {
    const analysis = analyzePuzzle({
      width: 3, height: 2,
      clues: [[1, null, 2], [null, null, null]],
      colors: [['white', 'black', 'white'], ['black', 'black', 'white']]
    });
    expect(analysis.clueDensity).toBe(2 / 6);
    expect(analysis.oneClueRatio).toBe(0.5);
  });

  it('accounts for every non-clue cell in a generated board', () => {
    const generated = generateNurikabeBoard(6, 42, 'normal');
    const analysis = analyzePuzzle(generated);
    const total = Object.values(analysis.deductions).reduce((sum, count) => sum + count, 0);
    expect(analysis.solved).toBe(true);
    expect(total).toBe(analysis.cellCount - analysis.clueCount);
    expect(analysis.clueCount).toBe(generated.clues.flat().filter((clue) => clue !== null).length);
    expect(analysis.oneClueCount).toBe(generated.clues.flat().filter((clue) => clue === 1).length);
    const recordedCells = new Set<string>();
    for (const step of analysis.solveTrace.steps) {
      const position = `${step.row},${step.col}`;
      expect(recordedCells.has(position)).toBe(false);
      recordedCells.add(position);
      expect(generated.clues[step.row][step.col]).toBeNull();
      expect(step.color).toBe(generated.colors[step.row][step.col]);
      expect(step.review.cells).toBeGreaterThan(0);
      expect(step.review.cells).toBeLessThanOrEqual(analysis.cellCount);
      expect(step.review.rows).toBeLessThanOrEqual(generated.height);
      expect(step.review.columns).toBeLessThanOrEqual(generated.width);
      if (step.rule === 'blackSquare') {
        expect(step.review).toEqual({ cells: 4, rows: 2, columns: 2 });
      }
    }
    expect(recordedCells.size).toBe(total);
    for (const [rule, count] of Object.entries(analysis.deductions)) {
      expect(analysis.solveTrace.steps.filter((step) => step.rule === rule)).toHaveLength(count);
    }
    expect(analyzePuzzle(generated).solveTrace).toEqual(analysis.solveTrace);
    for (const checkpoint of analysis.solveTrace.checkpoints) {
      expect(Object.values(checkpoint.byStage).reduce((sum, n) => sum + n, 0)).toBe(checkpoint.candidateCells);
      expect(checkpoint.candidateCells).toBeLessThanOrEqual(checkpoint.remainingCells);
    }
  });

  it('uses assumption contradictions to distinguish normal generation from easy', () => {
    const easy = analyzePuzzle(generateNurikabeBoard(6, 42, 'easy'));
    const normal = analyzePuzzle(generateNurikabeBoard(6, 42, 'normal'));

    expect(easy.solved).toBe(true);
    expect(easy.deductions.assumptionContradiction).toBe(0);
    expect(easy.solveTrace.observations.highestStage).toBeLessThan(4);
    expect(normal.solved).toBe(true);
    expect(normal.deductions.assumptionContradiction).toBeGreaterThan(0);
    expect(normal.solveTrace.observations.highestStage).toBe(4);
  }, 30000);
});

describe('generator determinism and validity', () => {
  it.each([[8, 'normal', 42, 41, 8, 9], [10, 'easy', 2, 70, 7, 7]] as const)(
    'improves white coverage and placement for %i-wide %s seed %i',
    (width, difficulty, seed, previousWhite, previousEdge, previousGaps) => {
      const generated = generateNurikabeBoard(width, seed, difficulty);
      const white = generated.colors.flat().filter((color) => color === 'white').length;
      const clues = generated.clues.flatMap((row, r) =>
        row.flatMap((clue, c) => clue === null ? [] : [[r, c]])
      );
      const edge = clues.filter(([r, c]) =>
        r === 0 || r === generated.height - 1 || c === 0 || c === generated.width - 1
      ).length;
      const gaps = clues.reduce((count, [r, c], i) => count + clues.slice(i + 1).filter(([nr, nc]) =>
        (r === nr && Math.abs(c - nc) === 2) || (c === nc && Math.abs(r - nr) === 2)
      ).length, 0);
      expect(white).toBeGreaterThan(previousWhite);
      expect(edge).toBeLessThanOrEqual(previousEdge);
      expect(gaps).toBeLessThanOrEqual(previousGaps);
      expect(edge < previousEdge || gaps < previousGaps).toBe(true);
      expect(validateNurikabeBoard(generated).valid).toBe(true);
      expect(analyzePuzzle(generated).solved).toBe(true);
    }, 30000);

  it.each([[6, 2], [6, 42], [8, 2], [8, 42], [10, 2], [10, 42], [12, 2], [12, 42]])(
    'meets the new normal targets at width %i and seed %i', (width, seed) => {
      const generated = generateNurikabeBoard(width, seed, 'normal');
      const clues = generated.clues.flat().filter((clue): clue is number => clue !== null);
      const counts = new Map<number, number>();
      for (const clue of clues) counts.set(clue, (counts.get(clue) ?? 0) + 1);
      expect(clues.length * 100).toBeLessThanOrEqual(width * generated.height * 16);
      expect(Math.max(...clues)).toBeGreaterThanOrEqual(width - 2);
      expect(counts.size * 2).toBeGreaterThanOrEqual(Math.max(...clues));
      for (const count of counts.values()) expect(count * 4).toBeLessThanOrEqual(clues.length);
      expect(validateNurikabeBoard(generated).valid).toBe(true);
      expect(analyzePuzzle(generated).solved).toBe(true);
    }, 90000);

  it('does not impose a clue-density minimum on the new normal generator', () => {
    const generated = generateNurikabeBoard(6, 2, 'normal');
    expect(generated.clues.flat().filter((clue) => clue !== null).length).toBeLessThan(9);
  });

  it('reduces row and column concentration on a crowded Normal 12x18 seed', () => {
    const board = generateNurikabeBoard(12, 1, 'normal');
    const rows = board.clues.map((row) => row.filter((clue) => clue !== null).length);
    const columns = board.clues[0].map((_, col) =>
      board.clues.filter((row) => row[col] !== null).length);
    const alignedPairs = [...rows, ...columns].reduce((sum, count) => sum + count * (count - 1) / 2, 0);
    expect(Math.max(...columns)).toBeLessThan(9);
    expect(alignedPairs).toBeLessThan(89);
    expect(analyzePuzzle(board).solved).toBe(true);
  }, 90000);

  it('reports normal generation failure when bounded search is exhausted', () => {
    const multiply = vi.spyOn(Math, 'imul').mockReturnValue(0);
    try {
      expect(() => generateNurikabeBoard(6, 42, 'normal'))
        .toThrow('Failed to generate a normal puzzle meeting the quality and uniqueness targets');
    } finally {
      multiply.mockRestore();
    }
  }, 30000);

  it.each([[6, 2], [6, 42], [8, 2], [8, 42], [10, 2], [10, 42], [12, 2], [12, 42]])(
    'meets all easy-mode quality targets at width %i and seed %i', (width, seed) => {
      const generated = generateNurikabeBoard(width, seed, 'easy');
      const clues = generated.clues.flat().filter((clue): clue is number => clue !== null);
      const counts = new Map<number, number>();
      for (const clue of clues) counts.set(clue, (counts.get(clue) ?? 0) + 1);
      expect(clues.length * 100).toBeLessThanOrEqual(width * generated.height * 20);
      expect(Math.max(...clues)).toBeGreaterThanOrEqual(width - 2);
      expect(counts.size * 2).toBeGreaterThanOrEqual(Math.max(...clues));
      for (const count of counts.values()) expect(count * 4).toBeLessThanOrEqual(clues.length);
      expect(validateNurikabeBoard(generated).valid).toBe(true);
      expect(analyzePuzzle(generated).solved).toBe(true);
    }, 30000);

  it('does not impose a clue-density minimum on easy puzzles', () => {
    const generated = generateNurikabeBoard(6, 2, 'easy');
    expect(generated.clues.flat().filter((clue) => clue !== null).length).toBeLessThan(6);
  });

  it('generates the same easy puzzle for the same seed', () => {
    expect(generateNurikabeBoard(6, 42, 'easy')).toEqual(generateNurikabeBoard(6, 42, 'easy'));
  });

  it('reports easy generation failure when bounded search is exhausted', () => {
    const multiply = vi.spyOn(Math, 'imul').mockReturnValue(0);
    try {
      expect(() => generateNurikabeBoard(6, 42, 'easy'))
        .toThrow('Failed to generate an easy puzzle meeting the quality and uniqueness targets');
    } finally {
      multiply.mockRestore();
    }
  }, 30000);

  it('independently verifies uniqueness of a new easy puzzle', () => {
    expect(countSolutions(generateNurikabeBoard(6, 42, 'easy'))).toBe(1);
  }, 30000);

  it('distinguishes a puzzle with multiple solutions', () => {
    expect(countSolutions({
      width: 2, height: 2,
      clues: [[2, null], [null, null]],
      colors: [['white', 'white'], ['black', 'black']]
    })).toBe(2);
  });

  it('generateNurikabeBoard is deterministic for same inputs', () => {
    const a = generateNurikabeBoard(6, 1234, 'normal');
    const b = generateNurikabeBoard(6, 1234, 'normal');
    expect(a).toEqual(b);
  });

  it('generateNurikabeBoard changes when seed changes', () => {
    const a = generateNurikabeBoard(6, 1234, 'normal');
    const b = generateNurikabeBoard(6, 1235, 'normal');
    expect(a).not.toEqual(b);
  });

  it('generateNurikabeBoard changes when difficulty changes', () => {
    const a = generateNurikabeBoard(10, 1234, 'easy');
    const b = generateNurikabeBoard(10, 1234, 'normal');
    expect(a).not.toEqual(b);
  });

  it('createSeededPuzzle is deterministic and carries a valid board', () => {
    const a = createSeededPuzzle(6, 77, 'normal');
    const b = createSeededPuzzle(6, 77, 'normal');
    expect(a).toEqual(b);
    expect(validateNurikabeBoard(combineNurikabeBoard(a.definition, a.solution)).valid).toBe(true);
  });

  it.each([
    [6, 0, 'easy'],
    [10, -1, 'easy'],
    [8, Number.MAX_SAFE_INTEGER, 'normal']
  ] as const)('returns consistent puzzle metadata and solution grids for %i, %i, %s', (width, seed, difficulty) => {
    const puzzle = createSeededPuzzle(width, seed, difficulty);
    const height = width * 3 / 2;
    expect(puzzle).toMatchObject({
      id: `p-${width}x${height}-${difficulty}-${seed}`,
      title: `Nurikabe ${difficulty} #${seed}`,
      difficulty,
      definition: { width, height },
      solution: { width, height }
    });
    expect(puzzle).not.toHaveProperty('grid');
    expect(puzzle.definition).not.toHaveProperty('colors');
    expect(puzzle.solution).not.toHaveProperty('clues');
    expect(validateNurikabeBoard(combineNurikabeBoard(puzzle.definition, puzzle.solution))).toEqual({ valid: true, issues: [] });
  });

  it('rejects combining a definition with a differently sized solution', () => {
    expect(() => combineNurikabeBoard(
      { width: 1, height: 1, clues: [[1]] },
      { width: 2, height: 1, colors: [['white', 'black']] }
    )).toThrow('dimensions must match');
  });

  it.each([0, 5, 7, 18, 6.5, NaN, Infinity])('rejects unsupported width %s', (width) => {
    expect(() => generateNurikabeBoard(width, 42)).toThrow();
  });

  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid seed %s', (seed) => {
    expect(() => generateNurikabeBoard(6, seed)).toThrow('seed must be a safe integer');
    expect(() => createSeededPuzzle(6, seed)).toThrow('seed must be a safe integer');
  });

  it.each([
    ['easy', 14], ['easy', 16], ['normal', 14], ['normal', 16], ['hard', 10], ['hard', 12]
  ] as const)('rejects %s width %i', (difficulty, width) => {
    expect(() => generateNurikabeBoard(width, 42, difficulty)).toThrow();
    expect(() => createSeededPuzzle(width, 42, difficulty)).toThrow();
  });

  it('rejects invalid runtime difficulty', () => {
    expect(() => generateNurikabeBoard(6, 42, 'unknown' as 'easy')).toThrow('invalid difficulty');
    expect(() => createSeededPuzzle(6, 42, 'unknown' as 'easy')).toThrow('invalid difficulty');
  });

  it.each([42, 1234])('produces exactly one solution for seed %i', (seed) => {
    expect(countSolutions(generateNurikabeBoard(6, seed, 'normal'))).toBe(1);
  });

});
