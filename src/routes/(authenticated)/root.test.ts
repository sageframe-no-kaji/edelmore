import { isValidDate } from '$lib/dates.js';
import { describe, expect, it } from 'vitest';
import { load } from './+page.server.js';

describe('(authenticated) root redirect', () => {
  it('redirects with status 302 to a valid YYYY-MM-DD path', async () => {
    let redirectLocation = '';
    try {
      await (load as any)({});
    } catch (e: any) {
      redirectLocation = e.location ?? '';
    }
    expect(redirectLocation).toMatch(/^\/\d{4}-\d{2}-\d{2}$/);
    expect(isValidDate(redirectLocation.slice(1))).toBe(true);
  });
});
