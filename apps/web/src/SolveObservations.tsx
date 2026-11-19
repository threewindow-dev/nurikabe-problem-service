import { useState } from 'react';
import { RULE_PRIORITY, RULE_STAGES, type DeductionRule, type SolveTrace, type SolveTraceStep } from '@core';

const ruleLabels: Record<DeductionRule, string> = {
  completedIsland: '완성된 섬 주변 바다',
  blackSquare: '바다 2×2 방지',
  islandReach: '섬 도달 범위',
  unreachable: '섬이 닿을 수 없는 칸',
  islandSeparation: '섬 분리',
  islandExpansion: '섬 확장',
  islandOverflow: '섬 크기 초과 방지',
  islandShapeIntersection: '섬 모양 교집합',
  islandShapeBoundary: '섬 후보 모양의 공통 경계',
  seaBridge: '바다 연결성',
  whiteConnection: '흰 칸 연결 통로',
  sharedIslandSpace: '두 섬의 공통 공간',
  assumptionContradiction: '가정 모순 검증'
};
const rules = (Object.keys(ruleLabels) as DeductionRule[])
  .sort((a, b) => RULE_PRIORITY[a] - RULE_PRIORITY[b]);

export function SolveStepRecord({ step }: { step: SolveTraceStep }) {
  const { scan, rule, row, col, color, review } = step;
  return <>
    스캔 {scan} · {ruleLabels[rule]} · {row + 1}행 {col + 1}열 → {color === 'white' ? '섬' : '바다'}
    {' '}· 검토 {review.cells}칸 ({review.rows}행 × {review.columns}열 범위)
  </>;
}

export function SolveObservations({ trace, activeStepIndex = null }: { trace: SolveTrace; activeStepIndex?: number | null }) {
  const [revealedTrace, setRevealedTrace] = useState<SolveTrace | null>(null);
  const showSteps = revealedTrace === trace;
  const metrics = trace.observations;
  const firstHigherStage = trace.steps.find(({ rule }) => RULE_STAGES[rule] > 1);

  return (
    <section aria-label="풀이 관측값">
      <h3>풀이 관측값 (난도 참고)</h3>
      <ul>
        <li>{metrics.solved ? '현재 추론 규칙으로 해결 가능' : `현재 추론 규칙으로 미해결: ${metrics.remainingCells}칸 (난도 판정 불가)`}</li>
        <li>사용된 추론 단계: {metrics.highestStage === null ? '사용 없음' : `${metrics.highestStage}단계`}</li>
        <li>확정한 칸: {metrics.confirmedCells}칸 (시작 단서 제외)</li>
        <li>추론 스캔: {metrics.deductionRounds}회</li>
        <li>첫 2단계 이상 추론: {firstHigherStage ? `${firstHigherStage.scan}번째 스캔` : '없음'}</li>
        <li>최대 검토 범위: {metrics.maxReview
          ? `${metrics.maxReview.cells}칸 (세로 ${metrics.maxReview.rows}행 × 가로 ${metrics.maxReview.columns}열 범위)`
          : '확정 기록 없음'}</li>
        <li>관측 시점 최소 다음 수 후보: {metrics.minCandidateCells === null ? '해당 없음' : `${metrics.minCandidateCells}칸`}</li>
        <li>후보가 1칸뿐인 관측 시점: {metrics.singleCandidateCheckpoints}회</li>
        <li>가정: 한 칸 색상 검증만 사용 · 백트래킹: 사용하지 않음</li>
      </ul>
      <table>
        <caption>규칙별 확정 칸 수</caption>
        <thead><tr><th>규칙</th><th>단계</th><th>칸 수</th><th>최대 검토 칸</th></tr></thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule}>
              <th scope="row">{ruleLabels[rule]}</th>
              <td>{RULE_STAGES[rule]}단계</td>
              <td>{metrics.deductions[rule]}</td>
              <td>{trace.steps.filter((step) => step.rule === rule).reduce((max, step) => Math.max(max, step.review.cells), 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>1단계: 국소 판단 · 2단계: 도달 불가 영역 · 3단계: 후보·연결 구조 · 4단계: 가정 모순 검증.</p>
      <p>검토 범위는 규칙이 참조한 영역의 크기이지, 사람이 반드시 살펴봐야 하는 최소 범위가 아닙니다. 도달 불가·바다 연결성·흰 칸 연결 통로는 보드 전체를 범위로 기록합니다.</p>
      <p>다음 수 후보는 스캔 시작 상태에서 추가 전개 없이 현재 규칙으로 확정 가능한 서로 다른 칸입니다. 중복은 가장 낮은 단계로 셉니다. 규칙·모양 열거 한도에 영향을 받으며, 후보가 적다는 이유만으로 어렵다고 판정하지 않습니다.</p>
      <details>
        <summary>다음 수 후보 관측 기록</summary>
        <div className="solve-trace">
          <table>
            <caption>스캔 시작 상태별 후보 수</caption>
            <thead><tr><th>확정 기록 이후</th><th>후보</th><th>1단계</th><th>2단계</th><th>3단계</th><th>4단계</th></tr></thead>
            <tbody>
              {trace.checkpoints.filter(({ remainingCells }) => remainingCells > 0).map((checkpoint) => (
                <tr key={checkpoint.scan}>
                  <th scope="row">{checkpoint.confirmedBefore}개</th>
                  <td>{checkpoint.candidateCells}칸</td>
                  <td>{checkpoint.byStage[1]}</td><td>{checkpoint.byStage[2]}</td>
                  <td>{checkpoint.byStage[3]}</td><td>{checkpoint.byStage[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p>풀이 기록 v{trace.version} · 표의 단계·규칙 순서대로 적용하며, 한 칸 확정 후 첫 규칙부터 다시 검사합니다. 확정 칸 수는 추론 횟수가 아니며, 스캔 수는 추론 깊이가 아닙니다. 실제 난도 등급·필수 최소 추론 단계는 아직 판정하지 않습니다.</p>
      <button type="button" className="secondary" aria-expanded={showSteps} onClick={() => setRevealedTrace(showSteps ? null : trace)}>
        {showSteps ? '풀이 기록 숨기기' : '풀이 기록 보기 (정답 위치 포함)'}
      </button>
      {showSteps && (
        <ol className="solve-trace" aria-label="풀이 확정 기록">
          {trace.steps.map((step, index) => (
            <li key={index} aria-current={index === activeStepIndex ? 'step' : undefined}>
              <SolveStepRecord step={step} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
