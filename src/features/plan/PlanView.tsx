import { useState } from 'react';
import { useCurrentPlan, useStore } from '../../store';
import { daysLeft } from '../../lib/plan';
import { generateModule } from '../../api';
import { DeliverableCard } from '../card/DeliverableCard';
import type { ModuleId } from '../../types';
import './planview.css';

export function PlanView() {
  const plan = useCurrentPlan();
  const selectPlan = useStore((s) => s.selectPlan);
  const upsertDeliverable = useStore((s) => s.upsertDeliverable);
  const patchDeliverable = useStore((s) => s.patchDeliverable);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  if (!plan) return null;

  const { input } = plan;
  const dleft = daysLeft(input.date);
  const headcount = input.cohorts.reduce((n, c) => n + c.count, 0);
  const dateLabel = new Date(input.date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const deliverables = Object.values(plan.deliverables);

  async function regen(moduleId: ModuleId) {
    if (!plan) return;
    setError(null);
    setBusy((b) => ({ ...b, [moduleId]: true }));
    try {
      const d = await generateModule(moduleId, plan);
      upsertDeliverable(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => ({ ...b, [moduleId]: false }));
    }
  }

  const hasTiming = Boolean(plan.deliverables['timing__main']);

  return (
    <div className="planview">
      <div className="container">
        <div className="pv-top">
          <div>
            <div className="kicker">Plan</div>
            <h1>
              {input.honorees.map((h) => h.name).join(' & ')}’s {input.eventType}
            </h1>
          </div>
          <button className="btn ghost" onClick={() => selectPlan(null)}>← New plan</button>
        </div>

        <div className="pv-meta">
          <div className="m">
            <b>{dateLabel}</b>
            <span>{dleft >= 0 ? `in ${dleft} days` : `${-dleft} days ago`}</span>
          </div>
          <div className="m">
            <b>{input.location.city}</b>
            <span>{input.location.area ?? 'location'}</span>
          </div>
          <div className="m">
            <b>₹{input.budgetTotal.toLocaleString('en-IN')}</b>
            <span>budget</span>
          </div>
          <div className="m">
            <b>{headcount}</b>
            <span>guests</span>
          </div>
          <div className="m">
            <b style={{ textTransform: 'capitalize' }}>{input.memoryValue}</b>
            <span>significance</span>
          </div>
        </div>

        <div className="callout">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>{deliverables.length ? 'Your reasoning board' : 'Generate the plan'}</h3>
              <p>
                Building one card at a time, starting with Timing &amp; Setting — the reasoning showcase. One-click
                full-plan generation lands in Step 7.
              </p>
            </div>
            <button className="btn primary" disabled={!!busy.timing} onClick={() => regen('timing')}>
              {busy.timing ? 'Thinking…' : hasTiming ? 'Regenerate timing' : 'Generate timing card →'}
            </button>
          </div>
          {error && (
            <div style={{ color: 'var(--warn)', marginTop: 10, fontSize: '0.9rem' }}>⚠ {error}</div>
          )}
        </div>

        {deliverables.length > 0 && (
          <div className="board" style={{ marginBottom: 26 }}>
            {deliverables.map((d) => (
              <DeliverableCard
                key={d.instanceId}
                deliverable={d}
                onPatch={(p) => patchDeliverable(d.instanceId, p)}
                onRefresh={() => regen(d.moduleId)}
                onDiscuss={() => alert('Per-card chat lands in Step 12.')}
              />
            ))}
          </div>
        )}

        <div className="pv-grid">
          <section className="panel">
            <div className="panel-head">
              <h2>The honoree{input.honorees.length > 1 ? 's' : ''}</h2>
            </div>
            {input.honorees.map((h) => (
              <div className="pv-person" key={h.id}>
                <div className="nm">
                  {h.name} <span className="muted" style={{ fontSize: '0.9rem' }}>· {h.relation}</span>
                  {h.age ? <span className="muted" style={{ fontSize: '0.9rem' }}> · {h.age}</span> : null}
                </div>
                <div className="pv-pills">
                  {h.loveLanguage && <span className="pill accent">loves: {h.loveLanguage}</span>}
                  {(h.interests ?? []).map((i) => (
                    <span className="pill" key={i}>{i}</span>
                  ))}
                  {(h.expressedWishes ?? []).map((w) => (
                    <span className="pill" key={w}>wants: {w}</span>
                  ))}
                </div>
                {h.recentInteractions && <div className="kv">Right now: {h.recentInteractions}</div>}
                {h.personality && <div className="kv">{h.personality}</div>}
                {h.mobility === 'limited' && <div className="kv"><b>Limited mobility</b> — daytime, step-free will be favoured.</div>}
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Guests &amp; signals</h2>
            </div>
            <div className="kv"><b>Groups</b></div>
            <div className="pv-pills">
              {input.cohorts.map((c) => (
                <span className="pill" key={c.id}>
                  {c.label}: {c.count}
                  {c.isKids ? ' (kids)' : ''}
                </span>
              ))}
            </div>
            {input.exceptions.length > 0 && (
              <>
                <div className="kv" style={{ marginTop: 12 }}><b>Exceptions honoured</b></div>
                <div className="pv-pills">
                  {input.exceptions.map((x) => (
                    <span className="pill" key={x.id}>{x.note}</span>
                  ))}
                </div>
              </>
            )}
            <div className="kv" style={{ marginTop: 12 }}>
              <b>Alcohol:</b> {input.alcohol ? 'yes' : 'no'}
            </div>
            {input.innerCircle.length > 0 && (
              <div className="kv">
                <b>Dressing for it:</b> {input.innerCircle.map((h) => h.name).join(', ')}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
