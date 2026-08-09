import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pinnedCategories } from '$lib/server/db/schema';
import { requireConnectionApi } from '$lib/server/connections';
import type { RequestHandler } from './$types';

/** Toggle a pinned category. Returns { pinned: boolean }. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const connectionId = Number(body.connectionId);
	const contentType = String(body.contentType ?? '');
	const categoryId = String(body.categoryId ?? '');
	if (!connectionId || !categoryId || !['live', 'vod', 'series'].includes(contentType)) {
		error(400, 'Invalid pin payload');
	}
	requireConnectionApi(user, connectionId);

	const where = and(
		eq(pinnedCategories.userId, user.id),
		eq(pinnedCategories.connectionId, connectionId),
		eq(pinnedCategories.contentType, contentType),
		eq(pinnedCategories.categoryId, categoryId)
	);

	const existing = db.select({ id: pinnedCategories.id }).from(pinnedCategories).where(where).get();
	if (existing) {
		db.delete(pinnedCategories).where(eq(pinnedCategories.id, existing.id)).run();
		return json({ pinned: false });
	}

	db.insert(pinnedCategories)
		.values({ userId: user.id, connectionId, contentType, categoryId })
		.run();
	return json({ pinned: true });
};
