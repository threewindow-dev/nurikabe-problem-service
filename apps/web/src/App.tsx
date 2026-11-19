import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createPlayState,
  evaluatePlayState,
  getClueCountBounds,
  getGenerationProfile,
  getSupportedWidths,
  setPlayCell,
  type PlayCell,
  type PlayState,
  type Puzzle,
  type PuzzleAnalysis
} from '@core';
import { getSavedPuzzleSet, savePuzzleSet } from '@storage';
import type { GenerationResponse, WorkerRequest } from './generator.worker';
import { meetsSavedQualityTargets } from './saved-quality';
import { BoardGridLines } from './BoardGridLines';
import { SolveObservations, SolveStepRecord } from './SolveObservations';

const difficultyOrder = ['easy', 'normal'] as const;
const cellLabels: Record<PlayCell, string> = { unknown: '미표시', white: '섬', black: '바다' };

interface Game {
  puzzle: Puzzle;
  play: PlayState;
  analysis: PuzzleAnalysis;
  fromSaved: boolean;
}

type BoardView = { mode: 'play' } | { mode: 'solution' } | { mode: 'trace'; step: number };

export default function App() {
  const [difficulty, setDifficulty] = useState<(typeof difficultyOrder)[number]>('normal');
  const [width, setWidth] = useState<number>(6);
  const [game, setGame] = useState<Game | null>(null);
  const [storage, setStorage] = useState<{ puzzles: Puzzle[]; error: string | null }>(() => {
    try {
      return { puzzles: getSavedPuzzleSet(), error: null };
    } catch (error) {
      return { puzzles: [], error: `저장된 보드를 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}` };
    }
  });
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [autoSaveNotice, setAutoSaveNotice] = useState<string | null>(null);
  const [boardView, setBoardView] = useState<BoardView>({ mode: 'play' });
  const worker = useRef<Worker | null>(null);
  const showSolution = boardView.mode === 'solution';
  const playbackStep = boardView.mode === 'trace' ? boardView.step : null;
  const stepCount = game?.analysis.solveTrace.steps.length ?? 0;
  const currentStep = playbackStep !== null && playbackStep > 0
    ? game?.analysis.solveTrace.steps[playbackStep - 1] : undefined;
  const playbackCells = useMemo(() => {
    if (!game || playbackStep === null) return null;
    const replay = createPlayState(game.puzzle.definition);
    for (const step of game.analysis.solveTrace.steps.slice(0, playbackStep)) {
      replay.cells[step.row][step.col] = step.color;
    }
    return replay.cells;
  }, [game, playbackStep]);
  const generationProfile = getGenerationProfile(width, difficulty);
  const { quality } = generationProfile;
  const clueCountBounds = getClueCountBounds(generationProfile);

  const visiblePuzzles = storage.puzzles.filter(({ difficulty, definition: { width, height } }) =>
    height === width * 3 / 2 && getSupportedWidths(difficulty).includes(width));
  const evaluation = useMemo(() => game ? evaluatePlayState(game.play) : null, [game?.play]);
  const whiteCount = game
    ? game.analysis.clueDistribution.reduce((total, { value, count }) => total + value * count, 0)
    : null;
  const definition = game?.puzzle.definition;
  const durationMs = game?.puzzle.generationDurationMs;
  const generationTime = durationMs === undefined ? null : `${(durationMs / 1000).toFixed(2)}초`;
  const edgeClueCount = definition
    ? definition.clues.reduce((total, row, r) => total + row.filter((clue, c) =>
      clue !== null && (r === 0 || r === definition.height - 1 || c === 0 || c === definition.width - 1)
    ).length, 0)
    : null;

  const save = (puzzle: Puzzle) => {
    try {
      const puzzles = savePuzzleSet(puzzle);
      setStorage({ puzzles, error: null });
    } catch (error) {
      setStorage((current) => ({
        ...current,
        error: `보드를 저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`
      }));
    }
  };

  const runWorker = (request: WorkerRequest) => {
    worker.current?.terminate();
    worker.current = null;
    const loading = 'puzzle' in request;
    const startedAt = loading ? null : performance.now();
    setLoadingSaved(loading);
    setGenerating(true);
    setGenerationError(null);
    try {
      const current = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
      worker.current = current;
      const finish = () => {
        current.terminate();
        if (worker.current === current) worker.current = null;
        setGenerating(false);
      };
      current.onmessage = (event: MessageEvent<GenerationResponse>) => {
        if (worker.current !== current) return;
        if ('error' in event.data) {
          setGenerationError(event.data.error);
        } else {
          const { puzzle: workerPuzzle, analysis } = event.data;
          const puzzle = startedAt === null
            ? workerPuzzle
            : { ...workerPuzzle, generationDurationMs: performance.now() - startedAt };
          setGame({ puzzle, analysis, play: createPlayState(puzzle.definition), fromSaved: loading });
          setBoardView({ mode: 'play' });
          if (!loading) {
            if (meetsSavedQualityTargets(puzzle, analysis)) {
              save(puzzle);
              setAutoSaveNotice(null);
            } else {
              setAutoSaveNotice('새 조건을 만족하지 않아 자동 저장하지 않았습니다. 수동 저장은 가능합니다.');
            }
          } else {
            setAutoSaveNotice(null);
          }
        }
        finish();
      };
      current.onerror = (event) => {
        if (worker.current !== current) return;
        setGenerationError(event.message || '생성 작업을 실행하지 못했습니다.');
        finish();
      };
      current.onmessageerror = () => {
        if (worker.current !== current) return;
        setGenerationError('생성 결과를 읽지 못했습니다.');
        finish();
      };
      current.postMessage(request);
    } catch (error) {
      worker.current?.terminate();
      worker.current = null;
      setGenerationError(error instanceof Error ? error.message : String(error));
      setGenerating(false);
    }
  };

  useEffect(() => {
    runWorker({ width: 6, seed: Date.now(), difficulty: 'normal' });
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  const handleGenerate = () => {
    runWorker({ width, seed: Date.now(), difficulty });
  };

  const handleSave = () => {
    if (!game) return;
    save(game.puzzle);
  };

  const handleCellClick = (row: number, col: number) => {
    setGame((current) => {
      if (!current) return current;
      const cell = current.play.cells[row][col];
      const next = cell === 'unknown' ? 'black' : cell === 'black' ? 'white' : 'unknown';
      return { ...current, play: setPlayCell(current.play, row, col, next) };
    });
  };

  return (
    <main className="shell">
      <section className="panel">
        <div className="header-row">
          <div>
            <p className="eyebrow">Nurikabe Puzzle Lab</p>
            <h1>퍼즐 생성기 + 플레이 UI</h1>
          </div>
          <span className="status-badge">{visiblePuzzles.length} saved</span>
        </div>

        <p className="board-help">생성 프로필(Easy·Normal)과 크기는 새 문제를 생성할 때 적용됩니다. 프로필은 실제 풀이 난도 등급이 아닙니다.</p>
        <div className="toolbar">
          {difficultyOrder.map((item) => (
            <button
              key={item}
              type="button"
              className={item === difficulty ? 'active' : ''}
              onClick={() => setDifficulty(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <label className="size-picker">
          보드 크기
          <select aria-label="보드 크기" value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {getSupportedWidths(difficulty).map((value) => (
              <option key={value} value={value}>{value}x{value * 3 / 2}</option>
            ))}
          </select>
        </label>

        <section className="generation-conditions board-help" aria-label="보드 생성 조건">
          <h2>보드 생성 조건</h2>
          <p>선택한 새 보드 기준: {difficulty} · {width}×{generationProfile.size.height}</p>
          <p><strong>필수 조건</strong></p>
          <ul>
            <li>단서 밀도: {quality.maxClueDensityPercent}% 이하 (최대 {clueCountBounds.max}개)</li>
            <li>최대 단서값: {quality.minLargestClue} 이상</li>
            {quality.distribution && <>
              <li>같은 숫자의 단서: 전체 단서 수의 {quality.distribution.maxValuePercent}% 이하 (개수는 내림)</li>
              <li>단서 숫자 종류: 1부터 실제 최대 단서값까지의 {quality.distribution.minDistinctPercent}% 이상 등장 (종류 수는 올림)</li>
            </>}
            <li>Nurikabe 규칙 충족 · 유일해 · 기존 8가지 직접 추론 규칙만으로 해결 가능</li>
          </ul>
          <p>풀이 분석은 신규 규칙 4개를 포함한 12가지 규칙으로 기록합니다.</p>
          <p><strong>선호 조건 (보장하지 않음)</strong></p>
          <ul>
            <li>흰 칸 비율을 50%에 가깝게 늘리기 (이미 50% 이상이면 줄이지 않음)</li>
            <li>가장자리 단서와 두 칸 간격의 격자형 단서 배치 줄이기</li>
            {difficulty === 'normal' && width === 12 && <li>같은 행·열의 단서 쏠림 완화</li>}
          </ul>
        </section>

        <section className="saved-boards" aria-label="보드 목록">
          <h2>보드 목록</h2>
          <p className="board-help">품질 조건을 만족하는 생성 보드는 자동 저장됩니다. 현재 지원하는 난이도와 크기만 표시합니다.</p>
          {visiblePuzzles.length === 0 && <p className="board-help">표시할 저장 보드가 없습니다.</p>}
          <ul>
            {visiblePuzzles.map((puzzle, index) => (
              <li key={`${puzzle.id}-${index}`}>
                <button type="button" className="secondary" onClick={() => runWorker({ puzzle })}>
                  저장 보드 열기 · {puzzle.title} · {puzzle.definition.width}×{puzzle.definition.height} · {puzzle.difficulty}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {game && evaluation && <div className="preview-card">
          <div className="meta-row">
            <strong>{game.puzzle.title}</strong>
            <span>{game.puzzle.definition.width}x{game.puzzle.definition.height}</span>
          </div>
          {!game.fromSaved && generationTime !== null && (
            <p className="board-help">생성 시간: {generationTime}</p>
          )}
          <p className="board-help">칸을 클릭하면 미표시(연한 회색) → 바다(푸른색) → 섬(모래색) → 미표시로 바뀝니다. 숫자 칸은 섬으로 고정됩니다.</p>
          <div className="solution-controls" role="group" aria-label="정답 및 풀이 보기">
            <button type="button" className="secondary" aria-pressed={showSolution}
              onClick={() => setBoardView(showSolution ? { mode: 'play' } : { mode: 'solution' })}>
              {showSolution ? '정답 숨기기' : '정답 보기'}
            </button>
            <button type="button" className="secondary" aria-pressed={playbackStep !== null}
              onClick={() => setBoardView(playbackStep === null ? { mode: 'trace', step: 0 } : { mode: 'play' })}>
              {playbackStep === null ? '풀이 보기' : '풀이 숨기기'}
            </button>
            <button type="button" className="secondary" aria-label="이전 풀이 단계"
              disabled={playbackStep === null || playbackStep === 0}
              onClick={() => setBoardView((current) => current.mode === 'trace'
                ? { mode: 'trace', step: Math.max(0, current.step - 1) } : current)}>
              ←
            </button>
            <button type="button" className="secondary" aria-label="다음 풀이 단계"
              disabled={playbackStep === null || playbackStep >= stepCount}
              onClick={() => setBoardView((current) => current.mode === 'trace'
                ? { mode: 'trace', step: Math.min(stepCount, current.step + 1) } : current)}>
              →
            </button>
          </div>
          {playbackStep !== null && (
            <section className="playback-step board-help" aria-label="현재 풀이 단계" aria-live="polite">
              <p><strong>풀이 {playbackStep} / {stepCount}</strong> · 한 단계는 한 칸 확정입니다. 직접 풀던 상태는 보존됩니다.</p>
              <p>{currentStep ? <SolveStepRecord step={currentStep} /> : stepCount === 0
                ? '기록된 풀이 단계가 없습니다.' : '시작 상태: 단서만 표시합니다.'}</p>
              {playbackStep === stepCount && stepCount > 0 && (
                <p>{game.analysis.solved ? '마지막 풀이 단계입니다.'
                  : `현재 추론 기록이 끝났습니다. 미확정 ${game.analysis.remainingCells}칸은 그대로 남깁니다.`}</p>
              )}
            </section>
          )}
          <div className="play-layout">
          <div className="play-board">
          <div className="board-scroll">
            <div className="board-coordinates">
              <span className="board-axis-corner" aria-hidden="true">행/열</span>
              <div className="board-axis board-columns" role="group" aria-label="열 번호"
                style={{ gridTemplateColumns: `repeat(${game.play.width}, 2.25rem)` }}>
                {Array.from({ length: game.play.width }, (_, col) => <span key={col}>{col + 1}</span>)}
              </div>
              <div className="board-axis board-rows" role="group" aria-label="행 번호"
                style={{ gridTemplateRows: `repeat(${game.play.height}, 2.25rem)` }}>
                {Array.from({ length: game.play.height }, (_, row) => <span key={row}>{row + 1}</span>)}
              </div>
            <div
              className="board"
              role="group"
              aria-label="퍼즐 보드"
              style={{ gridTemplateColumns: `repeat(${game.play.width}, 2.25rem)` }}
            >
              {game.play.cells.map((row, rowIndex) => row.map((cell, colIndex) => {
                const clue = game.play.clues[rowIndex][colIndex];
                const displayedCell = showSolution ? game.puzzle.solution.colors[rowIndex][colIndex]
                  : playbackCells ? playbackCells[rowIndex][colIndex] : cell;
                const isCurrentStep = currentStep !== undefined && currentStep.row === rowIndex && currentStep.col === colIndex;
                return (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    type="button"
                    className={`board-cell ${clue !== null ? 'clue' : displayedCell}${isCurrentStep ? ' current-step' : ''}`}
                    disabled={clue !== null || showSolution || playbackStep !== null}
                    aria-current={isCurrentStep ? 'step' : undefined}
                    aria-label={`${rowIndex + 1}행 ${colIndex + 1}열: ${clue !== null ? `단서 ${clue}` : cellLabels[displayedCell]}`}
                    onClick={() => handleCellClick(rowIndex, colIndex)}
                  >
                    {clue}
                  </button>
                );
              }))}
              <BoardGridLines columns={game.play.width} rows={game.play.height} />
            </div>
            </div>
          </div>
          <p className="play-status" role="status">
            {playbackStep !== null ? '풀이 보기 중 (읽기 전용)' : evaluation.status === 'completed'
              ? '완료! 퍼즐을 풀었습니다.'
              : evaluation.issues === null
                ? '푸는 중'
                : '모든 칸을 표시했습니다. 규칙에 맞지 않는 칸이 있습니다.'}
          </p>
          </div>
          <aside className="solve-sidebar" aria-label="풀이 규칙 기록">
            <SolveObservations trace={game.analysis.solveTrace}
              activeStepIndex={playbackStep !== null && playbackStep > 0 ? playbackStep - 1 : null} />
          </aside>
          </div>
          <details className="puzzle-analysis">
            <summary>퍼즐 분석 (개발용)</summary>
            <h3>생성 정보</h3>
            <ul>
              <li>생성 프로필: {game.puzzle.difficulty}</li>
              <li>생성 시간: {generationTime ?? '기록 없음'}</li>
            </ul>
            <section aria-label="구조적 품질 지표">
            <h3>구조적 품질 지표</h3>
            <ul>
              <li>단서: {game.analysis.clueCount}개 / {game.analysis.cellCount}칸</li>
              <li>단서 밀도: {(game.analysis.clueDensity * 100).toFixed(1)}%</li>
              {whiteCount !== null && (
                <li>흰 칸 / 검은 칸: {whiteCount}개 / {game.analysis.cellCount - whiteCount}개 (흰 칸 비율: {(whiteCount / game.analysis.cellCount * 100).toFixed(1)}%)</li>
              )}
              {edgeClueCount !== null && <li>가장자리 단서: {edgeClueCount}개</li>}
              <li>가장 큰 단서: {Math.max(...game.puzzle.definition.clues.flat().filter((clue): clue is number => clue !== null))}</li>
              <li>단서 1: {game.analysis.oneClueCount}개</li>
              <li>단서 분포: {game.analysis.clueDistribution.length === 0 ? '단서 없음' : game.analysis.clueDistribution.map(({ value, count }) => `${value}: ${count}개`).join(', ')}</li>
              <li>단서 중 1의 비율: {game.analysis.oneClueRatio === null ? '단서 없음' : `${(game.analysis.oneClueRatio * 100).toFixed(1)}%`}</li>
            </ul>
            </section>
          </details>
        </div>}

        {generationError && <p role="alert">{loadingSaved ? '보드를 열지 못했습니다' : '문제를 생성하지 못했습니다'}. 다시 시도해 주세요: {generationError}</p>}
        {storage.error && <p role="alert">{storage.error}</p>}
        {autoSaveNotice && <p className="board-help">{autoSaveNotice}</p>}
        {generating && <p role="status">{loadingSaved ? '보드 분석 중...' : '문제 생성 중...'}</p>}
        <div className="actions">
          <button type="button" onClick={handleGenerate} disabled={generating}>새 문제 생성</button>
          <button type="button" className="secondary" onClick={handleSave} disabled={!game}>로컬 캐시에 저장</button>
        </div>
        <p className="board-help">저장은 문제만 보관합니다. 풀이 진행 상태는 아직 저장되지 않습니다.</p>
      </section>
    </main>
  );
}
