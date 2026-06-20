import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MicQuill from './MicQuill.svelte';

describe('MicQuill', () => {
  it('renders a button in idle state with the start-recording label', () => {
    const { getByRole } = render(MicQuill, { props: { oninsert: vi.fn() } });
    const button = getByRole('button');
    expect(button.getAttribute('aria-label')).toBe('Start voice writing');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('renders an SVG quill icon', () => {
    const { container } = render(MicQuill, { props: { oninsert: vi.fn() } });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.querySelector('.quill-feather')).not.toBeNull();
    expect(container.querySelector('.quill-shaft')).not.toBeNull();
    expect(container.querySelector('.quill-nib')).not.toBeNull();
  });

  it('shares recording state across rendered quills', async () => {
    class MockMediaRecorder extends EventTarget {
      state: RecordingState = 'inactive';
      stream: MediaStream;

      constructor(stream: MediaStream) {
        super();
        this.stream = stream;
      }

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.dispatchEvent(new Event('stop'));
      }
    }

    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const first = render(MicQuill, { props: { oninsert: vi.fn() } });
    const second = render(MicQuill, { props: { oninsert: vi.fn() } });
    const firstButton = within(first.container).getByRole('button');
    const secondButton = within(second.container).getByRole('button');

    await fireEvent.click(firstButton);
    await waitFor(() => {
      expect(firstButton.classList.contains('is-recording')).toBe(true);
      expect(secondButton.classList.contains('is-recording')).toBe(true);
      expect(firstButton.getAttribute('aria-label')).toBe('Stop voice writing (hold to cancel)');
      expect(secondButton.getAttribute('aria-label')).toBe('Stop voice writing (hold to cancel)');
    });

    await fireEvent.click(secondButton);
    await waitFor(() => {
      expect(firstButton.classList.contains('is-recording')).toBe(false);
      expect(secondButton.classList.contains('is-recording')).toBe(false);
      expect(firstButton.getAttribute('aria-label')).not.toBe(
        'Stop voice writing (hold to cancel)'
      );
      expect(secondButton.getAttribute('aria-label')).not.toBe(
        'Stop voice writing (hold to cancel)'
      );
    });
  });
});
