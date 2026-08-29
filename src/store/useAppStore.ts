import { useSyncExternalStore } from 'react';
import { mockDb, DatabaseState } from '../repositories/MockDatabase';

export const useAppStore = (): DatabaseState => {
  return useSyncExternalStore(
    mockDb.subscribe,
    mockDb.getState
  );
};
