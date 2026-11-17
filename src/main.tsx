import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

const App = lazy(() => import('./App.tsx'));
const AutoatendimentoApp = lazy(() => import('./components/AutoatendimentoApp'));

const isSelfServiceRoute = () => {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return (
    pathname === '/autoatendimento' ||
    pathname.startsWith('/autoatendimento/') ||
    params.get('modo') === 'autoatendimento'
  );
};

const RootComponent = isSelfServiceRoute() ? AutoatendimentoApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950" />}>
      <RootComponent />
    </Suspense>
  </StrictMode>,
);
