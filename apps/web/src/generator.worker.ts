import { analyzePuzzle, combineNurikabeBoard, createSeededPuzzle, type Difficulty, type Puzzle, type PuzzleAnalysis } from '@core';

export interface GenerationRequest {
  width: number;
  seed: number;
  difficulty: Difficulty;
}

export type WorkerRequest = GenerationRequest | { puzzle: Puzzle };

export type GenerationResponse =
  | { puzzle: Puzzle; analysis: PuzzleAnalysis }
  | { error: string };

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  try {
    const request = event.data;
    const puzzle = 'puzzle' in request
      ? request.puzzle
      : createSeededPuzzle(request.width, request.seed, request.difficulty);
    const response: GenerationResponse = { puzzle, analysis: analyzePuzzle(combineNurikabeBoard(puzzle.definition, puzzle.solution)) };
    self.postMessage(response);
  } catch (error) {
    const response: GenerationResponse = { error: error instanceof Error ? error.message : String(error) };
    self.postMessage(response);
  }
});
