import { describe, expect, it } from 'vitest';
import {
  checkGenerationProfile, getAutoSaveProfile, getGenerationProfile,
  HARD_EXPERIMENT_PROFILE, summarizeClues
} from './generation-profile';

describe('generation profiles', () => {
  it('accepts 24 clues in the hard experiment without relaxing automatic saving', () => {
    const clues = summarizeClues([1, 2, 3].flatMap((value) => Array<number>(6).fill(value))
      .concat([4, 4, 4, 4, 4, 8]));
    expect(checkGenerationProfile(HARD_EXPERIMENT_PROFILE, clues)).toEqual([]);
    expect(checkGenerationProfile(getAutoSaveProfile('hard', { width: 10, height: 15 }), clues))
      .toEqual([{ code: 'density-above-maximum', actual: 24, limit: 18 }]);
  });

  it('reports the balanced integer density ceiling', () => {
    const nineClues = summarizeClues([1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect(checkGenerationProfile(getGenerationProfile(6, 'normal'), nineClues))
      .toEqual([{ code: 'density-above-maximum', actual: 9, limit: 8 }]);
  });

  it('reports missing variety and excess copies of values other than 1', () => {
    const profile = getGenerationProfile(6, 'easy');
    expect(checkGenerationProfile(profile, summarizeClues([2, 2, 2, 6])))
      .toEqual([
        { code: 'too-few-distinct-clues', actual: 2, limit: 3 },
        { code: 'clue-value-overrepresented', value: 2, actual: 3, limit: 1 }
      ]);
    expect(checkGenerationProfile(profile, summarizeClues([1, 2, 3])))
      .toContainEqual({ code: 'largest-clue-below-minimum', actual: 3, limit: 4 });
  });
});
