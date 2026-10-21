import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites, watchProgress } from '$lib/server/db/schema';
import { requireConnection } from '$lib/server/connections';
import { getSeriesInfo } from '$lib/server/xtream';
import { lookup } from '$lib/server/tmdb';
import { groupEpisodes, type SeriesEpisode } from '$lib/server/series';
import { moreLikeThis } from '$lib/server/recommend';
import { episodeWatchUrl } from '$lib/episodes';
import type { PageServerLoad } from './$types';

export type Episode = SeriesEpisode & { progressPct: number };

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
			duration: watchProgress.duration,
			updatedAt: watchProgress.updatedAt
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

	const seasons: { season: string; episodes: Episode[] }[] = groupEpisodes(data).map((s) => ({
		season: s.season,
		episodes: s.episodes.map((e) => ({ ...e, progressPct: Math.min(1, progressMap.get(e.id) ?? 0) }))
	}));

	// When the provider lists seasons but no episodes (placeholder entries),
	// surface the season metadata so the page can explain what's missing.
	const providerSeasons =
		seasons.length === 0 && Array.isArray(data.seasons)
			? data.seasons.map((s: any) => ({
					name: s.name || `Season ${s.season_number}`,
					episodeCount: Number(s.episode_count) || 0
				}))
			: [];

	// Netflix's one button: resume the episode you're in the middle of, else
	// the one after the last you finished, else the very first
	const ordered = seasons.flatMap((s) => s.episodes);
	let upNext: { episode: Episode; label: string; resume: boolean } | null = null;
	if (ordered.length) {
		const last = [...progressRows].sort((a, b) => b.updatedAt - a.updatedAt)[0];
		const idx = last ? ordered.findIndex((e) => e.id === last.streamId) : -1;
		const finished = last && last.duration > 0 && last.position >= last.duration * 0.95;
		let episode = ordered[0];
		let resume = false;
		if (idx >= 0 && !finished && last.position > 60) {
			episode = ordered[idx];
			resume = true;
		} else if (idx >= 0) {
			episode = ordered[Math.min(idx + 1, ordered.length - 1)];
		}
		const where = `S${episode.season}:E${episode.num}`;
		upNext = { episode, resume, label: idx < 0 ? 'Play' : `${resume ? 'Resume' : 'Play'} ${where}` };
	}

	const poster = tmdb?.poster || info.cover || null;
	if (url.searchParams.get('play') && upNext) {
		redirect(303, episodeWatchUrl({ seriesId, seriesName: name, connId: conn.id, poster }, upNext.episode));
	}

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
		poster,
		upNext,
		// Streamed: the page shouldn't wait on recommendations
		similar: moreLikeThis(conn, 'series', seriesId, {
			name,
			categoryId: info.category_id,
			genre: info.genre,
			cast: info.cast
		}).catch(() => []),
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
