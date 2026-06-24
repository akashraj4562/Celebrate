import { useState } from 'react';
import type { Deliverable, ModuleId } from '../../types';
import { PRIMARY_MOMENT_ID, instanceIdOf } from '../../types';
import { uid } from '../../lib/plan';
import { DeliverableCard } from './DeliverableCard';

function mk(
  p: Partial<Deliverable> & { moduleId: ModuleId; title: string; recommendation: string },
): Deliverable {
  const momentId = p.momentId ?? PRIMARY_MOMENT_ID;
  return {
    instanceId: instanceIdOf(p.moduleId, momentId),
    moduleId: p.moduleId,
    momentId,
    title: p.title,
    recommendation: p.recommendation,
    reasoning: p.reasoning ?? [],
    alternatives: p.alternatives ?? [],
    costLines: p.costLines ?? [],
    leadTimeDays: p.leadTimeDays ?? 14,
    status: p.status ?? 'suggested',
    feasibility: p.feasibility ?? 'ok',
    confidence: p.confidence ?? 'high',
    stale: p.stale ?? false,
    active: true,
    locked: p.locked ?? false,
    chat: [],
  };
}

const SAMPLES: Deliverable[] = [
  mk({
    moduleId: 'timing',
    title: 'Timing & Setting',
    recommendation: 'Outdoor lunch, 12:30–4 PM',
    reasoning: [
      'Mid-Feb Bengaluru afternoons sit ~26–28°C and dry; evenings drop to ~16°C — a daytime slot is lower-friction than a cold night event.',
      'With your mother’s limited mobility, a seated daytime lunch beats a late-night stand-around.',
      'Lunch lets older relatives travel home before dark — fewer logistics, higher turnout.',
    ],
    alternatives: [
      {
        recommendation: 'Evening dinner, 7 PM onward',
        reasoning: 'More festive once lights are on, but colder and harder for elderly guests to stay late.',
      },
    ],
    leadTimeDays: 10,
  }),
  mk({
    moduleId: 'venue',
    title: 'Venue',
    recommendation: 'Tamarind Tree — an open-garden restaurant in JP Nagar',
    reasoning: [
      'Open-garden fits the daytime-lunch + outdoor call while keeping a covered section as weather backup.',
      '₹/head ~₹1,200 lands inside a 60-pax budget without feeling cheap.',
      'Step-free access and on-site parking suit the elderly guests.',
    ],
    alternatives: [
      {
        recommendation: 'A banquet hall in Jayanagar',
        reasoning: 'Cheaper and fully weather-proof, but generic and indoors — loses the garden feel.',
        estimatedCost: 60000,
      },
    ],
    costLines: [{ id: uid('cl'), label: 'Venue hire', amount: 48000, basis: 'estimated' }],
    leadTimeDays: 25,
    stale: true,
  }),
  mk({
    moduleId: 'gifts',
    title: 'Gift — Mom',
    recommendation: 'A premium perfume set',
    reasoning: [
      'A safe, well-received gift for a parent.',
      'Sits comfortably inside the gifts allocation.',
    ],
    costLines: [{ id: uid('cl'), label: 'Gift', amount: 6000, basis: 'estimated' }],
    confidence: 'low',
  }),
  mk({
    moduleId: 'activities',
    title: 'Activities',
    recommendation: 'A 2-night weekend in Coorg',
    reasoning: [
      'A change of scene for a milestone year.',
      'Stretches spend toward travel + stay rather than the party itself.',
    ],
    costLines: [{ id: uid('cl'), label: 'Stay + travel (est)', amount: 35000, basis: 'estimated' }],
    leadTimeDays: 75,
    feasibility: 'infeasible',
  }),
  mk({
    moduleId: 'photography',
    title: 'Photo / Video',
    recommendation: 'Full-day photo + videography, with a printed photo-book',
    reasoning: [
      'Once-in-a-lifetime → the marginal ₹15–20k for video buys decades of replay value; the one thing you can’t redo later.',
      'A printed photo-book is the keepsake that outlives the cloud folder.',
    ],
    costLines: [{ id: uid('cl'), label: 'Lensanche Studios — photo + video', amount: 38000, basis: 'quoted' }],
    status: 'overridden',
    locked: true,
    leadTimeDays: 24,
  }),
];

export function CardDemo() {
  const [cards, setCards] = useState<Record<string, Deliverable>>(
    Object.fromEntries(SAMPLES.map((d) => [d.instanceId, d])),
  );

  const patch = (id: string, p: Partial<Deliverable>) =>
    setCards((c) => ({ ...c, [id]: { ...c[id], ...p } }));

  return (
    <div style={{ padding: '48px 0 96px' }}>
      <div className="container">
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 650,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              marginBottom: 10,
            }}
          >
            Component demo · DeliverableCard
          </div>
          <h1>The atomic unit</h1>
          <p className="muted" style={{ maxWidth: '64ch' }}>
            One reusable card renders every module. Click a card to expand it: edit the recommendation (Override), edit
            cost lines and cycle their basis estimated → quoted → actual, promote an alternative, lock it, or refresh
            when stale. Each card shows a single priority state-badge.
          </p>
        </div>

        <div className="board">
          {Object.values(cards).map((d) => (
            <DeliverableCard
              key={d.instanceId}
              deliverable={d}
              onPatch={(p) => patch(d.instanceId, p)}
              onRefresh={() => patch(d.instanceId, { stale: false })}
              onDiscuss={() => alert('Per-card chat lands in Step 12.')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
