import { DEFAULT_LANGUAGE, languageLabel } from '$lib/languages';
import { isPlayableTitle, titleKey } from '$lib/server/popular';
import type { Catalog, CatalogItem } from '$lib/server/catalog';

/**
 * Providers list a title once per language with no link between the copies, so
 * "Reacher" is nine unrelated shows. This works out which entries are the same
 * title, and in what language, from how they're named.
 */

// What providers put in front of a title or in a category's [TAG]. NF, D+, A+,
// TOP and 4K name a service or a quality, so those titles go by their category.
const CODES: Record<string, string> = {
	EN: 'en',
	ENG: 'en',
	US: 'en',
	UK: 'en',
	AF: 'af',
	AL: 'sq',
	ALB: 'sq',
	AR: 'ar',
	BG: 'bg',
	DK: 'da',
	NL: 'nl',
	FR: 'fr',
	QC: 'fr',
	DE: 'de',
	GR: 'el',
	IN: 'hi',
	IND: 'hi',
	HU: 'hu',
	IT: 'it',
	KD: 'kn',
	MA: 'ml',
	MR: 'mr',
	IR: 'fa',
	PL: 'pl',
	PT: 'pt',
	PB: 'pa',
	RO: 'ro',
	RU: 'ru',
	SC: 'sc',
	MU: 'sc',
	EX: 'sh',
	EXYU: 'sh',
	SOM: 'so',
	STH: 'si',
	ES: 'es',
	LAT: 'lat',
	TM: 'ta',
	TG: 'te',
	PK: 'ur'
};

const PREFIX = /^\s*([A-Za-z0-9+]{1,4})\s*[-|:]\s/;

function prefixLanguage(name: string): string | null {
	const code = name.match(PREFIX)?.[1].toUpperCase();
	return code ? (CODES[code] ?? null) : null;
}

function languageOf(item: CatalogItem, catalog: Catalog): string {
	const fromName = prefixLanguage(item.name);
	if (fromName) return fromName;
	if (item.en) return 'en';
	const category = catalog.categories[item.cat]?.name ?? '';
	for (const [, tag] of category.matchAll(/\[\s*([^\]]+?)\s*\]/g)) {
		const language = CODES[tag.toUpperCase()];
		if (language) return language;
	}
	if (/\p{Script=Arabic}/u.test(category)) return 'ar';
	if (/french/i.test(category)) return 'fr';
	return 'other';
}

function is4k(item: CatalogItem, catalog: Catalog): boolean {
	return /\b(4k|uhd)\b/i.test(`${item.name} ${catalog.categories[item.cat]?.name ?? ''}`);
}

/** A title's name without anything that varies between its copies: "PT - Reacher (2022) (US)" → "reacher". */
function workKey(name: string): string {
	const latin = titleKey(name.replace(/\(\s*[a-z]{2}\s*\)/gi, ' ').replace(/\b(vostfr|vost)\b/gi, ' '));
	// titleKey only keeps a-z, and two films differing only in Arabic aren't one film
	const words = name.normalize('NFD').match(/\p{L}+/gu) ?? [];
	const otherScripts = words.filter((word) => /[^a-z]/i.test(word));
	return [latin, ...otherScripts].join(' ').trim();
}

/**
 * Split same-named entries into the actual titles: The Office (2001) and (2005)
 * are different shows. Copies are often a year apart through sloppy data, but so
 * are some remakes, so that only merges when no language appears on both sides.
 * Merging wrongly would hide a title; splitting wrongly only shows an extra card.
 */
