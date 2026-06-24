import type { PrepTimeline as TL } from '../../engine/timeline';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function PrepTimeline({ timeline }: { timeline: TL }) {
  if (timeline.buckets.length === 0) {
    return (
      <div className="budget-rail">
        <div className="br-label">Prep timeline</div>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
          Generate the plan to see the backward-planned schedule.
        </p>
      </div>
    );
  }

  const d = timeline.daysUntilStart;
  return (
    <div className="budget-rail">
      <div className="br-label">Start planning by</div>
      <div className="br-total">{timeline.startByDate ? fmt(timeline.startByDate) : '—'}</div>
      <div className={`br-of ${d != null && d <= 0 ? 'late' : ''}`}>
        {d == null ? '' : d > 0 ? `in ${d} days` : `${-d} days ago — start now`}
      </div>

      {timeline.buckets.map((b) => (
        <div className="tl-bucket" key={b.id}>
          <div className={`tl-head ${b.tone}`}>{b.label}</div>
          {b.items.map((it) => (
            <div className={`tl-item ${it.feasibility !== 'ok' ? it.feasibility : ''}`} key={it.instanceId}>
              <div className="tl-title">
                {it.title}
                {it.momentLabel && <span className="tl-moment"> · {it.momentLabel}</span>}
              </div>
              <div className="tl-when">
                {fmt(it.actionBy)} · {it.leadTimeDays}d
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
