import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/shell/Shell';
import { Home } from './pages/Home';
import { AuditTrail } from './pages/AuditTrail';
import { Stub } from './pages/Stub';
import { Portfolio } from './pages/Portfolio';
import { Rules } from './pages/Rules';
import { Setup } from './pages/Setup';
import { StoreProvider } from './state/store';
import { RulebookProvider, useRulebook } from './state/rulebook';
import { STATES, type StateName } from './data/scenario';

export default function App() {
  const location = useLocation();
  const [state, setState] = useState<StateName>(() => readState(location.search));
  useEffect(() => {
    const next = readState(location.search);
    if (next !== state) setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  // The state switcher stays hidden unless the URL carries ?dev=1 (Ctrl+Shift+D also toggles it).
  const devVisible = useMemo(() => new URLSearchParams(location.search).has('dev'), [location.search]);

  return (
    <StoreProvider state={state}>
      <RulebookProvider>
        <SetupGate devVisible={devVisible} />
      </RulebookProvider>
    </StoreProvider>
  );
}

function SetupGate({ devVisible }: { devVisible: boolean }) {
  const location = useLocation();
  const { launched } = useRulebook();

  if (!launched && location.pathname !== '/setup') {
    return <Navigate replace to={{ pathname: '/setup', search: location.search }} />;
  }
  if (!launched) {
    return <div className="setup-standalone"><Setup /></div>;
  }
  if (launched && location.pathname === '/setup') {
    return <Navigate replace to={{ pathname: '/rules', search: location.search }} />;
  }

  return (
    <Shell devVisible={devVisible}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/audit" element={<AuditTrail />} />
        <Route path="/settings" element={<Stub title="Settings" text="People, roles, notification routes and the fund's connected accounts." />} />
      </Routes>
    </Shell>
  );
}

function readState(search: string): StateName {
  const p = new URLSearchParams(search).get('state');
  return (STATES as string[]).includes(p ?? '') ? (p as StateName) : 'normal';
}
