import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Suppress the SDK's internal page-tracking 405 errors so they don't
// surface as unhandled promise rejections and break page rendering.
window.addEventListener('unhandledrejection', (event) => {
  const msg = event?.reason?.message || String(event?.reason || '');
  if (msg.includes('log-user-in-app') || msg.includes('app-logs')) {
    event.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)