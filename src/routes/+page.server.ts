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

	// Everything recently watched, minus what's already in continue watching.
	// Episodes collapse to one entry per series.
	const cwIds = new Set(inProgress.map((r) => r.id));
	const cwSeriesIds = new Set(
		inProgress.filter((r) => r.streamType === 'episode' && r.seriesId).map((r) => r.seriesId)
	);

	const raw = db
		.select()
		.from(watchProgress)
		.where(eq(watchProgress.userId, userId))
		.orderBy(desc(watchProgress.updatedAt))
		.limit(48)
		.all();

	const seenSeries = new Set<number>();
	const recents: {
		id: number;
		kind: 'live' | 'movie' | 'episode' | 'series';
		name: string;
		icon: string | null;
		connectionId: number;
		streamId: number;
		seriesId: number | null;
		ext: string | null;
	}[] = [];
	for (const r of raw) {
		if (recents.length >= 12) break;
		if (r.streamType === 'episode' && r.seriesId) {
			if (cwSeriesIds.has(r.seriesId) || seenSeries.has(r.seriesId)) continue;
			seenSeries.add(r.seriesId);
			recents.push({
				id: r.id,
				kind: 'series',
				// Progress rows store "Series Name — Episode Title"
				name: r.name.split(' — ')[0],
				icon: r.icon,
				connectionId: r.connectionId,
				streamId: r.streamId,
				seriesId: r.seriesId,
				ext: r.ext
			});
		} else {
			if (cwIds.has(r.id)) continue;
			recents.push({
				id: r.id,
				kind: r.streamType as 'live' | 'movie' | 'episode',
				name: r.name,
				icon: r.icon,
				connectionId: r.connectionId,
				streamId: r.streamId,
				seriesId: r.seriesId,
				ext: r.ext
			});
		}
	}

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
