import { type Database, createDb } from '$lib/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './+server.js';

describe('/api/people', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  function makeEvent(body?: unknown) {
    return {
      locals: { db },
      request: { json: async () => body },
    };
  }

  it('GET returns an empty roster to start', async () => {
    expect(await (await GET(makeEvent() as any)).json()).toEqual({ people: [] });
  });

  it('POST adds a new person, 201, and GET lists the name-sorted roster', async () => {
    const res = await POST(makeEvent({ name: 'Marlowe' }) as any);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: expect.any(Number), name: 'Marlowe' });

    await POST(makeEvent({ name: 'Iona' }) as any);
    expect(await (await GET(makeEvent() as any)).json()).toEqual({
      people: [
        { id: expect.any(Number), name: 'Iona' },
        { id: expect.any(Number), name: 'Marlowe' },
      ],
    });
  });

  it('POST is idempotent by name: 200 and the same row on a repeat', async () => {
    const first = await (await POST(makeEvent({ name: 'Iona' }) as any)).json();
    const res = await POST(makeEvent({ name: 'Iona' }) as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(first);
    expect((await (await GET(makeEvent() as any)).json()).people).toHaveLength(1);
  });

  it('POST trims whitespace (attribution label, not credential)', async () => {
    const res = await POST(makeEvent({ name: '  Iona  ' }) as any);
    expect(await res.json()).toEqual({ id: expect.any(Number), name: 'Iona' });
  });

  it('POST rejects an invalid name with 400', async () => {
    for (const name of [undefined, '', '   ', 'a'.repeat(41), 7]) {
      await expect(POST(makeEvent({ name }) as any)).rejects.toMatchObject({ status: 400 });
    }
    expect((await (await GET(makeEvent() as any)).json()).people).toEqual([]);
  });
});
