import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './styles.css';

// Global Fetch Interceptor to automatically attach JWT tokens
const { fetch: originalFetch } = window;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  
  // Only inject authorization headers into app API requests (excluding public routes like login)
  if (url.includes('/api/') && !url.includes('/auth/login') && !url.includes('/health')) {
    const sessionStr = localStorage.getItem('crimecyclops-session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session?.token) {
          init = init || {};
          const headers = new Headers(init.headers || {});
          headers.set('Authorization', `Bearer ${session.token}`);
          init.headers = headers;
        }
      } catch (e) {
        console.error('Failed to parse local storage session:', e);
      }
    }
  }

  const response = await originalFetch(input, init);

  // If unauthorized, clear local storage and redirect to login screen
  if (response.status === 401 && url.includes('/api/') && !url.includes('/auth/login')) {
    localStorage.removeItem('crimecyclops-session');
    window.location.href = '/';
  }

  return response;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
