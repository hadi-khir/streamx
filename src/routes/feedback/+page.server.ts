import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { feedback } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const MAX_MESSAGE = 5000;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	return {
		from: url.searchParams.get('from') ?? '',
		reports: db
			.select()
			.from(feedback)
			.where(eq(feedback.userId, user.id))
			.orderBy(desc(feedback.id))
			.all()
	};
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		const user = locals.user!;
		const form = await request.formData();
		const kind = String(form.get('kind') ?? '');
		const message = String(form.get('message') ?? '').trim();
		const page = String(form.get('page') ?? '').slice(0, 500);

		if (!['bug', 'idea'].includes(kind)) return fail(400, { error: 'Pick a report type' });
		if (!message) return fail(400, { error: 'Describe the bug or idea first' });
		if (message.length > MAX_MESSAGE) {
			return fail(400, { error: `Keep it under ${MAX_MESSAGE} characters` });
		}

		db.insert(feedback)
			.values({
				userId: user.id,
				kind,
				message,
				page: page || null,
				userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null
			})
			.run();
		return { success: 'Report saved' };
	},

	status: async ({ locals, request }) => {
		const user = locals.user!;
		const form = await request.formData();
		const id = Number(form.get('id'));
		const status = String(form.get('status') ?? '');
		if (!['open', 'done'].includes(status)) return fail(400, { error: 'Invalid status' });

		db.update(feedback)
			.set({ status })
			.where(and(eq(feedback.id, id), eq(feedback.userId, user.id)))
			.run();
	}
};
