import { error } from '@sveltejs/kit';
import { openSeason } from '$lib/server/season-download';
import type { RequestHandler } from './$types';

/** The season itself. Each link works once, for the person who prepared it. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const download = openSeason(params.token, locals.user!.id);
	if (!download) error(404, 'This download has expired');

	const ascii = download.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
	// RFC 5987 leaves ' ( ) ! * out of attr-char, and encodeURIComponent keeps them
	const utf8 = encodeURIComponent(download.filename).replace(
		/['()!*]/g,
		(ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return new Response(download.body, {
		headers: {
			'Content-Type': 'application/x-tar',
			'Content-Length': String(download.total),
			'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
			'Cache-Control': 'no-store'
		}
	});
};
