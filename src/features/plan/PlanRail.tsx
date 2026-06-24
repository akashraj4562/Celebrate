import type { PlanState } from '../../types';
import { computeTimeline } from '../../engine/timeline';
import { BudgetDashboard } from './BudgetDashboard';
import { PrepTimeline } from './PrepTimeline';
import { ChatPanel, type ChatPanelProps } from './ChatPanel';

export type RailTab = 'budget' | 'timeline' | 'chat';

/** The sticky right rail — Budget | Timeline | Chat. Tab state is lifted to
 *  PlanView so hitting "Discuss" on a card can jump straight to the Chat tab. */
export function PlanRail({
  plan,
  tab,
  setTab,
  chat,
}: {
  plan: PlanState;
  tab: RailTab;
  setTab: (t: RailTab) => void;
  chat: ChatPanelProps;
}) {
  const hasProposal = Boolean(chat.proposal);
  return (
    <div className="rail">
      <div className="rail-tabs">
        <button className={tab === 'budget' ? 'on' : ''} onClick={() => setTab('budget')}>
          Budget
        </button>
        <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>
          Timeline
        </button>
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
          Chat{hasProposal && tab !== 'chat' ? <span className="tab-dot" /> : null}
        </button>
      </div>
      {tab === 'budget' && <BudgetDashboard budget={plan.budget} />}
      {tab === 'timeline' && <PrepTimeline timeline={computeTimeline(plan)} />}
      {tab === 'chat' && <ChatPanel {...chat} />}
    </div>
  );
}
