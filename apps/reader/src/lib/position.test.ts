import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ShelfBook,
  createPositionSaver,
  fetchShelf,
  pickRestore,
  positionForBook,
  putPosition,
} from './position';

function book(id: string, positions: ShelfBook['positions']): ShelfBook {
  return { id, title: id, author: null, cover: null, addedBy: 'someone', positions };
}

const shelf: ShelfBook[] = [
  book('alice', [
    { person: 'iona', chapterIdx: 1, charOffset: 40, updatedAt: '2026-07-10T00:00:00Z' },
    { person: 'isla', chapterIdx: 0, charOffset: 5, updatedAt: '2026-07-15T00:00:00Z' },
  ]),
  book('wind', [
    { person: 'iona', chapterIdx: 3, charOffset: 900, updatedAt: '2026-07-14T00:00:00Z' },
  ]),
];

describe('fetchShelf', () => {
  it('returns the books array from GET /api/books', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ books: shelf }), { status: 200 })
    ) as unknown as typeof fetch;
    expect(await fetchShelf(fetchMock)).toEqual(shelf);
    expect(fetchMock).toHaveBeenCalledWith('/api/books');
  });
  it('throws on a non-ok response', async () => {
    const fetchMock = vi.fn(
      async () => new Response('no', { status: 500 })
    ) as unknown as typeof fetch;
    await expect(fetchShelf(fetchMock)).rejects.toThrow('HTTP 500');
  });
});

describe('positionForBook', () => {
  it("finds a person's position on a specific book", () => {
    expect(positionForBook(shelf, 'alice', 'iona')).toEqual({ chapterIdx: 1, charOffset: 40 });
  });
  it('returns null when the person has no position on that book', () => {
    expect(positionForBook(shelf, 'wind', 'isla')).toBeNull();
  });
  it('returns null for an unknown book', () => {
    expect(positionForBook(shelf, 'ghost', 'iona')).toBeNull();
  });
});

describe('pickRestore', () => {
  it('picks the most recently updated position across the shelf', () => {
    // iona: alice@07-10 vs wind@07-14 → wind wins.
    expect(pickRestore(shelf, 'iona')).toEqual({ bookId: 'wind', chapterIdx: 3, charOffset: 900 });
  });
  it('restores a single-book reader to that book', () => {
    expect(pickRestore(shelf, 'isla')).toEqual({ bookId: 'alice', chapterIdx: 0, charOffset: 5 });
  });
  it('returns null when the person has never read anything', () => {
    expect(pickRestore(shelf, 'nobody')).toBeNull();
  });
});

describe('putPosition', () => {
  it('PUTs the position payload to the book position endpoint', async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 200 })
    ) as unknown as typeof fetch;
    await putPosition('alice', 'iona', { chapterIdx: 2, charOffset: 100 }, fetchMock);
    expect(fetchMock).toHaveBeenCalledWith('/api/books/alice/position', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person: 'iona', chapterIdx: 2, charOffset: 100 }),
      keepalive: false,
    });
  });
  it('sets keepalive when asked (pagehide / close)', async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 200 })
    ) as unknown as typeof fetch;
    await putPosition('alice', 'iona', { chapterIdx: 0, charOffset: 0 }, fetchMock, true);
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].keepalive).toBe(
      true
    );
  });
});

describe('createPositionSaver', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const target = (charOffset: number) => ({
    bookId: 'alice',
    person: 'iona',
    pos: { chapterIdx: 0, charOffset },
  });

  it('debounces a burst of saves into a single settled write', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 200 })
    ) as unknown as typeof fetch;
    const saver = createPositionSaver({ delayMs: 1000, fetchFn: fetchMock });
    saver.save(target(10));
    saver.save(target(20));
    saver.save(target(30));
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The last target wins, sent without keepalive.
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).charOffset).toBe(30);
    expect(init.keepalive).toBe(false);
  });

  it('flush sends the pending save immediately, with keepalive', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 200 })
    ) as unknown as typeof fetch;
    const saver = createPositionSaver({ delayMs: 1000, fetchFn: fetchMock });
    saver.save(target(50));
    saver.flush();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.keepalive).toBe(true);
    // The debounce timer must not also fire.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending is a no-op', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 200 })
    ) as unknown as typeof fetch;
    const saver = createPositionSaver({ fetchFn: fetchMock });
    saver.flush();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancel drops the pending save without sending', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 200 })
    ) as unknown as typeof fetch;
    const saver = createPositionSaver({ delayMs: 1000, fetchFn: fetchMock });
    saver.save(target(70));
    saver.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a failed PUT (fire-and-forget)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const saver = createPositionSaver({ delayMs: 10, fetchFn: fetchMock });
    saver.save(target(1));
    await vi.advanceTimersByTimeAsync(10);
    // No unhandled rejection; the saver keeps working.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
