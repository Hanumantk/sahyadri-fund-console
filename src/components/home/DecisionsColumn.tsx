import { useEffect, useRef } from 'react';
import type { Flag, QueueItem } from '../../data/derive';
import { fmtLeft, fmtTime } from '../../data/format';
import { useStore } from '../../state/store';
import { Icon, type IconName } from '../ui/Icon';

/**
 * How loudly a flag reads, and what glyph carries it. The kind is already in
 * the data, so this only chooses how to show it — never what it means.
 *
 * A disagreement is not a fault: the sources conflict and no agent will settle
 * it, which is the whole reason the item is here. It gets its own glyph and
 * stays in body colour rather than borrowing the language of a breach.
 */
const FLAG_LOOK: Record<Flag['kind'], { tone: '' | ' is-warn' | ' is-alert'; icon: IconName }> = {
  disagree: { tone: '', icon: 'split' },
  waiting: { tone: ' is-warn', icon: 'wait' },
  late: { tone: ' is-warn', icon: 'clock' },
  near: { tone: ' is-warn', icon: 'warning' },
  objection: { tone: ' is-alert', icon: 'alert' },
  broken: { tone: ' is-alert', icon: 'alert' },
};

function actionLabel(i: QueueItem): string {
  switch (i.kind) {
    case 'proposal':
      return 'Review proposal';
    case 'verdict':
      return 'Review both sides';
    case 'break':
      return 'Review mismatch';
    case 'feed':
      return 'Review feed';
    case 'limit':
      return 'Review limit';
  }
}

export function Timer({ item }: { item: QueueItem }) {
  if (item.deadlineKind === 'none') return <span className="timer">no deadline</span>;
  if (item.deadlineKind === 'due') {
    return (
      <span className="timer" title="Must be settled before today's official value is struck">
        due {fmtTime(item.deadlineMs!)}
      </span>
    );
  }
  const left = item.msLeft ?? 0;
  // Time is the one thing on this card that runs out while you look at it.
  const tone = left <= 0 ? ' is-alert' : item.urgent ? ' is-urgent' : '';
  return (
    <span className={`timer${tone}`} title={`Expires ${fmtTime(item.deadlineMs!)}, then nothing is bought`}>
      {fmtLeft(left)}
    </span>
  );
}

export function DecisionsColumn({ cursor, setCursor }: { cursor: number; setCursor: (n: number) => void }) {
  const { vm, selection, select } = useStore();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cursor < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const closedAll = [
    ...vm.closed.map((c) => ({ id: c.id, label: c.closedLabel ?? '', title: c.title, atMs: c.outcome?.at ?? 0, kind: 'decision' as const })),
    // A blocked item is no longer a dead row. It carries its authoring key so the
    // panel can be opened on it, because "blocked" is the one closed outcome a
    // person can still do something about.
    ...vm.blocked.map((b) => ({ id: b.key, label: b.label, title: `${b.company} · ${b.text}`, atMs: b.atMs, kind: 'blocked' as const })),
    ...vm.settledByYou.map((x) => ({ id: x.id, label: x.label, title: x.title, atMs: x.atMs, kind: 'settled' as const, selection: x.selection })),
  ].sort((a, b) => b.atMs - a.atMs);

  const openMeta = vm.open.length
    ? vm.needsYou.firstExpiresMs !== null
      ? `${vm.open.length} open · first expires ${fmtTime(vm.needsYou.firstExpiresMs)}`
      : `${vm.open.length} open`
    : 'Nothing open';

  return (
    <div className="queue">
      <div className="queue-head">
        <h2>Decisions</h2>
        <span className="meta">{openMeta}</span>
      </div>
      <div className="queue-list" ref={listRef} tabIndex={0} aria-label="Decision queue">
        {vm.open.length === 0 && (
          <div className="card">
            Nothing needs a decision. Routine trades inside the agents' autonomy go through on their own and appear in the Audit trail.
          </div>
        )}
        {vm.open.map((item, idx) => {
          const selected = selection?.kind === 'decision' && selection.id === item.id;
          const focused = cursor === idx;
          return (
            <button
              key={item.id}
              data-index={idx}
              className={`dcard${selected ? ' selected' : ''}`}
              style={focused && !selected ? { outline: '1px dashed var(--ink)', outlineOffset: 2 } : undefined}
              onClick={() => {
                setCursor(idx);
                select({ kind: 'decision', id: item.id });
              }}
            >
              <span className="ask">{item.ask}</span>
              {item.flags.length > 0 && (
                <span className="flags">
                  {item.flags.map((f, i) => {
                    const look = FLAG_LOOK[f.kind];
                    return (
                      <span className={`warn-chip${look.tone}`} key={i}>
                        <Icon name={look.icon} />
                        {f.text}
                      </span>
                    );
                  })}
                </span>
              )}
              <span className="actions">
                <span className="chip-btn">{actionLabel(item)}</span>
                <Timer item={item} />
              </span>
            </button>
          );
        })}

        {/* Requests the rules would not let you grant, sent to the person who may.
            They sit between what needs you and what is settled, because they are
            neither: you have acted, and the answer has not come back. */}
        {vm.escalations.length > 0 && (
          <>
            <div className="closed-head">
              <span>Waiting on others</span>
              <span>{vm.escalations.length}</span>
            </div>
            {vm.escalations.map((x) => {
              const selected = x.selection !== null && selection?.kind === x.selection.kind && selection.id === x.selection.id;
              return (
                <button key={x.id} className={`closed-item${selected ? ' selected' : ''}`} onClick={() => x.selection && select(x.selection)}>
                  <span className="t is-warn">
                    <strong>Waiting on {x.toName}</strong>
                    <br />
                    {x.company} · {x.ask} · {x.waitingLine}
                  </span>
                  <span className="when">{fmtTime(x.sentAtMs)}</span>
                </button>
              );
            })}
          </>
        )}

        <div className="closed-head">
          <span>Closed today</span>
          <span>{closedAll.length ? `${closedAll.length}` : 'none yet'}</span>
        </div>
        {closedAll.map((c) => {
          const selected = 'selection' in c ? false : selection?.kind === c.kind && selection.id === c.id;
          return (
            <button
              key={c.id}
              className={`closed-item${selected ? ' selected' : ''}`}
              onClick={() => select('selection' in c ? c.selection : { kind: c.kind, id: c.id })}
            >
              <span className={`t${/^Expired|^Let lapse/.test(c.label) ? ' is-warn' : /^Overridden|^Overrode|^On exception/.test(c.label) ? ' is-alert' : ''}`}>
                <strong>{c.label}</strong>
                <br />
                {c.title}
              </span>
              <span className="when">{fmtTime(c.atMs)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
