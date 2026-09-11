import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  cloneRulebook,
  formatRuleValue,
  type ActiveException,
  type AgentAutonomy,
  type AutonomyColumn,
  type EscalationRoute,
  type RiskStance,
  type RuleValue,
  type Rulebook,
  RULEBOOK_TODAY,
  RULEBOOK_SETUP_STORAGE_KEY,
} from '../data/rulebook';

interface RulebookStore {
  rulebook: Rulebook;
  mandateAcknowledged: boolean;
  reviewedAgents: string[];
  launched: boolean;
  setMandateAcknowledged: (value: boolean) => void;
  setAgentReviewed: (agent: string, value: boolean) => void;
  updateFund: (field: keyof Rulebook['fund'], value: string | number) => void;
  updateMandate: (id: string, text: string) => void;
  setRiskStance: (stance: RiskStance) => void;
  updateDraftLimit: (id: string, value: RuleValue) => void;
  saveLimit: (id: string, value: RuleValue, actor: string, reason: string) => void;
  moveAutonomy: (agent: string, action: string, from: AutonomyColumn, to: AutonomyColumn, who?: string, reason?: string, actor?: string) => void;
  setAgentThreshold: (agent: string, value: number | null, reason?: string, actor?: string) => void;
  updateEscalation: (id: string, patch: Partial<EscalationRoute>, reason?: string, actor?: string) => void;
  updateProhibited: (id: string, entries: string[], reason: string, actor: string) => void;
  updateException: (id: string, patch: Partial<ActiveException>, reason: string, actor: string) => void;
  endException: (id: string, reason: string, actor: string) => void;
  launch: () => void;
}

const RulebookContext = createContext<RulebookStore | null>(null);

