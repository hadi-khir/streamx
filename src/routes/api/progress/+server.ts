import { json, error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { connections, watchProgress } from '$lib/server/db/schema';
import { getConnection, requireConnectionApi } from '$lib/server/connections';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	const connectionId = Number(body.connectionId);
	const streamId = Number(body.streamId);
	const streamType = String(body.streamType ?? '');
	if (!connectionId || !streamId || !['live', 'movie', 'episode'].includes(streamType)) {
		error(400, 'Invalid progress payload');
	}
	requireConnectionApi(user, connectionId);

	const position = Number(body.position) || 0;
	const duration = Number(body.duration) || 0;

	db.insert(watchProgress)
		.values({
			userId: user.id,
			connectionId,
			streamType,
			streamId,
			seriesId: body.seriesId ? Number(body.seriesId) : null,
			name: String(body.name ?? `Stream ${streamId}`),
			icon: body.icon ? String(body.icon) : null,
			ext: body.ext ? String(body.ext) : null,
			position,
			duration,
			updatedAt: Date.now()
		})
		.onConflictDoUpdate({
			target: [
				watchProgress.userId,
				watchProgress.connectionId,
				watchProgress.streamType,
				watchProgress.streamId
			],
			set: {
				// Never regress a saved position with the initial 0/0 ping
				...(position > 0 ? { position, duration } : {}),
				updatedAt: Date.now()
			}
		})
		.run();

	return json({ ok: true });
};

/**
 * Remove watch history. Pass { id } for a single entry, { seriesId,
 * connectionId } to clear every episode of a series, and { ids } for the
 * extra rows a collapsed home card stands for — a card that swallowed a
 * same-named 24/7 channel has to take that channel with it, or it reappears
 * the moment the series is gone.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const body = await request.json().catch(() => null);

	const ids = Array.isArray(body?.ids)
		? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
		: [];
	if (ids.length) {
		db.delete(watchProgress)
			.where(and(eq(watchProgress.userId, user.id), inArray(watchProgress.id, ids)))
			.run();
	}

	if (body?.seriesId && body?.connectionId) {
		// Same series under a second login on the same server is the same
		// show on the home row, so clear it everywhere that provider appears.
		const conn = getConnection(user.id, Number(body.connectionId));
		const siblings = conn
			? db
					.select({ id: connections.id })
					.from(connections)
					.where(and(eq(connections.userId, user.id), eq(connections.serverUrl, conn.serverUrl)))
					.all()
					.map((c) => c.id)
			: [Number(body.connectionId)];

		db.delete(watchProgress)
			.where(
				and(
					eq(watchProgress.userId, user.id),
					inArray(watchProgress.connectionId, siblings),
					eq(watchProgress.streamType, 'episode'),
					eq(watchProgress.seriesId, Number(body.seriesId))
				)
			)
			.run();
		return json({ ok: true });
	}

	const id = Number(body?.id);
	if (!id) {
		if (ids.length) return json({ ok: true });
		error(400, 'Invalid progress id');
	}
	db.delete(watchProgress)
		.where(and(eq(watchProgress.id, id), eq(watchProgress.userId, user.id)))
		.run();
	return json({ ok: true });
};
