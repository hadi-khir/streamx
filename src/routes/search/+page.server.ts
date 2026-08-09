import { requireConnection } from '$lib/server/connections';
import { searchAll, type SearchItem } from '$lib/server/xtream';
import type { PageServerLoad } from './$types';

const MAX_PER_TYPE = 60;

export const load: PageServerLoad = async ({ locals, url }) => {
	const conn = requireConnection(locals.user!);
	const q = url.searchParams.get('q')?.trim() ?? '';

	let live: SearchItem[] = [];
	let movies: SearchItem[] = [];
	let series: SearchItem[] = [];
	let loadError = '';

	if (q.length >= 2) {
		try {
			const results = await searchAll(conn, q);
			live = results.filter((r) => r.type === 'live').slice(0, MAX_PER_TYPE);
			movies = results.filter((r) => r.type === 'movie').slice(0, MAX_PER_TYPE);
			series = results.filter((r) => r.type === 'series').slice(0, MAX_PER_TYPE);
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Search failed';
		}
	}

	return { connId: conn.id, q, live, movies, series, loadError };
};
