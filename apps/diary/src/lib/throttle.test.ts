import { describe, expect, it } from 'vitest';
import { createThrottle } from './throttle.js';

describe('createThrottle', () => {
  it('is unlocked with no failures', () => {
    const t = createThrottle();
    expect(t.isLocked('iona')).toBe(false);
  });

  it('stays unlocked below the attempt limit', () => {
    const t = createThrottle(5, 60_000);
    for (let i = 0; i < 4; i++) t.recordFailure('iona', 1000);
    expect(t.isLocked('iona', 1000)).toBe(false);
  });

  it('locks after maxAttempts consecutive failures', () => {
    const t = createThrottle(5, 60_000);
    for (let i = 0; i < 5; i++) t.recordFailure('iona', 1000);
    expect(t.isLocked('iona', 1001)).toBe(true);
  });

  it('unlocks after the lockout window expires', () => {
    const t = createThrottle(5, 60_000);
    for (let i = 0; i < 5; i++) t.recordFailure('iona', 1000);
    expect(t.isLocked('iona', 61_001)).toBe(false);
  });

  it('starts a clean count after an expired lockout', () => {
    const t = createThrottle(5, 60_000);
    for (let i = 0; i < 5; i++) t.recordFailure('iona', 1000);
    expect(t.isLocked('iona', 61_001)).toBe(false);
    t.recordFailure('iona', 61_002);
    expect(t.isLocked('iona', 61_003)).toBe(false);
  });

  it('clears the counter on success', () => {
    const t = createThrottle(5, 60_000);
    for (let i = 0; i < 4; i++) t.recordFailure('iona', 1000);
    t.recordSuccess('iona');
    t.recordFailure('iona', 1001);
    expect(t.isLocked('iona', 1002)).toBe(false);
  });

  it('tracks keys independently', () => {
    const t = createThrottle(5, 60_000);
    for (let i = 0; i < 5; i++) t.recordFailure('iona', 1000);
    expect(t.isLocked('iona', 1001)).toBe(true);
    expect(t.isLocked('isla', 1001)).toBe(false);
  });
});
