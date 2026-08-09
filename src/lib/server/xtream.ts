import type { Connection } from '$lib/server/db/schema';

export type XtreamConn = Pick<Connection, 'serverUrl' | 'username' | 'password'>;

export interface Category {
	category_id: string;
	category_name: string;
}

export interface LiveStream {
	stream_id: number;
	name: string;
	stream_icon: string;
	epg_channel_id: string | null;
	category_id: string;
}

export interface VodStream {
	stream_id: number;
	name: string;
	stream_icon: string;
	container_extension: string;
	rating: string | number | null;
	category_id: string;
	added?: string;
	tmdb_id?: string | number;
}

export interface SeriesItem {
	series_id: number;
	name: string;
	cover: string;
	plot: string | null;
	rating: string | number | null;
	category_id: string;
	last_modified?: string;
	tmdb?: string | number;
}

export interface SearchItem {
	type: 'live' | 'movie' | 'series';
	id: number;
	name: string;
	icon: string;
	ext?: string;
}

const CACHE_TTL = 5 * 60 * 1000;
const INDEX_FETCH_TIMEOUT = 60_000;

const cache = new Map<string, { data: unknown; time: number }>();
const searchIndexes = new Map<string, { items: SearchItem[]; time: number }>();

// Block requests to private/internal networks (SSRF protection)
const BLOCKED_HOSTS = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|localhost$|::1$|\[::1\])/i;

export function validateServerUrl(urlStr: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(urlStr);
	} catch {
		throw new Error('Invalid server URL');
	}
	if (!['http:', 'https:'].includes(parsed.protocol)) {
		throw new Error('Server URL must use http or https');
	}
	if (BLOCKED_HOSTS.test(parsed.hostname)) {
		throw new Error('Server URL cannot point to a private/internal network');
	}
	return parsed;
}

function connKey(conn: XtreamConn): string {
	return conn.serverUrl + conn.username;
}

function getCached<T>(key: string): T | null {
	const entry = cache.get(key);
	if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data as T;
	if (entry) cache.delete(key);
	return null;
}

export function buildApiUrl(
	conn: XtreamConn,
	action: string | null,
	params: Record<string, string> = {}
): string {
	const base = conn.serverUrl.replace(/\/+$/, '');
	const url = new URL(`${base}/player_api.php`);
	url.searchParams.set('username', conn.username);
	url.searchParams.set('password', conn.password);
	if (action) url.searchParams.set('action', action);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return url.toString();
}

export function buildStreamUrl(
	conn: XtreamConn,
	type: string,
	streamId: string | number,
	extension = 'm3u8'
): string {
	const base = conn.serverUrl.replace(/\/+$/, '');
	const typePath = type === 'live' ? 'live' : type === 'movie' ? 'movie' : 'series';
	return `${base}/${typePath}/${conn.username}/${conn.password}/${streamId}.${extension}`;
}

async function xtreamRequest<T>(
	conn: XtreamConn,
	action: string,
	params: Record<string, string> = {},
	timeout = 15_000
): Promise<T> {
	const key = `${connKey(conn)}:${action}:${JSON.stringify(params)}`;
	const cached = getCached<T>(key);
	if (cached) return cached;

	const res = await fetch(buildApiUrl(conn, action, params), {
		signal: AbortSignal.timeout(timeout)
	});
	if (!res.ok) throw new Error(`Xtream API error: ${res.status}`);
	const data = (await res.json()) as T;
	cache.set(key, { data, time: Date.now() });
	return data;
}

