import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './app';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
