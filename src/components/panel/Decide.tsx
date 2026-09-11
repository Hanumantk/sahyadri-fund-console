import { useEffect, useRef, useState } from 'react';
import type { Preview, QueueItem } from '../../data/derive';
import { fmtCr, fmtPct, fmtTime } from '../../data/format';
import { LIMITS } from '../../data/scenario';
import type { Choice } from '../../state/actions';
import { useStore } from '../../state/store';
import { Icon } from '../ui/Icon';

interface Option {
  key: Choice;
  label: string;
  preview?: Preview;
  needsReason: boolean;
  note?: string;
}

/** Shared decide block: equal-weight option buttons, a live preview, an optional slider, a reason field and one primary Confirm. */
export function Decide({
  item,
  options,
  slider,
  previewFor,
}: {
  item: QueueItem;
  options: Option[];
  slider?: { min: number; max: number; step: number; initial: number };
  previewFor?: (amount: number) => Preview;
}) {
  const { decide } = useStore();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [amount, setAmount] = useState(slider?.initial ?? 0);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const opt = options.find((o) => o.key === choice) ?? null;
  const preview = opt ? (opt.key === 'less' && previewFor ? previewFor(amount) : opt.preview) : null;
  const confirmRef = useRef<HTMLDivElement>(null);

  // Bring the preview, reason and Confirm into view once an option is picked.
  useEffect(() => {
    if (choice) confirmRef.current?.scrollIntoView({ block: 'nearest' });
  }, [choice]);

  if (item.status !== 'open') {
    const o = item.outcome;
    return (
      <div className="decide">
        <div className="section-title">Outcome</div>
        <div className="done-note">
          <strong style={{ fontWeight: 500, color: 'var(--text)' }}>{item.closedLabel}</strong>
          {o?.by && o.by !== 'system' ? ` · by ${o.by === 'priya' ? 'Priya Nair' : o.by}` : ''}
          {o?.at ? ` · ${fmtTime(o.at)}` : ''}
          {o?.reason ? ` · "${o.reason}"` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="decide">
      <div className="section-title">Your decision · each button shows its result before you confirm</div>
      <div className="buttons">
        {options.map((o) => (
          <button
            key={o.key}
            className={`btn${choice === o.key ? ' selected' : ''}`}
            onClick={() => {
              setChoice(o.key);
              setErr('');
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {opt && slider && opt.key === 'less' && (
        <div className="slider-row">
          <span>Size</span>
          <input type="range" min={slider.min} max={slider.max} step={slider.step} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <span className="val">{fmtCr(amount)}</span>
        </div>
      )}

      {opt && preview && (
        <div className="preview">
          <div>
            <div className="pv-k">{item.company} position</div>
            <div className="pv-v">{fmtPct(preview.positionPct)}</div>
            <div className="pv-s">of fund · limit {fmtPct(LIMITS.maxCompanyPct, 0)}</div>
          </div>
          <div>
            <div className="pv-k">{preview.sectorName} sector</div>
            <div className={`pv-v${preview.sectorUsedPct > 100 ? ' red' : preview.sectorUsedPct >= LIMITS.nearLimitPct ? ' amber' : ''}`}>{fmtPct(preview.sectorPct)}</div>
            <div className="pv-s">
              of fund · {fmtPct(preview.sectorUsedPct, 0)} of its {fmtPct(LIMITS.maxSectorPct, 0)} limit
            </div>
          </div>
          <div>
            <div className="pv-k">Cash after</div>
            <div className={`pv-v${preview.cashAfterPct < LIMITS.minCashPct ? ' red' : ''}`}>{fmtCr(preview.cashAfter)}</div>
            <div className="pv-s">
              {fmtPct(preview.cashAfterPct)} of fund · minimum {fmtPct(LIMITS.minCashPct, 0)}
            </div>
          </div>
          <div className="preview-note">{opt.note ?? preview.summary}</div>
        </div>
      )}
      {opt && !preview && opt.note && <div className="done-note">{opt.note}</div>}

      {opt && (
        <>
          <div className="reason">
            <input
              placeholder={opt.needsReason ? 'One-line reason, required. It goes into the record.' : 'One-line reason, optional'}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErr('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm();
              }}
            />
            {err && <div className="err">{err}</div>}
          </div>
          <div className="confirm-row" ref={confirmRef}>
            <button className="btn primary" onClick={confirm}>
              <Icon name="check" />
              Confirm {opt.label.toLowerCase()}
            </button>
            <span className="muted" style={{ fontSize: 'var(--fs-12)' }}>
              Written to the Audit trail as {item.id} · by Priya Nair
            </span>
          </div>
        </>
      )}
    </div>
  );

  function confirm() {
    if (!opt) return;
    if (opt.needsReason && !reason.trim()) {
      setErr('Add a one-line reason. It goes into the record.');
      return;
    }
    try {
      decide(item.id, opt.key, opt.key === 'less' ? amount : (opt.preview?.amount ?? 0), reason);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
}
