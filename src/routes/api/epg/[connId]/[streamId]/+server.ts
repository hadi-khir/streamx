import { json } from '@sveltejs/kit';
import { requireConnectionApi } from '$lib/server/connections';
import { getShortEpg } from '$lib/server/xtream';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const conn = requireConnectionApi(locals.user!, Number(params.connId));
	const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') ?? 4)));

	try {
		const listings = await getShortEpg(conn, params.streamId, limit);
		return json({ listings });
	} catch {
		return json({ listings: [] });
	}
};
