import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites, watchProgress } from '$lib/server/db/schema';
import { requireConnection } from '$lib/server/connections';
import { getShortEpg, type EpgListing } from '$lib/server/xtream';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const user = locals.user!;
	const { type, streamId } = params;
	if (!['live', 'movie', 'series'].includes(type)) error(404, 'Not found');

	const conn = requireConnection(user, url.searchParams.get('conn'));
	const ext = url.searchParams.get('ext');
	const name = url.searchParams.get('name') ?? `Stream ${streamId}`;
	const icon = url.searchParams.get('icon') ?? '';
	const seriesId = url.searchParams.get('series');

	const base = `/api/stream/${conn.id}/${type}/${streamId}`;
	const attempts: { label: string; method: 'hls' | 'direct'; url: string }[] = [];
	if (type === 'live') {
		attempts.push({ label: 'HLS', method: 'hls', url: `${base}?ext=m3u8` });
		attempts.push({ label: 'TS', method: 'direct', url: `${base}?ext=ts` });
	} else {
		// VOD: the provider's own container format is the most likely to work —
		// trying HLS first fails visibly on most providers before MP4 succeeds.
		const extOk = ext && ext !== 'm3u8' && /^[a-zA-Z0-9]{1,10}$/.test(ext);
		if (extOk) attempts.push({ label: ext.toUpperCase(), method: 'direct', url: `${base}?ext=${ext}` });
		if (!extOk || ext !== 'mp4') {
			attempts.push({ label: 'MP4', method: 'direct', url: `${base}?ext=mp4` });
		}
		attempts.push({ label: 'HLS', method: 'hls', url: `${base}?ext=m3u8` });
		if (ext !== 'ts') attempts.push({ label: 'TS', method: 'direct', url: `${base}?ext=ts` });
	}

	const progressType = type === 'live' ? 'live' : type === 'movie' ? 'movie' : 'episode';
	const numericId = Number(streamId);

	// Saved resume position (VOD only)
	let savedPosition = 0;
	if (progressType !== 'live') {
		const row = db
			.select({ position: watchProgress.position, duration: watchProgress.duration })
			.from(watchProgress)
			.where(
				and(
					eq(watchProgress.userId, user.id),
					eq(watchProgress.connectionId, conn.id),
					eq(watchProgress.streamType, progressType),
					eq(watchProgress.streamId, numericId)
				)
			)
			.get();
		if (row && row.position > 0 && (!row.duration || row.position < row.duration * 0.95)) {
			savedPosition = row.position;
		}
	}

	// Record in watch history without clobbering an existing resume position
	db.insert(watchProgress)
		.values({
			userId: user.id,
			connectionId: conn.id,
			streamType: progressType,
			streamId: numericId,
			seriesId: seriesId ? Number(seriesId) : null,
			name,
			icon: icon || null,
			ext,
			updatedAt: Date.now()
		})
		.onConflictDoUpdate({
			target: [
				watchProgress.userId,
				watchProgress.connectionId,
				watchProgress.streamType,
				watchProgress.streamId
			],
			set: { name, icon: icon || null, ext, updatedAt: Date.now() }
		})
		.run();

	// Favorite state (live channels + movies only)
	let favorited = false;
	if (type === 'live' || type === 'movie') {
		favorited =
			db
				.select({ id: favorites.id })
				.from(favorites)
				.where(
					and(
						eq(favorites.userId, user.id),
						eq(favorites.connectionId, conn.id),
						eq(favorites.streamType, type),
						eq(favorites.streamId, numericId)
					)
				)
				.get() != null;
	}

	// Program guide for live channels
	let epg: EpgListing[] = [];
	if (type === 'live') {
		try {
			epg = await getShortEpg(conn, streamId, 10);
		} catch {
			// EPG is best-effort
		}
	}

	return {
		type: type as 'live' | 'movie' | 'series',
		streamId: numericId,
		connectionId: conn.id,
		seriesId: seriesId ? Number(seriesId) : null,
		name,
		icon,
		ext,
		attempts,
		savedPosition,
		favorited,
		epg,
		progressType
	};
};
