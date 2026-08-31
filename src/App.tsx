/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './views/Dashboard';
import { Central } from './views/Central';
import { CRM } from './views/CRM';
import { Disparador } from './views/Disparador';
import { Pedidos } from './views/Pedidos';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginView } from './views/LoginView';
import { UnauthorizedView } from './views/UnauthorizedView';

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();

  if (status === 'loading' || status === 'authorizing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginView />;
  }

  if (status === 'unauthorized') {
    return <UnauthorizedView />;
  }

  if (status === 'authorized') {
    return <>{children}</>;
  }

  return null;
};

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="chat" element={<Central />} />
              <Route path="crm" element={<CRM />} />
              <Route path="disparador" element={<Disparador />} />
              <Route path="pedidos" element={<Pedidos />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthGate>
    </AuthProvider>
  );
}
