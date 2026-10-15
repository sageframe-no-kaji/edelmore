import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonPicker from './PersonPicker.svelte';

// Node 25's experimental `localStorage` global shadows happy-dom's and is inert
// without --localstorage-file; a working in-memory Storage keeps the picker's
// (browser-correct) localStorage calls testable.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  } as Storage;
}

interface RosterPerson {
  id: number;
  name: string;
}

/**
 * A fetch stub for `/api/people`: GET returns the given roster; POST echoes
 * back `{ id, name: <trimmed body.name> }`, standing in for the server's
 * idempotent-create — good enough to prove the client uses the SERVER's
 * returned name, not just its own trimmed draft, without re-implementing
 * `people.name UNIQUE` dedup here.
 */
function stubFetch(roster: RosterPerson[] = [], postName?: string) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url) === '/api/people' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ people: roster }), { status: 200 });
    }
    if (String(url) === '/api/people' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { name: string };
      return new Response(JSON.stringify({ id: 99, name: postName ?? body.name.trim() }), {
        status: 201,
      });
    }
    return new Response('no', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  stubFetch(); // sane default: empty roster, POST echoes the trimmed name
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('PersonPicker', () => {
  it('prompts for a name when none is stored', async () => {
    const onPerson = vi.fn();
    const { getByPlaceholderText } = render(PersonPicker, { props: { person: null, onPerson } });
    await waitFor(() => expect(getByPlaceholderText('Your name')).not.toBeNull());
    expect(onPerson).not.toHaveBeenCalled();
  });

  it('reports and persists a name that is entered', async () => {
    const onPerson = vi.fn();
    const { getByPlaceholderText, getByText } = render(PersonPicker, {
      props: { person: null, onPerson },
    });
    await fireEvent.input(getByPlaceholderText('Your name'), { target: { value: '  Iona  ' } });
    await fireEvent.click(getByText('Set'));
    await waitFor(() => expect(onPerson).toHaveBeenCalledWith('Iona')); // trimmed
    expect(localStorage.getItem('reader.person')).toBe('Iona');
  });

  it('commits on Enter', async () => {
    const onPerson = vi.fn();
    const { getByPlaceholderText } = render(PersonPicker, { props: { person: null, onPerson } });
    const input = getByPlaceholderText('Your name');
    await fireEvent.input(input, { target: { value: 'Isla' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onPerson).toHaveBeenCalledWith('Isla'));
  });

  it('ignores a blank name', async () => {
    const onPerson = vi.fn();
    const { getByPlaceholderText, getByText } = render(PersonPicker, {
      props: { person: null, onPerson },
    });
    await fireEvent.input(getByPlaceholderText('Your name'), { target: { value: '   ' } });
    const setButton = getByText('Set') as HTMLButtonElement;
    expect(setButton.disabled).toBe(true);
    await fireEvent.click(setButton);
    expect(onPerson).not.toHaveBeenCalled();
  });

  it('reports a stored name on mount without prompting', async () => {
    localStorage.setItem('reader.person', 'Tyro');
    const onPerson = vi.fn();
    const { queryByPlaceholderText } = render(PersonPicker, { props: { person: null, onPerson } });
    await waitFor(() => expect(onPerson).toHaveBeenCalledWith('Tyro'));
    expect(queryByPlaceholderText('Your name')).toBeNull();
  });

  it('can switch readers via the change control', async () => {
    localStorage.setItem('reader.person', 'Tyro');
    const onPerson = vi.fn();
    const { getByText, getByDisplayValue } = render(PersonPicker, {
      props: { person: 'Tyro', onPerson },
    });
    await waitFor(() => expect(getByText('Change')).not.toBeNull());
    await fireEvent.click(getByText('Change'));
    // The field pre-fills with the current name.
    const input = getByDisplayValue('Tyro');
    await fireEvent.input(input, { target: { value: 'Iona' } });
    await fireEvent.click(getByText('Set'));
    await waitFor(() => expect(onPerson).toHaveBeenLastCalledWith('Iona'));
    expect(localStorage.getItem('reader.person')).toBe('Iona');
  });

  it('loads and shows the shared roster when editing', async () => {
    stubFetch([
      { id: 1, name: 'Iona' },
      { id: 2, name: 'Marlowe' },
    ]);
    const onPerson = vi.fn();
    const { getByText } = render(PersonPicker, { props: { person: null, onPerson } });
    await waitFor(() => expect(getByText('Iona')).not.toBeNull());
    expect(getByText('Marlowe')).not.toBeNull();
  });

  it('choosing an existing person from the roster selects them without a POST', async () => {
    const { fetchMock } = stubFetch([{ id: 1, name: 'Iona' }]);
    const onPerson = vi.fn();
    const { getByText } = render(PersonPicker, { props: { person: null, onPerson } });
    await waitFor(() => expect(getByText('Iona')).not.toBeNull());
    await fireEvent.click(getByText('Iona'));

    expect(onPerson).toHaveBeenCalledWith('Iona');
    expect(localStorage.getItem('reader.person')).toBe('Iona');
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('adding someone new POSTs the trimmed name and selects the server’s canonical name', async () => {
    // The server reports a differently-cased existing match — the picker
    // must select what the SERVER returned, not its own local draft.
    const { calls } = stubFetch([], 'Iona');
    const onPerson = vi.fn();
    const { getByPlaceholderText, getByText } = render(PersonPicker, {
      props: { person: null, onPerson },
    });
    await fireEvent.input(getByPlaceholderText('Your name'), { target: { value: '  iona  ' } });
    await fireEvent.click(getByText('Set'));

    await waitFor(() => expect(onPerson).toHaveBeenCalledWith('Iona'));
    const post = calls.find((c) => c.init?.method === 'POST');
    expect(post && JSON.parse(post.init?.body as string)).toEqual({ name: 'iona' }); // trimmed before send
  });

  it('falls back to a local-only commit when the add-person POST fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url) === '/api/people' && (!init || init.method === undefined)) {
          return new Response(JSON.stringify({ people: [] }), { status: 200 });
        }
        throw new Error('network down');
      })
    );
    const onPerson = vi.fn();
    const { getByPlaceholderText, getByText } = render(PersonPicker, {
      props: { person: null, onPerson },
    });
    await fireEvent.input(getByPlaceholderText('Your name'), { target: { value: 'Isla' } });
    await fireEvent.click(getByText('Set'));

    await waitFor(() => expect(onPerson).toHaveBeenCalledWith('Isla'));
    expect(localStorage.getItem('reader.person')).toBe('Isla');
  });
});
