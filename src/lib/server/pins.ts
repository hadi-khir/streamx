import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pinnedCategories } from '$lib/server/db/schema';
import type { Category } from '$lib/server/xtream';

export interface CategoryWithPin {
	id: string;
	name: string;
	pinned: boolean;
}

/** Merge pin state into a category list, pinned first (original order otherwise). */
export function withPins(
	userId: string,
	connectionId: number,
	contentType: 'live' | 'vod' | 'series',
	categories: Category[]
): CategoryWithPin[] {
	const pinned = new Set(
		db
			.select({ categoryId: pinnedCategories.categoryId })
			.from(pinnedCategories)
			.where(
				and(
					eq(pinnedCategories.userId, userId),
					eq(pinnedCategories.connectionId, connectionId),
					eq(pinnedCategories.contentType, contentType)
				)
			)
			.all()
			.map((r) => r.categoryId)
	);

	const mapped = categories.map((c) => ({
		id: c.category_id,
		name: c.category_name,
		pinned: pinned.has(c.category_id)
	}));
	return [...mapped.filter((c) => c.pinned), ...mapped.filter((c) => !c.pinned)];
}
