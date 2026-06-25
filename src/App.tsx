import { useCurrentPlan } from './store';
import { Wizard } from './features/wizard/Wizard';
import { PlanView } from './features/plan/PlanView';
import { CardDemo } from './features/card/CardDemo';
import { NocturneFX } from './features/fx/NocturneFX';
import { BackgroundFX } from './features/fx/BackgroundFX';
import { LightningSpine } from './features/fx/LightningSpine';
import { ScrollFX } from './features/fx/ScrollFX';

export function App() {
  const plan = useCurrentPlan();

  // Dev harness for building components in isolation (e.g. ?demo=card).
  if (typeof window !== 'undefined' && window.location.search.includes('demo=card')) {
    return <CardDemo />;
  }

  return (
    <>
      <BackgroundFX />
      <LightningSpine />
      <NocturneFX />
      <ScrollFX />
      {plan ? <PlanView /> : <Wizard />}
    </>
  );
}
