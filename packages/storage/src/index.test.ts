import { beforeEach, describe, expect, it } from 'vitest';
import { combineNurikabeBoard, createSeededPuzzle } from '../../core/src';
import { getSavedPuzzleSet, savePuzzleSet } from './index';

describe('storage puzzle cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns empty array when storage is empty', () => {
    expect(getSavedPuzzleSet()).toEqual([]);
  });

  it('appends puzzles to existing saved set', () => {
    const first = createSeededPuzzle(6, 1, 'easy');
    const second = createSeededPuzzle(6, 2, 'normal');

    expect(savePuzzleSet(first)).toHaveLength(1);
    expect(savePuzzleSet(second)).toHaveLength(2);
    expect(getSavedPuzzleSet().map((item) => item.id)).toEqual([first.id, second.id]);
  });

  it('preserves malformed data and reports read and write failures', () => {
    window.localStorage.setItem('nurikabe:puzzles', '{bad json');

    expect(() => getSavedPuzzleSet()).toThrow();
    expect(() => savePuzzleSet(createSeededPuzzle(6, 1, 'easy'))).toThrow();
    expect(window.localStorage.getItem('nurikabe:puzzles')).toBe('{bad json');
  });

  it('does not duplicate the same board but preserves different boards with the same id', () => {
    const first = createSeededPuzzle(6, 1, 'easy');
    const different = { ...createSeededPuzzle(6, 2, 'easy'), id: first.id };
    expect(savePuzzleSet(first)).toHaveLength(1);
    expect(savePuzzleSet(first)).toHaveLength(1);
    expect(savePuzzleSet(different)).toHaveLength(2);
  });

  it('adds a measured duration to an untimed saved board without duplicating or overwriting its record', () => {
    const puzzle = createSeededPuzzle(6, 1, 'easy');
    savePuzzleSet(puzzle);
    const timed = { ...puzzle, generationDurationMs: 1234 };
    expect(savePuzzleSet(timed)).toEqual([timed]);
    expect(savePuzzleSet({ ...puzzle, generationDurationMs: 5678 })).toEqual([timed]);
    expect(getSavedPuzzleSet()).toEqual([timed]);
  });

  it('reads legacy square puzzles using rectangular dimensions', () => {
    window.localStorage.setItem('nurikabe:puzzles', JSON.stringify([{
      id: 'legacy',
      title: 'old puzzle',
      size: 2,
      difficulty: 'easy',
      grid: [[0, 0], [0, 0]],
      board: {
        size: 2,
        clues: [[4, null], [null, null]],
        colors: [['white', 'white'], ['white', 'white']]
      }
    }]));

    expect(getSavedPuzzleSet()[0]).toEqual({
      id: 'legacy',
      title: 'old puzzle',
      difficulty: 'easy',
      definition: { width: 2, height: 2, clues: [[4, null], [null, null]] },
      solution: { width: 2, height: 2, colors: [['white', 'white'], ['white', 'white']] }
    });
  });

  it('reads legacy rectangular puzzles and writes the new format without duplicating them', () => {
    const first = createSeededPuzzle(6, 1, 'easy');
    const { definition, solution, ...metadata } = first;
    const board = combineNurikabeBoard(definition, solution);
    const grid = board.colors.map((row) => row.map((color) => color === 'black' ? 1 : 0));
    const raw = JSON.stringify([{ ...metadata, width: board.width, height: board.height, board, grid }]);
    window.localStorage.setItem('nurikabe:puzzles', raw);
    expect(getSavedPuzzleSet()).toEqual([first]);
    expect(window.localStorage.getItem('nurikabe:puzzles')).toBe(raw);
    expect(savePuzzleSet(first)).toEqual([first]);
    const second = createSeededPuzzle(6, 2, 'normal');
    expect(savePuzzleSet(second)).toEqual([first, second]);
    expect(JSON.parse(window.localStorage.getItem('nurikabe:puzzles') ?? 'null')).toEqual([first, second]);
    expect(getSavedPuzzleSet()).toEqual([first, second]);
  });
});
