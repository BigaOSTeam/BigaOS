import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClientGate } from './components/setup/ClientGate';
import { ServerUrlGate } from './components/setup/ServerUrlGate';
import { AppErrorBoundary } from './components/setup/AppErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ServerUrlGate>
        <ClientGate />
      </ServerUrlGate>
    </AppErrorBoundary>
  </React.StrictMode>
);
