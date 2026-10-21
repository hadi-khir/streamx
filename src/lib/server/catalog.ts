import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';
import { buildApiUrl, type Category, type XtreamConn } from '$lib/server/xtream';
import { isAdultCategory, isEnglishCategory, parseRating, titleKey } from '$lib/server/popular';

/**
 * Every movie and show the provider carries, in one list. Providers won't
 * hand that over in one request (unfiltered get_vod_streams / get_series
 * never answer), so it's assembled category by category in the background,
 * kept on disk so a restart doesn't start over, and refreshed twice a day.
 * Recommendations, "More like this" and search all read from it.
 */

export interface CatalogItem {
	kind: 'movie' | 'series';
	id: number;
	name: string;
	image: string;
	rating: number | null;
	/** Unix seconds the provider added (or last updated) the title */
	added: number;
	cat: string;
	/** Lowercase genre words, from the provider's genre field and the category name */
	genres: string[];
	en: boolean;
	ext?: string;
	year?: number;
	/** Lowercase cast and director names, series only (VOD lists don't carry them) */
	people?: string[];
}

export interface Catalog {
	items: CatalogItem[];
	categories: Record<string, { name: string; kind: 'movie' | 'series'; en: boolean }>;
	builtAt: number;
	complete: boolean;
}

const REFRESH_AFTER = 12 * 60 * 60 * 1000;
const CATEGORY_TIMEOUT = 30_000;
// Gentle on the provider: a couple of category requests at a time
const CONCURRENCY = 2;
const MAX_ITEMS = 200_000;

interface State {
	catalog: Catalog | null;
	partial: CatalogItem[];
	partialCategories: Catalog['categories'];
	building: Promise<void> | null;
	loadedFromDisk: boolean;
}

const states = new Map<string, State>();

function providerKey(conn: XtreamConn): string {
	return conn.serverUrl.replace(/\/+$/, '').toLowerCase();
}

function diskPath(key: string): string {
	const dbPath = env.DATABASE_URL || './data/streamx.db';
	const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
	return join(dirname(dbPath), 'catalog', `${hash}.json`);
}

const GENRE_WORDS: [RegExp, string][] = [
	[/action/, 'action'],
	[/adventure/, 'adventure'],
	[/anim(e|ation|ated)|cartoon/, 'animation'],
	[/comed(y|ie)/, 'comedy'],
	[/crime|gangster/, 'crime'],
	[/documentar|docu/, 'documentary'],
	[/drama/, 'drama'],
	[/famil(y|le)|kids|children/, 'family'],
	[/fantas/, 'fantasy'],
	[/horror|scary/, 'horror'],
	[/myster/, 'mystery'],
	[/romanc|romant/, 'romance'],
	[/sci[\s-]?fi|science fiction/, 'sci-fi'],
	[/thrill|suspense/, 'thriller'],
	[/war\b|military/, 'war'],
	[/western/, 'western'],
	[/music|concert/, 'music'],
	[/biograph|biopic/, 'biography'],
	[/histor/, 'history'],
	[/sport/, 'sport'],
	[/reality/, 'reality'],
	[/christmas|holiday/, 'holiday']
];

/** Normalise free-text genres ("Sci-Fi & Fantasy, Action") to shared words. */
export function genreWords(...texts: (string | null | undefined)[]): string[] {
	const out = new Set<string>();
	for (const text of texts) {
		if (!text) continue;
		const lower = text.toLowerCase();
		for (const [re, word] of GENRE_WORDS) if (re.test(lower)) out.add(word);
	}
	return [...out];
}

function people(...texts: unknown[]): string[] {
	const out: string[] = [];
	for (const text of texts) {
		if (typeof text !== 'string') continue;
		for (const name of text.split(/\s*[,/]\s*/)) {
			const n = name.trim().toLowerCase();
			if (n.length > 2 && out.length < 6) out.push(n);
		}
	}
	return out;
}

function yearOf(name: string, release?: unknown): number | undefined {
	const fromName = name.match(/\((19|20)\d{2}\)/)?.[0];
	const y = Number(fromName ? fromName.slice(1, 5) : String(release ?? '').slice(0, 4));
	return y > 1900 && y < 2100 ? y : undefined;
}

async function fetchList(conn: XtreamConn, action: string, params: Record<string, string> = {}) {
	// Straight fetch, not xtreamRequest: hundreds of category listings would
	// otherwise sit in the request cache as a second copy of this index.
	const res = await fetch(buildApiUrl(conn, action, params), {
		signal: AbortSignal.timeout(CATEGORY_TIMEOUT)
	});
	if (!res.ok) throw new Error(`Xtream API error: ${res.status}`);
	return (await res.json()) as any;
}

function toItems(kind: 'movie' | 'series', list: any[], cat: string, catName: string, en: boolean): CatalogItem[] {
	if (!Array.isArray(list)) return [];
	const catGenres = genreWords(catName);
	const out: CatalogItem[] = [];
	for (const raw of list) {
		const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
		if (!name) continue;
		const image = kind === 'movie' ? raw.stream_icon : raw.cover;
		const genres = genreWords(raw.genre, catName);
		out.push({
			kind,
			id: Number(kind === 'movie' ? raw.stream_id : raw.series_id),
			name,
			image: typeof image === 'string' ? image : '',
			rating: parseRating(raw.rating),
			added: Number(kind === 'movie' ? raw.added : raw.last_modified) || 0,
			cat,
			genres: genres.length ? genres : catGenres,
			en,
			...(kind === 'movie' && raw.container_extension ? { ext: String(raw.container_extension) } : {}),
			...(yearOf(name, raw.releaseDate ?? raw.release_date) ? { year: yearOf(name, raw.releaseDate ?? raw.release_date) } : {}),
			...(kind === 'series' ? { people: people(raw.cast, raw.director) } : {})
		});
	}
	return out;
}

