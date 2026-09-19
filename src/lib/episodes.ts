export interface EpisodeLink {
	id: number;
	title: string;
	ext: string;
	image: string | null;
}

export interface SeriesContext {
	seriesId: number;
	seriesName: string;
	connId: number;
	poster: string | null;
}

/**
 * Watch-page URL for one episode. Shared so the season list and the up-next
 * card hand the player identical params.
 */
export function episodeWatchUrl(ctx: SeriesContext, ep: EpisodeLink): string {
	const q = new URLSearchParams({
		name: `${ctx.seriesName} — ${ep.title}`,
		icon: ep.image ?? ctx.poster ?? '',
		conn: String(ctx.connId),
		ext: ep.ext,
		series: String(ctx.seriesId)
	});
	return `/watch/series/${ep.id}?${q}`;
}
