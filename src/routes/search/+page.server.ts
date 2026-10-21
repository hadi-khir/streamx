import { requireConnection } from '$lib/server/connections';
import { searchLive, type SearchItem } from '$lib/server/xtream';
import { getCatalog, type CatalogItem } from '$lib/server/catalog';
import { isPlayableTitle } from '$lib/server/popular';
import { displayName } from '$lib/titles';
import type { PageServerLoad } from './$types';

const MAX_PER_TYPE = 60;
// A cold catalog gets this long to come up before search makes do
const CATALOG_WAIT = 15_000;

function fold(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
}

/**
 * Best match first: the whole title, then titles starting with the query,
 * then a word starting with it, then anywhere. English and rated titles break
 * ties, so "dune" finds Dune before a dubbed copy.
 */
function rank(items: CatalogItem[], q: string): CatalogItem[] {
	const scored: { item: CatalogItem; score: number }[] = [];
	for (const item of items) {
		const name = fold(displayName(item.name));
		const at = name.indexOf(q);
		if (at < 0 || !isPlayableTitle(item.name)) continue;
		let score = name === q ? 100 : at === 0 ? 60 : /[^a-z0-9]/.test(name[at - 1]) ? 35 : 10;
		if (item.en) score += 8;
		if (item.image) score += 4;
		score += (item.rating ?? 0) / 10;
		scored.push({ item, score });
	}
	scored.sort((a, b) => b.score - a.score);
	const seen = new Set<string>();
	return scored
		.map((s) => s.item)
		.filter((i) => {
			// The same title listed under several categories shows once
			const key = `${i.kind}:${i.id}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const conn = requireConnection(locals.user!);
	const q = url.searchParams.get('q')?.trim() ?? '';

	let live: SearchItem[] = [];
	let movies: SearchItem[] = [];
	let series: SearchItem[] = [];
	let loadError = '';
	let partial = false;

	if (q.length >= 2) {
		const needle = fold(q);
		const [liveResult, catalog] = await Promise.all([
			searchLive(conn, q).catch(() => null),
			getCatalog(conn, CATALOG_WAIT).catch(() => null)
		]);
		live = (liveResult ?? []).slice(0, MAX_PER_TYPE);
		if (catalog) {
			partial = !catalog.complete;
			const hits = rank(catalog.items, needle);
			const toItem = (i: CatalogItem): SearchItem => ({
				type: i.kind,
				id: i.id,
				name: i.name,
				icon: i.image,
				...(i.ext ? { ext: i.ext } : {})
			});
			movies = hits.filter((i) => i.kind === 'movie').slice(0, MAX_PER_TYPE).map(toItem);
			series = hits.filter((i) => i.kind === 'series').slice(0, MAX_PER_TYPE).map(toItem);
		}
		if (!liveResult && !catalog) loadError = 'Search failed — the provider did not answer.';
	}

	return { connId: conn.id, q, live, movies, series, loadError, partial };
};
