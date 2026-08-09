import { env } from '$env/dynamic/private';

export interface TmdbInfo {
	poster: string | null;
	backdrop: string | null;
	overview: string | null;
	rating: number | null;
	year: string | null;
	genres: string[];
}

const cache = new Map<string, { data: TmdbInfo | null; time: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const IMG = 'https://image.tmdb.org/t/p';

function apiKey(): string | null {
	return env.TMDB_API_KEY || null;
}

/** Strip provider prefixes/suffixes: "EN - Movie (2023) [4K]" -> "Movie", year "2023" */
export function cleanTitle(raw: string): { title: string; year: string | null } {
	let title = raw
		.replace(/^[A-Z]{2,3}\s*[-|:]\s*/i, '') // "EN - ", "FR| "
		.replace(/\[(.*?)\]/g, '')
		.replace(/\b(4k|uhd|fhd|hd|sd|hevc|h265|h264|multi(sub)?|vip)\b/gi, '')
		.trim();
	let year: string | null = null;
	const m = title.match(/\((19|20)\d{2}\)|\b(19|20)\d{2}\b\s*$/);
	if (m) {
		year = m[0].replace(/[()]/g, '').trim();
		title = title.replace(m[0], '').trim();
	}
	return { title: title.replace(/\s{2,}/g, ' '), year };
}

async function tmdbFetch(path: string, params: Record<string, string>): Promise<any | null> {
	const key = apiKey();
	if (!key) return null;
	const url = new URL(`https://api.themoviedb.org/3${path}`);
	url.searchParams.set('api_key', key);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

function toInfo(d: any, type: 'movie' | 'tv'): TmdbInfo {
	return {
		poster: d.poster_path ? `${IMG}/w500${d.poster_path}` : null,
		backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
		overview: d.overview || null,
		rating: typeof d.vote_average === 'number' && d.vote_average > 0 ? d.vote_average : null,
		year: (type === 'movie' ? d.release_date : d.first_air_date)?.slice(0, 4) || null,
		genres: Array.isArray(d.genres) ? d.genres.map((g: any) => g.name) : []
	};
}

/**
 * Look up TMDB info for a movie or series. Uses the provider-supplied tmdb id
 * when present, otherwise searches by cleaned title. Returns null without an API key.
 */
export async function lookup(
	type: 'movie' | 'tv',
	rawName: string,
	tmdbId?: string | number | null
): Promise<TmdbInfo | null> {
	if (!apiKey()) return null;
	const cacheKey = `${type}:${tmdbId || rawName}`;
	const hit = cache.get(cacheKey);
	if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data;

	let data: TmdbInfo | null = null;

	if (tmdbId && String(tmdbId) !== '0') {
		const d = await tmdbFetch(`/${type}/${tmdbId}`, {});
		if (d && !d.status_code) data = toInfo(d, type);
	}

	if (!data) {
		const { title, year } = cleanTitle(rawName);
		const params: Record<string, string> = { query: title };
		if (year) params[type === 'movie' ? 'year' : 'first_air_date_year'] = year;
		const d = await tmdbFetch(`/search/${type}`, params);
		const first = d?.results?.[0];
		if (first) data = toInfo(first, type);
	}

	cache.set(cacheKey, { data, time: Date.now() });
	return data;
}
