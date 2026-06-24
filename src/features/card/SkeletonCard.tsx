import './card.css';

/** Placeholder shown while a module is generating — fills in when its card resolves. */
export function SkeletonCard({ title, kicker }: { title: string; kicker: string }) {
  return (
    <div className="card skeleton">
      <div className="card-head" style={{ cursor: 'default' }}>
        <div style={{ minWidth: 0 }}>
          <div className="card-module">{kicker}</div>
          <div className="card-title">{title}</div>
          <div className="sk-line" style={{ width: '85%' }} />
          <div className="sk-line" style={{ width: '58%' }} />
        </div>
        <div className="head-right">
          <span className="sk-pulse">thinking…</span>
        </div>
      </div>
    </div>
  );
}
