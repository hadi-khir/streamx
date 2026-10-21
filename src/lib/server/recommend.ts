import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { connections, favorites, watchProgress } from '$lib/server/db/schema';
import { findItem, genreWords, getCatalog, titleIndex, type Catalog, type CatalogItem } from '$lib/server/catalog';
import type { XtreamConn } from '$lib/server/xtream';
import { isPlayableTitle, titleKey } from '$lib/server/popular';
import { lookup, recommendations, trending, type TmdbTitle } from '$lib/server/tmdb';

/**
 * Suggestions from what you actually watch. Xtream carries no popularity or
 * similarity data, so the signals are what the catalog does have —
 * category, genre words, cast — weighted by how recently and how far you
 * watched, plus TMDB's "people also watched" and weekly trending lists,
 * matched back to titles this provider really carries.
 */

const DAY = 24 * 60 * 60 * 1000;
// A title watched three weeks ago counts half as much as one watched today
const HALF_LIFE_DAYS = 21;

export interface Pick {
	kind: 'movie' | 'series';
	id: number;
	name: string;
	image: string;
	rating: number | null;
	ext?: string;
}

export interface Anchor {
	item: CatalogItem;
	weight: number;
	lastWatched: number;
}

export interface Taste {
	categories: Map<string, number>;
	genres: Map<string, number>;
	people: Map<string, number>;
	/** Everything already watched or listed, by provider id and by normalised title */
	seenIds: Set<string>;
	seenTitles: Set<string>;
	/** Watched titles, most recent first — the "because you watched" seeds */
	anchors: Anchor[];
}

function toPick(item: CatalogItem): Pick {
	return {
		kind: item.kind,
		id: item.id,
		name: item.name,
		image: item.image,
		rating: item.rating,
		...(item.ext ? { ext: item.ext } : {})
	};
}

function add(map: Map<string, number>, key: string, w: number) {
	map.set(key, (map.get(key) ?? 0) + w);
}

/** The user's taste on this provider, from watch history and their list. */
export function buildTaste(userId: string, serverUrl: string, catalog: Catalog): Taste {
	const host = serverUrl.replace(/\/+$/, '').toLowerCase();
	// Two logins on one server share a library, so history pools across them
	const sameProvider = new Set(
		db
			.select({ id: connections.id, serverUrl: connections.serverUrl })
			.from(connections)
			.where(eq(connections.userId, userId))
			.all()
			.filter((c) => c.serverUrl.replace(/\/+$/, '').toLowerCase() === host)
			.map((c) => c.id)
	);

	const taste: Taste = {
		categories: new Map(),
		genres: new Map(),
		people: new Map(),
		seenIds: new Set(),
		seenTitles: new Set(),
		anchors: []
	};

	const rows = db
		.select()
		.from(watchProgress)
		.where(eq(watchProgress.userId, userId))
		.orderBy(desc(watchProgress.updatedAt))
		.limit(400)
		.all()
		.filter((r) => sameProvider.has(r.connectionId) && r.streamType !== 'live');

	// One entry per title: a show's episodes pool into the show
	const titles = new Map<string, { kind: 'movie' | 'series'; id: number; name: string; last: number; engagement: number }>();
	for (const row of rows) {
		const isEpisode = row.streamType === 'episode' && row.seriesId != null;
		const kind = isEpisode ? 'series' : 'movie';
		const id = isEpisode ? row.seriesId! : row.streamId;
		const key = `${kind}:${id}`;
		const done = row.duration > 0 ? Math.min(1, row.position / row.duration) : 0.3;
		const entry = titles.get(key);
		if (entry) {
			// Each further episode is more evidence you like the show
			entry.engagement = Math.min(2, entry.engagement + 0.25 + done * 0.25);
			continue;
		}
		titles.set(key, {
			kind,
			id,
			name: isEpisode ? row.name.split(' — ')[0] : row.name,
			last: row.updatedAt,
			// Bailing out in the first minutes is a weak, not a strong, signal
			engagement: kind === 'series' ? 0.6 + done * 0.4 : Math.max(0.25, done)
		});
	}

	const favs = db
		.select()
		.from(favorites)
		.where(eq(favorites.userId, userId))
		.all()
		.filter((f) => sameProvider.has(f.connectionId) && f.streamType !== 'live');
	for (const f of favs) {
		const kind = f.streamType === 'series' ? 'series' : 'movie';
		const key = `${kind}:${f.streamId}`;
		const entry = titles.get(key);
		// A deliberate "add to my list" outweighs a casual click
		if (entry) entry.engagement += 0.75;
		else titles.set(key, { kind, id: f.streamId, name: f.name, last: f.createdAt, engagement: 1 });
	}

	const now = Date.now();
	for (const [key, t] of titles) {
		taste.seenIds.add(key);
		const tk = titleKey(t.name);
		if (tk) taste.seenTitles.add(tk);
		const item = findItem(catalog, t.kind, t.id);
		if (!item) continue;
		const ageDays = Math.max(0, (now - t.last) / DAY);
		const weight = t.engagement * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
		add(taste.categories, item.cat, weight);
		for (const g of item.genres) add(taste.genres, g, weight);
		for (const p of item.people ?? []) add(taste.people, p, weight);
		taste.anchors.push({ item, weight, lastWatched: t.last });
	}
	taste.anchors.sort((a, b) => b.lastWatched - a.lastWatched);
	return taste;
}

