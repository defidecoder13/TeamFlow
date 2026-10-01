// Ensure window.fetch is writable if an environment defines it with getter only
try {
  const currentFetch = window.fetch;
  let fetchFn = function (...args: Parameters<typeof fetch>) {
    return currentFetch.apply(window, args);
  };
  Object.defineProperty(window, 'fetch', {
    get: () => fetchFn,
    set: (newFetch) => {
      fetchFn = newFetch;
    },
    configurable: true,
    enumerable: true,
  });
} catch (_) {
  // Ignore if already configured
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
