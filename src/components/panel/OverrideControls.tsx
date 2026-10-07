import { useState, type ReactNode } from 'react';
import type { Authority, GrantedException, QueueItem } from '../../data/derive';
import { fmtTime } from '../../data/format';
import { COSIGNERS } from '../../data/rulebook';
import { useStore } from '../../state/store';
import { Icon, type IconName } from '../ui/Icon';

/**
 * The controls every override shares, so that a person meets the same four beats
 * wherever they overrule an agent: the rule, a second person when the rule asks
 * for one, a reason, and one button that names its consequence. When the rule
 * says no, the same place offers to send it to the person who may.
 */

const REASON = 'Add a one-line reason. It goes into the record.';

export function OverrideForm({
  authority,
  title,
  confirmLabel,
  confirmIcon = 'alert',
  subjectKey,
  onConfirm,
  restraint = false,
}: {
  authority: Authority;
  title: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  /** What an escalation would be about, if the rules refuse this. */
  subjectKey: string;
  onConfirm: (reason: string, cosigner: string | null) => void;
  /** Tightening rather than loosening: the button is quieter and nothing lapses. */
  restraint?: boolean;
}) {
  const { vm } = useStore();
  const [reason, setReason] = useState('');
  const [cosigner, setCosigner] = useState('');
  const [err, setErr] = useState('');

  if (authority.verdict === 'refused') return <EscalationBlock authority={authority} subjectKey={subjectKey} />;

  const commit = () => {
    if (!reason.trim()) return setErr(REASON);
    if (authority.verdict === 'needs-cosign' && !cosigner) return setErr(`This needs ${authority.cosignWho ?? 'a second person'} to sign it.`);
    try {
      onConfirm(reason, cosigner || null);
      setReason('');
      setCosigner('');
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="decide override-form">
      <div className="section-title">{title}</div>
      {authority.cosignLine && (
        <div className="loosen-warning">
          <strong>This loosens a control. It needs a second person.</strong>
          {/* Why a second person is needed is the substance of this block, not
              metadata, so it takes body colour rather than .faint. */}
          <div style={{ margin: '4px 0 6px', color: 'var(--text-2)' }}>{authority.cosignLine}.</div>
          <label>
            <span>Co-signer</span>
            <select
              value={cosigner}
              onChange={(e) => {
                setCosigner(e.target.value);
                setErr('');
              }}
            >
              <option value="">Select a co-signer</option>
              {COSIGNERS.map((person) => (
                <option key={person}>{person}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="reason">
        <input
          placeholder="One-line reason, required. It goes into the record."
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErr('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        {err && <div className="err">{err}</div>}
      </div>
      <div className="confirm-row">
        <button className={`btn ${restraint ? 'danger-hover' : 'primary'}`} onClick={commit}>
          <Icon name={confirmIcon} />
          {confirmLabel}
        </button>
        <span className="muted" style={{ fontSize: 'var(--fs-12)' }}>
          {authority.expiryLine} · by {vm.user.name}
        </span>
      </div>
      {authority.notifyLine && <div className="faint override-note">{authority.notifyLine}.</div>}
    </div>
  );
}

/**
 * What the console offers when the rules say no: the reason, in a sentence with
 * a name in it, and a request that stays on screen until it is answered.
 */
export function EscalationBlock({ authority, subjectKey }: { authority: Authority; subjectKey: string }) {
  const { vm, escalate, chase, withdrawEscalation } = useStore();
  const open = vm.escalations.find((x) => x.subjectKey === subjectKey) ?? null;
  return (
    <div className="decide override-form">
      <div className="section-title">{open ? `Sent to ${open.toName}` : 'You may not do this'}</div>
      <div className="override-copy">{authority.refusalLine}</div>
      {open ? (
        <>
          <div className="done-note escalation-status">
            <Icon name="wait" />
            <span>
              <strong>Waiting on {open.toName}</strong>, {open.toRole} · {open.waitingLine}
            </span>
          </div>
          <div className="confirm-row">
            <button className="btn" onClick={() => chase(open.id)}>
              <Icon name="send" />
              Chase {open.toName}
            </button>
            <button className="btn danger-hover" onClick={() => withdrawEscalation(open.id, '')}>
              <Icon name="x" />
              Withdraw the request
            </button>
            <span className="muted" style={{ fontSize: 'var(--fs-12)' }}>
              {open.id} · stays on Home until {open.toName} answers
            </span>
          </div>
        </>
      ) : authority.askInsteadName ? (
        <div className="confirm-row">
          <button className="btn primary" onClick={() => escalate(subjectKey)}>
            <Icon name="send" />
            Send to {authority.askInsteadName}
          </button>
          <span className="muted" style={{ fontSize: 'var(--fs-12)' }}>
            Writes your request and the refusal to the record, and tracks it until answered
          </span>
        </div>
      ) : (
        <div className="faint override-note">The rules name nobody who may.</div>
      )}
    </div>
  );
}

/** An override in force: who, when, why, when it lapses, and how to take it back. */
export function ExceptionInForce({ ex, subject, after }: { ex: GrantedException; subject: string; after?: ReactNode }) {
  const { vm, withdrawOverride } = useStore();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="decide override-form">
      <div className="section-title">
        {ex.id} in force · lapses {fmtTime(ex.lapsesAtMs)}
      </div>
      <div className="card">
        <div className="list">
          <div className="list-row">
            <span className="l">Granted</span>
            <span className="r">
              {vm.user.name} · {fmtTime(ex.grantedAtMs)}
            </span>
          </div>
          {ex.cosigner && (
            <div className="list-row">
              <span className="l">Co-signed</span>
              <span className="r">{ex.cosigner}</span>
            </div>
          )}
          <div className="list-row">
            <span className="l">Reason given</span>
            <span className="r">{ex.reason}</span>
          </div>
        </div>
      </div>
      <div className="override-copy">{subject}</div>
      {after}
      <div className="reason">
        <input
          placeholder="Reason to withdraw it, required. It goes into the record."
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErr('');
          }}
        />
        {err && <div className="err">{err}</div>}
      </div>
      <div className="confirm-row">
        <button
          className="btn danger-hover"
          onClick={() => {
            if (!reason.trim()) return setErr(REASON);
            try {
              withdrawOverride(ex.id, reason);
              setReason('');
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          <Icon name="x" />
          Withdraw {ex.id}
        </button>
        <span className="muted" style={{ fontSize: 'var(--fs-12)' }}>
          What it already bought stays bought. An override cannot undo a trade.
        </span>
      </div>
    </div>
  );
}

/** A reason and one button, for restraint that needs nothing else. */
export function ReasonAction({
  placeholder,
  label,
  icon,
  onConfirm,
  note,
}: {
  placeholder: string;
  label: string;
  icon: IconName;
  onConfirm: (reason: string) => void;
  note?: string;
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const commit = () => {
    if (!reason.trim()) return setErr(REASON);
    try {
      onConfirm(reason);
      setReason('');
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <>
      <div className="confirm-row">
        <input
          className="inline-input"
          style={{ flex: 1 }}
          placeholder={placeholder}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErr('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        <button className="btn danger-hover" onClick={commit}>
          <Icon name={icon} />
          {label}
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      {note && <div className="faint override-note">{note}</div>}
    </>
  );
}

/**
 * The blank box for an item words cannot settle, such as a late feed or a broken
 * limit. The instruction is recorded and sent; the item stays open, and what was
 * sent stays listed on it so the next look shows what you already asked for.
 */
export function OwnInstructionBox({ item }: { item: QueueItem }) {
  const { vm, instruct } = useStore();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const send = () => {
    if (!text.trim()) return setErr('Write the instruction. It goes into the record word for word.');
    try {
      instruct(item.id, text);
      setText('');
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="decide override-form">
      <label className={`own-action${text.trim() ? ' selected' : ''}`}>
        <span className="own-label">Something else</span>
        <textarea
          rows={2}
          placeholder={`Write your own instruction to the ${vm.agents[item.instructTo].name}, if none of the controls above is right`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr('');
          }}
        />
      </label>
      {text.trim() && <div className="done-note">{item.ownNote}</div>}
      {err && <div className="err">{err}</div>}
      {text.trim() && (
        <div className="confirm-row">
          <button className="btn primary" onClick={send}>
            <Icon name="send" />
            Send your instruction
          </button>
          <span className="muted" style={{ fontSize: 'var(--fs-12)' }}>
            Written to the Audit trail · by {vm.user.name}
          </span>
        </div>
      )}
      {item.instructions.length > 0 && (
        <div className="list own-sent">
          {item.instructions.map((x) => (
            <div className="list-row" key={x.atMs}>
              <span className="l">“{x.text}”</span>
              <span className="r">sent {fmtTime(x.atMs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
