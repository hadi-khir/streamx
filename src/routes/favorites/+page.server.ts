import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { favorites } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const rows = db
		.select()
		.from(favorites)
		.where(eq(favorites.userId, locals.user!.id))
		.orderBy(desc(favorites.createdAt))
		.all();

	return {
		live: rows.filter((r) => r.streamType === 'live'),
		movies: rows.filter((r) => r.streamType === 'movie'),
		series: rows.filter((r) => r.streamType === 'series')
	};
};
