import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hash, verify } from '@node-rs/argon2';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, sessions } from '$lib/server/db/schema';

const DAY_MS = 1000 * 60 * 60 * 24;
const SESSION_LIFETIME = 30 * DAY_MS;
const RENEW_THRESHOLD = 15 * DAY_MS;

export const SESSION_COOKIE = 'session';

export type SessionUser = { id: string; username: string; activeConnectionId: number | null };
export type SessionInfo = { id: string; userId: string; expiresAt: number };

const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
	return randomBytes(24).toString('base64url');
}

export function createSession(token: string, userId: string): SessionInfo {
	const session: SessionInfo = {
		id: hashToken(token),
		userId,
		expiresAt: Date.now() + SESSION_LIFETIME
	};
	db.insert(sessions).values(session).run();
	return session;
}

export function validateSessionToken(token: string): {
	session: SessionInfo | null;
	user: SessionUser | null;
} {
	const sessionId = hashToken(token);
	const row = db
		.select({
			session: sessions,
			user: { id: users.id, username: users.username, activeConnectionId: users.activeConnectionId }
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.get();

	if (!row) return { session: null, user: null };

	if (Date.now() >= row.session.expiresAt) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return { session: null, user: null };
	}

	if (Date.now() >= row.session.expiresAt - RENEW_THRESHOLD) {
		row.session.expiresAt = Date.now() + SESSION_LIFETIME;
		db.update(sessions)
			.set({ expiresAt: row.session.expiresAt })
			.where(eq(sessions.id, sessionId))
			.run();
	}

	return { session: row.session, user: row.user };
}

export function invalidateSession(sessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: number): void {
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: new Date(expiresAt)
	});
}

export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function createUser(username: string, password: string): Promise<SessionUser> {
	const passwordHash = await hash(password, ARGON2_OPTS);
	const user = { id: randomUUID(), username, passwordHash };
	db.insert(users).values(user).run();
	return { id: user.id, username, activeConnectionId: null };
}

export async function verifyLogin(
	username: string,
	password: string
): Promise<SessionUser | null> {
	const user = db.select().from(users).where(eq(users.username, username)).get();
	if (!user) return null;
	const valid = await verify(user.passwordHash, password);
	if (!valid) return null;
	return { id: user.id, username: user.username, activeConnectionId: user.activeConnectionId };
}
