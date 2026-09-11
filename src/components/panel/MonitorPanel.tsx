import { useEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import { StatusBadge } from '../ui/bits';
import { AgentView } from './AgentView';
import { AttentionView } from './AttentionView';
import { BreakView } from './BreakView';
import { Chat } from './Chat';
import { MonitorHome } from './MonitorHome';
import { ProposalView } from './ProposalView';
import { VerdictView } from './VerdictView';

export function MonitorPanel() {
  const { vm, selection, select } = useStore();
  const bodyRef = useRef<HTMLDivElement>(null);
  const selKey = selection ? `${selection.kind}:${selection.id}` : 'monitor';
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [selKey]);

  let title = 'Monitoring Agent';
  let body: JSX.Element;
  let badge: JSX.Element | null = <StatusBadge status={vm.agents.monitoring.status} />;

  if (!selection) {
    body = <MonitorHome />;
  } else if (selection.kind === 'agent') {
    const a = vm.agents[selection.id];
    title = a.name;
    badge = <StatusBadge status={a.status} />;
    body = <AgentView agent={a} />;
  } else {
    const item = [...vm.open, ...vm.closed].find((i) => i.id === selection.id);
    if (!item) {
      body = <MonitorHome />;
    } else {
      title = item.title;
      badge = null;
      if (item.kind === 'proposal') body = <ProposalView item={item} />;
      else if (item.kind === 'verdict') body = <VerdictView item={item} />;
      else if (item.kind === 'break') body = <BreakView item={item} />;
      else body = <AttentionView item={item} />;
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {badge && <span className="meta">{badge}</span>}
        <span className="spacer" />
        {selection && (
          <button className="btn small" onClick={() => select(null)} title="Escape also clears the selection">
            Back to Monitoring Agent
          </button>
        )}
      </div>
      <div className="panel-body" ref={bodyRef}>
        {body}
      </div>
      <Chat />
    </div>
  );
}
