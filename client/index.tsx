import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

root.render(
  <React.StrictMode>
    <AuthProvider serverUrl={serverUrl}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
