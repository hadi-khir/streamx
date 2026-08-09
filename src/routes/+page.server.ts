import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites, watchProgress } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	// VOD in progress (not finished, has a real position)
	const inProgress = db
		.select()
		.from(watchProgress)
		.where(
			and(
				eq(watchProgress.userId, userId),
				inArray(watchProgress.streamType, ['movie', 'episode']),
				gt(watchProgress.position, 60)
			)
		)
		.orderBy(desc(watchProgress.updatedAt))
		.limit(24)
		.all()
		.filter((r) => r.duration === 0 || r.position < r.duration * 0.95)
		.slice(0, 12);

	// Everything recently watched (any type), minus what's already in continue watching
	const cwIds = new Set(inProgress.map((r) => r.id));
	const recents = db
		.select()
		.from(watchProgress)
		.where(eq(watchProgress.userId, userId))
		.orderBy(desc(watchProgress.updatedAt))
		.limit(24)
		.all()
		.filter((r) => !cwIds.has(r.id))
		.slice(0, 12);

	const favs = db
		.select()
		.from(favorites)
		.where(eq(favorites.userId, userId))
		.orderBy(desc(favorites.createdAt))
		.limit(12)
		.all();

	return {
		continueWatching: inProgress,
		recents,
		favorites: favs,
		hasConnection: locals.user!.activeConnectionId != null
	};
};
