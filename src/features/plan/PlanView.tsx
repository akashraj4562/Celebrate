import { useState } from 'react';
import { getCurrentPlanState, useCurrentPlan, useStore } from '../../store';
import { daysLeft } from '../../lib/plan';
import { generateModule } from '../../api';
import { DeliverableCard } from '../card/DeliverableCard';
import { SkeletonCard } from '../card/SkeletonCard';
import { ALWAYS_ACTIVE_IDS, GROUP_LABEL, GROUP_ORDER, MODULES } from '../../modules';
import { PRIMARY_MOMENT_ID, instanceIdOf, type ModuleId } from '../../types';
import './planview.css';

export function PlanView() {
  const plan = useCurrentPlan();
  const selectPlan = useStore((s) => s.selectPlan);
  const patchDeliverable = useStore((s) => s.patchDeliverable);
  const [generatingAll, setGeneratingAll] = useState(false);
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

  const PM = PRIMARY_MOMENT_ID;
  const isGenerated = (id: ModuleId) => Boolean(plan.deliverables[instanceIdOf(id, PM)]);
  const doneCount = ALWAYS_ACTIVE_IDS.filter(isGenerated).length;
  const total = ALWAYS_ACTIVE_IDS.length;
  const anyCards = doneCount > 0;

  // Generate one module (used by per-card Refresh).
  async function regen(moduleId: ModuleId) {
    const cur = getCurrentPlanState();
    if (!cur) return;
    setError(null);
    try {
      const d = await generateModule(moduleId, cur);
      useStore.getState().upsertDeliverable(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Generate every always-active module in dependency-ordered parallel waves.
  // Cards stream in wave by wave; locked cards are never overwritten; a single
  // failure degrades to one card you can Refresh, it never aborts the rest.
  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    const active = ALWAYS_ACTIVE_IDS;
    const done = new Set<ModuleId>();
    const remaining = new Set<ModuleId>(active);
    const failures: ModuleId[] = [];

    try {
      while (remaining.size) {
        const ready = [...remaining].filter((id) =>
          MODULES[id].dependsOn.every((dep) => !active.includes(dep) || done.has(dep)),
        );
        if (ready.length === 0) break; // safety — shouldn't happen on a DAG
        await Promise.allSettled(
          ready.map(async (id) => {
            try {
              const cur = getCurrentPlanState();
              if (!cur) return;
              if (cur.deliverables[instanceIdOf(id, PM)]?.locked) return; // respect locks
              const d = await generateModule(id, cur);
              useStore.getState().upsertDeliverable(d);
            } catch {
              failures.push(id);
            } finally {
              done.add(id);
              remaining.delete(id);
            }
          }),
        );
      }
      if (failures.length) {
        setError(`${failures.length} card${failures.length > 1 ? 's' : ''} couldn’t generate — open one and hit Refresh to retry.`);
      }
    } finally {
      setGeneratingAll(false);
    }
  }

  const groups = GROUP_ORDER.map((g) => ({
    g,
    label: GROUP_LABEL[g],
    ids: ALWAYS_ACTIVE_IDS.filter((id) => MODULES[id].group === g),
  })).filter((grp) => grp.ids.length > 0);

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
          <div className="m"><b>{dateLabel}</b><span>{dleft >= 0 ? `in ${dleft} days` : `${-dleft} days ago`}</span></div>
          <div className="m"><b>{input.location.city}</b><span>{input.location.area ?? 'location'}</span></div>
          <div className="m"><b>₹{input.budgetTotal.toLocaleString('en-IN')}</b><span>budget</span></div>
          <div className="m"><b>{headcount}</b><span>guests</span></div>
          <div className="m"><b style={{ textTransform: 'capitalize' }}>{input.memoryValue}</b><span>significance</span></div>
        </div>

        <div className="callout">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>{anyCards ? 'Your reasoning board' : 'Generate the plan'}</h3>
              <p>
                One click builds every module — each card carries its reasoning. They fill in as the engine works
                through the dependency order: theme &amp; timing first, the itinerary last.
              </p>
            </div>
            <button className="btn primary" disabled={generatingAll} onClick={generateAll}>
              {generatingAll ? `Building… ${doneCount}/${total}` : anyCards ? 'Regenerate all' : 'Generate full plan →'}
            </button>
          </div>
          {error && <div style={{ color: 'var(--warn)', marginTop: 10, fontSize: '0.9rem' }}>⚠ {error}</div>}
        </div>

        {(anyCards || generatingAll) &&
          groups.map(({ g, label, ids }) => {
            const visible = ids.filter((id) => isGenerated(id) || generatingAll);
            if (visible.length === 0) return null;
            return (
              <section className="board-group" key={g}>
                <div className="group-head">
                  {label}
                  <span className="count">{visible.filter(isGenerated).length}/{ids.length}</span>
                </div>
                <div className="board">
                  {visible.map((id) => {
                    const inst = plan.deliverables[instanceIdOf(id, PM)];
                    return inst ? (
                      <DeliverableCard
                        key={id}
                        deliverable={inst}
                        onPatch={(p) => patchDeliverable(inst.instanceId, p)}
                        onRefresh={() => regen(id)}
                        onDiscuss={() => alert('Per-card chat lands in Step 12.')}
                      />
                    ) : (
                      <SkeletonCard key={id} title={MODULES[id].title} kicker={id} />
                    );
                  })}
                </div>
              </section>
            );
          })}

        <div className="pv-grid" style={{ marginTop: 8 }}>
          <section className="panel">
            <div className="panel-head"><h2>The honoree{input.honorees.length > 1 ? 's' : ''}</h2></div>
            {input.honorees.map((h) => (
              <div className="pv-person" key={h.id}>
                <div className="nm">
                  {h.name} <span className="muted" style={{ fontSize: '0.9rem' }}>· {h.relation}</span>
                  {h.age ? <span className="muted" style={{ fontSize: '0.9rem' }}> · {h.age}</span> : null}
                </div>
                <div className="pv-pills">
                  {h.loveLanguage && <span className="pill accent">loves: {h.loveLanguage}</span>}
                  {(h.interests ?? []).map((i) => (<span className="pill" key={i}>{i}</span>))}
                  {(h.expressedWishes ?? []).map((w) => (<span className="pill" key={w}>wants: {w}</span>))}
                </div>
                {h.recentInteractions && <div className="kv">Right now: {h.recentInteractions}</div>}
                {h.personality && <div className="kv">{h.personality}</div>}
                {h.mobility === 'limited' && <div className="kv"><b>Limited mobility</b> — daytime, step-free favoured.</div>}
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Guests &amp; signals</h2></div>
            <div className="kv"><b>Groups</b></div>
            <div className="pv-pills">
              {input.cohorts.map((c) => (
                <span className="pill" key={c.id}>{c.label}: {c.count}{c.isKids ? ' (kids)' : ''}</span>
              ))}
            </div>
            {input.exceptions.length > 0 && (
              <>
                <div className="kv" style={{ marginTop: 12 }}><b>Exceptions honoured</b></div>
                <div className="pv-pills">
                  {input.exceptions.map((x) => (<span className="pill" key={x.id}>{x.note}</span>))}
                </div>
              </>
            )}
            <div className="kv" style={{ marginTop: 12 }}><b>Alcohol:</b> {input.alcohol ? 'yes' : 'no'}</div>
            {input.innerCircle.length > 0 && (
              <div className="kv"><b>Dressing for it:</b> {input.innerCircle.map((h) => h.name).join(', ')}</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
