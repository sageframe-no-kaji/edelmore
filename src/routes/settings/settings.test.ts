import { type Database, createDb, createUser, getUserById } from '$lib/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { actions, load } from './+page.server.js';

function freshDb(): Database {
  return createDb(':memory:');
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const defaultUser = (userId: number) => ({
  id: userId,
  username: 'Iona',
  cover_id: 'meadow',
  font_size: 3.4,
  journal_font: 'eb-garamond',
  diary_title: 'D I A R Y',
});

describe('load', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('redirects to /login when unauthenticated', async () => {
    let threw: unknown;
    try {
      await load({ locals: { db, user: undefined } } as any);
    } catch (e) {
      threw = e;
    }
    expect((threw as { status?: number })?.status).toBe(302);
  });

  it('returns username, font_size, journal_font, and diary_title', async () => {
    const result = (await load({
      locals: { db, user: defaultUser(userId) },
    } as any)) as {
      username: string;
      font_size: number;
      journal_font: string;
      diary_title: string;
    };

    expect(result.username).toBe('Iona');
    expect(result.font_size).toBe(3.4);
    expect(result.journal_font).toBe('eb-garamond');
    expect(result.diary_title).toBe('D I A R Y');
  });
});

describe('actions.saveSettings', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('updates all settings in one submission', async () => {
    const result = await actions.saveSettings({
      request: {
        formData: async () =>
          makeFormData({
            username: 'Nova',
            diary_title: 'Moon Notes',
            font_size: '4.4',
            journal_font: 'cedarville-cursive',
            pin: '',
            confirm: '',
          }),
      },
      locals: { db, user: defaultUser(userId) },
    } as any);

    expect(result?.success).toBe(true);
    expect(getUserById(db, userId)).toMatchObject({
      username: 'Nova',
      diary_title: 'Moon Notes',
      font_size: 4.4,
      journal_font: 'cedarville-cursive',
    });
  });
});

describe('actions.updateName', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('redirects to /login when unauthenticated', async () => {
    let threw: unknown;
    try {
      await actions.updateName({
        request: { formData: async () => makeFormData({ username: 'Nova' }) },
        locals: { db, user: undefined },
      } as any);
    } catch (e) {
      threw = e;
    }
    expect((threw as { status?: number })?.status).toBe(302);
  });

  it('returns 400 for empty name', async () => {
    const result = await actions.updateName({
      request: { formData: async () => makeFormData({ username: '   ' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('updates the username', async () => {
    const result = await actions.updateName({
      request: { formData: async () => makeFormData({ username: 'Nova' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.success).toBe(true);
    expect(getUserById(db, userId)?.username).toBe('Nova');
  });
});

describe('actions.updateDiaryTitle', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('returns 400 for empty title', async () => {
    const result = await actions.updateDiaryTitle({
      request: { formData: async () => makeFormData({ diary_title: '' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for title longer than 40 chars', async () => {
    const result = await actions.updateDiaryTitle({
      request: { formData: async () => makeFormData({ diary_title: 'A'.repeat(41) }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('updates the diary title', async () => {
    const result = await actions.updateDiaryTitle({
      request: { formData: async () => makeFormData({ diary_title: 'My Diary' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.success).toBe(true);
    expect(getUserById(db, userId)?.diary_title).toBe('My Diary');
  });
});

describe('actions.updateFontSize', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('returns 400 for an invalid step', async () => {
    const result = await actions.updateFontSize({
      request: { formData: async () => makeFormData({ font_size: '99' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('updates the font size', async () => {
    const result = await actions.updateFontSize({
      request: { formData: async () => makeFormData({ font_size: '4.4' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.success).toBe(true);
    expect(getUserById(db, userId)?.font_size).toBe(4.4);
  });
});

describe('actions.updatePin', () => {
  let db: Database;
  let userId: number;

  beforeEach(() => {
    db = freshDb();
    userId = createUser(db, 'Iona', 'hash');
  });

  it('returns 400 when PINs do not match', async () => {
    const result = await actions.updatePin({
      request: { formData: async () => makeFormData({ pin: '1234', confirm: '5678' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns 400 for non-4-digit PIN', async () => {
    const result = await actions.updatePin({
      request: { formData: async () => makeFormData({ pin: '123', confirm: '123' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.status).toBe(400);
  });

  it('returns success for a valid PIN change', async () => {
    const result = await actions.updatePin({
      request: { formData: async () => makeFormData({ pin: '9999', confirm: '9999' }) },
      locals: { db, user: defaultUser(userId) },
    } as any);
    expect(result?.success).toBe(true);
  });
});
