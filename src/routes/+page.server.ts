import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites, watchProgress, type Connection, type WatchProgress } from '$lib/server/db/schema';
import { getConnection, listConnections } from '$lib/server/connections';
import { withPins } from '$lib/server/pins';
import {
	getLiveCategories,
	getLiveStreams,
	getSeries,
	getSeriesCategories,
	getVodCategories,
	getVodStreams
} from '$lib/server/xtream';
import { adultCategoryIds, isAdultCategory, parseRating, pickPopular, roundRobin } from '$lib/server/popular';
import type { PageServerLoad } from './$types';

const ROW_SIZE = 20;
// Home rows come from the full catalog listings, which are big on most
// providers. They stream in, so a slow provider delays a row, not the page.
const CATALOG_TIMEOUT = 45_000;

export interface RecentEntry {
	id: number;
	kind: 'live' | 'movie' | 'episode' | 'series';
	title: string;
	subtitle: string;
	/** Full progress-row name, so resuming hands the player the same title it saved */
	name: string;
	icon: string | null;
	connectionId: number;
	streamId: number;
	seriesId: number | null;
	ext: string | null;
	position: number;
	resumable: boolean;
	progress: number;
}

/** Started, not finished — worth dropping straight back into. */
function resumable(row: WatchProgress): boolean {
	if (row.streamType === 'live') return false;
	if (row.position <= 60) return false;
	return row.duration === 0 || row.position < row.duration * 0.95;
}

function toEntry(row: WatchProgress): RecentEntry {
	const isEpisode = row.streamType === 'episode' && row.seriesId != null;
	// Progress rows store episodes as "Series Name — Episode Title"
	const [series, ...episode] = row.name.split(' — ');
	const canResume = resumable(row);
	return {
		id: row.id,
		kind: isEpisode ? 'series' : (row.streamType as 'live' | 'movie' | 'episode'),
		title: isEpisode ? series : row.name,
		subtitle: isEpisode
			? episode.join(' — ') || 'Series'
			: row.streamType === 'movie'
				? 'Movie'
				: row.streamType === 'live'
					? 'Live TV'
					: 'Episode',
		name: row.name,
		icon: row.icon,
		connectionId: row.connectionId,
		streamId: row.streamId,
		seriesId: row.seriesId,
		ext: row.ext,
		position: row.position,
		resumable: canResume,
		progress: canResume && row.duration > 0 ? row.position / row.duration : 0
	};
}

/**
 * One entry per title, newest first: every episode of a show collapses into a
 * single card. Within a show the card points at the most recent episode you
 * left unfinished, falling back to the last one you opened.
 */
function recentlyWatched(userId: string): RecentEntry[] {
	const rows = db
		.select()
		.from(watchProgress)
		.where(eq(watchProgress.userId, userId))
		.orderBy(desc(watchProgress.updatedAt))
		.limit(80)
		.all();

	const order: string[] = [];
	const chosen = new Map<string, WatchProgress>();
	for (const row of rows) {
		const key =
			row.streamType === 'episode' && row.seriesId != null
				? `series:${row.connectionId}:${row.seriesId}`
				: `${row.streamType}:${row.connectionId}:${row.streamId}`;
		const prev = chosen.get(key);
		if (!prev) {
			chosen.set(key, row);
			order.push(key);
		} else if (!resumable(prev) && resumable(row)) {
			// Keep the show's slot where it is, but resume instead of restarting
			chosen.set(key, row);
		}
	}

	return order.slice(0, ROW_SIZE).map((key) => toEntry(chosen.get(key)!));
}

async function popularShows(conn: Connection) {
	try {
		const [cats, list] = await Promise.all([
			getSeriesCategories(conn),
			getSeries(conn, null, CATALOG_TIMEOUT)
		]);
		const skip = adultCategoryIds(cats ?? []);
		const rated = (list ?? []).flatMap((s) => {
			const rating = parseRating(s.rating);
			if (!rating || !s.cover || !s.name || skip.has(s.category_id)) return [];
			return [
				{
					id: s.series_id,
					name: s.name,
					image: s.cover,
					rating,
					categoryId: s.category_id ?? ''
				}
			];
		});
		return pickPopular(rated, ROW_SIZE);
	} catch {
		// A dead row beats a dead page
		return [];
	}
}

async function popularMovies(conn: Connection) {
	try {
		const [cats, list] = await Promise.all([
			getVodCategories(conn),
			getVodStreams(conn, null, CATALOG_TIMEOUT)
		]);
		const skip = adultCategoryIds(cats ?? []);
		const rated = (list ?? []).flatMap((m) => {
			const rating = parseRating(m.rating);
			if (!rating || !m.stream_icon || !m.name || skip.has(m.category_id)) return [];
			return [
				{
					id: m.stream_id,
					name: m.name,
					image: m.stream_icon,
					rating,
					categoryId: m.category_id ?? ''
				}
			];
		});
		return pickPopular(rated, ROW_SIZE);
	} catch {
		return [];
	}
}

/**
 * Channels have no rating to sort on, so the row follows your own signal:
 * pinned live categories, or the provider's first few when nothing is pinned.
 */
async function liveChannels(userId: string, conn: Connection) {
	try {
		const cats = withPins(userId, conn.id, 'live', (await getLiveCategories(conn)) ?? []).filter(
			(c) => !isAdultCategory(c.name)
		);
		const pinned = cats.filter((c) => c.pinned);
		const picked = (pinned.length ? pinned : cats).slice(0, 3);
		if (!picked.length) return [];

		const lists = await Promise.all(
			picked.map((c) =>
				getLiveStreams(conn, c.id, CATALOG_TIMEOUT)
					.then((list) =>
						(list ?? [])
							.filter((s) => s.name && s.stream_icon)
							.map((s) => ({ id: s.stream_id, name: s.name, image: s.stream_icon }))
					)
					.catch(() => [])
			)
		);
		return roundRobin(lists, ROW_SIZE);
	} catch {
		return [];
	}
}

export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user!;

	const favs = db
		.select()
		.from(favorites)
		.where(eq(favorites.userId, user.id))
		.orderBy(desc(favorites.createdAt))
		.limit(ROW_SIZE)
		.all();

	let conn = user.activeConnectionId ? getConnection(user.id, user.activeConnectionId) : undefined;
	if (!conn) conn = listConnections(user.id)[0];

	return {
		recents: recentlyWatched(user.id),
		favorites: favs,
		hasConnection: conn != null,
		connId: conn?.id ?? 0,
		// Streamed: history and favorites render immediately, catalog rows fill in
		popularShows: conn ? popularShows(conn) : [],
		popularMovies: conn ? popularMovies(conn) : [],
		liveChannels: conn ? liveChannels(user.id, conn) : []
	};
};
