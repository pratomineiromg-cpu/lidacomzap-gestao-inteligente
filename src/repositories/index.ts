import { AppRepository } from './IRepository';
import { mockRepository } from './MockRepository';

// Dependency Injection Point
// In the future, this can be swapped with a FirestoreRepository
export const repository: AppRepository = mockRepository;
