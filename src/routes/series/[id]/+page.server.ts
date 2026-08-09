import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites, watchProgress } from '$lib/server/db/schema';
import { requireConnection } from '$lib/server/connections';
import { getSeriesInfo } from '$lib/server/xtream';
import { lookup } from '$lib/server/tmdb';
import type { PageServerLoad } from './$types';

export interface Episode {
	id: number;
	num: number;
	title: string;
	ext: string;
	image: string | null;
	plot: string | null;
	durationSecs: number | null;
	progressPct: number;
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const user = locals.user!;
	const conn = requireConnection(user, url.searchParams.get('conn'));
	const seriesId = Number(params.id);

	let data: Record<string, any>;
	try {
		data = await getSeriesInfo(conn, seriesId);
	} catch {
		error(502, 'Could not load series info from the provider');
	}

	const info = data.info ?? {};
	const name: string = info.name || `Series ${params.id}`;
	const tmdb = await lookup('tv', name, info.tmdb);

	// Watch progress for all episodes of this series
	const progressRows = db
		.select({
			streamId: watchProgress.streamId,
			position: watchProgress.position,
			duration: watchProgress.duration
		})
		.from(watchProgress)
		.where(
			and(
				eq(watchProgress.userId, user.id),
				eq(watchProgress.connectionId, conn.id),
				eq(watchProgress.streamType, 'episode'),
				eq(watchProgress.seriesId, seriesId)
			)
		)
		.all();
	const progressMap = new Map(
		progressRows.map((r) => [r.streamId, r.duration > 0 ? r.position / r.duration : 0])
	);

	// Season covers double as episode-thumb fallbacks when a still is missing
	const seasonCovers = new Map<string, string>();
	for (const s of Array.isArray(data.seasons) ? data.seasons : []) {
		const cover = s.cover_big || s.cover || s.cover_tmdb;
		if (cover && s.season_number != null) seasonCovers.set(String(s.season_number), cover);
	}

	const seasons: { season: string; episodes: Episode[] }[] = [];
	const episodesBySeason = data.episodes ?? {};
	for (const season of Object.keys(episodesBySeason).sort((a, b) => Number(a) - Number(b))) {
		const eps = (episodesBySeason[season] ?? []).map((e: any): Episode => {
			const id = Number(e.id);
			return {
				id,
				num: Number(e.episode_num) || 0,
				title: e.title || `Episode ${e.episode_num}`,
				ext: e.container_extension || 'mp4',
				image: e.info?.movie_image || seasonCovers.get(String(e.season ?? season)) || null,
				plot: e.info?.plot || null,
				durationSecs: e.info?.duration_secs ? Number(e.info.duration_secs) : null,
				progressPct: Math.min(1, progressMap.get(id) ?? 0)
			};
		});
		if (eps.length) seasons.push({ season, episodes: eps });
	}

	// When the provider lists seasons but no episodes (placeholder entries),
	// surface the season metadata so the page can explain what's missing.
	const providerSeasons =
		seasons.length === 0 && Array.isArray(data.seasons)
			? data.seasons.map((s: any) => ({
					name: s.name || `Season ${s.season_number}`,
					episodeCount: Number(s.episode_count) || 0
				}))
			: [];

	const favorited =
		db
			.select({ id: favorites.id })
			.from(favorites)
			.where(
				and(
					eq(favorites.userId, user.id),
					eq(favorites.connectionId, conn.id),
					eq(favorites.streamType, 'series'),
					eq(favorites.streamId, seriesId)
				)
			)
			.get() != null;

	return {
		connId: conn.id,
		seriesId,
		name,
		poster: tmdb?.poster || info.cover || null,
		backdrop:
			tmdb?.backdrop || (Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : null),
		overview: tmdb?.overview || info.plot || null,
		rating: tmdb?.rating ?? (info.rating ? Number(info.rating) : null),
		year: tmdb?.year || (info.releaseDate ? String(info.releaseDate).slice(0, 4) : null),
		genres: tmdb?.genres?.length
			? tmdb.genres
			: info.genre
				? String(info.genre).split(',').map((g: string) => g.trim())
				: [],
		cast: info.cast || null,
		seasons,
		providerSeasons,
		favorited
	};
};
