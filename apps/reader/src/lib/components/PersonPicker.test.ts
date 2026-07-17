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

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
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
    expect(onPerson).toHaveBeenCalledWith('Iona'); // trimmed
    expect(localStorage.getItem('reader.person')).toBe('Iona');
  });

  it('commits on Enter', async () => {
    const onPerson = vi.fn();
    const { getByPlaceholderText } = render(PersonPicker, { props: { person: null, onPerson } });
    const input = getByPlaceholderText('Your name');
    await fireEvent.input(input, { target: { value: 'Isla' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPerson).toHaveBeenCalledWith('Isla');
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
    expect(onPerson).toHaveBeenLastCalledWith('Iona');
    expect(localStorage.getItem('reader.person')).toBe('Iona');
  });
});
