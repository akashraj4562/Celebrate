import { useEffect, useRef, useState } from 'react';
import type { Deliverable } from '../../types';
import type { ChatProposal } from '../../api';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export interface ChatPanelProps {
  deliverable: Deliverable | null;
  proposal?: ChatProposal;
  busy: boolean;
  onSend: (message: string) => void;
  onApply: (lock: boolean) => void;
  onDismiss: () => void;
}

/**
 * Per-card chat (spec §9). Lives in the right rail so the board never reflows.
 * Three things the agent does — justify, ingest pasted quotes (cost × convenience),
 * propose a revision — surface here; a proposal carries an Apply that runs it back
 * through the engine (activation + cascade), never a silent edit.
 */
export function ChatPanel({ deliverable, proposal, busy, onSend, onApply, onDismiss }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [deliverable?.chat.length, busy, proposal]);

  if (!deliverable) {
    return (
      <div className="rail-pane chat-pane">
        <div className="br-label">Discuss</div>
        <p className="chat-hint">
          Open a card and hit <b>Discuss</b> to talk it through — push back on the pick, ask “why this”, or paste
          vendor quotes in any format to compare them on cost <i>and</i> convenience.
        </p>
      </div>
    );
  }

  const send = () => {
    const m = draft.trim();
    if (!m || busy) return;
    onSend(m);
    setDraft('');
  };

  const quotes = proposal?.ingestedQuotes ? [...proposal.ingestedQuotes].sort((a, b) => b.convenienceScore - a.convenienceScore) : [];

  return (
    <div className="rail-pane chat-pane">
      <div className="br-label chat-title">
        Discuss · <span>{deliverable.title}</span>
      </div>

      <div className="chat-thread" ref={threadRef}>
        {deliverable.chat.length === 0 && !busy && (
          <div className="chat-empty">
            Ask a question, push back on the recommendation, or paste vendor quotes to have them compared and scored.
          </div>
        )}
        {deliverable.chat.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="msg assistant pending">
            <span className="dots"><span /><span /><span /></span>
          </div>
        )}
      </div>

      {proposal && (
        <div className="proposal">
          <div className="proposal-head">Proposed change</div>
          {proposal.recommendation && <div className="proposal-rec">{proposal.recommendation}</div>}

          {quotes.length > 0 && (
            <table className="quote-table">
              <thead>
                <tr>
                  <th>Option</th>
                  <th className="num">Cost</th>
                  <th className="num">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q, i) => (
                  <tr key={i} className={i === 0 ? 'pick' : ''}>
                    <td>
                      {q.source}
                      {q.inclusions.length > 0 && <div className="q-incl">{q.inclusions.join(' · ')}</div>}
                    </td>
                    <td className="num">{inr(q.cost)}</td>
                    <td className="num">
                      <span className="conv-pill">{q.convenienceScore}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {proposal.reasoning.length > 0 && (
            <ul className="proposal-why">
              {proposal.reasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}

          {proposal.costLines.length > 0 && (
            <div className="proposal-cost">
              {proposal.costLines.map((l) => (
                <span key={l.id} className="cost-chip">
                  {l.label}: <b>{inr(l.amount)}</b> <span className={`basis ${l.basis}`}>{l.basis}</span>
                </span>
              ))}
            </div>
          )}

          {proposal.tags.length > 0 && (
            <div className="proposal-tags">
              {proposal.tags.map((t) => (
                <span key={t} className="tag-chip">
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="proposal-actions">
            <button className="btn tiny primary" disabled={busy} onClick={() => onApply(false)}>
              Apply
            </button>
            <button className="btn tiny" disabled={busy} onClick={() => onApply(true)}>
              Apply &amp; lock
            </button>
            <button className="btn ghost tiny" disabled={busy} onClick={onDismiss}>
              Dismiss
            </button>
          </div>
          <div className="proposal-foot">Applying re-flows the plan — downstream cards restale, new modules can spawn.</div>
        </div>
      )}

      <div className="chat-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask, push back, or paste vendor quotes…  (⌘↵ to send)"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn primary send" disabled={busy || !draft.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
