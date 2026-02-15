import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './src/App';
import './src/styles/globals.css';
import './src/i18n';
import { GlobalErrorBoundary } from './src/components/GlobalErrorBoundary';
import { validateEnv } from './src/config/validateEnv';

function renderStartupError(message: string): void {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  // Use DOM API instead of innerHTML to prevent XSS via error messages
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#111827';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:720px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 10px 25px rgba(0,0,0,.08)';

  const h1 = document.createElement('h1');
  h1.style.cssText = 'margin:0 0 12px;font-size:20px;line-height:1.3';
  h1.textContent = 'App configuration error';

  const p = document.createElement('p');
  p.style.cssText = 'margin:0 0 12px;line-height:1.5';
  p.textContent = 'The application failed to start because required environment variables are missing or invalid.';

  const pre = document.createElement('pre');
  pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;background:#f3f4f6;border-radius:8px;padding:12px;margin:0;font-size:13px;line-height:1.45';
  pre.textContent = message;

  card.appendChild(h1);
  card.appendChild(p);
  card.appendChild(pre);
  wrapper.appendChild(card);

  rootElement.textContent = '';
  rootElement.appendChild(wrapper);
}

let envValid = true;

try {
  validateEnv();
} catch (error) {
  envValid = false;
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  console.error('Environment validation failed during startup:', error);
  renderStartupError(message);
}

if (envValid) {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </GlobalErrorBoundary>
    </React.StrictMode>
  );
}
