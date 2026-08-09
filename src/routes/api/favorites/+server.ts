import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites } from '$lib/server/db/schema';
import { requireConnectionApi } from '$lib/server/connections';
import type { RequestHandler } from './$types';

/** Toggle a favorite. Returns { favorited: boolean }. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const connectionId = Number(body.connectionId);
	const streamId = Number(body.streamId);
	const streamType = String(body.streamType ?? '');
	if (!connectionId || !streamId || !['live', 'movie', 'series'].includes(streamType)) {
		error(400, 'Invalid favorite payload');
	}
	requireConnectionApi(user, connectionId);

	const where = and(
		eq(favorites.userId, user.id),
		eq(favorites.connectionId, connectionId),
		eq(favorites.streamType, streamType),
		eq(favorites.streamId, streamId)
	);

	const existing = db.select({ id: favorites.id }).from(favorites).where(where).get();
	if (existing) {
		db.delete(favorites).where(eq(favorites.id, existing.id)).run();
		return json({ favorited: false });
	}

	db.insert(favorites)
		.values({
			userId: user.id,
			connectionId,
			streamType,
			streamId,
			name: String(body.name ?? `Stream ${streamId}`),
			icon: body.icon ? String(body.icon) : null,
			ext: body.ext ? String(body.ext) : null
		})
		.run();
	return json({ favorited: true });
};
