import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app'; // NOTE: lowercase if your file is app.tsx
import './index.css';   // if you have a global css; otherwise remove

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
