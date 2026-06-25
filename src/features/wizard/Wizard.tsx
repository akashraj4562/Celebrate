import { useState } from 'react';
import type {
  ArchivedEvent,
  AttendeeCohort,
  AttendeeException,
  EventInput,
  Honoree,
  LoveLanguage,
  MemoryValue,
  Mobility,
} from '../../types';
import { uid } from '../../lib/plan';
import { useStore } from '../../store';
import './wizard.css';

const EVENT_TYPES = [
  'birthday',
  'anniversary',
  'wedding',
  'engagement',
  'baby shower',
  'housewarming',
  'retirement',
  'graduation',
  'festival',
  'other',
];

const LOVE_LANGUAGES: { id: LoveLanguage; label: string }[] = [
  { id: 'gifts', label: 'Gifts' },
  { id: 'experiences', label: 'Experiences' },
  { id: 'words', label: 'Words' },
  { id: 'time', label: 'Quality time' },
  { id: 'acts', label: 'Acts of service' },
];

// Working draft — interests/wishes stay as raw text while editing, split on submit.
interface HonoreeDraft {
  id: string;
  name: string;
  relation: string;
  age?: string;
  personality?: string;
  loveLanguage?: LoveLanguage;
  interestsText?: string;
  recentInteractions?: string;
  wishesText?: string;
  styleNotes?: string;
  size?: string;
  mobility?: Mobility;
}

const newDraft = (): HonoreeDraft => ({ id: uid('h'), name: '', relation: '' });
const newCohort = (label: string, isKids = false): AttendeeCohort => ({
  id: uid('c'),
  label,
  count: 0,
  portionFactor: isKids ? 0.5 : 1,
  isKids,
});

const splitList = (s?: string): string[] | undefined => {
  if (!s) return undefined;
  const items = s.split(',').map((x) => x.trim()).filter(Boolean);
  return items.length ? items : undefined;
};

function toHonoree(d: HonoreeDraft): Honoree {
  const age = d.age ? Number(d.age) : undefined;
  return {
    id: d.id,
    name: d.name.trim(),
    relation: d.relation.trim(),
    age: Number.isFinite(age) ? age : undefined,
    personality: d.personality?.trim() || undefined,
    loveLanguage: d.loveLanguage,
    interests: splitList(d.interestsText),
    recentInteractions: d.recentInteractions?.trim() || undefined,
    expressedWishes: splitList(d.wishesText),
    styleNotes: d.styleNotes?.trim() || undefined,
    size: d.size?.trim() || undefined,
    mobility: d.mobility,
  };
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div
      className={`switch ${on ? 'on' : ''}`}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!on);
        }
      }}
    >
      <span className="track" />
      <span>{label}</span>
    </div>
  );
}

