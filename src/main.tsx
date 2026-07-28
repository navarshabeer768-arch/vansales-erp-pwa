import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

// GitHub Pages has no server to rewrite deep links to index.html, so it needs
// HashRouter. Real hosts (Netlify/Vercel) get clean URLs via BrowserRouter —
// configure a SPA rewrite there (netlify.toml / vercel.json, included in this
// repo) so deep links and Supabase's auth-callback hash both work correctly.
const Router = import.meta.env.VITE_USE_HASH_ROUTER === 'true' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </React.StrictMode>
);
