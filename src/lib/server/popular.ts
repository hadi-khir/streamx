import type { Category } from '$lib/server/xtream';

// Providers hide porn in plainly named categories; the home page surfaces
// content nobody asked for, so those categories never feed a row.
const ADULT = /(^|[^a-z])(xxx|adult|porn|erotic|18\+|nsfw)([^a-z]|$)/i;

export function isAdultCategory(name: string): boolean {
	return ADULT.test(name);
}

// Providers tag a category's language in its name — "[EN]", "[US] SPORTS",
// "VOD - ENGLISH 4K" — with no standard for it. A bracket tag is the
// provider's own verdict, so when one is present it decides; only an
// untagged name falls back to reading the words.
const ENGLISH_TAG = /^\[\s*(en|eng|english|us|usa|uk|gb|ca|can|au|aus|nz|ie|irl|multisub)\s*\]$/i;
const ENGLISH_WORD = /(^|[^a-z])(english|american|british|imdb)([^a-z]|$)/i;
// Markers that outrank an English tag: "[CA] CANADA FRANÇAISE" is French,
// "[AU] AUSTRIA" is German (the provider means Austria, not Australia),
// "[US] TELEMUNDO" is Spanish, and "NETFLIX ASIA [MULTISUB]" is subtitled.
const NOT_ENGLISH =
	/(asia|asian|turkish|turkiye|korean|japan|chinese|hindi|punjabi|bollywood|latino|telemundo|univision|tudn|austria|quebec|french|francais|arabic|spanish|german|italian|portug|dutch|polish|russian|greek)/i;

/** Accents never help the match and "FRANÇAISE" must read as "francaise". */
function plain(name: string): string {
	return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isEnglishCategory(name: string): boolean {
	const text = plain(name);
	if (NOT_ENGLISH.test(text)) return false;
	const tags = text.match(/\[[^\]]*\]/g);
	if (tags) return tags.some((tag) => ENGLISH_TAG.test(tag));
	return ENGLISH_WORD.test(text);
}

/**
 * Xtream has no popularity signal, so rating stands in for it. The field is
 * free text and often a placeholder ("0", "", "N/A"), so only a real score on
 * the provider's 0–10 scale counts — everything else is treated as unrated and
 * left out of the row rather than ranked as a zero.
 */
export function parseRating(raw: string | number | null | undefined): number | null {
	if (raw == null) return null;
	const n = Number(String(raw).trim());
	if (!Number.isFinite(n) || n <= 0 || n > 10) return null;
	return n;
}

/** Take one item from each group per pass, until `limit` or the groups run dry. */
export function roundRobin<T>(groups: T[][], limit: number): T[] {
	const out: T[] = [];
	const longest = Math.max(0, ...groups.map((g) => g.length));
	for (let i = 0; i < longest && out.length < limit; i++) {
		for (const group of groups) {
			if (i >= group.length) continue;
			out.push(group[i]);
			if (out.length >= limit) break;
		}
	}
	return out;
}

// Providers pad channel lists with divider pseudo-entries ("##### [UK] NEWS
// #####") that play nothing.
const SEPARATOR = /(#{3,}|={3,}|\*{3,}|_{3,})/;
// A title's own country marker: "Juan Gabriel (2025) (MX)" sits in a
// multi-subtitle category but is not an English-language title.
const FOREIGN_TITLE =
	/\(\s*(mx|fr|es|it|de|br|pt|kr|jp|cn|tr|in|ar|ru|nl|pl|se|no|dk|fi|gr|il|th|ph|vn|id|hk|tw|qc|be|ch|at|ua|cz|hu|ro|bg|rs|hr)\s*\)/i;

export function isPlayableTitle(name: string): boolean {
	return !!name && !SEPARATOR.test(name) && !FOREIGN_TITLE.test(name);
}

const QUALITY = /\b(4k|uhd|fhd|hd|sd|hevc|h26[45]|x26[45]|lq|hq|vip|raw|1080p?|720p?|multisub)\b/g;

/**
 * Strip the provider's decoration from a title so its variants collapse to one
 * key: "EN - Silicon Valley (2014)" the series and "[EN] SILICON VALLEY" the
 * 24/7 channel are the same show, and the same film listed under two
 * categories is one film.
 */
export function titleKey(title: string): string {
	return title
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\[[^\]]*\]/g, ' ')
		.replace(/^\s*[a-z0-9+]{1,4}\s*[-|:]\s*/, ' ')
		.replace(/\((19|20)\d{2}\)/g, ' ')
		.replace(QUALITY, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Keep the first of each title — rows draw from categories that overlap. */
export function uniqueByTitle<T extends { name: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	return items.filter((i) => {
		const key = titleKey(i.name);
		if (!key) return true;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
