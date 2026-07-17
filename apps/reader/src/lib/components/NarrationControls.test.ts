import type { NarrationPhase } from '$lib/narration-engine.js';
// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NarrationControls from './NarrationControls.svelte';

afterEach(cleanup);

function mount(overrides: Partial<Record<string, unknown>> = {}) {
  const handlers = {
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    onSlower: vi.fn(),
    onResetRate: vi.fn(),
    onFaster: vi.fn(),
  };
  const result = render(NarrationControls, {
    props: { phase: 'idle' as NarrationPhase, rate: 1.0, ...handlers, ...overrides },
  });
  const btn = (role: string) =>
    result.container.querySelector<HTMLButtonElement>(`[data-role="${role}"]`)!;
  return { ...result, ...handlers, btn };
}

describe('NarrationControls', () => {
  it('primary button starts narration when idle', async () => {
    const { btn, onPlay } = mount({ phase: 'idle' });
    expect(btn('primary').textContent?.trim()).toBe('Play');
    await fireEvent.click(btn('primary'));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('primary button pauses when playing', async () => {
    const { btn, onPause } = mount({ phase: 'playing' });
    expect(btn('primary').textContent?.trim()).toBe('Pause');
    await fireEvent.click(btn('primary'));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('primary button resumes when paused', async () => {
    const { btn, onResume } = mount({ phase: 'paused' });
    expect(btn('primary').textContent?.trim()).toBe('Resume');
    await fireEvent.click(btn('primary'));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('primary button is disabled and inert while loading', async () => {
    const { btn, onPlay, onPause, onResume } = mount({ phase: 'loading' });
    expect(btn('primary').textContent?.trim()).toBe('Preparing…');
    expect(btn('primary').disabled).toBe(true);
    await fireEvent.click(btn('primary'));
    expect(onPlay).not.toHaveBeenCalled();
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
  });

  it('stop is disabled at idle and enabled while playing', () => {
    expect(mount({ phase: 'idle' }).btn('stop').disabled).toBe(true);
    expect(mount({ phase: 'playing' }).btn('stop').disabled).toBe(false);
  });

  it('stop emits onStop', async () => {
    const { btn, onStop } = mount({ phase: 'playing' });
    await fireEvent.click(btn('stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('rate buttons emit their intents and show the current rate', async () => {
    const { btn, onSlower, onFaster, onResetRate } = mount({ phase: 'playing', rate: 1.2 });
    expect(btn('reset-rate').textContent?.trim()).toBe('1.20×');
    await fireEvent.click(btn('slower'));
    await fireEvent.click(btn('faster'));
    await fireEvent.click(btn('reset-rate'));
    expect(onSlower).toHaveBeenCalledTimes(1);
    expect(onFaster).toHaveBeenCalledTimes(1);
    expect(onResetRate).toHaveBeenCalledTimes(1);
  });

  it('slower is disabled at the floor, faster at the ceiling, reset at 1.0', () => {
    expect(mount({ rate: 0.5 }).btn('slower').disabled).toBe(true);
    expect(mount({ rate: 1.6 }).btn('faster').disabled).toBe(true);
    expect(mount({ rate: 1.0 }).btn('reset-rate').disabled).toBe(true);
    expect(mount({ rate: 1.2 }).btn('reset-rate').disabled).toBe(false);
  });
});
