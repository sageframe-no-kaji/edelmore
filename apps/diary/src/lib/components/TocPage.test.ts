import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TocPage from './TocPage.svelte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  restoreGeometry();
});

const entries = [
  { entry_date: '2026-05-14', preview: 'Today.' },
  { entry_date: '2026-05-13', preview: 'Yesterday.' },
];

// ── Geometry mocking ────────────────────────────────────────────────────────
// happy-dom reports zero layout everywhere; these prototype overrides give the
// measurement code a deterministic geometry: every <li> is ITEM_HEIGHT tall,
// stacked, and the <ul> is `listHeight` tall.
const ITEM_HEIGHT = 30;
let listHeight = 0;

const savedDescriptors = new Map<string, PropertyDescriptor | undefined>();

function mockGeometry() {
  for (const prop of ['clientHeight', 'offsetTop', 'offsetHeight']) {
    savedDescriptors.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop));
  }
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'UL' ? listHeight : 1000;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => ITEM_HEIGHT,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const siblings = this.parentElement ? Array.from(this.parentElement.children) : [];
      return Math.max(0, siblings.indexOf(this)) * ITEM_HEIGHT;
    },
  });
}

function restoreGeometry() {
  for (const [prop, descriptor] of savedDescriptors) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
  }
  savedDescriptors.clear();
}

// Captures ResizeObserver callbacks so tests can simulate a container resize.
function stubResizeObserver(): Array<() => void> {
  const fires: Array<() => void> = [];
  class MockResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      fires.push(() => cb([], this as unknown as ResizeObserver));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  return fires;
}

describe('TocPage', () => {
  it('calls onNavigate with the entry date when a row is clicked', async () => {
    const onNavigate = vi.fn();
    const { getAllByRole } = render(TocPage, { entries, onNavigate });
    const buttons = getAllByRole('button');
    buttons[0].click();
    expect(onNavigate).toHaveBeenCalledWith('2026-05-14');
  });

  it('renders entries newest first', () => {
    const { getAllByRole } = render(TocPage, { entries, onNavigate: vi.fn() });
    const buttons = getAllByRole('button');
    expect(buttons[0].textContent).toContain('May 14');
    expect(buttons[1].textContent).toContain('May 13');
  });

  it('renders empty state when entries is empty', () => {
    const { getByText } = render(TocPage, { entries: [], onNavigate: vi.fn() });
    expect(getByText('No entries yet.')).toBeTruthy();
  });

  it('renders all entry rows', () => {
    const { getAllByRole } = render(TocPage, { entries, onNavigate: vi.fn() });
    expect(getAllByRole('button')).toHaveLength(2);
  });

  it('trims rows that overflow the measured container', async () => {
    const fireResize = stubResizeObserver();
    mockGeometry();
    listHeight = ITEM_HEIGHT; // room for exactly one row
    const { getAllByRole } = render(TocPage, { entries, onNavigate: vi.fn() });
    for (const fire of fireResize) fire();
    await waitFor(() => expect(getAllByRole('button')).toHaveLength(1));
  });

  it('recovers trimmed rows after the container grows', async () => {
    const fireResize = stubResizeObserver();
    mockGeometry();
    listHeight = ITEM_HEIGHT; // shrink to one row first
    const { getAllByRole } = render(TocPage, { entries, onNavigate: vi.fn() });
    for (const fire of fireResize) fire();
    await waitFor(() => expect(getAllByRole('button')).toHaveLength(1));

    listHeight = ITEM_HEIGHT * 10; // grow — the count must climb back
    for (const fire of fireResize) fire();
    await waitFor(() => expect(getAllByRole('button')).toHaveLength(2));
  });

  it('shows newly added entries when the entries prop grows', async () => {
    stubResizeObserver();
    mockGeometry();
    listHeight = ITEM_HEIGHT * 10;
    const { getAllByRole, rerender } = render(TocPage, { entries, onNavigate: vi.fn() });
    await waitFor(() => expect(getAllByRole('button')).toHaveLength(2));

    await rerender({ entries: [...entries, { entry_date: '2026-05-12', preview: 'Older.' }] });
    await waitFor(() => expect(getAllByRole('button')).toHaveLength(3));
  });
});