function maxOf(map: Map<string, number>): number {
	let m = 0;
	for (const v of map.values()) if (v > m) m = v;
	return m || 1;
}

/** Provider ratings are often a flat 10, so they only nudge, never lead. */
function quality(item: CatalogItem): number {
	if (item.rating == null) return 0.35;
	if (item.rating >= 10) return 0.6;
	return Math.max(0, Math.min(1, (item.rating - 4) / 5));
}

function freshness(item: CatalogItem, now: number): number {
	if (!item.added) return 0;
	const ageDays = (now / 1000 - item.added) / 86400;
	return ageDays < 0 ? 1 : Math.pow(0.5, ageDays / 45);
}

function eligible(item: CatalogItem, taste: Taste | null, englishOnly: boolean): boolean {
	if (!item.image || !isPlayableTitle(item.name)) return false;
	if (englishOnly && !item.en) return false;
	if (taste) {
		if (taste.seenIds.has(`${item.kind}:${item.id}`)) return false;
		const tk = titleKey(item.name);
		if (tk && taste.seenTitles.has(tk)) return false;
	}
	return true;
}

/**
 * Highest scores first, but no category may crowd the row: each further pick
 * from one category is discounted, and a title listed twice shows once.
 */
function diversify(scored: { item: CatalogItem; score: number }[], limit: number, spread = 0.8): CatalogItem[] {
	const pool = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit * 8);
	const out: CatalogItem[] = [];
	const perCat = new Map<string, number>();
	const titles = new Set<string>();
	while (out.length < limit && pool.length) {
		let best = -1;
		let bestScore = -Infinity;
		for (let i = 0; i < pool.length; i++) {
			const s = pool[i].score * Math.pow(spread, perCat.get(pool[i].item.cat) ?? 0);
			if (s > bestScore) {
				bestScore = s;
				best = i;
			}
		}
		const [{ item }] = pool.splice(best, 1);
		const tk = titleKey(item.name);
		if (tk && titles.has(tk)) continue;
		if (tk) titles.add(tk);
		perCat.set(item.cat, (perCat.get(item.cat) ?? 0) + 1);
		out.push(item);
	}
	return out;
}

function englishOnly(catalog: Catalog): boolean {
	// Providers that tag no language would otherwise have nothing to suggest
	return catalog.items.some((i) => i.en);
}

/** "Top picks for you": the whole catalog against your taste. */
export function topPicks(catalog: Catalog, taste: Taste, limit = 20): Pick[] {
	if (!taste.anchors.length) return [];
	const en = englishOnly(catalog);
	const maxCat = maxOf(taste.categories);
	const maxGenre = maxOf(taste.genres);
	const maxPeople = maxOf(taste.people);
	const now = Date.now();
	const scored = [];
	for (const item of catalog.items) {
		const cat = (taste.categories.get(item.cat) ?? 0) / maxCat;
		let genre = 0;
		for (const g of item.genres) genre += (taste.genres.get(g) ?? 0) / maxGenre;
		genre = item.genres.length ? genre / Math.sqrt(item.genres.length) : 0;
		let cast = 0;
		for (const p of item.people ?? []) cast += (taste.people.get(p) ?? 0) / maxPeople;
		// Nothing in common with anything you watched: not a pick
		if (cat === 0 && genre === 0 && cast === 0) continue;
		if (!eligible(item, taste, en)) continue;
		const score =
			0.4 * cat + 0.35 * Math.min(1, genre) + 0.1 * Math.min(1, cast) + 0.1 * quality(item) + 0.05 * freshness(item, now);
		scored.push({ item, score });
	}
	return diversify(scored, limit).map(toPick);
}

function jaccard(a: string[], b: string[]): number {
	if (!a.length || !b.length) return 0;
	const set = new Set(a);
	let both = 0;
	for (const x of b) if (set.has(x)) both++;
	return both / (a.length + b.length - both);
}

function matchTitles(catalog: Catalog, titles: TmdbTitle[], en: boolean, taste: Taste | null): CatalogItem[] {
	const index = titleIndex(catalog);
	const out: CatalogItem[] = [];
	const used = new Set<string>();
	for (const t of titles) {
		const candidates = index.get(titleKey(t.title));
		if (!candidates) continue;
		const kind = t.type === 'movie' ? 'movie' : 'series';
		// Same title, right kind; a matching year settles remakes
		const match =
			candidates.find((c) => c.kind === kind && t.year && c.year === Number(t.year) && eligible(c, taste, en)) ??
			candidates.find((c) => c.kind === kind && eligible(c, taste, en));
		if (!match || used.has(`${match.kind}:${match.id}`)) continue;
		used.add(`${match.kind}:${match.id}`);
		out.push(match);
	}
	return out;
}