export function RulebookProvider({ children }: { children: ReactNode }) {
  const [rulebook, setRulebook] = useState<Rulebook>(cloneRulebook);
  const [mandateAcknowledged, setMandateAcknowledged] = useState(false);
  const [reviewedAgents, setReviewedAgents] = useState<string[]>([]);
  const [launched, setLaunched] = useState(readSetupCompletion);

  const store = useMemo<RulebookStore>(() => ({
    rulebook,
    mandateAcknowledged,
    reviewedAgents,
    launched,
    setMandateAcknowledged,
    setAgentReviewed: (agent, value) => setReviewedAgents((current) => value ? [...new Set([...current, agent])] : current.filter((item) => item !== agent)),
    updateFund: (field, value) => setRulebook((current) => ({ ...current, fund: { ...current.fund, [field]: value } })),
    updateMandate: (id, text) => setRulebook((current) => launched ? current : ({ ...current, mandate: current.mandate.map((rule) => rule.id === id ? { ...rule, text } : rule) })),
    setRiskStance: (stance) => setRulebook((current) => ({
      ...current,
      riskStance: stance,
      limits: current.limits.map((limit) => limit.source === 'mandate' ? limit : { ...limit, setTo: limit.defaults[stance] }),
    })),
    updateDraftLimit: (id, value) => setRulebook((current) => ({ ...current, limits: current.limits.map((limit) => limit.id === id && limit.source !== 'mandate' ? { ...limit, setTo: value } : limit) })),
    saveLimit: (id, value, actor, reason) => setRulebook((current) => {
      const limit = current.limits.find((item) => item.id === id);
      if (!limit || limit.source === 'mandate') return current;
      return {
        ...current,
        version: current.version + 1,
        limits: current.limits.map((item) => item.id === id ? { ...item, setTo: value, changedBy: actor, changedOn: RULEBOOK_TODAY } : item),
        history: [{ id: `CHG-${current.version + 1}`, date: RULEBOOK_TODAY, actor, rule: limit.label, from: formatRuleValue(limit.setTo, limit.unit), to: formatRuleValue(value, limit.unit), reason, limitId: id }, ...current.history],
      };
    }),
    moveAutonomy: (agentName, action, from, to, who = 'Fund Manager', reason, actor) => setRulebook((current) => ({
      ...current,
      version: reason ? current.version + 1 : current.version,
      agents: current.agents.map((agent) => agent.agent === agentName ? moveAction(agent, action, from, to, who) : agent),
      history: reason ? [{ id: `CHG-${current.version + 1}`, date: RULEBOOK_TODAY, actor: actor ?? 'Fund Manager', rule: `${agentName} autonomy`, from, to, reason }, ...current.history] : current.history,
    })),
    setAgentThreshold: (agentName, value, reason, actor) => setRulebook((current) => {
      const agent = current.agents.find((item) => item.agent === agentName);
      if (!agent) return current;
      return {
        ...current,
        version: reason ? current.version + 1 : current.version,
        agents: current.agents.map((item) => item.agent === agentName ? { ...item, sizeThresholdPctOfFund: value } : item),
        history: reason ? [{
          id: `CHG-${current.version + 1}`,
          date: RULEBOOK_TODAY,
          actor: actor ?? 'Fund Manager',
          rule: `${agentName} size threshold`,
          from: agent.sizeThresholdPctOfFund === null ? 'Not set' : formatRuleValue(agent.sizeThresholdPctOfFund, 'percent'),
          to: value === null ? 'Not set' : formatRuleValue(value, 'percent'),
          reason,
        }, ...current.history] : current.history,
      };
    }),
    updateEscalation: (id, patch, reason, actor) => setRulebook((current) => ({
      ...current,
      version: reason ? current.version + 1 : current.version,
      escalation: current.escalation.map((route) => route.id === id ? { ...route, ...patch } : route),
      history: reason ? [{ id: `CHG-${current.version + 1}`, date: RULEBOOK_TODAY, actor: actor ?? 'Fund Manager', rule: 'escalation routing changed', reason }, ...current.history] : current.history,
    })),
    updateProhibited: (id, entries, reason, actor) => setRulebook((current) => ({
      ...current,
      version: current.version + 1,
      prohibited: current.prohibited.map((entry) => entry.id === id ? { ...entry, entries } : entry),
      history: [{ id: `CHG-${current.version + 1}`, date: RULEBOOK_TODAY, actor, rule: 'internal prohibited list changed', reason }, ...current.history],
    })),
    updateException: (id, patch, reason, actor) => setRulebook((current) => ({
      ...current,
      version: current.version + 1,
      exceptions: current.exceptions.map((exception) => exception.id === id ? { ...exception, ...patch } : exception),
      history: [{ id: `CHG-${current.version + 1}`, date: RULEBOOK_TODAY, actor, rule: 'active exception changed', reason }, ...current.history],
    })),
    endException: (id, reason, actor) => setRulebook((current) => ({
      ...current,
      version: current.version + 1,
      exceptions: current.exceptions.filter((exception) => exception.id !== id),
      history: [{ id: `CHG-${current.version + 1}`, date: RULEBOOK_TODAY, actor, rule: 'active exception ended', reason }, ...current.history],
    })),
    launch: () => {
      try {
        window.localStorage.setItem(RULEBOOK_SETUP_STORAGE_KEY, 'complete');
      } catch {
        // The in-memory launch still succeeds when browser storage is unavailable.
      }
      setLaunched(true);
    },
  }), [rulebook, mandateAcknowledged, reviewedAgents, launched]);

  return <RulebookContext.Provider value={store}>{children}</RulebookContext.Provider>;
}

function readSetupCompletion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RULEBOOK_SETUP_STORAGE_KEY) === 'complete';
  } catch {
    return false;
  }
}

export function useRulebook(): RulebookStore {
  const store = useContext(RulebookContext);
  if (!store) throw new Error('useRulebook outside RulebookProvider');
  return store;
}

function moveAction(agent: AgentAutonomy, action: string, from: AutonomyColumn, to: AutonomyColumn, who: string): AgentAutonomy {
  const next: AgentAutonomy = {
    ...agent,
    mayDoAlone: agent.mayDoAlone.filter((item) => !(from === 'alone' && item === action)),
    needsHuman: agent.needsHuman.filter((item) => !(from === 'human' && item.action === action)),
    never: agent.never.filter((item) => !(from === 'never' && item === action)),
  };
  if (to === 'alone') next.mayDoAlone = [...next.mayDoAlone, action];
  if (to === 'human') next.needsHuman = [...next.needsHuman, { action, who }];
  if (to === 'never') next.never = [...next.never, action];
  return next;
}
