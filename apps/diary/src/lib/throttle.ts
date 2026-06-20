// In-memory attempt throttle for PIN logins. A 4-digit PIN is brute-forceable
// in minutes without one, and the threat model is literally curious siblings.
// Per-key sliding lockout: maxAttempts straight failures → locked for
// lockoutMs; the counter clears on success or when the lockout expires.
// In-memory is deliberate — a restart clearing it is acceptable for a
// single-process family app, and the sessions table is the durable state.

export type Throttle = {
  isLocked(key: string, now?: number): boolean;
  recordFailure(key: string, now?: number): void;
  recordSuccess(key: string): void;
};

export function createThrottle(maxAttempts = 5, lockoutMs = 60_000): Throttle {
  const state = new Map<string, { count: number; lockedUntil: number }>();
  return {
    isLocked(key: string, now: number = Date.now()): boolean {
      const s = state.get(key);
      if (!s) return false;
      if (s.lockedUntil > now) return true;
      if (s.lockedUntil > 0) state.delete(key); // lockout expired — clean slate
      return false;
    },
    recordFailure(key: string, now: number = Date.now()): void {
      const s = state.get(key) ?? { count: 0, lockedUntil: 0 };
      s.count += 1;
      if (s.count >= maxAttempts) {
        s.lockedUntil = now + lockoutMs;
        s.count = 0;
      }
      state.set(key, s);
    },
    recordSuccess(key: string): void {
      state.delete(key);
    },
  };
}
