import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthState, AuthenticatedUser } from './types';
import { AuthService } from './AuthService';

const AuthContext = createContext<AuthState>({
  status: 'loading'
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    status: 'loading'
  });

  useEffect(() => {
    const unsubscribe = AuthService.subscribeToAuthState((user) => {
      if (user) {
        setAuthState({
          status: 'authenticated',
          user
        });
      } else {
        setAuthState({
          status: 'unauthenticated'
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
