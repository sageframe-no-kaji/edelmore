import { cleanup, render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Spread from './Spread.svelte';

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

describe('Spread page-edge stacks', () => {
  it('renders no stack leaves when spreadIndex and spreadCount are 0', () => {
    const { container } = render(Spread, {
      props: { ...baseProps, spreadIndex: 0, spreadCount: 0 },
    });
    expect(container.querySelectorAll('.stack-leaf')).toHaveLength(0);
  });

  it('renders left stack leaves equal to spreadIndex (up to MAX_STACK)', () => {
    const { container } = render(Spread, {
      props: { ...baseProps, spreadIndex: 3, spreadCount: 10 },
    });
    expect(container.querySelectorAll('.stack-left .stack-leaf')).toHaveLength(3);
  });

  it('renders right stack leaves equal to remaining spreads', () => {
    const { container } = render(Spread, {
      props: { ...baseProps, spreadIndex: 3, spreadCount: 10 },
    });
    // 10 - 3 - 1 = 6 remaining
    expect(container.querySelectorAll('.stack-right .stack-leaf')).toHaveLength(6);
  });

  it('caps stack layers at MAX_STACK (12) regardless of spreadCount', () => {
    const { container } = render(Spread, {
      props: { ...baseProps, spreadIndex: 500, spreadCount: 1000 },
    });
    expect(container.querySelectorAll('.stack-left .stack-leaf')).toHaveLength(12);
    expect(container.querySelectorAll('.stack-right .stack-leaf')).toHaveLength(12);
  });
});
