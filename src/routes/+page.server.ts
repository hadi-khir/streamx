import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	connections,
	favorites,
	watchProgress,
	type Connection,
	type WatchProgress
} from '$lib/server/db/schema';
import { getConnection, listConnections } from '$lib/server/connections';
import { getSeriesInfo } from '$lib/server/xtream';
import { withPins } from '$lib/server/pins';
import {
	getLiveCategories,
	getLiveStreams,
	getSeries,
	getSeriesCategories,
	getVodCategories,
	getVodStreams
} from '$lib/server/xtream';
import {
	isAdultCategory,
	isEnglishCategory,
	isPlayableTitle,
	parseRating,
	roundRobin,
	titleKey,
	uniqueByTitle
} from '$lib/server/popular';
import type { Category } from '$lib/server/xtream';
import type { PageServerLoad } from './$types';

const ROW_SIZE = 20;
// How many categories may feed one row.
const ROW_CATEGORIES = 6;
// Netflix' own catalog is a narrower, more recognisable pool than every
// English category the provider carries. Its kids spin-off is a separate
// category and would drag the row back to cartoons, so it stays out.
const SHOWS_CATALOG = /netflix/i;
const NOT_A_CATALOG = /kids|children|cartoon/i;
// Enough from each category to fill the row with slack for near-duplicates,
// whether the row draws on six categories or on one.
const quotaPer = (categories: number) => Math.ceil((ROW_SIZE * 1.5) / Math.max(1, categories));
// Rows are built per category: the unfiltered get_series / get_vod_streams
// listings never return on some providers, while a single category answers in
// a second or two. Rows stream in, so a slow category delays a row, not the page.
const CATEGORY_TIMEOUT = 25_000;

interface RowItem {
	id: number;
	name: string;
	image: string;
	rating: number;
}

/**
 * The categories a home row draws from: English only (the home page is not a
 * language tour), never adult, and your pinned ones win when you have any.
 * Providers that tag no language would leave the row empty, so there the
 * filter relaxes rather than showing nothing.
 */
function rowCategories(
	userId: string,
	connectionId: number,
	contentType: 'live' | 'vod' | 'series',
	categories: Category[],
	prefer?: RegExp
) {
	const usable = withPins(userId, connectionId, contentType, categories).filter(
		(c) => !isAdultCategory(c.name)
	);
	const english = usable.filter((c) => isEnglishCategory(c.name));
	const pool = english.length ? english : usable;

	// Your pins beat everything; failing that, a marquee catalog keeps the row
	// recognisable instead of spreading it over every category the provider has.
	const pinned = pool.filter((c) => c.pinned);
	if (pinned.length) return pinned.slice(0, ROW_CATEGORIES);
	const preferred = prefer
		? pool.filter((c) => prefer.test(c.name) && !NOT_A_CATALOG.test(c.name))
		: [];
	return (preferred.length ? preferred : pool).slice(0, ROW_CATEGORIES);
}

/**
 * One category's contribution to a row: its best-rated titles with artwork.
 * Providers hand out a lot of flat 10s, so ties fall back to whatever landed
 * in the catalog most recently.
 */
function topRated(
	items: { id: number; name: string; image: unknown; rating: unknown; added?: unknown }[],
	take: number
): RowItem[] {
	return items
		.flatMap((i) => {
			const rating = parseRating(i.rating as string | number | null);
			const image = typeof i.image === 'string' ? i.image : '';
			if (!rating || !image || !isPlayableTitle(i.name)) return [];
			return [{ id: i.id, name: i.name, image, rating, added: Number(i.added) || 0 }];
		})
		.sort((a, b) => b.rating - a.rating || b.added - a.added)
		.slice(0, take);
}

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
	/** Every progress row this one card stands for — what "remove" must clear */
	absorbed: number[];
}

function resumable(row: WatchProgress): boolean {
	if (row.streamType === 'live') return false;
	if (row.position <= 60) return false;
	return row.duration === 0 || row.position < row.duration * 0.95;
}

