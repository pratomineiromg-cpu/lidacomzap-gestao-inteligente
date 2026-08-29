import { useSyncExternalStore } from 'react';
import { repository } from '../repositories';
import { DatabaseState } from '../repositories/IRepository';

export const useAppStore = (): DatabaseState => {
  return useSyncExternalStore(
    repository.subscribe,
    repository.getState
  );
};