/** Validates credentials against the provider; throws on failure. */
export async function authenticate(conn: XtreamConn) {
	validateServerUrl(conn.serverUrl);
	const res = await fetch(buildApiUrl(conn, null), { signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error('Failed to connect to server');
	const data = await res.json();
	if (!data.user_info || data.user_info.auth === 0) throw new Error('Invalid credentials');
	return data;
}

export const getLiveCategories = (c: XtreamConn) =>
	xtreamRequest<Category[]>(c, 'get_live_categories');
export const getVodCategories = (c: XtreamConn) =>
	xtreamRequest<Category[]>(c, 'get_vod_categories');
export const getSeriesCategories = (c: XtreamConn) =>
	xtreamRequest<Category[]>(c, 'get_series_categories');

export const getLiveStreams = (c: XtreamConn, categoryId?: string | null, timeout?: number) =>
	xtreamRequest<LiveStream[]>(c, 'get_live_streams', categoryId ? { category_id: categoryId } : {}, timeout);
export const getVodStreams = (c: XtreamConn, categoryId?: string | null, timeout?: number) =>
	xtreamRequest<VodStream[]>(c, 'get_vod_streams', categoryId ? { category_id: categoryId } : {}, timeout);
export const getSeries = (c: XtreamConn, categoryId?: string | null, timeout?: number) =>
	xtreamRequest<SeriesItem[]>(c, 'get_series', categoryId ? { category_id: categoryId } : {}, timeout);

export const getVodInfo = (c: XtreamConn, vodId: string | number) =>
	xtreamRequest<Record<string, any>>(c, 'get_vod_info', { vod_id: String(vodId) });
export const getSeriesInfo = (c: XtreamConn, seriesId: string | number) =>
	xtreamRequest<Record<string, any>>(c, 'get_series_info', { series_id: String(seriesId) });

export interface EpgListing {
	title: string;
	description: string;
	start: number; // unix seconds
	end: number;
	now: boolean;
}

function decodeB64(value: unknown): string {
	if (typeof value !== 'string' || !value) return '';
	try {
		return Buffer.from(value, 'base64').toString('utf8');
	} catch {
		return value;
	}
}

export async function getShortEpg(
	conn: XtreamConn,
	streamId: string | number,
	limit = 4
): Promise<EpgListing[]> {
	const data = await xtreamRequest<{ epg_listings?: any[] }>(conn, 'get_short_epg', {
		stream_id: String(streamId),
		limit: String(limit)
	});
	const now = Date.now() / 1000;
	return (data.epg_listings ?? []).map((e) => {
		const start = Number(e.start_timestamp);
		const end = Number(e.stop_timestamp);
		return {
			title: decodeB64(e.title),
			description: decodeB64(e.description),
			start,
			end,
			now: start <= now && end >= now
		};
	});
}

/** Full-text search across live/vod/series. Index is cached for 5 minutes per connection. */
export async function searchAll(conn: XtreamConn, query: string): Promise<SearchItem[]> {
	const key = connKey(conn);
	let index = searchIndexes.get(key);
	if (!index || Date.now() - index.time >= CACHE_TTL) {
		const results = await Promise.allSettled([
			getLiveStreams(conn, null, INDEX_FETCH_TIMEOUT),
			getVodStreams(conn, null, INDEX_FETCH_TIMEOUT),
			getSeries(conn, null, INDEX_FETCH_TIMEOUT)
		]);
		const live = results[0].status === 'fulfilled' ? (results[0].value ?? []) : [];
		const vod = results[1].status === 'fulfilled' ? (results[1].value ?? []) : [];
		const series = results[2].status === 'fulfilled' ? (results[2].value ?? []) : [];

		const items: SearchItem[] = [];
		for (const s of live)
			if (s.name) items.push({ type: 'live', id: s.stream_id, name: s.name, icon: s.stream_icon });
		for (const s of vod)
			if (s.name)
				items.push({
					type: 'movie',
					id: s.stream_id,
					name: s.name,
					icon: s.stream_icon,
					ext: s.container_extension
				});
		for (const s of series)
			if (s.name) items.push({ type: 'series', id: s.series_id, name: s.name, icon: s.cover });

		index = { items, time: Date.now() };
		// If some sources failed, expire the index quickly so it retries
		if (!results.every((r) => r.status === 'fulfilled')) {
			index.time = Date.now() - CACHE_TTL + 30_000;
		}
		searchIndexes.set(key, index);
	}

	const q = query.toLowerCase();
	return index.items.filter((i) => i.name.toLowerCase().includes(q));
}