function splitByYear(entries: CatalogItem[], catalog: Catalog): CatalogItem[][] {
	const years = new Map<number, CatalogItem[]>();
	const undated: CatalogItem[] = [];
	for (const item of entries) {
		if (!item.year) undated.push(item);
		else if (years.has(item.year)) years.get(item.year)!.push(item);
		else years.set(item.year, [item]);
	}

	const titles: { items: CatalogItem[]; lastYear: number; languages: Set<string> }[] = [];
	for (const year of [...years.keys()].sort((a, b) => a - b)) {
		const items = years.get(year)!;
		const languages = items.map((i) => languageOf(i, catalog));
		const last = titles.at(-1);
		if (last && year - last.lastYear <= 1 && !languages.some((l) => last.languages.has(l))) {
			last.items.push(...items);
			last.lastYear = year;
			languages.forEach((l) => last.languages.add(l));
		} else {
			titles.push({ items, lastYear: year, languages: new Set(languages) });
		}
	}

	const out = titles.map((t) => t.items);
	// With no year to go on, only an unambiguous name can place a copy
	if (undated.length) {
		if (out.length === 1) out[0].push(...undated);
		else out.push(undated);
	}
	return out;
}

const indexes = new WeakMap<Catalog, Map<string, CatalogItem[]>>();

function titlesOf(catalog: Catalog): Map<string, CatalogItem[]> {
	let index = indexes.get(catalog);
	if (index) return index;

	const named = new Map<string, CatalogItem[]>();
	for (const item of catalog.items) {
		if (!isPlayableTitle(item.name)) continue;
		const key = workKey(item.name);
		if (!key) continue;
		const grouped = `${item.kind}:${key}`;
		const entries = named.get(grouped);
		if (entries) entries.push(item);
		else named.set(grouped, [item]);
	}

	index = new Map();
	for (const entries of named.values()) {
		for (const title of splitByYear(entries, catalog)) {
			for (const item of title) index.set(`${item.kind}:${item.id}`, title);
		}
	}
	indexes.set(catalog, index);
	return index;
}

/** Every copy of the same title as this one, including itself. */
export function copiesOf(catalog: Catalog, item: CatalogItem): CatalogItem[] {
	return titlesOf(catalog).get(`${item.kind}:${item.id}`) ?? [item];
}

/** The copy to show someone: their language, falling back to English, the plain one over 4K. */
export function bestCopy(catalog: Catalog, copies: CatalogItem[], language: string): CatalogItem {
	const score = (item: CatalogItem) => {
		const spoken = languageOf(item, catalog);
		return (
			(spoken === language ? 1000 : spoken === DEFAULT_LANGUAGE ? 100 : 0) +
			// "EN - Dune" over a subtitled "NF - Dune" that only counts as English
			(prefixLanguage(item.name) === spoken ? 10 : 0) +
			(item.image ? 4 : 0) +
			(is4k(item, catalog) ? 0 : 2) +
			(item.rating ?? 0) / 10
		);
	};
	return copies.reduce((best, item) => (score(item) > score(best) ? item : best));
}

export function hasLanguage(catalog: Catalog, copies: CatalogItem[], language: string): boolean {
	return copies.some((item) => languageOf(item, catalog) === language);
}

/** The languages these copies come in, by name. */
export function languagesOf(catalog: Catalog, copies: CatalogItem[]): string[] {
	return [...new Set(copies.map((item) => languageLabel(languageOf(item, catalog))))];
}

export interface Version {
	id: number;
	label: string;
}

/** What a title's page offers to switch between: one per language and quality, the viewer's language first. */
export function versionsOf(catalog: Catalog, kind: 'movie' | 'series', id: number, language: string): Version[] {
	const copies = titlesOf(catalog).get(`${kind}:${id}`);
	if (!copies) return [];

	const options = new Map<string, CatalogItem[]>();
	for (const item of copies) {
		const label = languageLabel(languageOf(item, catalog)) + (is4k(item, catalog) ? ' · 4K' : '');
		const same = options.get(label);
		if (same) same.push(item);
		else options.set(label, [item]);
	}

	const preferred = languageLabel(language);
	return [...options]
		.map(([label, same]) => ({
			// The one being viewed keeps its place even if another copy would have been picked
			id: same.find((item) => item.id === id)?.id ?? bestCopy(catalog, same, language).id,
			label
		}))
		.sort((a, b) => {
			const rank = (v: Version) => (v.label.startsWith(preferred) ? 0 : 1);
			return rank(a) - rank(b) || a.label.localeCompare(b.label);
		});
}
