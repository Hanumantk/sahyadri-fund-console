import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { demoNow } from '../data/clock';
import { derive, initialRuntime, type Runtime, type TrimTo, type ViewModel } from '../data/derive';
import type { AgentId, StateName } from '../data/scenario';
import {
  applyAgentPause,
  applyAgentResume,
  applyBudget,
  applyDecision,
  applyExpiry,
  applyInstruction,
  applyCapOverride,
  applyChase,
  applyEscalate,
  applyLimitException,
  applyOverride,
  applyPauseAll,
  applyReinstate,
  applyReopen,
  applyRestoreSpeed,
  applyResumeAll,
  applyStopOrder,
  applyTrim,
  applyWithdrawEscalation,
  applyWithdrawOverride,
  type Choice,
} from './actions';

export type Selection =
  | { kind: 'decision'; id: string }
  | { kind: 'agent'; id: AgentId }
  // A blocked item, selected by its authoring key rather than its display id,
  // because display ids are renumbered per state and a selection must survive.
  | { kind: 'blocked'; id: string }
  | null;

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
  | { type: 'resumeAgent'; id: AgentId; reason?: string }
  | { type: 'budget'; id: AgentId; rupees: number }
  | { type: 'stopOrder'; orderId: string; reason: string }
  | { type: 'override'; eventKey: string; reason: string; cosigner: string | null }
  | { type: 'withdrawOverride'; exceptionId: string; reason: string }
  | { type: 'limitException'; limitKey: string; reason: string; cosigner: string | null }
  | { type: 'trim'; limitKey: string; reason: string; to: TrimTo }
  | { type: 'capOverride'; decisionId: string; reason: string; cosigner: string | null }
  | { type: 'reinstate'; dropKey: string; reason: string }
  | { type: 'reopen'; decisionId: string; reason: string }
  | { type: 'restoreSpeed'; id: AgentId }
  | { type: 'escalate'; subjectKey: string }
  | { type: 'chase'; escalationId: string }
  | { type: 'withdrawEscalation'; escalationId: string; reason: string }
  | { type: 'instruct'; itemId: string; text: string };

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
      return { ...s, rt: applyAgentResume(s.rt, a.id, a.reason) };
    case 'budget':
      return { ...s, rt: applyBudget(s.rt, a.id, a.rupees) };
    case 'stopOrder':
      return { ...s, rt: applyStopOrder(s.rt, a.orderId, a.reason) };
    case 'override':
      return { ...s, rt: applyOverride(s.rt, a.eventKey, a.reason, a.cosigner) };
    case 'withdrawOverride':
      return { ...s, rt: applyWithdrawOverride(s.rt, a.exceptionId, a.reason) };
    case 'limitException':
      return { ...s, rt: applyLimitException(s.rt, a.limitKey, a.reason, a.cosigner) };
    case 'trim':
      return { ...s, rt: applyTrim(s.rt, a.limitKey, a.reason, a.to) };
    case 'capOverride':
      return { ...s, rt: applyCapOverride(s.rt, a.decisionId, a.reason, a.cosigner) };
    case 'reinstate':
      return { ...s, rt: applyReinstate(s.rt, a.dropKey, a.reason) };
    case 'reopen':
      return { ...s, rt: applyReopen(s.rt, a.decisionId, a.reason) };
    case 'restoreSpeed':
      return { ...s, rt: applyRestoreSpeed(s.rt, a.id) };
    case 'escalate':
      return { ...s, rt: applyEscalate(s.rt, a.subjectKey) };
    case 'chase':
      return { ...s, rt: applyChase(s.rt, a.escalationId) };
    case 'withdrawEscalation':
      return { ...s, rt: applyWithdrawEscalation(s.rt, a.escalationId, a.reason) };
    case 'instruct':
      return { ...s, rt: applyInstruction(s.rt, a.itemId, a.text) };
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
  resumeAgent: (id: AgentId, reason?: string) => void;
  setBudget: (id: AgentId, rupees: number) => void;
  stopOrder: (orderId: string, reason: string) => void;
  override: (eventKey: string, reason: string, cosigner: string | null) => void;
  withdrawOverride: (exceptionId: string, reason: string) => void;
  limitException: (limitKey: string, reason: string, cosigner: string | null) => void;
  trim: (limitKey: string, reason: string, to?: TrimTo) => void;
  capOverride: (decisionId: string, reason: string, cosigner: string | null) => void;
  reinstate: (dropKey: string, reason: string) => void;
  reopen: (decisionId: string, reason: string) => void;
  restoreSpeed: (id: AgentId) => void;
  escalate: (subjectKey: string) => void;
  chase: (escalationId: string) => void;
  withdrawEscalation: (escalationId: string, reason: string) => void;
  instruct: (itemId: string, text: string) => void;
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
      resumeAgent: (id, reason) => dispatch({ type: 'resumeAgent', id, reason }),
      setBudget: (id, rupees) => dispatch({ type: 'budget', id, rupees }),
      stopOrder: (orderId, reason) => dispatch({ type: 'stopOrder', orderId, reason }),
      override: (eventKey, reason, cosigner) => dispatch({ type: 'override', eventKey, reason, cosigner }),
      withdrawOverride: (exceptionId, reason) => dispatch({ type: 'withdrawOverride', exceptionId, reason }),
      limitException: (limitKey, reason, cosigner) => dispatch({ type: 'limitException', limitKey, reason, cosigner }),
      trim: (limitKey, reason, to = 'limit') => dispatch({ type: 'trim', limitKey, reason, to }),
      capOverride: (decisionId, reason, cosigner) => dispatch({ type: 'capOverride', decisionId, reason, cosigner }),
      reinstate: (dropKey, reason) => dispatch({ type: 'reinstate', dropKey, reason }),
      reopen: (decisionId, reason) => dispatch({ type: 'reopen', decisionId, reason }),
      restoreSpeed: (id) => dispatch({ type: 'restoreSpeed', id }),
      escalate: (subjectKey) => dispatch({ type: 'escalate', subjectKey }),
      chase: (escalationId) => dispatch({ type: 'chase', escalationId }),
      withdrawEscalation: (escalationId, reason) => dispatch({ type: 'withdrawEscalation', escalationId, reason }),
      instruct: (itemId, text) => dispatch({ type: 'instruct', itemId, text }),
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
