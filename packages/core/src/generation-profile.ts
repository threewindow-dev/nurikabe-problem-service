import type { Difficulty } from './index.js';

type BoardSize = Readonly<{ width: number; height: number }>;

export interface GenerationProfile {
  readonly size: BoardSize;
  readonly difficulty: Difficulty;
  readonly quality: QualityConstraints;
}

export interface QualityConstraints {
  readonly minClueDensityPercent?: number;
  readonly maxClueDensityPercent: number;
  readonly minLargestClue: number;
  readonly distribution?: Readonly<{ maxValuePercent: number; minDistinctPercent: number }>;
}

interface ClueSummary {
  readonly clueCount: number;
  readonly clueDistribution: ReadonlyArray<{ readonly value: number; readonly count: number }>;
}

export type GenerationProfileViolation =
  | { code: 'density-below-minimum' | 'density-above-maximum' | 'largest-clue-below-minimum' | 'too-few-distinct-clues'; actual: number; limit: number }
  | { code: 'clue-value-overrepresented'; value: number; actual: number; limit: number };

const revisedDensity = { easy: 20, normal: 16, hard: 12 } as const;
const revisedDistribution = { maxValuePercent: 25, minDistinctPercent: 50 } as const;

function revisedProfile(difficulty: Difficulty, size: BoardSize): GenerationProfile {
  return {
    size, difficulty,
    quality: {
      maxClueDensityPercent: revisedDensity[difficulty],
      minLargestClue: size.width - 2,
      distribution: revisedDistribution
    }
  };
}

export const SUPPORTED_WIDTHS = [6, 8, 10, 12] as const;

export function getSupportedWidths(difficulty: Difficulty): readonly number[] {
  if (difficulty === 'easy' || difficulty === 'normal') return SUPPORTED_WIDTHS;
  if (difficulty === 'hard') return [];
  throw new Error('invalid difficulty');
}

export function getGenerationProfile(width: number, difficulty: Difficulty): GenerationProfile {
  const widths = getSupportedWidths(difficulty);
  if (widths.length === 0) throw new Error(`${difficulty} generation is not supported`);
  if (!widths.includes(width)) throw new Error(`width for ${difficulty} must be one of ${widths.join(', ')}`);
  return revisedProfile(difficulty, { width, height: width * 3 / 2 });
}

export function getAutoSaveProfile(difficulty: Difficulty, size: BoardSize): GenerationProfile {
  return revisedProfile(difficulty, size);
}

export const HARD_EXPERIMENT_PROFILE: GenerationProfile = {
  ...revisedProfile('hard', { width: 10, height: 15 }),
  quality: { ...revisedProfile('hard', { width: 10, height: 15 }).quality, maxClueDensityPercent: 16 }
};

export function getClueCountBounds(profile: GenerationProfile) {
  const area = profile.size.width * profile.size.height;
  const { quality } = profile;
  return {
    min: quality.minClueDensityPercent === undefined ? 0 : Math.ceil(area * quality.minClueDensityPercent / 100),
    max: Math.floor(area * quality.maxClueDensityPercent / 100)
  };
}

export function getClueValueLimit(profile: GenerationProfile, clueCount: number): number {
  return profile.quality.distribution ? Math.floor(clueCount * profile.quality.distribution.maxValuePercent / 100) : clueCount;
}

export function summarizeClues(clues: readonly number[]) {
  const counts = new Map<number, number>();
  for (const clue of clues) counts.set(clue, (counts.get(clue) ?? 0) + 1);
  return {
    clueCount: clues.length,
    clueDistribution: [...counts].map(([value, count]) => ({ value, count }))
  };
}

// Checks clue statistics only; board validity and uniqueness are separate.
export function checkGenerationProfile(profile: GenerationProfile, summary: ClueSummary): GenerationProfileViolation[] {
  const { clueCount, clueDistribution } = summary;
  const { quality } = profile;
  const { min, max } = getClueCountBounds(profile);
  const largest = clueDistribution.reduce((maxValue, { value }) => Math.max(maxValue, value), 0);
  const issues: GenerationProfileViolation[] = [];
  if (clueCount < min) issues.push({ code: 'density-below-minimum', actual: clueCount, limit: min });
  if (clueCount > max) issues.push({ code: 'density-above-maximum', actual: clueCount, limit: max });
  if (largest < quality.minLargestClue) {
    issues.push({ code: 'largest-clue-below-minimum', actual: largest, limit: quality.minLargestClue });
  }
  if (quality.distribution) {
    const minDistinct = Math.ceil(largest * quality.distribution.minDistinctPercent / 100);
    if (clueDistribution.length < minDistinct) {
      issues.push({ code: 'too-few-distinct-clues', actual: clueDistribution.length, limit: minDistinct });
    }
    const limit = getClueValueLimit(profile, clueCount);
    for (const { value, count } of clueDistribution) {
      if (count > limit) issues.push({ code: 'clue-value-overrepresented', value, actual: count, limit });
    }
  }
  return issues;
}
