import { redirect, json, type Handle } from '@sveltejs/kit';
import * as auth from '$lib/server/auth';

const PUBLIC_PATHS = new Set(['/login', '/register']);

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(auth.SESSION_COOKIE);

	if (token) {
		const { session, user } = auth.validateSessionToken(token);
		if (session) {
			auth.setSessionTokenCookie(event, token, session.expiresAt);
		} else {
			auth.deleteSessionTokenCookie(event);
		}
		event.locals.user = user;
		event.locals.session = session;
	} else {
		event.locals.user = null;
		event.locals.session = null;
	}

	const path = event.url.pathname;
	if (!event.locals.user && !PUBLIC_PATHS.has(path)) {
		if (path.startsWith('/api/')) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}
		redirect(303, `/login${path !== '/' ? `?redirect=${encodeURIComponent(path)}` : ''}`);
	}
	if (event.locals.user && PUBLIC_PATHS.has(path)) {
		redirect(303, '/');
	}

	return resolve(event);
};
