import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ChapterMeasurer from './ChapterMeasurer.svelte';

afterEach(() => cleanup());

// happy-dom computes no layout (scrollHeight and clientHeight are both 0), so
// a real overflow → split cannot be exercised here: every probe "fits" and
// paginate returns []. What CAN be verified is the measurement harness —
// metric copying, probe mount/unmount hygiene, and the no-op result. The
// actual split behavior is pure logic (pagination.test.ts) plus browser
// verification by the practitioner on the dev route.
describe('ChapterMeasurer', () => {
  function renderMeasurer() {
    const rendered = render(ChapterMeasurer);
    const host = rendered.container.querySelector<HTMLElement>('.measure-host');
    if (!host) throw new Error('measure-host did not render');
    const reference = document.createElement('div');
    reference.style.width = '400px';
    reference.style.height = '300px';
    reference.style.lineHeight = '24px';
    reference.style.padding = '0px';
    document.body.appendChild(reference);
    return { ...rendered, host, reference };
  }

  it('returns [] when every probe fits (no layout in happy-dom)', () => {
    const { component, reference } = renderMeasurer();
    const points = component.paginate(reference, 'some chapter text here', []);
    expect(points).toEqual([]);
  });

  it('copies the reference element metrics onto the hidden host', () => {
    const { component, host, reference } = renderMeasurer();
    component.paginate(reference, 'text', []);
    expect(host.style.width).toBe('400px');
    expect(host.style.height).toBe('300px');
    expect(host.style.lineHeight).toBe('24px');
  });

  it('unmounts the probe PageView after paginating', () => {
    const { component, host, reference } = renderMeasurer();
    component.paginate(reference, 'a few words of text', []);
    expect(host.childElementCount).toBe(0);
  });

  it('handles the empty chapter without probing', () => {
    const { component, host, reference } = renderMeasurer();
    expect(component.paginate(reference, '', [])).toEqual([]);
    expect(host.childElementCount).toBe(0);
  });
});
