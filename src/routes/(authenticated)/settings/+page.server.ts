import { COVERS } from '$lib/covers.js';
import { updateUserCoverId } from '$lib/db.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
  const user = locals.user!;
  return {
    coverId: user.cover_id,
    username: user.username,
    covers: COVERS,
  };
};

export const actions: Actions = {
  select: async ({ request, locals }) => {
    // biome-ignore lint/style/noNonNullAssertion: layout guard guarantees user is present
    const user = locals.user!;
    const data = await request.formData();
    const coverId = data.get('cover_id')?.toString() ?? '';
    if (!COVERS.find((c) => c.id === coverId)) return fail(400, { error: 'Invalid cover' });
    updateUserCoverId(locals.db, user.id, coverId);
    redirect(302, '/');
  },
};
