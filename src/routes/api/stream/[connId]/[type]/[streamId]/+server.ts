import { error } from '@sveltejs/kit';
import { requireConnectionApi } from '$lib/server/connections';
import { buildStreamUrl } from '$lib/server/xtream';
import type { RequestHandler } from './$types';

const UA = 'StreamX/1.0';

/**
 * Proxies streams through the backend so provider credentials never reach the
 * browser. Rewrites m3u8 playlists so segments and sub-playlists also route
 * through this endpoint. Forwards Range headers for VOD seeking.
 */
export const GET: RequestHandler = async ({ params, url, request, locals }) => {
	const user = locals.user!;
	const conn = requireConnectionApi(user, Number(params.connId));

	const { type, streamId } = params;
	if (!['live', 'movie', 'series'].includes(type)) error(400, 'Invalid stream type');

	const ext = url.searchParams.get('ext') ?? 'm3u8';
	if (!/^[a-zA-Z0-9]{1,10}$/.test(ext)) error(400, 'Invalid extension');

	const proxyBase = `/api/stream/${conn.id}/${type}/${streamId}`;

	function rewriteM3u8(text: string, originUrl: string): string {
		const parsedOrigin = new URL(originUrl);
		const urlOrigin = parsedOrigin.origin;
		const baseUrl = originUrl.substring(0, originUrl.lastIndexOf('/') + 1);

		return text.replace(/^(?!#)(.+)$/gm, (match) => {
			const trimmed = match.trim();
			if (!trimmed) return match;

			let absoluteUrl: string;
			if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
				absoluteUrl = trimmed;
			} else if (trimmed.startsWith('/')) {
				absoluteUrl = urlOrigin + trimmed;
			} else {
				absoluteUrl = baseUrl + trimmed;
			}

			const isPlaylist = /\.m3u8?(\?|$)/i.test(trimmed);
			const segExt = isPlaylist ? 'm3u8' : 'ts';
			return `${proxyBase}?ext=${segExt}&seg=${encodeURIComponent(absoluteUrl)}`;
		});
	}

	// Segment / sub-playlist requests (already-absolute upstream URL in ?seg=)
	const seg = url.searchParams.get('seg');
	if (seg) {
		if (!seg.startsWith('http://') && !seg.startsWith('https://')) {
			error(400, 'Invalid segment URL');
		}

		const upstream = await fetch(seg, {
			signal: AbortSignal.timeout(30_000),
			headers: { 'User-Agent': UA }
		});
		if (!upstream.ok) return new Response(null, { status: upstream.status });

		const ct = upstream.headers.get('content-type') ?? '';
		const isM3u8 =
			ext === 'm3u8' || ct.includes('mpegurl') || ct.includes('m3u8') || /\.m3u8?(\?|$)/i.test(seg);

		if (isM3u8) {
			const text = await upstream.text();
			return new Response(rewriteM3u8(text, upstream.url || seg), {
				headers: {
					'Content-Type': 'application/vnd.apple.mpegurl',
					'Cache-Control': 'no-store'
				}
			});
		}

		const headers = new Headers({ 'Cache-Control': 'no-store' });
		if (ct) headers.set('Content-Type', ct);
		const cl = upstream.headers.get('content-length');
		if (cl) headers.set('Content-Length', cl);
		return new Response(upstream.body, { headers });
	}

	// Main stream request
	const streamUrl = buildStreamUrl(
		{ serverUrl: conn.serverUrl, username: conn.username, password: conn.password },
		type,
		streamId,
		ext
	);

	const fetchHeaders: Record<string, string> = { 'User-Agent': UA };
	const range = request.headers.get('range');
	if (range) fetchHeaders.Range = range;

	const upstream = await fetch(streamUrl, {
		signal: AbortSignal.timeout(30_000),
		headers: fetchHeaders,
		redirect: 'follow'
	});

	if (!upstream.ok && upstream.status !== 206) {
		error(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, 'Stream not available');
	}

	if (ext === 'm3u8') {
		const ct = upstream.headers.get('content-type') ?? '';
		const looksLikeM3u8 =
			ct.includes('mpegurl') || ct.includes('m3u8') || ct.includes('text') || ct.includes('utf-8') || !ct;

		if (!looksLikeM3u8) {
			upstream.body?.cancel().catch(() => {});
			error(415, `Server did not return an HLS playlist (got ${ct})`);
		}

		const text = await upstream.text();
		if (!text.trim().startsWith('#EXTM3U') && !text.includes('#EXT-X-')) {
			error(415, 'Server did not return a valid HLS playlist');
		}

		return new Response(rewriteM3u8(text, upstream.url || streamUrl), {
			headers: {
				'Content-Type': 'application/vnd.apple.mpegurl',
				'Cache-Control': 'no-store'
			}
		});
	}

	const headers = new Headers({ 'Cache-Control': 'no-store' });
	for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
		const val = upstream.headers.get(h);
		if (val) headers.set(h, val);
	}

	return new Response(upstream.body, { status: upstream.status, headers });
};
