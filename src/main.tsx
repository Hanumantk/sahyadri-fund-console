import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './styles/base.css';

// A host that cannot rewrite unknown paths to index.html has to carry the route
// in the hash instead. GitHub Pages and Vercel both rewrite, so they keep clean
// URLs; set VITE_ROUTER=hash for a host that does not.
const useHash = import.meta.env.VITE_ROUTER === 'hash';
const Router = useHash ? HashRouter : BrowserRouter;
const basename = useHash ? undefined : import.meta.env.BASE_URL;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router basename={basename}>
      <App />
    </Router>
  </React.StrictMode>,
);
