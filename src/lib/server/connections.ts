import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { connections, type Connection } from '$lib/server/db/schema';
import type { SessionUser } from '$lib/server/auth';

export function listConnections(userId: string): Connection[] {
	return db.select().from(connections).where(eq(connections.userId, userId)).all();
}

export function getConnection(userId: string, connectionId: number): Connection | undefined {
	return db
		.select()
		.from(connections)
		.where(and(eq(connections.id, connectionId), eq(connections.userId, userId)))
		.get();
}

/** Resolve the user's active connection for page loads; redirects to settings if none. */
export function requireConnection(user: SessionUser, connParam?: string | null): Connection {
	const id = connParam ? Number(connParam) : user.activeConnectionId;
	if (id) {
		const conn = getConnection(user.id, id);
		if (conn) return conn;
	}
	// Fall back to the first connection the user has
	const first = listConnections(user.id)[0];
	if (first) return first;
	redirect(303, '/settings?setup=1');
}

/** Same as requireConnection but for API routes: 404 instead of redirect. */
export function requireConnectionApi(user: SessionUser, connectionId: number): Connection {
	const conn = getConnection(user.id, connectionId);
	if (!conn) error(404, 'Connection not found');
	return conn;
}
