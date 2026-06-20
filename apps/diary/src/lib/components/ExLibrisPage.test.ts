import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ExLibrisPage from './ExLibrisPage.svelte';

afterEach(() => cleanup());

describe('ExLibrisPage', () => {
  it('renders the username', () => {
    render(ExLibrisPage, { username: 'Elspeth' });
    expect(screen.getByText('Elspeth')).toBeTruthy();
  });
});
