import { useCallback, useEffect, useState } from 'react';
import { Layer1Strip } from '../components/home/Layer1Strip';
import { AgentRow } from '../components/home/AgentRow';
import { DecisionsColumn } from '../components/home/DecisionsColumn';
import { MonitorPanel } from '../components/panel/MonitorPanel';
import { useStore } from '../state/store';

export function Home() {
  const { vm, selection, select } = useStore();
  const [cursor, setCursor] = useState<number>(-1);

  // Keyboard: arrows move through the queue, Enter opens, Escape clears the selection.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      const n = vm.open.length;
      if (e.key === 'Escape') {
        select(null);
        setCursor(-1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!n) return;
        e.preventDefault();
        const base = cursor >= 0 ? cursor : selection?.kind === 'decision' ? vm.open.findIndex((i) => i.id === selection.id) : -1;
        const next = e.key === 'ArrowDown' ? Math.min(n - 1, base + 1) : Math.max(0, base < 0 ? 0 : base - 1);
        setCursor(next);
      } else if (e.key === 'Enter') {
        if (cursor >= 0 && cursor < n) select({ kind: 'decision', id: vm.open[cursor].id });
      }
    },
    [vm.open, cursor, selection, select],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  useEffect(() => {
    if (cursor >= vm.open.length) setCursor(vm.open.length - 1);
  }, [vm.open.length, cursor]);

  return (
    <div className="home">
      <Layer1Strip />
      <AgentRow />
      <div className="lower">
        <DecisionsColumn cursor={cursor} setCursor={setCursor} />
        <MonitorPanel />
      </div>
    </div>
  );
}
