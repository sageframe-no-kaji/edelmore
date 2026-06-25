import { Spread } from '@edelmore/book';
import { cleanup, render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => cleanup());

const baseProps = { onFlipPrev: vi.fn(), onFlipNext: vi.fn() };

describe('Spread click zones', () => {
  it('does not render zones when prevZonePct and nextZonePct are 0 (default)', () => {
    render(Spread, { props: baseProps });
    expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('renders prev zone when prevZonePct > 0', () => {
    render(Spread, { props: { ...baseProps, prevZonePct: 50 } });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeTruthy();
  });

  it('renders next zone when nextZonePct > 0', () => {
    render(Spread, { props: { ...baseProps, nextZonePct: 50 } });
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy();
  });

  it('can leave a top dead-zone on the next-page click target', () => {
    render(Spread, { props: { ...baseProps, nextZonePct: 50, nextZoneTopDeadPct: 33.333 } });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(next.getAttribute('style')).toContain('top: 33.333%');
    expect(next.getAttribute('style')).toContain('height: 66.667%');
  });

  it('calls onFlipPrev immediately when prev zone is clicked', async () => {
    const onFlipPrev = vi.fn();
    render(Spread, { props: { ...baseProps, onFlipPrev, prevZonePct: 50 } });
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onFlipPrev).toHaveBeenCalledOnce();
  });

  it('calls onFlipNext immediately when next zone is clicked', async () => {
    const onFlipNext = vi.fn();
    render(Spread, { props: { ...baseProps, onFlipNext, nextZonePct: 50 } });
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onFlipNext).toHaveBeenCalledOnce();
  });

  it('disables the prev zone button when canFlipPrev is false', () => {
    render(Spread, { props: { ...baseProps, prevZonePct: 50, canFlipPrev: false } });
    expect(
      (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('disables the next zone button when canFlipNext is false', () => {
    render(Spread, { props: { ...baseProps, nextZonePct: 50, canFlipNext: false } });
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('enables zone buttons when can flags are true', () => {
    render(Spread, {
      props: {
        ...baseProps,
        prevZonePct: 50,
        nextZonePct: 50,
        canFlipPrev: true,
        canFlipNext: true,
      },
    });
    expect(
      (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled
    ).toBe(false);
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});

// Stacks moved to the persistent shell in +layout.svelte (ho-03 AT-01).
// Spread no longer renders any per-leaf DOM for page-edge stacks.
describe('Spread page-edge stacks', () => {
  it('accepts spreadIndex and spreadCount props without error', () => {
    expect(() =>
      render(Spread, { props: { ...baseProps, spreadIndex: 3, spreadCount: 10 } })
    ).not.toThrow();
  });

  it('renders no stack-leaf DOM regardless of spreadIndex or spreadCount', () => {
    const { container } = render(Spread, {
      props: { ...baseProps, spreadIndex: 3, spreadCount: 10 },
    });
    expect(container.querySelectorAll('.stack-leaf')).toHaveLength(0);
    expect(container.querySelectorAll('.stack-left')).toHaveLength(0);
    expect(container.querySelectorAll('.stack-right')).toHaveLength(0);
  });
});
