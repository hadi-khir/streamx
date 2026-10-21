import { redirect, json, type Handle } from '@sveltejs/kit';
import * as auth from '$lib/server/auth';

const PUBLIC_PATHS = new Set(['/login', '/register']);

// A stray rejection (a scanner's malformed URL, a provider socket dying
// mid-stream) must cost one request, not take the server down with it.
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled rejection:', reason);
});

export const handle: Handle = async ({ event, resolve }) => {
	// SvelteKit can't decode a path like "/%c0", and a redirect thrown for one
	// escapes as an unhandled rejection — answer it here instead.
	try {
		decodeURI(event.url.pathname);
	} catch {
		return new Response('Bad Request', { status: 400 });
	}

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
