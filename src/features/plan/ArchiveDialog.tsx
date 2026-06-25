// ── src/features/plan/ArchiveDialog.tsx ─────────────────────────────────────
// Past-event archive (spec §12a). When an event's date has passed, the user can
// snapshot its ACTUALS — real vendors + real per-category spend — into the
// separate `archivedEvents` collection, with an optional "what worked" note.
// The dialog previews exactly the derived facts before committing, so the user
// sees what will be remembered.

import { useState } from 'react';
import type { PlanState } from '../../types';
import { archiveFacts, totalSpend } from '../../engine/archive';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function ArchiveDialog({
  plan,
  onArchive,
  onClose,
}: {
  plan: PlanState;
  onArchive: (whatWorked?: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const facts = archiveFacts(plan);
  const total = totalSpend(plan);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Archive this celebration" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="kicker">Archive</div>
            <h2>Capture what worked</h2>
          </div>
          <button className="btn ghost tiny" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p className="modal-sub">
          This celebration has passed. We’ll save its real vendors and spend so the next plan can
          reference them — “use the same photographer”, “what did the cake cost?”.
        </p>

        <div className="arch-preview">
          <div className="arch-total">
            <span className="br-label">Total spend captured</span>
            <b>{inr(total)}</b>
          </div>
          {facts.length > 0 ? (
            <ul className="arch-facts">
              {facts.map((f, i) => (
                <li key={i}>
                  <span className="arch-cat">{f.category}</span>
                  <span className="arch-detail">{f.detail}</span>
                  {f.actualCost ? <span className="arch-cost">{inr(f.actualCost)}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="chat-empty" style={{ marginTop: 10 }}>
              No locked or quoted decisions yet — lock the cards you committed to, or paste real
              quotes, so there are actuals worth remembering.
            </div>
          )}
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>What worked / what you’d change <span className="muted">(optional)</span></label>
          <textarea
            placeholder="e.g. the terrace was perfect at sunset; book the caterer 3 weeks earlier next time"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onArchive(note.trim() || undefined)}>
            Archive this celebration
          </button>
        </div>
      </div>
    </div>
  );
}
