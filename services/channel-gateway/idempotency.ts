export interface IdempotencyStore {
  reserve(key: string): boolean;
  has(key: string): boolean;
}

/** Process-local proof implementation. No persistence or provider state. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly keys = new Set<string>();

  reserve(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }
}
