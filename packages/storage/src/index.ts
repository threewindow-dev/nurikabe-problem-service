import { combineNurikabeBoard, createPuzzle, validateNurikabeBoard, type NurikabeBoard, type Puzzle, type PuzzleMetadata } from '../../core/src';

const STORAGE_KEY = 'nurikabe:puzzles';

type LegacyPuzzle = PuzzleMetadata & {
  board: NurikabeBoard | (Omit<NurikabeBoard, 'width' | 'height'> & { size: number });
};

function upgradePuzzle(puzzle: Puzzle | LegacyPuzzle): Puzzle {
  if (!puzzle || typeof puzzle.id !== 'string' || typeof puzzle.title !== 'string' ||
      !['easy', 'normal', 'hard'].includes(puzzle.difficulty)) {
    throw new Error('Invalid saved puzzle metadata');
  }
  const { id, title, difficulty, generationDurationMs } = puzzle;
  if (generationDurationMs !== undefined && (!Number.isFinite(generationDurationMs) || generationDurationMs < 0)) {
    throw new Error(`Invalid saved puzzle generation duration: ${id}`);
  }
  const board = 'board' in puzzle
    ? 'size' in puzzle.board
      ? { width: puzzle.board.size, height: puzzle.board.size, clues: puzzle.board.clues, colors: puzzle.board.colors }
      : puzzle.board
    : combineNurikabeBoard(puzzle.definition, puzzle.solution);
  if (!validateNurikabeBoard(board).valid) throw new Error(`Invalid saved puzzle board: ${id}`);
  return createPuzzle({
    id, title, difficulty,
    ...(generationDurationMs === undefined ? {} : { generationDurationMs })
  }, board);
}

export function getSavedPuzzleSet(): Puzzle[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const puzzles = JSON.parse(raw) as Array<Puzzle | LegacyPuzzle>;
  if (!Array.isArray(puzzles)) throw new Error('Saved puzzles must be an array');
  return puzzles.map(upgradePuzzle);
}

export function savePuzzleSet(nextPuzzle: Puzzle): Puzzle[] {
  if (typeof window === 'undefined') {
    throw new Error('Puzzle storage is unavailable');
  }

  const current = getSavedPuzzleSet();
  const existingIndex = current.findIndex((puzzle) =>
    puzzle.id === nextPuzzle.id &&
    puzzle.difficulty === nextPuzzle.difficulty &&
    puzzle.definition.width === nextPuzzle.definition.width &&
    puzzle.definition.height === nextPuzzle.definition.height &&
    JSON.stringify(puzzle.definition.clues) === JSON.stringify(nextPuzzle.definition.clues) &&
    JSON.stringify(puzzle.solution.colors) === JSON.stringify(nextPuzzle.solution.colors)
  );
  const { generationDurationMs } = nextPuzzle;
  if (existingIndex !== -1 &&
      (current[existingIndex].generationDurationMs !== undefined || generationDurationMs === undefined)) return current;
  const updated = existingIndex === -1
    ? [...current, nextPuzzle]
    : current.map((puzzle, index) => index === existingIndex ? { ...puzzle, generationDurationMs } : puzzle);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
