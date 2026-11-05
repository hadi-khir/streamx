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
// WebKit won't play a response without byte ranges: it asks for the first two
// bytes, and gives up unless they come back as a range of a known size. So it's
// told a size no stream reaches, and then asks for the whole of that.
const WEBKIT_SIZE = 1e12;
const WEBKIT_RANGE = new RegExp(`^bytes=(\\d+)-${WEBKIT_SIZE - 1}$`);

export const GET: RequestHandler = async ({ params, url, locals, request }) => {
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

	const range = request.headers.get('range');
	if (range === 'bytes=0-1') {
		// An MP4 opens with its first box's size, far too small to reach these two bytes
		return new Response(new Uint8Array(2), {
			status: 206,
			headers: {
				'Content-Type': 'video/mp4',
				'Cache-Control': 'no-store',
				'Accept-Ranges': 'bytes',
				'Content-Range': `bytes 0-1/${WEBKIT_SIZE}`
			}
		});
	}
	const webkitFrom = range?.match(WEBKIT_RANGE)?.[1];
	// Asking past what it got means the pipe ended. Any refusal has WebKit retrying
	// dozens of times a second, so the request just idles until the page drops it.
	if (webkitFrom && webkitFrom !== '0') {
		return new Response(new ReadableStream(), {
			status: 206,
			headers: {
				'Content-Type': 'video/mp4',
				'Cache-Control': 'no-store',
				'Accept-Ranges': 'bytes',
				'Content-Range': `bytes ${webkitFrom}-${WEBKIT_SIZE - 1}/${WEBKIT_SIZE}`
			}
		});
	}

	const start = Math.max(0, Number(url.searchParams.get('start')) || 0);
	const audioTrack = Math.max(0, Math.floor(Number(url.searchParams.get('audio')) || 0));
	// Only an undecodable track is worth remembering — not a container fallback
	if (url.searchParams.get('fix') === 'audio') {
		rememberFix(conn.id, type, streamId, url.searchParams.get('series'));
	}

	// Only WebKit cares how HEVC is tagged. Cached from the player's own probe.
	const videoCodec =
		webkitFrom && !live
			? await probe(source, `${conn.id}:${type}:${streamId}`)
					.then((p) => p.video)
					.catch(() => null)
			: null;

	const body = transcodeAudio(conn.id, source, { start, live, audioTrack, videoCodec });
	if (webkitFrom) {
		return new Response(body, {
			status: 206,
			headers: {
				'Content-Type': 'video/mp4',
				'Cache-Control': 'no-store',
				'Accept-Ranges': 'bytes',
				'Content-Range': `bytes 0-${WEBKIT_SIZE - 1}/${WEBKIT_SIZE}`
			}
		});
	}
	return new Response(body, {
		headers: {
			'Content-Type': 'video/mp4',
			'Cache-Control': 'no-store',
			// A pipe has no byte ranges; seeking re-requests with ?start=
			'Accept-Ranges': 'none'
		}
	});
};
