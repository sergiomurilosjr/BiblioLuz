import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AutoatendimentoApp from './components/AutoatendimentoApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AutoatendimentoApp />
  </StrictMode>,
);
