import { useState } from 'react';
import type { Alternative, CostBasis, CostLine, Deliverable } from '../../types';
import { uid } from '../../lib/plan';
import './card.css';

const BASIS_NEXT: Record<CostBasis, CostBasis> = {
  estimated: 'quoted',
  quoted: 'actual',
  actual: 'estimated',
};

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const cardTotal = (d: Deliverable) => d.costLines.reduce((s, l) => s + (l.amount || 0), 0);

function basisSummary(lines: CostLine[]): CostBasis | null {
  if (lines.length === 0) return null;
  if (lines.some((l) => l.basis === 'estimated')) return 'estimated';
  if (lines.some((l) => l.basis === 'quoted')) return 'quoted';
  return 'actual';
}

type Badge = { label: string; cls: string } | null;
function topBadge(d: Deliverable): Badge {
  if (d.feasibility === 'infeasible') return { label: 'Infeasible', cls: 'b-infeasible' };
  if (d.feasibility === 'tight') return { label: 'Tight', cls: 'b-tight' };
  if (d.stale) return { label: 'Stale', cls: 'b-stale' };
  if (d.confidence === 'low') return { label: 'Low signal', cls: 'b-lowconf' };
  if (d.status === 'overridden') return { label: 'Yours', cls: 'b-overridden' };
  return null;
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      {locked ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2.2" />}
    </svg>
  );
}

interface Props {
  deliverable: Deliverable;
  onPatch: (patch: Partial<Deliverable>) => void;
  onOverride?: (patch: Partial<Deliverable>) => void; // value change → cascade (falls back to onPatch)
  onRefresh?: () => void;
  onDiscuss?: () => void;
}

