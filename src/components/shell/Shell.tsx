import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { fmtAgo, fmtTime, fmtTimeSec, fmtWeekdayDate } from '../../data/format';
import { FUND, STATES, type StateName } from '../../data/scenario';
import { useStore } from '../../state/store';
import { Icon } from '../ui/Icon';
import { MARKET_CLOSE_MS } from '../../data/clock';

const RAIL_BELOW = 1440;

export function Shell({ children, devVisible }: { children: ReactNode; devVisible: boolean }) {
  const { vm, rt, setState, pauseAll, resumeAll } = useStore();
  const navigate = useNavigate();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [devShown, setDevShown] = useState(devVisible);

  // The sidebar starts as an icon rail below 1440 so the 12-column grid keeps its proportions.
  const [rail, setRail] = useState(() => window.innerWidth < RAIL_BELOW);
  const touched = useRef(false);
  useEffect(() => {
    const onResize = () => {
      if (!touched.current) setRail(window.innerWidth < RAIL_BELOW);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => setDevShown(devVisible), [devVisible]);
  // Ctrl+Shift+D also reveals the state switcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') setDevShown((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const needs = vm.needsYou.count;
  const marketLine = vm.marketOpen ? `NSE open until ${fmtTime(MARKET_CLOSE_MS)}` : 'NSE closed';

  return (
    <div className={`shell${rail ? ' rail' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="sidebar-toggle"
            aria-label={rail ? 'Show the sidebar labels' : 'Collapse the sidebar'}
            title={rail ? 'Show the sidebar labels' : 'Collapse the sidebar'}
            onClick={() => {
              touched.current = true;
              setRail((v) => !v);
            }}
          >
            <Icon name="sidebar" />
          </button>
          <div className="topbar-nav">
            <button aria-label="Back" title="Back" onClick={() => navigate(-1)}>
              <Icon name="chevron-left" />
            </button>
            <button aria-label="Forward" title="Forward" onClick={() => navigate(1)}>
              <Icon name="chevron-right" />
            </button>
          </div>
        </div>

        <div className="topbar-grid">
          <div className="topbar-item tb-data" title={vm.feeds.map((f) => `${f.name}: ${fmtTimeSec(f.lastUpdatedMs)}`).join('\n')}>
            <span className="label">Data</span>
            <span className="dot4" />
            <span className="val">{vm.health.label}</span>
          </div>
          <div className="topbar-item tb-last" title={`${vm.lastAction.agent} · ${fmtTimeSec(vm.lastAction.atMs)} · ${vm.lastAction.text}`}>
            <span className="label">Last agent action</span>
            <span className="dot4" />
            <span className="val">
              {vm.lastAction.warn
                ? `No agent action for ${fmtAgo(vm.lastAction.atMs, vm.nowMs).replace(' ago', '')}`
                : `${fmtAgo(vm.lastAction.atMs, vm.nowMs)} · ${vm.lastAction.agent}`}
            </span>
          </div>
          <div className={`tb-right${rt.pausedAll ? ' paused' : ''}`}>
            <div className="topbar-item" title={`${fmtWeekdayDate(vm.nowMs)} · ${fmtTimeSec(vm.nowMs)} IST · ${marketLine}`}>
              <span className="label">{fmtWeekdayDate(vm.nowMs)}</span>
              <span className="dot4" />
              <span className="val">
                {fmtTimeSec(vm.nowMs)} IST
                <span className="tb-nse"> · {marketLine}</span>
              </span>
            </div>
            <div className="pause-slot">
              {rt.pausedAll ? (
                <>
                  <span className="badge">All paused by {vm.user.name}</span>
                  <button className="btn" onClick={resumeAll}>
                    Resume all
                  </button>
                </>
              ) : (
                <button className="btn" onClick={() => setPauseOpen(true)}>
                  Pause all agents
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">{FUND.name}</div>
          <div className="brand-sub">Long-only · benchmark {FUND.benchmark}</div>
        </div>
        <nav className="nav">
          <NavItem to="/" end icon="home" label="Home">
            <span className="nav-badge nav-count" title={vm.needsYou.label}>
              {needs}
            </span>
          </NavItem>
          <NavItem to="/portfolio" icon="portfolio" label="Portfolio" />
          <NavItem to="/rules" icon="rules" label="Rules" />
          <NavItem to="/audit" icon="audit" label="Audit trail" />
        </nav>
        <nav className="nav nav-bottom">
          <NavItem to="/settings" icon="settings" label="Settings" />
        </nav>
        <div className="user-line">
          <strong>{vm.user.name}</strong>
          <span>{vm.user.role}</span>
        </div>
      </aside>

      <main className="main">
        {children}
      </main>

      {pauseOpen && (
        <PauseAllDialog
          onCancel={() => setPauseOpen(false)}
          onConfirm={(reason) => {
            pauseAll(reason);
            setPauseOpen(false);
          }}
        />
      )}

      {devShown && (
        <div className="dev-toggle">
          <span>State</span>
          {STATES.map((s: StateName) => (
            <button key={s} className={`btn small${vm.state === s ? ' selected' : ''}`} onClick={() => setState(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavItem({
  to,
  end,
  icon,
  label,
  children,
}: {
  to: string;
  end?: boolean;
  icon: 'home' | 'portfolio' | 'rules' | 'audit' | 'settings';
  label: string;
  children?: ReactNode;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title={label}>
      <Icon name={icon} />
      <span className="nav-label">{label}</span>
      {children}
    </NavLink>
  );
}

function PauseAllDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const { vm } = useStore();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const working = vm.agentRow.filter((a) => a.status !== 'Paused');
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Pause all agents</h3>
        <p>These stop now and stay stopped until you resume them. Orders already working are held. Nothing is sold.</p>
        <ul>
          {working.map((a) => (
            <li key={a.id}>
              <strong style={{ fontWeight: 600 }}>{a.name}</strong> <span className="muted">· {a.liveLine}</span>
            </li>
          ))}
        </ul>
        <p>The Monitoring Agent keeps watching feeds, so this panel stays live.</p>
        <div className="reason">
          <input
            autoFocus
            placeholder="One-line reason, for the record"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErr('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          {err && <div className="err">{err}</div>}
        </div>
        <div className="actions">
          <button className="btn small" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            Pause {working.length} agents
          </button>
        </div>
      </div>
    </div>
  );

  function submit() {
    if (!reason.trim()) {
      setErr('Add a one-line reason. It goes into the record.');
      return;
    }
    onConfirm(reason);
  }
}
