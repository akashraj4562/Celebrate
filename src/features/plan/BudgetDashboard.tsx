import type { BudgetSummary } from '../../types';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function BudgetDashboard({ budget }: { budget: BudgetSummary }) {
  const over = budget.variance < 0;
  const pct = budget.budget > 0 ? Math.round((budget.grandTotal / budget.budget) * 100) : 0;
  const pressureOf = (cat: string) => budget.pressure.find((p) => p.category === cat)?.state ?? 'ok';

  return (
    <div className="budget-rail">
      <div className="br-label">Budget</div>
      <div className="br-total">{inr(budget.grandTotal)}</div>
      <div className="br-of">of {inr(budget.budget)} planned</div>
      <div className={`br-variance ${over ? 'over' : 'ok'}`}>
        {budget.grandTotal === 0
          ? 'nothing committed yet'
          : over
            ? `${inr(-budget.variance)} over budget`
            : `${inr(budget.variance)} left`}
      </div>
      <div className="br-bar">
        <div className={`fill ${over ? 'over' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>

      <div className="br-basis">
        <span>
          <b>{inr(budget.totalEstimated)}</b>estimated
        </span>
        <span>
          <b>{inr(budget.totalQuoted)}</b>quoted
        </span>
        <span>
          <b>{inr(budget.totalActual)}</b>actual
        </span>
      </div>

      <div className="br-section">
        Allocation <span>target vs actual</span>
      </div>
      {budget.allocation.map((a) => {
        const target = (budget.budget * a.targetPct) / 100;
        const fill = target > 0 ? Math.min(100, Math.round((a.actual / target) * 100)) : 0;
        const state = pressureOf(a.category);
        return (
          <div className="alloc" key={a.category} title={a.reason}>
            <div className="alloc-top">
              <span className="alloc-cat">{a.category}</span>
              <span className={`alloc-state ${state}`}>{state}</span>
            </div>
            <div className="alloc-bar">
              <div className={`f ${state}`} style={{ width: `${fill}%` }} />
            </div>
            <div className="alloc-nums">
              <span>{inr(a.actual)}</span>
              <span className="muted">
                target {a.targetPct}% · {inr(target)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
