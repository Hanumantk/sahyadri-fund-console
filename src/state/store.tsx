import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { demoNow } from '../data/clock';
import { derive, initialRuntime, type Runtime, type ViewModel } from '../data/derive';
import type { AgentId, StateName } from '../data/scenario';
import {
  applyAgentPause,
  applyAgentResume,
  applyBudget,
  applyDecision,
  applyExpiry,
  applyPauseAll,
  applyResumeAll,
  type Choice,
} from './actions';

export type Selection = { kind: 'decision'; id: string } | { kind: 'agent'; id: AgentId } | null;

interface State {
  rt: Runtime;
  selection: Selection;
}

type Action =
  | { type: 'tick'; nowMs: number }
  | { type: 'reset'; state: StateName; nowMs: number }
  | { type: 'select'; selection: Selection }
  | { type: 'decide'; id: string; choice: Choice; amount: number; reason: string }
  | { type: 'expire'; id: string }
  | { type: 'pauseAll'; reason: string }
  | { type: 'resumeAll' }
  | { type: 'pauseAgent'; id: AgentId; reason: string }
  | { type: 'resumeAgent'; id: AgentId }
  | { type: 'budget'; id: AgentId; rupees: number };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'tick':
      return { ...s, rt: { ...s.rt, nowMs: a.nowMs } };
    case 'reset':
      return { rt: initialRuntime(a.state, a.nowMs), selection: null };
    case 'select':
      return { ...s, selection: a.selection };
    case 'decide':
      return { ...s, rt: applyDecision(s.rt, a.id, a.choice, a.amount, a.reason) };
    case 'expire':
      return { ...s, rt: applyExpiry(s.rt, a.id) };
    case 'pauseAll':
      return { ...s, rt: applyPauseAll(s.rt, a.reason) };
    case 'resumeAll':
      return { ...s, rt: applyResumeAll(s.rt) };
    case 'pauseAgent':
      return { ...s, rt: applyAgentPause(s.rt, a.id, a.reason) };
    case 'resumeAgent':
      return { ...s, rt: applyAgentResume(s.rt, a.id) };
    case 'budget':
      return { ...s, rt: applyBudget(s.rt, a.id, a.rupees) };
  }
}

interface Store {
  vm: ViewModel;
  rt: Runtime;
  selection: Selection;
  select: (sel: Selection) => void;
  decide: (id: string, choice: Choice, amount: number, reason: string) => void;
  pauseAll: (reason: string) => void;
  resumeAll: () => void;
  pauseAgent: (id: AgentId, reason: string) => void;
  resumeAgent: (id: AgentId) => void;
  setBudget: (id: AgentId, rupees: number) => void;
  setState: (state: StateName) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, state }: { children: ReactNode; state: StateName }) {
  const [s, dispatch] = useReducer(reducer, state, (st) => ({ rt: initialRuntime(st, demoNow()), selection: null }));
  const lastState = useRef(state);

  useEffect(() => {
    if (lastState.current !== state) {
      lastState.current = state;
      dispatch({ type: 'reset', state, nowMs: demoNow() });
    }
  }, [state]);

  // Tick once a second so timers and relative times count live.
  useEffect(() => {
    const t = window.setInterval(() => dispatch({ type: 'tick', nowMs: demoNow() }), 1000);
    return () => window.clearInterval(t);
  }, []);

  const vm = useMemo(() => derive(s.rt), [s.rt]);

  // When a timer hits zero, record the expiry in the log.
  useEffect(() => {
    for (const item of vm.closed) {
      if (item.status === 'expired' && !s.rt.outcomes[item.id]) dispatch({ type: 'expire', id: item.id });
    }
  }, [vm.closed, s.rt.outcomes]);

  const select = useCallback((selection: Selection) => dispatch({ type: 'select', selection }), []);

  const store: Store = useMemo(
    () => ({
      vm,
      rt: s.rt,
      selection: s.selection,
      select,
      decide: (id, choice, amount, reason) => dispatch({ type: 'decide', id, choice, amount, reason }),
      pauseAll: (reason) => dispatch({ type: 'pauseAll', reason }),
      resumeAll: () => dispatch({ type: 'resumeAll' }),
      pauseAgent: (id, reason) => dispatch({ type: 'pauseAgent', id, reason }),
      resumeAgent: (id) => dispatch({ type: 'resumeAgent', id }),
      setBudget: (id, rupees) => dispatch({ type: 'budget', id, rupees }),
      setState: (next) => {
        const url = new URL(window.location.href);
        url.searchParams.set('state', next);
        window.history.replaceState(null, '', url.toString());
        dispatch({ type: 'reset', state: next, nowMs: demoNow() });
      },
    }),
    [vm, s.rt, s.selection, select],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}
