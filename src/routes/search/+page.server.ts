import { requireConnection } from '$lib/server/connections';
import { searchLive, type SearchItem } from '$lib/server/xtream';
import { getCatalog, type Catalog, type CatalogItem } from '$lib/server/catalog';
import { isPlayableTitle } from '$lib/server/popular';
import { bestCopy, copiesOf, hasLanguage, languagesOf } from '$lib/server/versions';
import { displayName } from '$lib/titles';
import type { PageServerLoad } from './$types';

const MAX_PER_TYPE = 60;
const MAX_TITLES = 60;
// A cold catalog gets this long to come up before search makes do
const CATALOG_WAIT = 15_000;

interface TitleResult {
	type: 'movie' | 'series';
	id: number;
	name: string;
	icon: string;
	year: number | null;
	languages: string[];
}

function fold(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
}

/** Best match first: the whole title, then titles starting with the query, then a word starting with it, then anywhere. */
function matchScore(name: string, q: string): number {
	const at = name.indexOf(q);
	if (at < 0) return -1;
	return name === q ? 100 : at === 0 ? 60 : /[^a-z0-9]/.test(name[at - 1]) ? 35 : 10;
}

/**
 * Each title once, as the copy in the viewer's language. Titles they can't watch
 * in that language come back separately, so they don't crowd the ones they can.
 */
function search(catalog: Catalog, q: string, language: string): { titles: TitleResult[]; otherLanguages: TitleResult[] } {
	const matches = new Map<CatalogItem[], number>();
	for (const item of catalog.items) {
		if (!isPlayableTitle(item.name)) continue;
		const score = matchScore(fold(displayName(item.name)), q);
		if (score < 0) continue;
		const copies = copiesOf(catalog, item);
		matches.set(copies, Math.max(score, matches.get(copies) ?? 0));
	}

	const scored = [...matches].map(([copies, match]) => {
		const best = bestCopy(catalog, copies, language);
		const languages = languagesOf(catalog, copies);
		return {
			score: match + (best.image ? 4 : 0) + (best.rating ?? 0) / 10,
			inLanguage: hasLanguage(catalog, copies, language),
			result: {
				type: best.kind,
				id: best.id,
				name: best.name,
				icon: best.image,
				year: best.year ?? null,
				languages
			}
		};
	});
	scored.sort((a, b) => b.score - a.score);

	const results = (inLanguage: boolean) =>
		scored
			.filter((s) => s.inLanguage === inLanguage)
			.slice(0, MAX_TITLES)
			.map((s) => s.result);
	return { titles: results(true), otherLanguages: results(false) };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const conn = requireConnection(locals.user!);
	const q = url.searchParams.get('q')?.trim() ?? '';

	let live: SearchItem[] = [];
	let titles: TitleResult[] = [];
	let otherLanguages: TitleResult[] = [];
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
			({ titles, otherLanguages } = search(catalog, needle, locals.user!.language));
		}
		if (!liveResult && !catalog) loadError = 'Search failed — the provider did not answer.';
	}

	return { connId: conn.id, q, live, titles, otherLanguages, loadError, partial };
};
