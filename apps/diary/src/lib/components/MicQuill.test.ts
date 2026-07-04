import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MicQuill from './MicQuill.svelte';

// Minimal MediaRecorder stand-in: enough surface for start/stop/track release.
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

function mockMicAccess() {
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }],
  });
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  return { stopTrack, getUserMedia };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('cancels the recording when the instance that started it unmounts', async () => {
    const { stopTrack } = mockMicAccess();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const oninsert = vi.fn();
    const owner = render(MicQuill, { props: { oninsert } });
    const watcher = render(MicQuill, { props: { oninsert: vi.fn() } });
    const ownerButton = within(owner.container).getByRole('button');
    const watcherButton = within(watcher.container).getByRole('button');

    await fireEvent.click(ownerButton);
    await waitFor(() => {
      expect(watcherButton.classList.contains('is-recording')).toBe(true);
    });

    owner.unmount();

    // The shared state returns to idle: recorder stopped, tracks released.
    await waitFor(() => {
      expect(watcherButton.classList.contains('is-recording')).toBe(false);
      expect(watcherButton.getAttribute('aria-label')).toBe('Start voice writing');
    });
    expect(stopTrack).toHaveBeenCalled();
    // Cancelled recording never transcribes — the destroyed oninsert can't fire.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(oninsert).not.toHaveBeenCalled();
    watcher.unmount();
  });

  it('leaves a recording owned by another instance alone on unmount', async () => {
    const { stopTrack } = mockMicAccess();

    const owner = render(MicQuill, { props: { oninsert: vi.fn() } });
    const bystander = render(MicQuill, { props: { oninsert: vi.fn() } });
    const ownerButton = within(owner.container).getByRole('button');

    await fireEvent.click(ownerButton);
    await waitFor(() => {
      expect(ownerButton.classList.contains('is-recording')).toBe(true);
    });

    bystander.unmount();

    // Still recording — the bystander's unmount must not tear it down.
    expect(ownerButton.classList.contains('is-recording')).toBe(true);
    expect(stopTrack).not.toHaveBeenCalled();

    // Clean up for the following tests.
    owner.unmount();
    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
  });

  it('shares recording state across rendered quills', async () => {
    mockMicAccess();

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

  it('shows the error message in a status element while in error phase', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    const { container } = render(MicQuill, { props: { oninsert: vi.fn() } });
    const button = within(container).getByRole('button');
    // The shared store may still hold the previous test's error phase — wait
    // out its display window so start() isn't gated.
    await waitFor(() => expect(button.getAttribute('aria-label')).toBe('Start voice writing'), {
      timeout: 4000,
    });

    await fireEvent.click(button);
    await waitFor(() => {
      const status = within(container).getByRole('status');
      expect(status.textContent).toContain('Microphone access is off');
    });
  });
});
