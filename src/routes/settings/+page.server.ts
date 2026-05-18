import { hashPin } from '$lib/auth.js';
import { updateDiaryTitle, updateFontSize, updatePinHash, updateUsername } from '$lib/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const FONT_SIZE_STEPS = [2.4, 2.8, 3.2, 3.6, 4.0, 4.4];

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login');
  return {
    username: locals.user.username,
    font_size: locals.user.font_size,
    diary_title: locals.user.diary_title,
  };
};

export const actions: Actions = {
  updateName: async ({ request, locals }) => {
    if (!locals.user) redirect(302, '/login');
    const data = await request.formData();
    const username = data.get('username')?.toString().trim() ?? '';
    if (!username) return fail(400, { error: 'Name cannot be empty' });
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
