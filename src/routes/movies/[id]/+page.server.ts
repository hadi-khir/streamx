import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites, watchProgress } from '$lib/server/db/schema';
import { requireConnection } from '$lib/server/connections';
import { getVodInfo } from '$lib/server/xtream';
import { lookup } from '$lib/server/tmdb';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const user = locals.user!;
	const conn = requireConnection(user, url.searchParams.get('conn'));

	let data: Record<string, any>;
	try {
		data = await getVodInfo(conn, params.id);
	} catch {
		error(502, 'Could not load movie info from the provider');
	}

	const info = data.info ?? {};
	const movieData = data.movie_data ?? {};
	const streamId = Number(movieData.stream_id ?? params.id);
	const name: string = movieData.name || info.name || `Movie ${params.id}`;
	const ext: string = movieData.container_extension || 'mp4';

	const tmdb = await lookup('movie', name, info.tmdb_id);

	const progress = db
		.select({ position: watchProgress.position, duration: watchProgress.duration })
		.from(watchProgress)
		.where(
			and(
				eq(watchProgress.userId, user.id),
				eq(watchProgress.connectionId, conn.id),
				eq(watchProgress.streamType, 'movie'),
				eq(watchProgress.streamId, streamId)
			)
		)
		.get();

	const favorited =
		db
			.select({ id: favorites.id })
			.from(favorites)
			.where(
				and(
					eq(favorites.userId, user.id),
					eq(favorites.connectionId, conn.id),
					eq(favorites.streamType, 'movie'),
					eq(favorites.streamId, streamId)
				)
			)
			.get() != null;

	return {
		connId: conn.id,
		streamId,
		name,
		ext,
		poster: tmdb?.poster || info.movie_image || info.cover_big || null,
		backdrop: tmdb?.backdrop || (Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : null),
		overview: tmdb?.overview || info.plot || info.description || null,
		rating: tmdb?.rating ?? (info.rating ? Number(info.rating) : null),
		year: tmdb?.year || (info.releasedate ? String(info.releasedate).slice(0, 4) : null),
		genres: tmdb?.genres?.length ? tmdb.genres : info.genre ? String(info.genre).split(',').map((g: string) => g.trim()) : [],
		cast: info.cast || info.actors || null,
		director: info.director || null,
		durationSecs: info.duration_secs ? Number(info.duration_secs) : null,
		progress: progress ?? null,
		favorited
	};
};