export function Wizard() {
  const createPlan = useStore((s) => s.createPlan);
  const archivedEvents = useStore((s) => s.archivedEvents);
  const removeArchivedEvent = useStore((s) => s.removeArchivedEvent);

  const [eventType, setEventType] = useState('');
  const [eventTypeOther, setEventTypeOther] = useState('');
  const [date, setDate] = useState('');
  const [budget, setBudget] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [honorees, setHonorees] = useState<HonoreeDraft[]>([newDraft()]);
  const [openDetail, setOpenDetail] = useState<Record<string, boolean>>({});
  const [cohorts, setCohorts] = useState<AttendeeCohort[]>([newCohort('Adults')]);
  const [exceptions, setExceptions] = useState<AttendeeException[]>([]);
  const [exceptionDraft, setExceptionDraft] = useState('');
  const [alcohol, setAlcohol] = useState(false);
  const [memoryValue, setMemoryValue] = useState<MemoryValue>('standard');
  const [milestone, setMilestone] = useState('');
  const [notes, setNotes] = useState('');
  const [innerIds, setInnerIds] = useState<string[]>([]);

  const resolvedType = (eventType === 'other' ? eventTypeOther : eventType).trim();
  const isAnniv = /anniversar/i.test(resolvedType);
  const showMilestone = Boolean(resolvedType) && !/birthday|bday/i.test(resolvedType);
  const budgetNum = Number(budget) || 0;
  const namedHonorees = honorees.filter((h) => h.name.trim());
  const headcount = cohorts.reduce((n, c) => n + (Number(c.count) || 0), 0);
  const valid = Boolean(resolvedType) && Boolean(date) && budgetNum > 0 && Boolean(city.trim()) && namedHonorees.length > 0 && headcount > 0;

  const missing: string[] = [];
  if (!resolvedType) missing.push('event type');
  if (namedHonorees.length === 0) missing.push('who it’s for');
  if (!date) missing.push('date');
  if (budgetNum <= 0) missing.push('budget');
  if (!city.trim()) missing.push('city');
  if (headcount <= 0) missing.push('guest count');

  const patchHonoree = (id: string, patch: Partial<HonoreeDraft>) =>
    setHonorees((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const patchCohort = (id: string, patch: Partial<AttendeeCohort>) =>
    setCohorts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  function addException() {
    const note = exceptionDraft.trim();
    if (!note) return;
    setExceptions((xs) => [...xs, { id: uid('x'), note }]);
    setExceptionDraft('');
  }

  function submit() {
    if (!valid) return;
    const finalHonorees = namedHonorees.map(toHonoree);
    const innerCircle = finalHonorees.filter((h) => innerIds.includes(h.id));
    const input: EventInput = {
      eventType: resolvedType,
      honorees: finalHonorees,
      date,
      budgetTotal: budgetNum,
      location: { city: city.trim(), area: area.trim() || undefined },
      cohorts: cohorts.filter((c) => (Number(c.count) || 0) > 0),
      exceptions,
      alcohol,
      memoryValue,
      milestone: milestone ? Number(milestone) : undefined,
      innerCircle,
      notes: notes.trim() || undefined,
    };
    createPlan(`${finalHonorees[0].name}’s ${resolvedType}`, input);
  }

  // Seed the wizard from a past celebration (§12a): event type, honoree names and
  // a budget ≈ last spend. Date and city stay blank — an archive has no city, and
  // the date is always new.
  function prefillFrom(event: ArchivedEvent) {
    if (EVENT_TYPES.includes(event.eventType)) {
      setEventType(event.eventType);
      setEventTypeOther('');
    } else {
      setEventType('other');
      setEventTypeOther(event.eventType);
    }
    setHonorees(
      event.honorees.length
        ? event.honorees.map((name) => ({ ...newDraft(), name }))
        : [newDraft()],
    );
    setBudget(String(Math.round(event.totalSpend)));
    setDate('');
    setCity('');
    setArea('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="wizard">
      <div className="container">
        <div className="wizard-hero">
          <div className="kicker">Celebrate</div>
          <h1>Plan a celebration</h1>
          <p>
            Describe the event. I’ll build a living plan where every recommendation shows its
            reasoning, every cost is yours to override, and the whole plan re-flows when you change
            your mind. The more you tell me, the more specific — and delightful — it gets.
          </p>
        </div>

        {archivedEvents.length > 0 && (
          <section className="past-panel">
            <div className="past-head">
              <h2>Past celebrations</h2>
              <span className="muted">Plan one like a previous event — its real vendors and spend carry forward.</span>
            </div>
            <div className="past-list">
              {archivedEvents.map((e) => (
                <div className="past-card" key={e.id}>
                  <div className="past-card-top">
                    <div>
                      <div className="past-title">
                        {e.eventType} <span className="muted">for {e.honorees.join(' & ')}</span>
                      </div>
                      <div className="past-meta">
                        {new Date(e.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        {' · '}₹{Math.round(e.totalSpend).toLocaleString('en-IN')} spent
                      </div>
                    </div>
                    <button className="btn ghost tiny" onClick={() => removeArchivedEvent(e.id)} aria-label="Remove">Remove</button>
                  </div>
                  {e.facts.length > 0 && (
                    <div className="past-facts">
                      {e.facts.slice(0, 4).map((f, i) => (
                        <span className="pill" key={i}>
                          {f.category}{f.actualCost ? ` · ₹${Math.round(f.actualCost).toLocaleString('en-IN')}` : ''}
                        </span>
                      ))}
                      {e.facts.length > 4 && <span className="pill">+{e.facts.length - 4} more</span>}
                    </div>
                  )}
                  {e.whatWorked && <div className="past-note">“{e.whatWorked}”</div>}
                  <button className="btn tiny primary" style={{ marginTop: 10 }} onClick={() => prefillFrom(e)}>
                    Plan one like this →
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="wizard-sections">
          {/* 1 · The basics */}
          <section className="panel">
            <div className="panel-head">
              <div className="row">
                <span className="panel-num">1</span>
                <h2>The basics</h2>
              </div>
            </div>
            <div className="stack">
              <div className="field">
                <label>What are we celebrating?</label>
                <div className="seg">
                  {EVENT_TYPES.map((t) => (
                    <button key={t} className={eventType === t ? 'on' : ''} onClick={() => setEventType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                {eventType === 'other' && (
                  <input
                    type="text"
                    placeholder="e.g. farewell dinner"
                    value={eventTypeOther}
                    onChange={(e) => setEventTypeOther(e.target.value)}
                  />
                )}
              </div>
              {showMilestone && (
                <div className="field">
                  <label>
                    {isAnniv ? 'Which anniversary? (years together)' : 'Milestone number'}{' '}
                    <span className="muted">{isAnniv ? '' : '(optional)'}</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder={isAnniv ? 'e.g. 25 (silver jubilee)' : 'e.g. 50'}
                    value={milestone}
                    onChange={(e) => setMilestone(e.target.value)}
                  />
                </div>
              )}
              <div className="grid-2">
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="field">
                  <label>Total budget (₹)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 80000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>City</label>
                  <input type="text" placeholder="e.g. Bengaluru" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="field">
                  <label>Area <span className="muted">(optional)</span></label>
                  <input type="text" placeholder="e.g. Indiranagar" value={area} onChange={(e) => setArea(e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          {/* 2 · Who it's for */}
          <section className="panel">
            <div className="panel-head">
              <div className="row">
                <span className="panel-num">2</span>
                <h2>Who it’s for</h2>
              </div>
              <div className="sub">The honoree(s). Adding a detail or two is what turns a generic plan into a personal one.</div>
            </div>
            <div className="stack">
              {honorees.map((h) => {
                const open = openDetail[h.id];
                return (
                  <div className="person" key={h.id}>
                    <div className="grid-3">
                      <div className="field">
                        <label>Name</label>
                        <input type="text" placeholder="e.g. Meera" value={h.name} onChange={(e) => patchHonoree(h.id, { name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Relation</label>
                        <input type="text" placeholder="e.g. mother" value={h.relation} onChange={(e) => patchHonoree(h.id, { relation: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Age</label>
                        <input type="number" min={0} placeholder="e.g. 60" value={h.age ?? ''} onChange={(e) => patchHonoree(h.id, { age: e.target.value })} />
                      </div>
                    </div>
                    <div className="row wrap" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                      <button className="btn ghost tiny" onClick={() => setOpenDetail((o) => ({ ...o, [h.id]: !open }))}>
                        {open ? '− Hide detail' : '+ Add personal detail'} <span className="muted">(sharpens gifts &amp; notes)</span>
                      </button>
                      {honorees.length > 1 && (
                        <button className="btn ghost tiny" onClick={() => setHonorees((hs) => hs.filter((x) => x.id !== h.id))}>
                          Remove
                        </button>
                      )}
                    </div>

                    {open && (
                      <div className="person-detail">
                        <div className="payoff">
                          Without love-language, a gift defaults to <b>“a premium perfume set.”</b> With it, the plan can reason its
                          way to <b>“a guided weekend cycling experience.”</b>
                        </div>
                        <div className="field">
                          <label>Mobility</label>
                          <div className="seg">
                            <button className={!h.mobility || h.mobility === 'full' ? 'on' : ''} onClick={() => patchHonoree(h.id, { mobility: 'full' })}>Full</button>
                            <button className={h.mobility === 'limited' ? 'on' : ''} onClick={() => patchHonoree(h.id, { mobility: 'limited' })}>Limited</button>
                          </div>
                        </div>
                        <div className="field">
                          <label>Love language <span className="muted">(how they feel cared for)</span></label>
                          <div className="seg">
                            {LOVE_LANGUAGES.map((l) => (
                              <button key={l.id} className={h.loveLanguage === l.id ? 'on' : ''} onClick={() => patchHonoree(h.id, { loveLanguage: h.loveLanguage === l.id ? undefined : l.id })}>
                                {l.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="field">
                          <label>Personality</label>
                          <input type="text" placeholder="e.g. understated, dislikes a fuss" value={h.personality ?? ''} onChange={(e) => patchHonoree(h.id, { personality: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Interests <span className="muted">(comma-separated)</span></label>
                          <input type="text" placeholder="e.g. cycling, filter coffee, ghazals" value={h.interestsText ?? ''} onChange={(e) => patchHonoree(h.id, { interestsText: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>What’s going on in their life right now</label>
                          <textarea placeholder="e.g. just took up cycling; recovering from a hectic work quarter" value={h.recentInteractions ?? ''} onChange={(e) => patchHonoree(h.id, { recentInteractions: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Things they’ve said they want <span className="muted">(comma-separated)</span></label>
                          <input type="text" placeholder="e.g. a good road bike, a quiet weekend away" value={h.wishesText ?? ''} onChange={(e) => patchHonoree(h.id, { wishesText: e.target.value })} />
                        </div>
                        <div className="grid-2">
                          <div className="field">
                            <label>Style notes <span className="muted">(for outfits)</span></label>
                            <input type="text" placeholder="e.g. prefers indo-western" value={h.styleNotes ?? ''} onChange={(e) => patchHonoree(h.id, { styleNotes: e.target.value })} />
                          </div>
                          <div className="field">
                            <label>Size <span className="muted">(for outfits)</span></label>
                            <input type="text" placeholder="e.g. M / 40" value={h.size ?? ''} onChange={(e) => patchHonoree(h.id, { size: e.target.value })} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div>
                <button className="btn tiny" onClick={() => setHonorees((hs) => [...hs, newDraft()])}>+ Add another honoree</button>
                <span className="muted" style={{ marginLeft: 10, fontSize: '0.85rem' }}>(anniversaries have two)</span>
              </div>
            </div>
          </section>

          {/* 3 · The guests */}
          <section className="panel">
            <div className="panel-head">
              <div className="row">
                <span className="panel-num">3</span>
                <h2>The guests</h2>
              </div>
              <div className="sub">Group them so the food math and menu can honour who’s actually coming.</div>
            </div>
            <div className="stack">
              {cohorts.map((c) => (
                <div key={c.id}>
                  <div className="cohort">
                    <div className="field">
                      <label>Group</label>
                      <input type="text" value={c.label} onChange={(e) => patchCohort(c.id, { label: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Count</label>
                      <input className="count" type="number" min={0} value={c.count || ''} onChange={(e) => patchCohort(c.id, { count: Number(e.target.value) || 0 })} />
                    </div>
                    {cohorts.length > 1 && (
                      <button className="btn ghost tiny" onClick={() => setCohorts((cs) => cs.filter((x) => x.id !== c.id))}>Remove</button>
                    )}
                  </div>
                  <div className="cohort-tags">
                    <button className={`btn tiny ${c.isKids ? 'primary' : ''}`} onClick={() => patchCohort(c.id, { isKids: !c.isKids, portionFactor: !c.isKids ? 0.5 : 1 })}>Kids portion</button>
                    <button className={`btn tiny ${c.isVeg === true ? 'primary' : ''}`} onClick={() => patchCohort(c.id, { isVeg: c.isVeg === true ? undefined : true })}>Veg</button>
                    <button className={`btn tiny ${c.isVeg === false ? 'primary' : ''}`} onClick={() => patchCohort(c.id, { isVeg: c.isVeg === false ? undefined : false })}>Non-veg</button>
                  </div>
                </div>
              ))}
              <div className="row wrap">
                <button className="btn tiny" onClick={() => setCohorts((cs) => [...cs, newCohort('Adults — veg')])}>+ Adults (veg)</button>
                <button className="btn tiny" onClick={() => setCohorts((cs) => [...cs, newCohort('Adults — non-veg')])}>+ Adults (non-veg)</button>
                <button className="btn tiny" onClick={() => setCohorts((cs) => [...cs, newCohort('Kids', true)])}>+ Kids</button>
              </div>

              <div className="field">
                <label>Dietary or care exceptions <span className="muted">(the engine will respect each one)</span></label>
                <div className="row">
                  <input
                    className="grow"
                    type="text"
                    placeholder="e.g. grandmother — diabetic"
                    value={exceptionDraft}
                    onChange={(e) => setExceptionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addException();
                      }
                    }}
                  />
                  <button className="btn" onClick={addException}>Add</button>
                </div>
                {exceptions.length > 0 && (
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    {exceptions.map((x) => (
                      <span className="chip" key={x.id}>
                        {x.note}
                        <button onClick={() => setExceptions((xs) => xs.filter((y) => y.id !== x.id))} aria-label="remove">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 4 · A few more signals */}
          <section className="panel">
            <div className="panel-head">
              <div className="row">
                <span className="panel-num">4</span>
                <h2>A few more signals</h2>
              </div>
            </div>
            <div className="stack">
              <div className="row wrap" style={{ gap: 24 }}>
                <Switch on={alcohol} onChange={setAlcohol} label="Serving alcohol" />
              </div>

              <div className="field">
                <label>How significant is this one?</label>
                <div className="seg">
                  <button className={memoryValue === 'standard' ? 'on' : ''} onClick={() => setMemoryValue('standard')}>Standard</button>
                  <button className={memoryValue === 'high' ? 'on' : ''} onClick={() => setMemoryValue('high')}>Once-in-a-lifetime</button>
                </div>
                {memoryValue === 'high' && (
                  <div className="payoff" style={{ marginTop: 8 }}>
                    Marked <b>once-in-a-lifetime</b> — the engine will invest in things that pay off for years: videography &amp; a
                    photo-book, a keepsake gift, a recorded message to open later.
                  </div>
                )}
              </div>

              {namedHonorees.length > 0 && (
                <div className="field">
                  <label>Who’s dressing for it? <span className="muted">(the inner circle — drives the outfits module)</span></label>
                  <div className="inner-grid">
                    {namedHonorees.map((h) => {
                      const on = innerIds.includes(h.id);
                      return (
                        <div
                          key={h.id}
                          className={`inner-opt ${on ? 'on' : ''}`}
                          onClick={() => setInnerIds((ids) => (on ? ids.filter((x) => x !== h.id) : [...ids, h.id]))}
                        >
                          {on ? '✓ ' : ''}
                          {h.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="field">
                <label>
                  Anything else worth knowing?{' '}
                  <span className="muted">(community, rituals, a theme they’d love — optional)</span>
                </label>
                <textarea
                  placeholder="e.g. Tamil Brahmin family; she’d love a carnatic-music theme; keep it traditional"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* sticky create bar */}
      <div className="create-bar">
        <div className="inner">
          <div className="summary">
            <span>
              <b>{headcount || 0}</b> guests
            </span>
            <span>
              <b>₹{budgetNum.toLocaleString('en-IN')}</b> budget
            </span>
            {resolvedType && (
              <span>
                <b>{resolvedType}</b>
              </span>
            )}
          </div>
          <div className="grow" />
          {!valid && <span className="missing">Still need: {missing.join(', ')}</span>}
          <button className="btn primary" disabled={!valid} onClick={submit}>
            Build the plan →
          </button>
        </div>
      </div>
    </div>
  );
}
