import { listConnections } from '$lib/server/connections';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { user: null, connections: [] };

	const conns = listConnections(locals.user.id).map((c) => ({ id: c.id, name: c.name }));
	return {
		user: locals.user,
		connections: conns
	};
};
