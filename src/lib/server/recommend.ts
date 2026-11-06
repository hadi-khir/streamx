import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { connections, favorites, watchProgress } from '$lib/server/db/schema';
import { findItem, genreWords, getCatalog, titleIndex, type Catalog, type CatalogItem } from '$lib/server/catalog';
import type { XtreamConn } from '$lib/server/xtream';
import { isPlayableTitle, titleKey } from '$lib/server/popular';
import { lookup, recommendations, trending, type TmdbTitle } from '$lib/server/tmdb';
import { hiddenFilter, hiddenOnProvider } from '$lib/server/hidden';

/**
 * Suggestions from what you actually watch. Two kinds of evidence, blended:
 * what audiences who liked the same titles went on to watch (TMDB's
 * recommendations, matched back to what this provider really carries), and how
 * closely a title's genres and cast match your own. Xtream has no popularity
 * data of its own, so without TMDB the second one carries the row alone.
 */

const DAY = 24 * 60 * 60 * 1000;
// Recent viewing counts for more, but old favourites never fade out entirely
const HALF_LIFE_DAYS = 45;
const LONG_TERM_SHARE = 0.25;
// Left within five minutes, and hadn't come back days later: not for you
const BAILED_SECONDS = 5 * 60;
const BAILED_AFTER_DAYS = 3;
const REJECTED = -0.5;
// Saying so outright is firmer than leaving, and outweighs having watched it
const NOT_FOR_ME = -0.8;
// How many watched titles get asked about, and how many of them become rows
const AUDIENCE_SEEDS = 8;
const AUDIENCE_TIMEOUT = 10_000;
const SEED_POOL = 6;
const RELEVANCE_FLOOR = 0.4;

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
	/** Signed: titles you walked away from count against what they're made of */
	categories: Map<string, number>;
	genres: Map<string, number>;
	people: Map<string, number>;
	genreNorm: number;
	peopleNorm: number;
	maxCategory: number;
	/** Share of your interest in films and in shows */
	kinds: { movie: number; series: number };
	/** Everything already watched or listed, by provider id and by normalised title */
	seenIds: Set<string>;
	seenTitles: Set<string>;
	/** Titles you liked, strongest first: what recommendations are drawn from */
	anchors: Anchor[];
	/** Titles you left early */
	rejected: Anchor[];
	/** Changes daily, and differs per person, so rows don't stand still */
	rotation: string;
	audience?: Promise<Audience>;
}

