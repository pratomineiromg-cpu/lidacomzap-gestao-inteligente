export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

export interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user?: AuthenticatedUser;
  error?: string;
}

export type AppUserRole = 'ADMIN' | 'ATENDIMENTO' | 'CAIXA' | 'COZINHA';

export interface AppUserProfile {
  uid: string;
  email: string;
  name: string;
  active: boolean;
  role: AppUserRole;
  createdAt: Date;
  updatedAt: Date;
}
