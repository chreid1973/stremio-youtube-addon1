// frontend/src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app'; // use './App' if your file is App.tsx
import './index.css';    // remove if you don’t have it

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