interface Audience {
	/** How strongly audiences of your titles point at each one, 0 to 1 */
	scores: Map<string, number>;
	/** TMDB's score for a title, where enough people voted for it to mean anything */
	ratings: Map<string, number>;
	trending: Set<string>;
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

const idfs = new WeakMap<object, { genres: Map<string, number>; people: Map<string, number> }>();

/**
 * How much sharing a genre or person says. Most of a catalog is "drama", so
 * sharing that means little; sharing "western" or one actor means a lot.
 */
function rarity(catalog: Catalog) {
	let idf = idfs.get(catalog);
	if (!idf) {
		const genres = new Map<string, number>();
		const people = new Map<string, number>();
		for (const item of catalog.items) {
			for (const g of item.genres) add(genres, g, 1);
			for (const p of item.people ?? []) add(people, p, 1);
		}
		const total = catalog.items.length + 1;
		for (const map of [genres, people]) {
			for (const [key, count] of map) map.set(key, Math.log(1 + total / count));
		}
		idf = { genres, people };
		idfs.set(catalog, idf);
	}
	return idf;
}

interface Viewing {
	kind: 'movie' | 'series';
	id: number;
	name: string;
	last: number;
	/** Episodes opened, and episodes seen through to the end */
	started: number;
	finished: number;
	seconds: number;
	furthest: number;
	listed: boolean;
	notForMe: boolean;
}

/** What one title's viewing says about you: positive if you liked it, negative if you left. */
function interest(v: Viewing, now: number): number {
	if (v.notForMe) return NOT_FOR_ME;
	let score: number;
	if (v.kind === 'series' && (v.finished > 0 || v.started > 1)) {
		// Every further episode is another decision to keep watching
		score = Math.min(2, 0.5 + 0.4 * v.finished + 0.1 * (v.started - v.finished));
	} else if (v.started === 0) {
		score = 0; // Only listed
	} else if (v.kind === 'movie' && v.furthest >= 0.7) {
		score = 1.2;
	} else if (v.seconds >= 20 * 60 || v.furthest >= 0.3) {
		score = 0.5;
	} else if (v.seconds < BAILED_SECONDS && (now - v.last) / DAY > BAILED_AFTER_DAYS) {
		score = REJECTED;
	} else {
		score = 0.15; // Just started: too soon to read anything into it
	}
	// A deliberate save outweighs anything a casual click implies
	return v.listed ? Math.max(score, 0) + 0.8 : score;
}

function norm(values: Iterable<number>): number {
	let sum = 0;
	for (const v of values) sum += v * v;
	return Math.sqrt(sum) || 1;
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

	const now = Date.now();
	const taste: Taste = {
		categories: new Map(),
		genres: new Map(),
		people: new Map(),
		genreNorm: 1,
		peopleNorm: 1,
		maxCategory: 1,
		kinds: { movie: 0.5, series: 0.5 },
		seenIds: new Set(),
		seenTitles: new Set(),
		anchors: [],
		rejected: [],
		rotation: `${userId}:${Math.floor(now / DAY)}`
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
	const titles = new Map<string, Viewing>();
	for (const row of rows) {
		const isEpisode = row.streamType === 'episode' && row.seriesId != null;
		const kind = isEpisode ? 'series' : 'movie';
		const id = isEpisode ? row.seriesId! : row.streamId;
		const key = `${kind}:${id}`;
		const done = row.duration > 0 ? Math.min(1, row.position / row.duration) : 0;
		let entry = titles.get(key);
		if (!entry) {
			entry = {
				kind,
				id,
				name: isEpisode ? row.name.split(' — ')[0] : row.name,
				last: row.updatedAt,
				started: 0,
				finished: 0,
				seconds: 0,
				furthest: 0,
				listed: false,
				notForMe: false
			};
			titles.set(key, entry);
		}
		entry.started++;
		if (done >= 0.85) entry.finished++;
		entry.seconds += row.position;
		entry.furthest = Math.max(entry.furthest, done);
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
		if (entry) entry.listed = true;
		else {
			titles.set(key, {
				kind,
				id: f.streamId,
				name: f.name,
				last: f.createdAt,
				started: 0,
				finished: 0,
				seconds: 0,
				furthest: 0,
				listed: true,
				notForMe: false
			});
		}
	}

	for (const h of hiddenOnProvider(userId, serverUrl)) {
		const kind = h.kind === 'series' ? 'series' : 'movie';
		const key = `${kind}:${h.streamId}`;
		const entry = titles.get(key);
		if (entry) entry.notForMe = true;
		else {
			titles.set(key, {
				kind,
				id: h.streamId,
				name: h.name,
				last: h.createdAt,
				started: 0,
				finished: 0,
				seconds: 0,
				furthest: 0,
				listed: false,
				notForMe: true
			});
		}
	}

	const interestByKind = { movie: 0, series: 0 };
	for (const [key, t] of titles) {
		taste.seenIds.add(key);
		const tk = titleKey(t.name);
		if (tk) taste.seenTitles.add(tk);
		const item = findItem(catalog, t.kind, t.id);
		if (!item) continue;
		const ageDays = Math.max(0, (now - t.last) / DAY);
		const recency = LONG_TERM_SHARE + (1 - LONG_TERM_SHARE) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
		const weight = interest(t, now) * recency;
		if (weight === 0) continue;
		add(taste.categories, item.cat, weight);
		for (const g of item.genres) add(taste.genres, g, weight);
		for (const p of item.people ?? []) add(taste.people, p, weight);
		if (weight > 0) {
			interestByKind[t.kind] += weight;
			taste.anchors.push({ item, weight, lastWatched: t.last });
		} else {
			taste.rejected.push({ item, weight, lastWatched: t.last });
		}
	}
	taste.anchors.sort((a, b) => b.weight - a.weight);
	taste.rejected.sort((a, b) => a.weight - b.weight);

	const idf = rarity(catalog);
	taste.genreNorm = norm([...taste.genres].map(([g, w]) => w * (idf.genres.get(g) ?? 0)));
	taste.peopleNorm = norm([...taste.people].map(([p, w]) => w * (idf.people.get(p) ?? 0)));
	taste.maxCategory = Math.max(1e-6, ...[...taste.categories.values()].map(Math.abs));
	const total = interestByKind.movie + interestByKind.series;
	if (total > 0) taste.kinds = { movie: interestByKind.movie / total, series: interestByKind.series / total };
	return taste;
}

/** Likeness of `features` to your profile, each weighted by how telling it is: -1 to 1. */
function likeness(features: string[], prefs: Map<string, number>, idf: Map<string, number>, prefNorm: number): number {
	let dot = 0;
	let own = 0;
	for (const f of features) {
		const rare = idf.get(f) ?? 0;
		dot += rare * rare * (prefs.get(f) ?? 0);
		own += rare * rare;
	}
	return own > 0 ? dot / (Math.sqrt(own) * prefNorm) : 0;
}

/** How well a title's genres, cast and category match your taste. */
function contentMatch(item: CatalogItem, taste: Taste, catalog: Catalog): number {
	const idf = rarity(catalog);
	const genre = likeness(item.genres, taste.genres, idf.genres, taste.genreNorm);
	const cast = likeness(item.people ?? [], taste.people, idf.people, taste.peopleNorm);
	// A provider's folders describe the provider as much as the title, so it only nudges
	const category = (taste.categories.get(item.cat) ?? 0) / taste.maxCategory;
	return 0.7 * genre + 0.15 * cast + 0.15 * category;
}

/** The same number for the same title and day, so rows rotate daily, not per page load. */
function dailyJitter(rotation: string, key: string): number {
	let hash = 0;
	for (const char of rotation + key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	return (Math.abs(hash) % 1000) / 1000;
}

/**
 * Asks what audiences of your liked titles went on to watch. A title several of
 * them point at, near the top of each list, scores highest. Answers are cached
 * for a day, and a slow TMDB just means this row leans on content for now.
 */
function audienceOf(catalog: Catalog, taste: Taste): Promise<Audience> {
	taste.audience ??= (async () => {
		const empty: Audience = { scores: new Map(), ratings: new Map(), trending: new Set() };
		const en = englishOnly(catalog);
		const raw = new Map<string, number>();
		const ask = async (seed: Anchor) => {
			const type = seed.item.kind === 'movie' ? 'movie' : 'tv';
			const info = await lookup(type, seed.item.name).catch(() => null);
			if (!info?.id) return;
			const recs = await recommendations(type, info.id).catch(() => []);
			recs.forEach((rec, rank) => {
				const match = matchTitles(catalog, [rec], en, taste)[0];
				if (!match) return;
				const key = `${match.kind}:${match.id}`;
				add(raw, key, seed.weight / (rank + 5));
				if (rec.votes >= 50) empty.ratings.set(key, rec.rating);
			});
		};
		const seeds = [...taste.anchors.slice(0, AUDIENCE_SEEDS), ...taste.rejected.slice(0, 3)];
		const asked = Promise.all([
			...seeds.map(ask),
			trending()
				.catch(() => [])
				.then((titles) => {
					for (const item of matchTitles(catalog, titles, en, taste)) empty.trending.add(`${item.kind}:${item.id}`);
				})
		]);
		await Promise.race([asked, new Promise((resolve) => setTimeout(resolve, AUDIENCE_TIMEOUT))]);
		const top = Math.max(0, ...raw.values());
		for (const [key, value] of raw) {
			// Square root: being on one list matters, without the top few drowning out the rest
			if (value > 0) empty.scores.set(key, Math.sqrt(value / top));
		}
		return empty;
	})();
	return taste.audience;
}

/**
 * The titles that get a "because you watched" row: your strongest always, the
 * rest changing from day to day among the next few.
 */
export function seedsFor(taste: Taste, count: number): Anchor[] {
	const [first, ...rest] = taste.anchors.slice(0, SEED_POOL);
	if (!first) return [];
	const others = rest.sort((a, b) => dailyJitter(taste.rotation, a.item.name) - dailyJitter(taste.rotation, b.item.name));
	return [first, ...others].slice(0, count);
}

/** Provider ratings are often a flat 10, so they only nudge, never lead. */
function quality(item: CatalogItem, audienceRating?: number): number {
	// Real votes beat whatever the provider typed in
	if (audienceRating != null) return Math.max(0, Math.min(1, (audienceRating - 5) / 3));
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

/** How much two titles overlap: mostly genre, with a shared category on top. */
function overlap(a: CatalogItem, b: CatalogItem): number {
	const genre = jaccard(a.genres, b.genres);
	return Math.min(1, genre + (a.cat === b.cat ? 0.2 : 0));
}

/**
 * Highest scores first, but each pick is discounted by how much it resembles
 * what's already chosen, so one genre or category can't fill a row. A title
 * listed twice shows once.
 */
function diversify(scored: { item: CatalogItem; score: number }[], limit: number, spread = 0.8): CatalogItem[] {
	// Candidates per genre, not just the very top: one strong genre could fill any
	// fixed-size slice of the ranking, and the others would never be weighed against it
	const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
	const pool: typeof ranked = [];
	const perGenre = new Map<string, number>();
	for (const s of ranked) {
		const open = s.item.genres.some((g) => (perGenre.get(g) ?? 0) < limit * 2);
		if (!open && pool.length >= limit * 8) continue;
		for (const g of s.item.genres) add(perGenre, g, 1);
		pool.push(s);
	}
	const out: CatalogItem[] = [];
	const titles = new Set<string>();
	while (out.length < limit && pool.length) {
		let best = -1;
		let bestScore = -Infinity;
		for (let i = 0; i < pool.length; i++) {
			// The more of the row it resembles, the more it costs
			let crowding = 0;
			for (const chosen of out) crowding += overlap(pool[i].item, chosen);
			const s = pool[i].score * Math.pow(spread, crowding);
			if (s > bestScore) {
				bestScore = s;
				best = i;
			}
		}
		const [{ item }] = pool.splice(best, 1);
		const tk = titleKey(item.name);
		if (tk && titles.has(tk)) continue;
		if (tk) titles.add(tk);
		out.push(item);
	}
	return out;
}

function englishOnly(catalog: Catalog): boolean {
	// Providers that tag no language would otherwise have nothing to suggest
	return catalog.items.some((i) => i.en);
}

/** "Picked for you": the whole catalog against your taste and your audiences. */
export async function topPicks(catalog: Catalog, taste: Taste, limit = 20): Promise<Pick[]> {
	if (!taste.anchors.length) return [];
	const en = englishOnly(catalog);
	const audience = await audienceOf(catalog, taste);
	const hasAudience = audience.scores.size > 0;
	const now = Date.now();
	const scored = [];
	for (const item of catalog.items) {
		const key = `${item.kind}:${item.id}`;
		const audienceScore = audience.scores.get(key) ?? 0;
		const content = contentMatch(item, taste, catalog);
		// Nothing points at it and nothing about it matches: not a pick
		if (audienceScore === 0 && content <= 0.05) continue;
		if (!eligible(item, taste, en)) continue;
		const match = Math.max(-1, content);
		const shared =
			0.1 * quality(item, audience.ratings.get(key)) +
			0.05 * freshness(item, now) +
			0.05 * (audience.trending.has(key) ? 1 : 0) +
			0.03 * dailyJitter(taste.rotation, key);
		const score = hasAudience ? 0.45 * audienceScore + 0.3 * match + shared : 0.75 * match + shared;
		// Mostly watch shows? Then shows, a little more often
		scored.push({ item, score: score * (0.9 + 0.2 * taste.kinds[item.kind]) });
	}
	// Variety must never mean a poor match: nothing far below your best one qualifies
	const best = Math.max(0, ...scored.map((s) => s.score));
	return diversify(scored.filter((s) => s.score >= best * RELEVANCE_FLOOR), limit, 0.88).map(toPick);
}

function jaccard(a: string[], b: string[]): number {
	if (!a.length || !b.length) return 0;
	const set = new Set(a);
	let both = 0;
	for (const x of b) if (set.has(x)) both++;
	return both / (a.length + b.length - both);
}

/** Jaccard where a shared rare feature counts for more than a shared common one. */
function rareOverlap(a: string[], b: string[], idf: Map<string, number>): number {
	if (!a.length || !b.length) return 0;
	const inA = new Set(a);
	let both = 0;
	let either = 0;
	for (const x of a) either += idf.get(x) ?? 0;
	for (const x of b) {
		const rare = idf.get(x) ?? 0;
		if (inA.has(x)) both += rare;
		else either += rare;
	}
	return either > 0 ? both / either : 0;
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
	const idf = rarity(catalog);
	const taken = new Set(fromTmdb.map((i) => `${i.kind}:${i.id}`));
	const scored = [];
	for (const item of catalog.items) {
		if (exclude(item) || taken.has(`${item.kind}:${item.id}`)) continue;
		const sameCat = item.cat === anchor.cat ? 1 : 0;
		const genre = rareOverlap(anchor.genres, item.genres, idf.genres);
		const cast = rareOverlap(anchor.people ?? [], item.people ?? [], idf.people);
		if (!sameCat && genre === 0 && cast === 0) continue;
		if (!eligible(item, taste, en)) continue;
		if (titleKey(item.name) === anchorKey) continue;
		const score =
			0.15 * sameCat +
			0.5 * genre +
			0.2 * cast +
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

/** Recent additions that are recent films and shows too, the likelier for you first. */
export function newArrivals(catalog: Catalog, taste: Taste | null, limit = 20): Pick[] {
	const en = englishOnly(catalog);
	const thisYear = new Date().getFullYear();
	const now = Date.now();
	const scored = catalog.items
		.filter((i) => i.added > 0 && (i.year == null || i.year >= thisYear - 1) && eligible(i, taste, en))
		.map((item) => ({
			item,
			score: freshness(item, now) * (taste ? 0.6 + 0.4 * Math.max(0, contentMatch(item, taste, catalog)) : 1)
		}));
	return diversify(scored, limit, 0.85).map(toPick);
}

/**
 * The genre you favour most compared with the catalog at large, not simply your
 * biggest (which would be "drama" for nearly everyone), and the best of it you
 * haven't seen.
 */
export function genreRow(catalog: Catalog, taste: Taste, skip: Set<string>, limit = 20): { genre: string; picks: Pick[] } | null {
	const idf = rarity(catalog);
	const strongest = Math.max(0, ...taste.genres.values());
	const ranked = [...taste.genres]
		.filter(([, weight]) => weight >= strongest * 0.25 && weight > 0)
		.sort((a, b) => b[1] * (idf.genres.get(b[0]) ?? 0) - a[1] * (idf.genres.get(a[0]) ?? 0))
		.map(([g]) => g);
	const en = englishOnly(catalog);
	const now = Date.now();
	for (const genre of ranked.slice(0, 3)) {
		const scored = catalog.items
			.filter((i) => i.genres.includes(genre) && !skip.has(`${i.kind}:${i.id}`) && eligible(i, taste, en))
			.map((item) => ({
				item,
				score:
					0.5 * quality(item) +
					0.2 * freshness(item, now) +
					0.3 * Math.max(0, contentMatch(item, taste, catalog)) +
					0.03 * dailyJitter(taste.rotation, `${item.kind}:${item.id}`)
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
	userId: string,
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
	// Unlike the home rows, "more like this" may include things you've seen, though
	// not what you've said is not for you. Ask for spares to fill the gaps those leave.
	const isHidden = hiddenFilter(userId, conn.serverUrl);
	const picks = await similarTo(catalog, anchor, null, limit * 2);
	return picks.filter((p) => !isHidden(p.kind, p.id, p.name)).slice(0, limit);
}
