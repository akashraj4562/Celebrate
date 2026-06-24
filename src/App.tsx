import { useCurrentPlan } from './store';
import { Wizard } from './features/wizard/Wizard';
import { PlanView } from './features/plan/PlanView';
import { CardDemo } from './features/card/CardDemo';

export function App() {
  const plan = useCurrentPlan();

  // Dev harness for building components in isolation (e.g. ?demo=card).
  if (typeof window !== 'undefined' && window.location.search.includes('demo=card')) {
    return <CardDemo />;
  }

  return plan ? <PlanView /> : <Wizard />;
}