export function DeliverableCard({ deliverable: d, onPatch, onOverride, onRefresh, onDiscuss }: Props) {
  const [open, setOpen] = useState(false);
  const [editingRec, setEditingRec] = useState(false);
  const [recDraft, setRecDraft] = useState(d.recommendation);

  const applyValue = onOverride ?? onPatch; // value changes cascade; falls back to a plain patch
  const badge = topBadge(d);
  const total = cardTotal(d);
  const summaryBasis = basisSummary(d.costLines);

  function toggleLock() {
    const locked = !d.locked;
    const status = locked
      ? d.status === 'overridden'
        ? 'overridden'
        : 'locked'
      : d.status === 'locked'
        ? 'suggested'
        : d.status;
    onPatch({ locked, status });
  }

  const setLine = (id: string, patch: Partial<CostLine>) =>
    onPatch({ costLines: d.costLines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const addLine = () =>
    onPatch({ costLines: [...d.costLines, { id: uid('cl'), label: 'New line', amount: 0, basis: 'estimated' }] });
  const removeLine = (id: string) => onPatch({ costLines: d.costLines.filter((l) => l.id !== id) });

  function saveRec() {
    applyValue({ recommendation: recDraft.trim() || d.recommendation, status: d.locked ? d.status : 'overridden' });
    setEditingRec(false);
  }
  function startOverride() {
    setRecDraft(d.recommendation);
    setEditingRec(true);
    setOpen(true);
  }
  function promote(alt: Alternative) {
    applyValue({
      recommendation: alt.recommendation,
      reasoning: [alt.reasoning],
      status: 'overridden',
      alternatives: d.alternatives.filter((a) => a !== alt),
      costLines:
        alt.estimatedCost != null
          ? [{ id: uid('cl'), label: d.title, amount: alt.estimatedCost, basis: 'estimated' }]
          : d.costLines,
    });
  }

  return (
    <div className={`card ${d.locked ? 'is-locked' : ''} ${d.stale ? 'is-stale' : ''}`}>
      <div className="card-head" onClick={() => setOpen((o) => !o)}>
        <div>
          <div className="card-module">{d.moduleId}</div>
          <div className="card-title">{d.title}</div>
          {!open && <div className="card-rec1">{d.recommendation}</div>}
          {!open && d.reason && <div className="card-spawn">{d.reason}</div>}
        </div>
        <div className="head-right">
          <div className="card-cost">
            {total > 0 ? (
              <>
                <div className="amt">{inr(total)}</div>
                <div className="basis">{summaryBasis}</div>
              </>
            ) : (
              <div className="none">no direct cost</div>
            )}
          </div>
          <div className="head-icons">
            {badge && <span className={`badge ${badge.cls}`}>{badge.label}</span>}
            <button
              className={`icon-btn ${d.locked ? 'on' : ''}`}
              title={d.locked ? 'Locked — protected from cascade' : 'Lock this card'}
              onClick={(e) => {
                e.stopPropagation();
                toggleLock();
              }}
            >
              <LockIcon locked={d.locked} />
            </button>
            <span className={`chev ${open ? 'open' : ''}`}>▾</span>
          </div>
        </div>
      </div>

      {open && (
        <div className="card-body">
          {editingRec ? (
            <div className="rec-edit">
              <textarea value={recDraft} onChange={(e) => setRecDraft(e.target.value)} rows={2} />
              <div className="row">
                <button className="btn tiny" onClick={() => setEditingRec(false)}>Cancel</button>
                <button className="btn tiny primary" onClick={saveRec}>Save</button>
              </div>
            </div>
          ) : (
            <div className="card-rec-full">{d.recommendation}</div>
          )}

          {d.feasibility === 'infeasible' && (
            <div className="feasibility-note infeasible">
              Infeasible — this needs ~{d.leadTimeDays} days of lead time, more than the calendar allows. It should fall
              back to a simpler, local option.
            </div>
          )}
          {d.feasibility === 'tight' && (
            <div className="feasibility-note tight">
              Tight — ~{d.leadTimeDays} days of lead time against a close date. Action this one early.
            </div>
          )}

          {d.confidence === 'low' && (
            <div className="nudge">
              <b>This is generic-defensible, not yet delightful.</b> Give me one specific signal (a love-language, a
              recent wish, what’s going on in their life) and I’ll redo it sharper.
            </div>
          )}

          {d.reasoning.length > 0 && (
            <>
              <div className="why-label">Why</div>
              <ul className="why">
                {d.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}

          <div className="cost-label">Cost</div>
          {d.costLines.map((l) => (
            <div className="cost-row" key={l.id}>
              <input className="lbl" value={l.label} onChange={(e) => setLine(l.id, { label: e.target.value })} />
              <input
                className="amt"
                type="number"
                value={l.amount || ''}
                onChange={(e) => setLine(l.id, { amount: Number(e.target.value) || 0 })}
              />
              <button
                className={`basis-chip ${l.basis}`}
                title="Cycle estimated → quoted → actual"
                onClick={() => setLine(l.id, { basis: BASIS_NEXT[l.basis] })}
              >
                {l.basis}
              </button>
              <button className="rm" title="Remove line" onClick={() => removeLine(l.id)}>×</button>
            </div>
          ))}
          <button className="btn ghost tiny" onClick={addLine}>+ add cost line</button>
          <div className="cost-total">
            <span className="muted">Total</span>
            <b>{total > 0 ? inr(total) : '—'}</b>
          </div>

          {d.alternatives.length > 0 && (
            <>
              <div className="cost-label">Alternatives</div>
              <div className="alts">
                {d.alternatives.map((a, i) => (
                  <div className="alt" key={i}>
                    <div>
                      <div className="a-rec">{a.recommendation}</div>
                      <div className="a-why">{a.reasoning}</div>
                    </div>
                    <div className="row">
                      {a.estimatedCost != null && <span className="muted" style={{ fontSize: '0.82rem' }}>{inr(a.estimatedCost)}</span>}
                      <button className="btn tiny" onClick={() => promote(a)}>Promote</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="card-actions">
            <button className="btn tiny" onClick={startOverride}>Override</button>
            {d.stale && (
              <button className="btn tiny" onClick={() => onRefresh?.()}>↺ Refresh</button>
            )}
            <button className="btn tiny" onClick={() => onDiscuss?.()}>Discuss →</button>
          </div>
        </div>
      )}
    </div>
  );
}
