import type { AgentFigure } from '../../data/derive';
import { fmtTime } from '../../data/format';
import { useStore } from '../../state/store';

/**
 * "Running - Reading Infosys's Q1 FY27 results filing". One line, no pill.
 * A stopped agent leads with why, then who stopped it and when, so the first
 * words carry the reason even where the line runs out of room.
 */
/** The status word, split out so it can be read on its own. */
function statusTail(a: AgentFigure): string {
  if (a.status === 'Running') return a.liveLine;
  return [a.why ?? a.liveLine, a.changedBy ? `by ${a.changedBy}` : '', a.changedAtMs ? fmtTime(a.changedAtMs) : '']
    .filter(Boolean)
    .join(' · ');
}

function statusLine(a: AgentFigure): string {
  if (a.status === 'Running') return `${a.status} - ${a.liveLine}`;
  const tail = [a.why ?? a.liveLine, a.changedBy ? `by ${a.changedBy}` : '', a.changedAtMs ? fmtTime(a.changedAtMs) : '']
    .filter(Boolean)
    .join(' · ');
  return `${a.status} - ${tail}`;
}

/** The whole story, for the tooltip. */
function fullStory(a: AgentFigure): string {
  return [statusLine(a), a.status === 'Running' ? '' : a.liveLine, a.job].filter(Boolean).join(' · ');
}

export function AgentRow() {
  const { vm, selection, select } = useStore();
  return (
    <div className="agent-row">
      {vm.agentRow.map((a) => {
        const selected = selection?.kind === 'agent' && selection.id === a.id;
        const line = statusLine(a);
        return (
          <button
            key={a.id}
            className={`agent-card is-${a.status.toLowerCase().replace(/s+/g, '-')}${selected ? ' selected' : ''}`}
            onClick={() => select(selected ? null : { kind: 'agent', id: a.id })}
            title={fullStory(a)}
          >
            {/* Name and what it is doing now. The counters that used to sit
                between them are evidence of work, and evidence belongs in the
                panel this card opens, not in the glance that decides whether
                to open it. */}
            <span className="name">{a.name}</span>
            <span className="live" title={line}>
              <span className="st">{a.status}</span> - {statusTail(a)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
