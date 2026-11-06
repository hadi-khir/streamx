import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { connections, hiddenTitles, type HiddenTitle } from '$lib/server/db/schema';
import { titleKey } from '$lib/server/popular';

const host = (url: string) => url.replace(/\/+$/, '').toLowerCase();

/** Everything the user marked "not for me" on this provider, newest first. */
export function hiddenOnProvider(userId: string, serverUrl: string): HiddenTitle[] {
	// Two logins on one server share a library, so this pools across them
	const same = new Set(
		db
			.select({ id: connections.id, serverUrl: connections.serverUrl })
			.from(connections)
			.where(eq(connections.userId, userId))
			.all()
			.filter((c) => host(c.serverUrl) === host(serverUrl))
			.map((c) => c.id)
	);
	return db
		.select()
		.from(hiddenTitles)
		.where(eq(hiddenTitles.userId, userId))
		.orderBy(desc(hiddenTitles.createdAt))
		.all()
		.filter((h) => same.has(h.connectionId));
}

/**
 * A test for rows built outside the recommender. By name as well as id: providers
 * list the same title more than once, and hiding it should hide every copy.
 */
export function hiddenFilter(userId: string, serverUrl: string) {
	const hidden = hiddenOnProvider(userId, serverUrl);
	const ids = new Set(hidden.map((h) => `${h.kind}:${h.streamId}`));
	const titles = new Set(hidden.map((h) => titleKey(h.name)).filter(Boolean));
	return (kind: 'movie' | 'series', id: number, name: string) => {
		if (ids.has(`${kind}:${id}`)) return true;
		const key = titleKey(name);
		return !!key && titles.has(key);
	};
}
