import { error } from '@sveltejs/kit';
import { requireConnectionApi } from '$lib/server/connections';
import { prepareSeason } from '$lib/server/season-download';
import type { RequestHandler } from './$types';

// Measuring a long season can outlast a proxy's patience, so whitespace (which JSON
// ignores) keeps the response alive until the answer is ready
const KEEP_ALIVE_EVERY = 15_000;

/** Picks a login and measures the season, returning a link to download it from. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const body = await request.json().catch(() => null);
	const seriesId = Number(body?.seriesId);
	const season = String(body?.season ?? '');
	if (!seriesId || !season) error(400, 'Invalid season');
	const conn = requireConnectionApi(user, Number(body?.connectionId));

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const timer = setInterval(() => controller.enqueue(encoder.encode(' ')), KEEP_ALIVE_EVERY);
			const result = await prepareSeason(user.id, conn, seriesId, season).catch(() => ({
				ok: false as const,
				reason: 'unavailable' as const
			}));
			clearInterval(timer);
			controller.enqueue(encoder.encode(JSON.stringify(result)));
			controller.close();
		}
	});
	return new Response(stream, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
