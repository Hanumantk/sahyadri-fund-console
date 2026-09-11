import { fmtAge, fmtCr, fmtDayMonth, fmtPct, fmtPrice, fmtSignedCr, fmtSignedPct, fmtTimeSec } from '../../data/format';
import { LIMITS } from '../../data/scenario';
import { useStore } from '../../state/store';
import { LimitBar } from '../ui/bits';
import { PORTFOLIO_SUMMARY } from '../../data/portfolio';

/**
 * Four open blocks on the 12-column grid, three columns each: fund value,
 * drawdown, limits, cash. The routine "as of" stamp is gone because the top bar
 * carries the check time, but a late feed still says how old these numbers are,
 * because then the top bar's time is not the number's time.
 */
export function Layer1Strip() {
  const { vm } = useStore();
  const f = vm.fund;
  const stale = f.stale;
  const staleLabel = stale ? `${fmtTimeSec(f.measuredAtMs).slice(0, 5)} · ${fmtAge(f.measuredAtMs, vm.nowMs)} old` : null;

  /** Up or down, to colour a figure that already states its own sign. */
  const dir = (n: number) => (Math.abs(n) < 0.005 ? '' : n > 0 ? ' v-up' : ' v-down');
  /** How close a limit is to being broken, in the same words the row uses. */
  const limitTone = (status: string) => (status === 'broken' ? ' v-over' : status === 'near' ? ' v-near' : '');

  return (
    <div className="layer1">
      {/* Fund value against the Nifty 50 */}
      <div className="block">
        <div className="block-head">
          <div className="block-label">
            <span>Fund value · live estimate</span>
            {staleLabel && <span className="asof">{staleLabel}</span>}
          </div>
          <div className={`headline${stale ? ' stale' : ''}`}>{fmtCr(f.fundValue)}</div>
          <div className={`block-sub${dir(f.dayChange)}`}>{fmtSignedCr(f.dayChange)} today</div>
          <div className="block-sub">
            Official {fmtPrice(f.official.navPerUnit)}/unit · {fmtDayMonth(f.official.dateMs)}
          </div>
        </div>
        <div className="block-rule" />
        <div className="block-rows">
          <div className="row">
            <span className="k">Fund</span>
            <span className={`v${dir(f.dayChangePct)}`}>{fmtSignedPct(f.dayChangePct)}</span>
          </div>
          <div className="row">
            <span className="k">Nifty 50</span>
            <span className={`v${dir(f.benchmarkPct)}`}>{fmtSignedPct(f.benchmarkPct)}</span>
          </div>
        </div>
      </div>

      {/* Drawdown */}
      <div className="block">
        <div className="block-head">
          <div className="block-label">
            <span>Drawdown · per unit</span>
            {staleLabel && <span className="asof">{staleLabel}</span>}
          </div>
          <div className={`headline${stale ? ' stale' : ''}`}>{fmtPct(f.drawdownPct)}</div>
          <div className="block-sub">
            Below peak of {fmtPrice(f.peak.navPerUnit)} per unit · {fmtDayMonth(f.peak.dateMs)}
          </div>
        </div>
        <div className="block-rule" />
        <div className="block-rows">
          <div className="row">
            <span className="k">Value per unit, live</span>
            <span className="v">{fmtPrice(f.navPerUnit)}</span>
          </div>
          <div className="row" title={`${f.roomPts.toFixed(1)} pts of room left before buying pauses`}>
            <span className="k">Buying pauses at</span>
            <span className="bar-cell">
              <LimitBar usedPct={f.drawdownProgress * 100} />
            </span>
            <span className="v">
              {fmtPct(f.pausePct)} · {fmtPrice(f.pauseNavPerUnit)}
            </span>
          </div>
        </div>
      </div>

      {/* Limits */}
      <div className="block">
        <div className="block-head">
          <div className="block-label">
            <span>Limits</span>
            {staleLabel && <span className="asof">{staleLabel}</span>}
          </div>
          <div className={`headline${stale ? ' stale' : ''}`}>
            <span>{vm.limits.broken.length} broken</span>
            <span className="dot4" />
            <span>{vm.limits.near.length} near limit</span>
          </div>
          <div className="block-sub">
            {vm.limits.broken.length
              ? "Agents can't add to a broken limit · nothing is forced to sell"
              : vm.limits.near.length
                ? `${PORTFOLIO_SUMMARY.exceptionCount} on exception · set on Rules`
                : `Nothing above ${LIMITS.nearLimitPct}% of its limit · set on Rules`}
          </div>
        </div>
        <div className="block-rule" />
        <div className="block-rows">
          {vm.limits.nearest.map((r) => (
            <div key={r.key} className="row">
              <span className="k">{r.name}</span>
              <span className={`v${limitTone(r.status)}`}>
                {fmtPct(r.pct)} of {fmtPct(r.limitPct, 0)} · {r.headroom >= 0 ? `${fmtCr(r.headroom)} room` : `${fmtCr(-r.headroom)} over`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cash */}
      <div className="block">
        <div className="block-head">
          <div className="block-label">
            <span>Cash</span>
          </div>
          <div className="headline">{fmtCr(f.cash)}</div>
          <div className="block-sub">
            {fmtPct(f.cashPct)} of fund · uninvested{' '}
            {f.cashIdleDays >= 1
              ? `${f.cashIdleDays} ${f.cashIdleDays === 1 ? 'day' : 'days'} · since ${fmtDayMonth(f.cashIdleSinceMs)}`
              : `since ${fmtTimeSec(f.cashIdleSinceMs).slice(0, 5)} today`}
          </div>
        </div>
        <div className="block-rule" />
        <div className="block-rows">
          <div className="row">
            <span className="k">Minimum {fmtPct(LIMITS.minCashPct, 0)}</span>
            <span className="v">{fmtCr(f.minCashRupees)}</span>
          </div>
          <div className="row" title="Cash above the minimum buffer">
            <span className="k">Spendable</span>
            <span className="v">{fmtCr(f.spendableCash)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
