import { type Database, createDb } from '$lib/db.js';
import { describe, expect, it } from 'vitest';
import { createHandle } from './hooks.server.js';

function makeEvent() {
  return {
    locals: {} as App.Locals,
    request: new Request('http://localhost/'),
  };
}

describe('createHandle', () => {
  it('wires locals.db and locals.dataDir, then returns resolve’s response', async () => {
    const db: Database = createDb(':memory:');
    const handle = createHandle(db, '/tmp/reader-data');
    const event = makeEvent();
    const mockResponse = new Response('ok');

    const result = await handle({
      event: event as any,
      resolve: async () => mockResponse,
    });

    expect(result).toBe(mockResponse);
    expect(event.locals.db).toBe(db);
    expect(event.locals.dataDir).toBe('/tmp/reader-data');
  });
});
