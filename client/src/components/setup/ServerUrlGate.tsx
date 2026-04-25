import React from 'react';
import { getStoredServerUrl, isNativeApp } from '../../utils/serverConfig';
import { ServerUrlSetup } from './ServerUrlSetup';

interface ServerUrlGateProps {
  children: React.ReactNode;
}

export const ServerUrlGate: React.FC<ServerUrlGateProps> = ({ children }) => {
  if (isNativeApp() && !getStoredServerUrl()) {
    return <ServerUrlSetup />;
  }
  return <>{children}</>;
};
