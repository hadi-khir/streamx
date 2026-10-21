import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites, watchProgress } from '$lib/server/db/schema';
import { requireConnection } from '$lib/server/connections';
import { getSeriesInfo, getShortEpg, getVodInfo, type EpgListing } from '$lib/server/xtream';
import { audioCodecOf, groupEpisodes, type SeriesEpisode } from '$lib/server/series';
import { knownToNeedFix } from '$lib/server/transcode';
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

	// Up-next episode for autoplay. Best-effort: get_series_info is cached for
	// 5 minutes, so arriving from the series page is normally a cache hit.
	let nextEpisode: SeriesEpisode | null = null;
	let seriesName = '';
	let seriesPoster: string | null = null;
	// What the provider's own probe says about the file: the player needs the
	// audio codec to know up front whether this browser can play the sound,
	// and the length to seek a re-encoded stream, which can't report one.
	let audioCodec: string | null = null;
	let durationSecs: number | null = null;
	if (type === 'movie') {
		try {
			const info = (await Promise.race([
				getVodInfo(conn, streamId),
				new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
			])) as Record<string, any>;
			audioCodec = audioCodecOf(info?.info);
			const secs = Number(info?.info?.duration_secs);
			if (secs > 0) durationSecs = secs;
		} catch {
			// The player still finds out by listening
		}
	}
	if (type === 'series' && seriesId) {
		try {
			const info = await getSeriesInfo(conn, seriesId);
			seriesName = info.info?.name || name.split(' — ')[0];
			seriesPoster = info.info?.cover || null;
			// Remember the show's own artwork: history cards shouldn't be the
			// still from whichever episode you happened to open.
			if (seriesPoster) {
				db.update(watchProgress)
					.set({ seriesIcon: seriesPoster })
					.where(
						and(
							eq(watchProgress.userId, user.id),
							eq(watchProgress.connectionId, conn.id),
							eq(watchProgress.seriesId, Number(seriesId))
						)
					)
					.run();
			}
			const ordered = groupEpisodes(info).flatMap((s) => s.episodes);
			const idx = ordered.findIndex((e) => e.id === numericId);
			if (idx >= 0) {
				audioCodec = ordered[idx].audioCodec;
				durationSecs = ordered[idx].durationSecs;
			}
			if (idx >= 0 && idx + 1 < ordered.length) nextEpisode = ordered[idx + 1];
		} catch {
			// Autoplay is a nicety — never block playback on the provider
		}
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

	// Same title with the audio re-encoded, for when the original is silent here
	const transcodeExt = type === 'live' ? 'ts' : ext && /^[a-zA-Z0-9]{1,10}$/.test(ext) && ext !== 'm3u8' ? ext : 'mp4';
	const transcode = {
		url: `/api/transcode/${conn.id}/${type}/${streamId}?ext=${transcodeExt}${seriesId ? `&series=${seriesId}` : ''}`,
		known: knownToNeedFix(conn.id, type, numericId, seriesId ? Number(seriesId) : null)
	};

	return {
		type: type as 'live' | 'movie' | 'series',
		audioCodec,
		durationSecs,
		transcode,
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
		progressType,
		nextEpisode,
		seriesName,
		seriesPoster
	};
};
