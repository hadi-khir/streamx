import { fail, redirect } from '@sveltejs/kit';
import * as auth from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
			return fail(400, {
				error: 'Username must be 3-32 characters (letters, numbers, - or _)',
				username
			});
		}
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters', username });
		}
		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match', username });
		}

		let user;
		try {
			user = await auth.createUser(username, password);
		} catch (e: unknown) {
			const msg = e instanceof Error && e.message.includes('UNIQUE') ? 'Username is already taken' : 'Registration failed';
			return fail(400, { error: msg, username });
		}

		const token = auth.generateSessionToken();
		const session = auth.createSession(token, user.id);
		auth.setSessionTokenCookie(event, token, session.expiresAt);
		redirect(303, '/settings?setup=1');
	}
};
