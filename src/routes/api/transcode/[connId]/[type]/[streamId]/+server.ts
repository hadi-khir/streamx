import { error, json } from '@sveltejs/kit';
import { requireConnectionApi } from '$lib/server/connections';
import { buildStreamUrl } from '$lib/server/xtream';
import { probe, rememberFix, transcodeAudio } from '$lib/server/transcode';
import type { RequestHandler } from './$types';

/**
 * The same title as /api/stream, with its audio re-encoded to AAC for
 * browsers that can't decode the original (see $lib/server/transcode).
 * `?probe=1` describes the source instead — its length, which a piped stream
 * can't report, and its audio tracks.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user!;
	const conn = requireConnectionApi(user, Number(params.connId));

	const { type, streamId } = params;
	if (!['live', 'movie', 'series'].includes(type)) error(400, 'Invalid stream type');
	if (!/^\d+$/.test(streamId)) error(400, 'Invalid stream id');

	const live = type === 'live';
	const ext = url.searchParams.get('ext') || (live ? 'ts' : 'mp4');
	if (!/^[a-zA-Z0-9]{1,10}$/.test(ext) || ext === 'm3u8') error(400, 'Invalid extension');

	const source = buildStreamUrl(
		{ serverUrl: conn.serverUrl, username: conn.username, password: conn.password },
		type,
		streamId,
		ext
	);

	if (url.searchParams.get('probe') === '1') {
		try {
			return json(await probe(source, `${conn.id}:${type}:${streamId}`));
		} catch {
			error(502, 'Could not read the stream');
		}
	}

	const start = Math.max(0, Number(url.searchParams.get('start')) || 0);
	const audioTrack = Math.max(0, Math.floor(Number(url.searchParams.get('audio')) || 0));
	// Only an undecodable track is worth remembering — not a container fallback
	if (url.searchParams.get('fix') === 'audio') {
		rememberFix(conn.id, type, streamId, url.searchParams.get('series'));
	}

	return new Response(transcodeAudio(conn.id, source, { start, live, audioTrack }), {
		headers: {
			'Content-Type': 'video/mp4',
			'Cache-Control': 'no-store',
			// A pipe has no byte ranges; seeking re-requests with ?start=
			'Accept-Ranges': 'none'
		}
	});
};