async function build(conn: XtreamConn, state: State) {
	let listFailed = false;
	const [vodCats, seriesCats] = await Promise.all(
		['get_vod_categories', 'get_series_categories'].map((action) =>
			fetchList(conn, action).catch(() => {
				listFailed = true;
				return [];
			})
		)
	);

	const jobs: { kind: 'movie' | 'series'; cat: Category; en: boolean }[] = [];
	for (const [kind, cats] of [
		['series', seriesCats],
		['movie', vodCats]
	] as const) {
		for (const cat of Array.isArray(cats) ? (cats as Category[]) : []) {
			if (isAdultCategory(cat.category_name)) continue;
			jobs.push({ kind, cat, en: isEnglishCategory(cat.category_name) });
		}
	}
	// English first: partial results are what the home page sees on a cold start
	jobs.sort((a, b) => Number(b.en) - Number(a.en));

	const items: CatalogItem[] = [];
	const categories: Catalog['categories'] = {};
	state.partial = items;
	state.partialCategories = categories;
	let failures = 0;

	let next = 0;
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			while (next < jobs.length && items.length < MAX_ITEMS) {
				const job = jobs[next++];
				const action = job.kind === 'movie' ? 'get_vod_streams' : 'get_series';
				try {
					const list = await fetchList(conn, action, { category_id: job.cat.category_id });
					categories[job.cat.category_id] = { name: job.cat.category_name, kind: job.kind, en: job.en };
					items.push(...toItems(job.kind, list, job.cat.category_id, job.cat.category_name, job.en));
				} catch {
					failures++;
				}
			}
		})
	);

	const catalog: Catalog = {
		items,
		categories,
		builtAt: Date.now(),
		// Mostly-failed builds retry soon rather than standing for 12 hours
		complete: !listFailed && failures <= jobs.length * 0.2
	};
	if (!catalog.complete) catalog.builtAt = Date.now() - REFRESH_AFTER + 30 * 60 * 1000;
	// A failed rebuild never replaces a good catalog, in memory or on disk
	const adopt = catalog.complete || !state.catalog || state.catalog.items.length <= items.length;
	if (adopt) state.catalog = catalog;
	else state.catalog!.builtAt = catalog.builtAt; // retry in 30 minutes, not every request
	state.partial = [];
	state.partialCategories = {};

	if (!adopt || !items.length) return;
	try {
		const path = diskPath(providerKey(conn));
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(`${path}.tmp`, JSON.stringify(catalog));
		renameSync(`${path}.tmp`, path);
	} catch (e) {
		console.error('Could not save catalog:', e);
	}
}

function stateFor(conn: XtreamConn): State {
	const key = providerKey(conn);
	let state = states.get(key);
	if (!state) {
		state = { catalog: null, partial: [], partialCategories: {}, building: null, loadedFromDisk: false };
		states.set(key, state);
	}
	if (!state.loadedFromDisk) {
		state.loadedFromDisk = true;
		try {
			state.catalog = JSON.parse(readFileSync(diskPath(key), 'utf8'));
		} catch {
			// First run for this provider
		}
	}
	return state;
}

/**
 * The provider's catalog. Starts (or refreshes) the background build when
 * needed and waits up to `waitMs` for it; a cold start returns whatever
 * categories have landed so far, which may be nothing.
 */
export async function getCatalog(conn: XtreamConn, waitMs = 0): Promise<Catalog> {
	const state = stateFor(conn);
	const stale = !state.catalog || Date.now() - state.catalog.builtAt > REFRESH_AFTER;
	if (stale && !state.building) {
		state.building = build(conn, state)
			.catch((e) => console.error('Catalog build failed:', e))
			.finally(() => {
				state.building = null;
			});
	}
	if (state.catalog) return state.catalog;
	if (state.building && waitMs > 0) {
		await Promise.race([state.building, new Promise((r) => setTimeout(r, waitMs))]);
		if (state.catalog) return state.catalog;
	}
	return { items: [...state.partial], categories: { ...state.partialCategories }, builtAt: 0, complete: false };
}

const byKey = new WeakMap<object, Map<string, CatalogItem[]>>();

/** Titles keyed by their normalised name, for matching outside lists (TMDB) against the catalog. */
export function titleIndex(catalog: Catalog): Map<string, CatalogItem[]> {
	let index = byKey.get(catalog);
	if (!index) {
		index = new Map();
		for (const item of catalog.items) {
			const key = titleKey(item.name);
			if (!key) continue;
			const list = index.get(key);
			if (list) list.push(item);
			else index.set(key, [item]);
		}
		byKey.set(catalog, index);
	}
	return index;
}

/** Look one title up by kind and provider id. */
export function findItem(catalog: Catalog, kind: 'movie' | 'series', id: number): CatalogItem | undefined {
	let ids = idIndexes.get(catalog);
	if (!ids) {
		ids = new Map(catalog.items.map((i) => [`${i.kind}:${i.id}`, i]));
		idIndexes.set(catalog, ids);
	}
	return ids.get(`${kind}:${id}`);
}

const idIndexes = new WeakMap<object, Map<string, CatalogItem>>();
