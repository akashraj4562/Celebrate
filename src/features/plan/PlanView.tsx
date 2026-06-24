import { useState } from 'react';
import { getCurrentPlanState, useCurrentPlan, useStore } from '../../store';
import { daysLeft } from '../../lib/plan';
import { chatModule, generateModule, type ChatProposal } from '../../api';
import { DeliverableCard } from '../card/DeliverableCard';
import { SkeletonCard } from '../card/SkeletonCard';
import { ALWAYS_ACTIVE_IDS, GROUP_LABEL, GROUP_ORDER, MODULES } from '../../modules';
import { PRIMARY_MOMENT_ID, instanceIdOf, type ModuleId } from '../../types';
import { activate } from '../../engine/activation';
import { PlanRail, type RailTab } from './PlanRail';
import './planview.css';

export function PlanView() {
  const plan = useCurrentPlan();
  const selectPlan = useStore((s) => s.selectPlan);
  const patchDeliverable = useStore((s) => s.patchDeliverable);
  const overrideDeliverable = useStore((s) => s.overrideDeliverable);
  const clearStale = useStore((s) => s.clearStale);
  const dismissMoment = useStore((s) => s.dismissMoment);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-card chat (§9) — rail tab is lifted so "Discuss" can jump to it.
  const [railTab, setRailTab] = useState<RailTab>('budget');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Record<string, ChatProposal>>({});
  const [chatBusy, setChatBusy] = useState(false);

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
  const staleCount = Object.values(plan.deliverables).filter((d) => d.stale).length;

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

  // Run the given modules in dependency-ordered parallel waves over the per-module
  // endpoint. Cards stream in wave by wave; locked cards are never overwritten; a
  // single failure degrades to one retryable card, it never aborts the rest.
  async function runGeneration(ids: ModuleId[]): Promise<ModuleId[]> {
    const idset = new Set(ids);
    const done = new Set<ModuleId>();
    const remaining = new Set<ModuleId>(ids);
    const failures: ModuleId[] = [];
    while (remaining.size) {
      const ready = [...remaining].filter((id) =>
        MODULES[id].dependsOn.every((dep) => !idset.has(dep) || done.has(dep)),
      );
      if (ready.length === 0) break; // safety — shouldn't happen on a DAG
      await Promise.allSettled(
        ready.map(async (id) => {
          try {
            const cur = getCurrentPlanState();
            if (!cur) return;
            const mslot = MODULES[id].moment;
            const mid = mslot === 'primary' ? PM : mslot;
            if (cur.deliverables[instanceIdOf(id, mid)]?.locked) return; // respect locks
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
    return failures;
  }

  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    try {
      const f1 = await runGeneration(ALWAYS_ACTIVE_IDS);
      // Activation (§6): spawn conditional + moment modules from inputs + generated tags.
      let f2: ModuleId[] = [];
      const cur = getCurrentPlanState();
      if (cur) {
        const { plan: nextPlan, spawn } = activate(cur);
        useStore.getState().replacePlan(nextPlan);
        f2 = await runGeneration(spawn.map((s) => s.moduleId));
        for (const s of spawn) {
          const slot = MODULES[s.moduleId].moment;
          const mid = slot === 'primary' ? PM : slot;
          useStore.getState().patchDeliverable(instanceIdOf(s.moduleId, mid), { reason: s.reason });
        }
      }
      const fails = [...f1, ...f2];
      if (fails.length) {
        setError(`${fails.length} card${fails.length > 1 ? 's' : ''} couldn’t generate — open one and hit Refresh to retry.`);
      }
    } finally {
      setGeneratingAll(false);
    }
  }

  // Refresh all stale cards in dependency order (so each reads fresh upstream).
  async function refreshAllStale() {
    const cur = getCurrentPlanState();
    if (!cur) return;
    const staleIds = ALWAYS_ACTIVE_IDS.filter((id) => cur.deliverables[instanceIdOf(id, PM)]?.stale);
    if (staleIds.length === 0) return;
    setGeneratingAll(true);
    setError(null);
    try {
      await runGeneration(staleIds);
    } finally {
      setGeneratingAll(false);
    }
  }

  // Open a card's chat in the rail.
  function discuss(instanceId: string) {
    setFocusedId(instanceId);
    setRailTab('chat');
  }

  // Send one chat turn for the focused card (§9). Optimistically appends the user
  // message, then the assistant reply; a returned proposal is held for Apply.
  async function sendChat(message: string) {
    const inst = focusedId;
    if (!inst) return;
    const before = getCurrentPlanState();
    const d = before?.deliverables[inst];
    if (!before || !d) return;
    const history = d.chat; // prior turns, before this message
    patchDeliverable(inst, { chat: [...history, { role: 'user', content: message }] });
    setChatBusy(true);
    setError(null);
    try {
      const res = await chatModule(d.moduleId, getCurrentPlanState() ?? before, history, message);
      const cur = getCurrentPlanState();
      const cd = cur?.deliverables[inst];
      if (cd) patchDeliverable(inst, { chat: [...cd.chat, { role: 'assistant', content: res.reply }] });
      setProposals((p) => {
        if (res.proposal) return { ...p, [inst]: res.proposal };
        const { [inst]: _drop, ...rest } = p;
        return rest;
      });
    } catch (e) {
      const cur = getCurrentPlanState();
      const cd = cur?.deliverables[inst];
      const msg = e instanceof Error ? e.message : String(e);
      if (cd) patchDeliverable(inst, { chat: [...cd.chat, { role: 'assistant', content: `⚠ ${msg}` }] });
    } finally {
      setChatBusy(false);
    }
  }

  // Apply the focused card's proposal THROUGH the engine — override (which cascades
  // downstream stale), then activation (tags may spawn/deactivate modules), then
  // generate anything newly spawned. Never a silent edit (§9).
  async function applyProposal(lock: boolean) {
    const inst = focusedId;
    const proposal = inst ? proposals[inst] : undefined;
    if (!inst || !proposal) return;
    const patch: Parameters<typeof overrideDeliverable>[1] = {
      status: 'overridden',
      ...(proposal.recommendation ? { recommendation: proposal.recommendation } : {}),
      ...(proposal.reasoning.length ? { reasoning: proposal.reasoning } : {}),
      ...(proposal.costLines.length ? { costLines: proposal.costLines } : {}),
      ...(proposal.tags.length ? { tags: proposal.tags } : {}),
      ...(proposal.ingestedQuotes.length ? { ingestedQuotes: proposal.ingestedQuotes } : {}),
      ...(lock ? { locked: true } : {}),
    };
    overrideDeliverable(inst, patch);
    setProposals((p) => {
      const { [inst]: _drop, ...rest } = p;
      return rest;
    });
    // Re-run activation: a changed venue tag can spawn home-catering / weather backup.
    const cur = getCurrentPlanState();
    if (!cur) return;
    const { plan: nextPlan, spawn } = activate(cur);
    useStore.getState().replacePlan(nextPlan);
    if (spawn.length) {
      setGeneratingAll(true);
      try {
        await runGeneration(spawn.map((s) => s.moduleId));
        for (const s of spawn) {
          const slot = MODULES[s.moduleId].moment;
          const mid = slot === 'primary' ? PM : slot;
          useStore.getState().patchDeliverable(instanceIdOf(s.moduleId, mid), { reason: s.reason });
        }
      } finally {
        setGeneratingAll(false);
      }
    }
  }

  function dismissProposal() {
    const inst = focusedId;
    if (!inst) return;
    setProposals((p) => {
      const { [inst]: _drop, ...rest } = p;
      return rest;
    });
  }

  // Primary-moment module set = always-active + any spawned conditionals in `main`.
  const primaryConditionalIds = Object.values(plan.deliverables)
    .filter((d) => d.momentId === PM && MODULES[d.moduleId].kind !== 'always')
    .map((d) => d.moduleId);
  const primaryIds: ModuleId[] = [...new Set<ModuleId>([...ALWAYS_ACTIVE_IDS, ...primaryConditionalIds])];
  const otherMoments = plan.moments.filter((m) => !m.isPrimary);

  const renderGroupedBoard = (moduleIds: ModuleId[], momentId: string, withSkeletons: boolean) =>
    GROUP_ORDER.map((g) => {
      const ids = moduleIds.filter((id) => MODULES[id].group === g);
      const visible = ids.filter(
        (id) => plan.deliverables[instanceIdOf(id, momentId)] || (withSkeletons && ALWAYS_ACTIVE_IDS.includes(id)),
      );
      if (visible.length === 0) return null;
      return (
        <section className="board-group" key={`${momentId}-${g}`}>
          <div className="group-head">{GROUP_LABEL[g]}</div>
          <div className="board">
            {visible.map((id) => {
              const inst = plan.deliverables[instanceIdOf(id, momentId)];
              return inst ? (
                <DeliverableCard
                  key={id}
                  deliverable={inst}
                  onPatch={(p) => patchDeliverable(inst.instanceId, p)}
                  onOverride={(p) => overrideDeliverable(inst.instanceId, p)}
                  onRefresh={() => regen(id)}
                  onDiscuss={() => discuss(inst.instanceId)}
                />
              ) : (
                <SkeletonCard key={id} title={MODULES[id].title} kicker={id} />
              );
            })}
          </div>
        </section>
      );
    });

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

        {staleCount > 0 && !generatingAll && (
          <div className="stale-banner">
            <span>
              <b>{staleCount}</b> card{staleCount > 1 ? 's' : ''} may be affected by your change — review or refresh.
            </span>
            <div className="row">
              <button className="btn tiny primary" onClick={refreshAllStale}>↺ Refresh all</button>
              <button className="btn tiny" onClick={clearStale}>Dismiss</button>
            </div>
          </div>
        )}

        <div className="plan-body">
          <div className="plan-main">
            {(anyCards || generatingAll) && renderGroupedBoard(primaryIds, PM, generatingAll)}

        {otherMoments.map((m) => {
          const ids = Object.values(plan.deliverables)
            .filter((d) => d.momentId === m.id)
            .map((d) => d.moduleId);
          if (ids.length === 0) return null;
          return (
            <section className="moment-section" key={m.id}>
              <div className="moment-head">
                <div>
                  <h2>{m.label}</h2>
                  {m.reason && <div className="moment-reason">{m.reason}</div>}
                </div>
                <button className="btn ghost tiny" onClick={() => dismissMoment(m.id)}>Dismiss</button>
              </div>
              {renderGroupedBoard(ids, m.id, false)}
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
          <div className="plan-rail">
            <PlanRail
              plan={plan}
              tab={railTab}
              setTab={setRailTab}
              chat={{
                deliverable: focusedId ? plan.deliverables[focusedId] ?? null : null,
                proposal: focusedId ? proposals[focusedId] : undefined,
                busy: chatBusy,
                onSend: sendChat,
                onApply: applyProposal,
                onDismiss: dismissProposal,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
