import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { watchProgress } from '$lib/server/db/schema';
import { requireConnectionApi } from '$lib/server/connections';
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
