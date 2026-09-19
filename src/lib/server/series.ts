export interface SeriesEpisode {
	id: number;
	num: number;
	season: string;
	title: string;
	ext: string;
	image: string | null;
	plot: string | null;
	durationSecs: number | null;
}

/**
 * Flatten a get_series_info payload into seasons of episodes, ordered the way
 * the series page lists them. The watch page derives "up next" from the same
 * order, so the autoplay target always matches the episode below the one you
 * clicked.
 */
export function groupEpisodes(data: Record<string, any>): { season: string; episodes: SeriesEpisode[] }[] {
	// Season covers double as episode-thumb fallbacks when a still is missing
	const seasonCovers = new Map<string, string>();
	for (const s of Array.isArray(data.seasons) ? data.seasons : []) {
		const cover = s.cover_big || s.cover || s.cover_tmdb;
		if (cover && s.season_number != null) seasonCovers.set(String(s.season_number), cover);
	}

	const out: { season: string; episodes: SeriesEpisode[] }[] = [];
	const bySeason = data.episodes ?? {};
	for (const season of Object.keys(bySeason).sort((a, b) => Number(a) - Number(b))) {
		const eps = (bySeason[season] ?? []).map(
			(e: any): SeriesEpisode => ({
				id: Number(e.id),
				num: Number(e.episode_num) || 0,
				season,
				title: e.title || `Episode ${e.episode_num}`,
				ext: e.container_extension || 'mp4',
				image: e.info?.movie_image || seasonCovers.get(String(e.season ?? season)) || null,
				plot: e.info?.plot || null,
				durationSecs: e.info?.duration_secs ? Number(e.info.duration_secs) : null
			})
		);
		if (eps.length) out.push({ season, episodes: eps });
	}
	return out;
}
