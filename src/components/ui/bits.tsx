import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AgentStatus } from '../../data/scenario';
import type { IconName } from './Icon';

export type Tone = 'grey' | 'outline' | 'amber' | 'red' | 'blue' | 'green';

/** Plain text. The wireframe carries no pills, so tone and icon are ignored. */
export function Badge({ children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

export function Chip({ children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return <span className="chip">{children}</span>;
}

/** Status, as plain text. */
export function StatusBadge({ status }: { status: AgentStatus }) {
  return <span className="badge">{status}</span>;
}

/** One track, one fill. Level is the only thing a bar says here. */
export function LimitBar({ usedPct }: { usedPct: number; status?: 'ok' | 'near' | 'broken' }) {
  const width = Math.min(100, Math.max(0, usedPct));
  return (
    <div className="bar">
      <i style={{ width: width + '%' }} />
    </div>
  );
}

/** A record ID rendered as a link into the Audit trail, filtered to that record. */
export function RecordLink({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <Link to={`/audit?record=${encodeURIComponent(id)}`} className="record-link">
      {children ?? id}
    </Link>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function AuthorshipBadge({ authorship }: { authorship: 'Human-written' | 'AI-written' }) {
  return <Badge>{authorship}</Badge>;
}

/** Renders text where [[ID]] becomes a record link. */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[\[([^\]]+)\]\]$/);
        return m ? <RecordLink key={i} id={m[1]} /> : <span key={i}>{p}</span>;
      })}
    </>
  );
}
