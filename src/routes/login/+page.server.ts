import { fail, redirect } from '@sveltejs/kit';
import * as auth from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!username || !password) {
			return fail(400, { error: 'Username and password are required', username });
		}

		const user = await auth.verifyLogin(username, password);
		if (!user) {
			return fail(400, { error: 'Invalid username or password', username });
		}

		const token = auth.generateSessionToken();
		const session = auth.createSession(token, user.id);
		auth.setSessionTokenCookie(event, token, session.expiresAt);

		const target = event.url.searchParams.get('redirect');
		redirect(303, target?.startsWith('/') ? target : '/');
	}
};
