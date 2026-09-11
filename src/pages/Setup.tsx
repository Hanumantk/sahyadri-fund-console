import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AutonomyGrid } from '../components/rules/AutonomyGrid';
import { EscalationTable } from '../components/rules/EscalationTable';
import {
  BASE_CURRENCIES,
  ESCALATION_NOTE,
  LAUNCH_NOTE,
  MANDATE_NOTICE,
  RISK_STANCE_COPY,
  SETUP_STEPS,
  THRESHOLD_AGENTS,
  formatRupeeEquivalent,
  formatRuleValue,
  reviewSentences,
  stanceDefault,
  valuesEqual,
  type AutonomyColumn,
  type Limit,
  type RuleValue,
} from '../data/rulebook';
import { CR } from '../data/scenario';
import { useRulebook } from '../state/rulebook';

export function Setup() {
  const navigate = useNavigate();
  const {
    rulebook,
    mandateAcknowledged,
    reviewedAgents,
    launched,
    setMandateAcknowledged,
    setAgentReviewed,
    updateFund,
    updateMandate,
    setRiskStance,
    updateDraftLimit,
    moveAutonomy,
    setAgentThreshold,
    updateEscalation,
    launch,
  } = useRulebook();
  const [step, setStep] = useState(0);

  const fundComplete = Boolean(rulebook.fund.name.trim() && rulebook.fund.baseCurrency && rulebook.fund.size > 0 && rulebook.fund.inceptionDate);
  const mandateComplete = mandateAcknowledged && rulebook.mandate.every((rule) => rule.text.trim());
  const limitsComplete = rulebook.limits.every((limit) => validValue(limit.setTo));
  const autonomyComplete = reviewedAgents.length === rulebook.agents.length && rulebook.agents
    .filter((agent) => THRESHOLD_AGENTS.includes(agent.agent as (typeof THRESHOLD_AGENTS)[number]))
    .every((agent) => agent.sizeThresholdPctOfFund !== null);
  const escalationComplete = rulebook.escalation.every((route) => route.recipient && route.channel && route.timing);
  const completion = [fundComplete, mandateComplete, limitsComplete, autonomyComplete, escalationComplete, launched];
  const currentComplete = completion[step];
  const review = useMemo(() => reviewSentences(rulebook), [rulebook]);
  const canLaunch = fundComplete && mandateComplete && limitsComplete && autonomyComplete && escalationComplete;

  return (
    <div className="page setup-page">
      <div className="setup-title-row">
        <div><h1 className="page-title">Fund setup</h1><p>Write the boundaries the agents will operate inside.</p></div>
      </div>
      <div className="setup-layout">
        <nav className="setup-rail" aria-label="Fund setup steps">
          <span className="rule-eyebrow">Setup</span>
          {SETUP_STEPS.map((label, index) => {
            const reachable = index <= step || completion.slice(0, index).every(Boolean);
            return <button key={label} className={index === step ? 'active' : ''} aria-current={index === step ? 'step' : undefined} disabled={!reachable} onClick={() => setStep(index)}><span>{index + 1}</span><strong>{label}</strong>{completion[index] && <small>Complete</small>}</button>;
          })}
          <p>The rulebook is one object. Setup writes it; the Rules page edits it later.</p>
        </nav>

        <div className="setup-stage-shell">
          <main className="setup-stage">
          {step === 0 && FundStep()}
          {step === 1 && MandateStep()}
          {step === 2 && LimitsStep()}
          {step === 3 && (
            <section className="setup-step">
              <StepHeading eyebrow="Agent autonomy" title="Decide where every agent must stop" copy="Select a movable item to move it to the next column. Locked rules are part of the architecture and cannot move." />
              <AutonomyGrid
                agents={rulebook.agents}
                mode="setup"
                reviewedAgents={reviewedAgents}
                onMove={(agent, action, from) => moveAutonomy(agent.agent, action, from, nextColumn(from))}
                onThreshold={(agent, value) => setAgentThreshold(agent.agent, value)}
                onReview={setAgentReviewed}
              />
            </section>
          )}
          {step === 4 && (
            <section className="setup-step">
              <StepHeading eyebrow="Escalation" title="Who is told what, and how fast" copy={ESCALATION_NOTE} />
              <EscalationTable routes={rulebook.escalation} mode="setup" onChange={(id, patch) => updateEscalation(id, patch)} />
            </section>
          )}
          {step === 5 && (
            <section className="setup-step review-step">
              <StepHeading eyebrow="Review and launch" title="Read the rules as the agents will act on them" copy="This is the rulebook in plain English, not a form summary." />
              <div className="rulebook-prose">
                {review.map((group) => <section key={group.heading}><h3>{group.heading}</h3>{group.sentences.map((sentence) => <p key={sentence}>{sentence}</p>)}</section>)}
              </div>
              <div className="launch-gate">
                <div><span className="rule-eyebrow">Launch gate</span><h3>Nothing goes live by default</h3><p>{LAUNCH_NOTE}</p></div>
                <div className="launch-checks">
                  <GateItem ok={fundComplete} label="Fund details set" step={0} onGo={setStep} />
                  <GateItem ok={mandateComplete} label="Mandate acknowledged" step={1} onGo={setStep} />
                  <GateItem ok={limitsComplete} label="Risk limits set" step={2} onGo={setStep} />
                  {rulebook.agents.map((agent) => <GateItem key={agent.agent} ok={reviewedAgents.includes(agent.agent) && (!THRESHOLD_AGENTS.includes(agent.agent as (typeof THRESHOLD_AGENTS)[number]) || agent.sizeThresholdPctOfFund !== null)} label={`${agent.agent} autonomy explicitly set`} step={3} onGo={setStep} />)}
                  <GateItem ok={escalationComplete} label="Escalation routing set" step={4} onGo={setStep} />
                </div>
                <button className="btn primary launch-button" disabled={!canLaunch || launched} onClick={() => { launch(); navigate('/rules', { replace: true }); }}>{launched ? 'Fund launched' : 'Launch fund with this rulebook'}</button>
              </div>
            </section>
          )}

          </main>
          <div className="setup-actions">
            <button className="btn small" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button>
            {step < SETUP_STEPS.length - 1 && <button className="btn primary" disabled={!currentComplete} onClick={() => setStep((current) => Math.min(SETUP_STEPS.length - 1, current + 1))}>Continue</button>}
          </div>
        </div>
      </div>
    </div>
  );

  function FundStep() {
    return <section className="setup-step short-step">
      <StepHeading eyebrow="The fund" title="Start with the few facts every rule depends on" copy="These values set the base for every capital equivalent shown later." />
      <div className="setup-form-grid">
        <label><span>Fund name</span><input autoFocus value={rulebook.fund.name} onChange={(event) => updateFund('name', event.target.value)} /></label>
        <label><span>Base currency</span><select value={rulebook.fund.baseCurrency} onChange={(event) => updateFund('baseCurrency', event.target.value)}>{BASE_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        <label><span>Size at launch</span><div className="input-affix"><span>₹</span><input type="number" step="0.1" value={rulebook.fund.size / CR} onChange={(event) => updateFund('size', Number(event.target.value) * CR)} /><span>Cr</span></div></label>
        <label><span>Inception date</span><input type="date" value={rulebook.fund.inceptionDate} onChange={(event) => updateFund('inceptionDate', event.target.value)} /></label>
      </div>
    </section>;
  }

  function MandateStep() {
    return <section className="setup-step mandate-step">
      <StepHeading eyebrow="The mandate" title="Write the promise made to investors" copy="This is binding fund language, not a preference." />
      <div className="mandate-warning">{MANDATE_NOTICE}</div>
      <div className="mandate-editor">
        {rulebook.mandate.map((rule) => <label key={rule.id}><span>{rule.label}</span><input disabled={launched} value={rule.text} onChange={(event) => updateMandate(rule.id, event.target.value)} /></label>)}
      </div>
      <label className="acknowledgement"><input type="checkbox" disabled={launched} checked={mandateAcknowledged} onChange={(event) => setMandateAcknowledged(event.target.checked)} /><span>I understand that this mandate cannot be edited here after launch.</span></label>
    </section>;
  }

  function LimitsStep() {
    return <section className="setup-step">
      <StepHeading eyebrow="Risk stance and limits" title="Begin with a coherent set, then make deliberate exceptions" copy="Choosing a stance pre-fills every internal limit. Mandate limits stay locked." />
      <div className="stance-cards" role="radiogroup" aria-label="Risk stance">
        {(Object.keys(RISK_STANCE_COPY) as Array<keyof typeof RISK_STANCE_COPY>).map((stance) => <button key={stance} role="radio" aria-checked={rulebook.riskStance === stance} className={rulebook.riskStance === stance ? 'selected' : ''} onClick={() => setRiskStance(stance)}><strong>{RISK_STANCE_COPY[stance].label}</strong><span>{RISK_STANCE_COPY[stance].description}</span></button>)}
      </div>
      <div className="setup-limits">
        <div className="setup-limit-head"><span>Limit</span><span>Set to</span><span>Capital equivalent</span><span>Source</span></div>
        {rulebook.limits.map((limit) => <SetupLimit key={limit.id} limit={limit} />)}
      </div>
    </section>;
  }

  function SetupLimit({ limit }: { limit: Limit }) {
    const defaultValue = stanceDefault(limit, rulebook.riskStance);
    const changed = !valuesEqual(limit.setTo, defaultValue);
    return <div className="setup-limit-row">
      <div><strong>{limit.label}</strong><span>{limit.description}</span></div>
      <RuleValueInput limit={limit} value={limit.setTo} onChange={(value) => updateDraftLimit(limit.id, value)} />
      <div className="limit-equivalent"><strong>{formatRupeeEquivalent(limit.setTo, limit.unit, rulebook.fund.size)}</strong>{changed && limit.source !== 'mandate' && <span>Changed from {RISK_STANCE_COPY[rulebook.riskStance].label.toLowerCase()} default {formatRuleValue(defaultValue, limit.unit)}</span>}</div>
      <div>{limit.source === 'mandate' ? <span className="rule-lock-label">From the mandate</span> : <span>Internal</span>}</div>
    </div>;
  }
}

function RuleValueInput({ limit, value, onChange }: { limit: Limit; value: RuleValue; onChange: (value: RuleValue) => void }) {
  const locked = limit.source === 'mandate';
  if (Array.isArray(value)) return <div className="range-input"><input disabled={locked} aria-label={`${limit.label} lower bound`} type="number" step="0.1" value={value[0]} onChange={(event) => onChange([Number(event.target.value), value[1]])} /><span>to</span><input disabled={locked} aria-label={`${limit.label} upper bound`} type="number" step="0.1" value={value[1]} onChange={(event) => onChange([value[0], Number(event.target.value)])} /><span>%</span></div>;
  return <div className="single-rule-input"><input disabled={locked} aria-label={limit.label} type="number" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{limit.unit === 'days' ? 'days' : '%'}</span></div>;
}

function StepHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="setup-step-head"><span className="rule-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{copy}</p></header>;
}

function GateItem({ ok, label, step, onGo }: { ok: boolean; label: string; step: number; onGo: (step: number) => void }) {
  return <div className={ok ? 'complete' : 'missing'}><span aria-hidden="true">{ok ? '✓' : '×'}</span><strong>{label}</strong>{!ok && <button className="btn link" onClick={() => onGo(step)}>Go to step</button>}</div>;
}

function nextColumn(column: AutonomyColumn): AutonomyColumn {
  if (column === 'alone') return 'human';
  if (column === 'human') return 'never';
  return 'alone';
}

function validValue(value: RuleValue): boolean {
  if (Array.isArray(value)) return value.every(Number.isFinite) && value[0] < value[1];
  return Number.isFinite(value);
}
