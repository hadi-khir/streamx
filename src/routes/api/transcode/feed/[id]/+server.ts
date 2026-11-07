import { error } from '@sveltejs/kit';
import { closeFeed, findFeed, keepFeed, readFeed } from '$lib/server/transcode';
import type { RequestHandler } from './$types';

/** The next piece of a stream opened with ?feed=1, or 204 when it has finished. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const feed = findFeed(params.id, locals.user!.id);
	if (!feed) error(404, 'This stream has closed');
	let piece: Uint8Array | null;
	try {
		piece = await readFeed(feed);
	} catch {
		error(502, 'Could not read the stream');
	}
	return new Response(piece as BodyInit | null, {
		status: piece ? 200 : 204,
		headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' }
	});
};

/** Still watching, just not needing more yet: paused, or plenty buffered. */
export const POST: RequestHandler = async ({ params, locals }) => {
	const feed = findFeed(params.id, locals.user!.id);
	if (!feed) error(404, 'This stream has closed');
	keepFeed(feed);
	return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const feed = findFeed(params.id, locals.user!.id);
	if (feed) closeFeed(feed);
	return new Response(null, { status: 204 });
};
