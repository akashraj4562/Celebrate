import { useState } from 'react';
import type { PlanState } from '../../types';
import { computeTimeline } from '../../engine/timeline';
import { BudgetDashboard } from './BudgetDashboard';
import { PrepTimeline } from './PrepTimeline';

/** The sticky right rail — Budget | Timeline (Chat tab lands in Step 12). */
export function PlanRail({ plan }: { plan: PlanState }) {
  const [tab, setTab] = useState<'budget' | 'timeline'>('budget');
  return (
    <div className="rail">
      <div className="rail-tabs">
        <button className={tab === 'budget' ? 'on' : ''} onClick={() => setTab('budget')}>
          Budget
        </button>
        <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>
          Timeline
        </button>
      </div>
      {tab === 'budget' ? (
        <BudgetDashboard budget={plan.budget} />
      ) : (
        <PrepTimeline timeline={computeTimeline(plan)} />
      )}
    </div>
  );
}
