import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { hiddenTitles } from '$lib/server/db/schema';
import { requireConnectionApi } from '$lib/server/connections';
import type { RequestHandler } from './$types';

async function readTitle(request: Request) {
	const body = await request.json().catch(() => null);
	const connectionId = Number(body?.connectionId);
	const kind = String(body?.kind ?? '');
	const streamId = Number(body?.streamId);
	if (!connectionId || !streamId || !['movie', 'series'].includes(kind)) error(400, 'Invalid title');
	return { connectionId, kind, streamId, name: String(body?.name ?? '').slice(0, 300) };
}

/** Mark a title "not for me". */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const { connectionId, kind, streamId, name } = await readTitle(request);
	if (!name) error(400, 'Invalid title');
	requireConnectionApi(user, connectionId);

	db.insert(hiddenTitles)
		.values({ userId: user.id, connectionId, kind, streamId, name })
		.onConflictDoNothing()
		.run();
	return json({ hidden: true });
};

/** Undo it. */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const { connectionId, kind, streamId } = await readTitle(request);
	requireConnectionApi(user, connectionId);

	db.delete(hiddenTitles)
		.where(
			and(
				eq(hiddenTitles.userId, user.id),
				eq(hiddenTitles.connectionId, connectionId),
				eq(hiddenTitles.kind, kind),
				eq(hiddenTitles.streamId, streamId)
			)
		)
		.run();
	return json({ hidden: false });
};
