import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { connections, hiddenTitles, users } from '$lib/server/db/schema';
import { listConnections } from '$lib/server/connections';
import { authenticate, validateServerUrl } from '$lib/server/xtream';
import { LANGUAGES } from '$lib/languages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	return {
		setup: url.searchParams.has('setup'),
		language: user.language,
		connections: listConnections(user.id).map((c) => ({
			id: c.id,
			name: c.name,
			serverUrl: c.serverUrl,
			username: c.username,
			active: c.id === user.activeConnectionId
		})),
		hidden: db
			.select({ id: hiddenTitles.id, name: hiddenTitles.name, kind: hiddenTitles.kind })
			.from(hiddenTitles)
			.where(eq(hiddenTitles.userId, user.id))
			.orderBy(desc(hiddenTitles.createdAt))
			.all()
	};
};

export const actions: Actions = {
	add: async ({ locals, request }) => {
		const user = locals.user!;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const serverUrl = String(form.get('serverUrl') ?? '').trim();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '').trim();

		if (!name || !serverUrl || !username || !password) {
			return fail(400, { error: 'All fields are required', name, serverUrl, username });
		}

		try {
			validateServerUrl(serverUrl);
			await authenticate({ serverUrl, username, password });
		} catch (e) {
			return fail(400, {
				error: e instanceof Error ? e.message : 'Could not connect to the server',
				name,
				serverUrl,
				username
			});
		}

		const inserted = db
			.insert(connections)
			.values({ userId: user.id, name, serverUrl, username, password })
			.returning({ id: connections.id })
			.get();

		if (!user.activeConnectionId) {
			db.update(users).set({ activeConnectionId: inserted.id }).where(eq(users.id, user.id)).run();
		}
		return { success: `Connected to ${name}` };
	},

	delete: async ({ locals, request }) => {
		const user = locals.user!;
		const form = await request.formData();
		const id = Number(form.get('connectionId'));

		db.delete(connections)
			.where(and(eq(connections.id, id), eq(connections.userId, user.id)))
			.run();

		if (user.activeConnectionId === id) {
			const next = listConnections(user.id)[0];
			db.update(users)
				.set({ activeConnectionId: next?.id ?? null })
				.where(eq(users.id, user.id))
				.run();
		}
		return { success: 'Connection removed' };
	},

	setLanguage: async ({ locals, request }) => {
		const form = await request.formData();
		const language = String(form.get('language'));
		if (!(language in LANGUAGES)) return fail(400, { error: 'Unknown language' });
		db.update(users).set({ language }).where(eq(users.id, locals.user!.id)).run();
		return { success: `Search now shows ${LANGUAGES[language]} first` };
	},

	restoreHidden: async ({ locals, request }) => {
		const form = await request.formData();
		db.delete(hiddenTitles)
			.where(and(eq(hiddenTitles.id, Number(form.get('id'))), eq(hiddenTitles.userId, locals.user!.id)))
			.run();
		return { success: 'It can be suggested again' };
	},

	activate: async ({ locals, request }) => {
		const user = locals.user!;
		const form = await request.formData();
		const id = Number(form.get('connectionId'));

		const conn = db
			.select({ id: connections.id })
			.from(connections)
			.where(and(eq(connections.id, id), eq(connections.userId, user.id)))
			.get();
		if (!conn) return fail(404, { error: 'Connection not found' });

		db.update(users).set({ activeConnectionId: id }).where(eq(users.id, user.id)).run();
		redirect(303, '/');
	}
};