function toEntry(row: WatchProgress, absorbed: number[]): RecentEntry {
	const isEpisode = row.streamType === 'episode' && row.seriesId != null;
	// A show is its poster, not a still from one episode
	const icon = (isEpisode && row.seriesIcon) || row.icon;
	// Progress rows store episodes as "Series Name — Episode Title", and this
	// provider's episode titles repeat the show ("Superstore (2015) - S01E07"),
	// which would just truncate under a card already titled with the show.
	const [series, ...rest] = row.name.split(' — ');
	const episode = rest
		.join(' — ')
		.replace(new RegExp('^' + series.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
		.replace(/^[\s\-–—:|]+/, '')
		.trim();
	const canResume = resumable(row);
	return {
		id: row.id,
		kind: isEpisode ? 'series' : (row.streamType as 'live' | 'movie' | 'episode'),
		title: isEpisode ? series : row.name,
		subtitle: isEpisode
			? episode || 'Series'
			: row.streamType === 'movie'
				? 'Movie'
				: row.streamType === 'live'
					? 'Live TV'
					: 'Episode',
		name: row.name,
		icon,
		connectionId: row.connectionId,
		streamId: row.streamId,
		seriesId: row.seriesId,
		ext: row.ext,
		position: row.position,
		resumable: canResume,
		progress: canResume && row.duration > 0 ? row.position / row.duration : 0,
		absorbed
	};
}

/**
 * One entry per title, newest first: every episode of a show collapses into a
 * single card. Within a show the card points at the most recent episode you
 * left unfinished, falling back to the last one you opened.
 */
function recentlyWatched(userId: string): RecentEntry[] {
	// Two logins on the same server are the same library, so history groups
	// per provider rather than per connection.
	const provider = new Map(
		db
			.select({ id: connections.id, serverUrl: connections.serverUrl })
			.from(connections)
			.where(eq(connections.userId, userId))
			.all()
			.map((c) => [c.id, c.serverUrl.replace(/\/+$/, '').toLowerCase()] as const)
	);

	const rows = db
		.select()
		.from(watchProgress)
		.where(eq(watchProgress.userId, userId))
		.orderBy(desc(watchProgress.updatedAt))
		.limit(80)
		.all();

	const order: string[] = [];
	const groups = new Map<string, { chosen: WatchProgress; ids: number[] }>();
	for (const row of rows) {
		const host = provider.get(row.connectionId) ?? String(row.connectionId);
		const key =
			row.streamType === 'episode' && row.seriesId != null
				? `series:${host}:${row.seriesId}`
				: `${row.streamType}:${host}:${row.streamId}`;
		const group = groups.get(key);
		if (!group) {
			groups.set(key, { chosen: row, ids: [row.id] });
			order.push(key);
			continue;
		}
		group.ids.push(row.id);
		// Keep the show's slot where it is, but resume instead of restarting
		if (!resumable(group.chosen) && resumable(row)) group.chosen = row;
	}

	// Providers ship popular shows twice — as a series and as a 24/7 channel
	// of the same name. They are different streams, but on one row they read
	// as a duplicate, so the series or movie wins and swallows the channel.
	const out: RecentEntry[] = [];
	const slotOfShow = new Map<string, number>();
	for (const key of order) {
		const group = groups.get(key)!;
		const entry = toEntry(group.chosen, group.ids);
		const show = titleKey(entry.title);
		const slot = show ? slotOfShow.get(show) : undefined;
		if (slot == null) {
			if (show) slotOfShow.set(show, out.length);
			out.push(entry);
			continue;
		}
		const kept = out[slot];
		kept.absorbed.push(...entry.absorbed);
		if (kept.kind === 'live' && entry.kind !== 'live') {
			out[slot] = { ...entry, absorbed: kept.absorbed };
		}
	}

	return out.slice(0, ROW_SIZE);
}

/**
 * Posters for shows whose history predates us keeping them. Streamed, so the
 * row renders at once with whatever art it has and swaps when these land, and
 * each lookup writes itself back to the row so it happens once per show.
 */
async function seriesArt(userId: string, entries: RecentEntry[]): Promise<Record<number, string>> {
	const wanted = new Map<number, number>(); // seriesId -> connectionId
	for (const e of entries) {
		if (e.kind === 'series' && e.seriesId != null && !e.icon) wanted.set(e.seriesId, e.connectionId);
	}
	const pending = db
		.select({ seriesId: watchProgress.seriesId, connectionId: watchProgress.connectionId })
		.from(watchProgress)
		.where(
			and(
				eq(watchProgress.userId, userId),
				eq(watchProgress.streamType, 'episode'),
				isNull(watchProgress.seriesIcon),
				inArray(
					watchProgress.seriesId,
					entries.flatMap((e) => (e.kind === 'series' && e.seriesId != null ? [e.seriesId] : []))
				)
			)
		)
		.all();
	for (const row of pending) {
		if (row.seriesId != null) wanted.set(row.seriesId, row.connectionId);
	}

	const art: Record<number, string> = {};
	await Promise.all(
		[...wanted].slice(0, 8).map(async ([seriesId, connectionId]) => {
			const conn = getConnection(userId, connectionId);
			if (!conn) return;
			try {
				const info = await getSeriesInfo(conn, seriesId);
				const cover = info.info?.cover;
				if (typeof cover !== 'string' || !cover) return;
				art[seriesId] = cover;
				db.update(watchProgress)
					.set({ seriesIcon: cover })
					.where(
						and(
							eq(watchProgress.userId, userId),
							eq(watchProgress.connectionId, connectionId),
							eq(watchProgress.seriesId, seriesId)
						)
					)
					.run();
			} catch {
				// Artwork is a nicety; the card still has the episode still
			}
		})
	);
	return art;
}

async function popularShows(userId: string, conn: Connection) {
	try {
		const cats = rowCategories(
			userId,
			conn.id,
			'series',
			(await getSeriesCategories(conn)) ?? [],
			SHOWS_CATALOG
		);
		const lists = await Promise.all(
			cats.map((c) =>
				getSeries(conn, c.id, CATEGORY_TIMEOUT)
					.then((list) =>
						topRated(
							(list ?? []).map((s) => ({
								id: s.series_id,
								name: s.name,
								image: s.cover,
								rating: s.rating,
								added: s.last_modified
							})),
							quotaPer(cats.length)
						)
					)
					// A category that times out costs its slice of the row, nothing more
					.catch(() => [])
			)
		);
		return uniqueByTitle(roundRobin(lists, ROW_SIZE * 2)).slice(0, ROW_SIZE);
	} catch {
		// A dead row beats a dead page
		return [];
	}
}

async function popularMovies(userId: string, conn: Connection) {
	try {
		const cats = rowCategories(userId, conn.id, 'vod', (await getVodCategories(conn)) ?? []);
		const lists = await Promise.all(
			cats.map((c) =>
				getVodStreams(conn, c.id, CATEGORY_TIMEOUT)
					.then((list) =>
						topRated(
							(list ?? []).map((m) => ({
								id: m.stream_id,
								name: m.name,
								image: m.stream_icon,
								rating: m.rating,
								added: m.added
							})),
							quotaPer(cats.length)
						)
					)
					.catch(() => [])
			)
		);
		return uniqueByTitle(roundRobin(lists, ROW_SIZE * 2)).slice(0, ROW_SIZE);
	} catch {
		return [];
	}
}

/**
 * Channels have no rating to sort on, so the row is simply the head of each
 * category it draws from.
 */
async function liveChannels(userId: string, conn: Connection) {
	try {
		const cats = rowCategories(userId, conn.id, 'live', (await getLiveCategories(conn)) ?? []);
		const lists = await Promise.all(
			cats.map((c) =>
				getLiveStreams(conn, c.id, CATEGORY_TIMEOUT)
					.then((list) =>
						(list ?? [])
							.filter((s) => s.stream_icon && isPlayableTitle(s.name))
							.slice(0, quotaPer(cats.length))
							.map((s) => ({ id: s.stream_id, name: s.name, image: s.stream_icon, rating: 0 }))
					)
					.catch(() => [])
			)
		);
		return uniqueByTitle(roundRobin(lists, ROW_SIZE * 2)).slice(0, ROW_SIZE);
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

	const recents = recentlyWatched(user.id);

	return {
		recents,
		favorites: favs,
		hasConnection: conn != null,
		connId: conn?.id ?? 0,
		// Streamed: history and favorites render immediately, artwork and
		// catalog rows fill in
		seriesArt: seriesArt(user.id, recents),
		popularShows: conn ? popularShows(user.id, conn) : [],
		popularMovies: conn ? popularMovies(user.id, conn) : [],
		liveChannels: conn ? liveChannels(user.id, conn) : []
	};
};