/**
 * Titles like `anchor`: TMDB's audience recommendations that this provider
 * carries come first, then the catalog's nearest neighbours by category,
 * genre and cast.
 */
export async function similarTo(
	catalog: Catalog,
	anchor: CatalogItem,
	taste: Taste | null,
	limit = 20
): Promise<Pick[]> {
	const en = englishOnly(catalog) && anchor.en;
	const exclude = (i: CatalogItem) => i.kind === anchor.kind && i.id === anchor.id;
	const anchorKey = titleKey(anchor.name);

	let fromTmdb: CatalogItem[] = [];
	const type = anchor.kind === 'movie' ? 'movie' : 'tv';
	const info = await lookup(type, anchor.name).catch(() => null);
	if (info?.id) {
		const recs = await recommendations(type, info.id).catch(() => []);
		fromTmdb = matchTitles(catalog, recs, en, taste).filter((i) => !exclude(i) && titleKey(i.name) !== anchorKey);
	}

	const now = Date.now();
	const taken = new Set(fromTmdb.map((i) => `${i.kind}:${i.id}`));
	const scored = [];
	for (const item of catalog.items) {
		if (exclude(item) || taken.has(`${item.kind}:${item.id}`)) continue;
		const sameCat = item.cat === anchor.cat ? 1 : 0;
		const genre = jaccard(anchor.genres, item.genres);
		const cast = jaccard(anchor.people ?? [], item.people ?? []);
		if (!sameCat && genre === 0 && cast === 0) continue;
		if (!eligible(item, taste, en)) continue;
		if (titleKey(item.name) === anchorKey) continue;
		const score =
			0.35 * sameCat +
			0.35 * genre +
			0.15 * cast +
			(item.kind === anchor.kind ? 0.05 : 0) +
			0.07 * quality(item) +
			0.03 * freshness(item, now);
		scored.push({ item, score });
	}
	const neighbours = diversify(scored, limit, 0.9);
	return [...fromTmdb, ...neighbours].slice(0, limit).map(toPick);
}

/** This week's TMDB trending titles that this provider carries. */
export async function trendingNow(catalog: Catalog, taste: Taste | null, limit = 20): Promise<Pick[]> {
	const titles = await trending().catch(() => []);
	// Trending is for discovery, but finished titles still don't belong in it
	return matchTitles(catalog, titles, englishOnly(catalog), taste).slice(0, limit).map(toPick);
}

/** Recent additions to the provider that are recent films and shows, too. */
export function newArrivals(catalog: Catalog, taste: Taste | null, limit = 20): Pick[] {
	const en = englishOnly(catalog);
	const thisYear = new Date().getFullYear();
	const scored = catalog.items
		.filter((i) => i.added > 0 && (i.year == null || i.year >= thisYear - 1) && eligible(i, taste, en))
		.map((item) => ({ item, score: item.added }));
	return diversify(scored, limit, 0.85).map(toPick);
}

/** Your strongest genre, and the best of it you haven't seen. */
export function genreRow(catalog: Catalog, taste: Taste, skip: Set<string>, limit = 20): { genre: string; picks: Pick[] } | null {
	const ranked = [...taste.genres].sort((a, b) => b[1] - a[1]).map(([g]) => g);
	const en = englishOnly(catalog);
	const now = Date.now();
	for (const genre of ranked.slice(0, 3)) {
		const scored = catalog.items
			.filter((i) => i.genres.includes(genre) && !skip.has(`${i.kind}:${i.id}`) && eligible(i, taste, en))
			.map((item) => ({
				item,
				score: 0.5 * quality(item) + 0.3 * freshness(item, now) + 0.2 * ((taste.categories.get(item.cat) ?? 0) / maxOf(taste.categories))
			}));
		const picks = diversify(scored, limit).map(toPick);
		if (picks.length >= 8) return { genre, picks };
	}
	return null;
}

/**
 * "More like this" for a detail page. Never waits on a catalog build: a
 * cold start just shows no row this time.
 */
export async function moreLikeThis(
	conn: XtreamConn,
	kind: 'movie' | 'series',
	id: number,
	fallback: { name: string; categoryId?: unknown; genre?: unknown; cast?: unknown },
	limit = 18
): Promise<Pick[]> {
	const catalog = await getCatalog(conn, 0);
	if (!catalog.items.length) return [];
	let anchor = findItem(catalog, kind, id);
	if (!anchor) {
		// Not indexed yet (a category the build hasn't reached): describe it from its info
		const cat = typeof fallback.categoryId === 'string' || typeof fallback.categoryId === 'number' ? String(fallback.categoryId) : '';
		const category = catalog.categories[cat];
		anchor = {
			kind,
			id,
			name: fallback.name,
			image: '',
			rating: null,
			added: 0,
			cat,
			genres: genreWords(typeof fallback.genre === 'string' ? fallback.genre : null, category?.name),
			en: category?.en ?? true,
			people: typeof fallback.cast === 'string' ? fallback.cast.toLowerCase().split(/\s*,\s*/).slice(0, 6) : []
		};
	}
	// Unlike the home rows, "more like this" may include things you've seen
	return similarTo(catalog, anchor, null, limit);
}
