import type { Category } from '$lib/server/xtream';

// Providers hide porn in plainly named categories; the home page surfaces
// content nobody asked for, so those categories never feed a row.
const ADULT = /(^|[^a-z])(xxx|adult|porn|erotic|18\+|nsfw)([^a-z]|$)/i;

export function adultCategoryIds(categories: Category[]): Set<string> {
	return new Set(
		categories.filter((c) => ADULT.test(c.category_name ?? '')).map((c) => c.category_id)
	);
}

export function isAdultCategory(name: string): boolean {
	return ADULT.test(name);
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

/**
 * Best-rated items, spread across categories: each category contributes its
 * top pick before any category contributes a second, so one enormous category
 * can't fill the whole row.
 */
export function pickPopular<T extends { categoryId: string; rating: number }>(
	items: T[],
	limit: number
): T[] {
	const byCategory = new Map<string, T[]>();
	for (const item of items) {
		const group = byCategory.get(item.categoryId);
		if (group) group.push(item);
		else byCategory.set(item.categoryId, [item]);
	}
	const groups = [...byCategory.values()];
	for (const group of groups) group.sort((a, b) => b.rating - a.rating);
	groups.sort((a, b) => b[0].rating - a[0].rating);
	return roundRobin(groups, limit);
}
