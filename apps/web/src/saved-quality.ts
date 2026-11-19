import { checkGenerationProfile, getAutoSaveProfile, type Puzzle, type PuzzleAnalysis } from '@core';

export function meetsSavedQualityTargets(puzzle: Puzzle, analysis: PuzzleAnalysis): boolean {
  const { width, height } = puzzle.definition;
  return analysis.solved &&
    checkGenerationProfile(getAutoSaveProfile(puzzle.difficulty, { width, height }), analysis).length === 0;
}
