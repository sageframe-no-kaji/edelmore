import { hashPin } from '$lib/auth.js';
import {
  updateDiaryTitle,
  updateFontSize,
  updateJournalFont,
  updatePinHash,
  updateUsername,
  updateVoiceUri,
} from '$lib/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const FONT_SIZE_STEPS = [2.4, 2.8, 3.2, 3.6, 4.0, 4.4];
const JOURNAL_FONTS = ['eb-garamond', 'cedarville-cursive'] as const;

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login');
  return {
    username: locals.user.username,
    font_size: locals.user.font_size,
    journal_font: locals.user.journal_font,
    diary_title: locals.user.diary_title,
  };
};

export const actions: Actions = {
  saveSettings: async ({ request, locals }) => {
    if (!locals.user) redirect(302, '/login');
    const data = await request.formData();

    const username = data.get('username')?.toString().trim() ?? '';
    const diaryTitle = data.get('diary_title')?.toString().trim() ?? '';
    const fontSize = Number(data.get('font_size'));
    const journalFont = data.get('journal_font')?.toString() ?? '';
    const pin = data.get('pin')?.toString() ?? '';
    const confirm = data.get('confirm')?.toString() ?? '';
    // voice_uri: empty string means "use device default" — store as NULL.
    const voiceUriRaw = data.get('voice_uri')?.toString() ?? '';
    const voiceUri = voiceUriRaw === '' ? null : voiceUriRaw;

    if (!username) return fail(400, { error: 'Name cannot be empty' });
    if (username.length > 40) return fail(400, { error: 'Name too long (max 40 chars)' });
    if (!diaryTitle) return fail(400, { error: 'Title cannot be empty' });
    if (diaryTitle.length > 40) return fail(400, { error: 'Title too long (max 40 chars)' });
    if (!FONT_SIZE_STEPS.includes(fontSize)) return fail(400, { error: 'Invalid font size' });
    if (!JOURNAL_FONTS.includes(journalFont as (typeof JOURNAL_FONTS)[number])) {
      return fail(400, { error: 'Invalid journal font' });
    }
    // Validate (and hash) the PIN here, but WRITE it after the other updates:
    // updateUsername can still fail on uniqueness, and the save must not
    // change the PIN while reporting an error.
    let pinHash: string | null = null;
    if (pin.length > 0 || confirm.length > 0) {
      if (!/^\d{4}$/.test(pin)) return fail(400, { error: 'PIN must be exactly 4 digits' });
      if (pin !== confirm) return fail(400, { error: 'PINs do not match' });
      pinHash = await hashPin(pin);
    }

    try {
      updateUsername(locals.db, locals.user.id, username);
      updateDiaryTitle(locals.db, locals.user.id, diaryTitle);
      updateFontSize(locals.db, locals.user.id, fontSize);
      updateJournalFont(locals.db, locals.user.id, journalFont);
      updateVoiceUri(locals.db, locals.user.id, voiceUri);
      if (pinHash) updatePinHash(locals.db, locals.user.id, pinHash);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE constraint failed: users.username')) {
        return fail(400, { error: 'That display name is already in use.' });
      }
      return fail(400, { error: 'Could not save settings. Please try again.' });
    }
    return { success: true };
  },

  updateName: async ({ request, locals }) => {
    if (!locals.user) redirect(302, '/login');
    const data = await request.formData();
    const username = data.get('username')?.toString().trim() ?? '';
    if (!username) return fail(400, { error: 'Name cannot be empty' });
    if (username.length > 40) return fail(400, { error: 'Name too long (max 40 chars)' });
    updateUsername(locals.db, locals.user.id, username);
    return { success: true };
  },

  updateDiaryTitle: async ({ request, locals }) => {
    if (!locals.user) redirect(302, '/login');
    const data = await request.formData();
    const title = data.get('diary_title')?.toString().trim() ?? '';
    if (!title) return fail(400, { error: 'Title cannot be empty' });
    if (title.length > 40) return fail(400, { error: 'Title too long (max 40 chars)' });
    updateDiaryTitle(locals.db, locals.user.id, title);
    return { success: true };
  },

  updateFontSize: async ({ request, locals }) => {
    if (!locals.user) redirect(302, '/login');
    const data = await request.formData();
    const size = Number(data.get('font_size'));
    if (!FONT_SIZE_STEPS.includes(size)) return fail(400, { error: 'Invalid font size' });
    updateFontSize(locals.db, locals.user.id, size);
    return { success: true };
  },

  updatePin: async ({ request, locals }) => {
    if (!locals.user) redirect(302, '/login');
    const data = await request.formData();
    const pin = data.get('pin')?.toString() ?? '';
    const confirm = data.get('confirm')?.toString() ?? '';
    if (!/^\d{4}$/.test(pin)) return fail(400, { error: 'PIN must be exactly 4 digits' });
    if (pin !== confirm) return fail(400, { error: 'PINs do not match' });
    const hash = await hashPin(pin);
    updatePinHash(locals.db, locals.user.id, hash);
    return { success: true };
  },
};
