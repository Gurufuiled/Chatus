import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvidersStandalone } from './app/AppProvidersStandalone';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvidersStandalone />
  </StrictMode>,
);
