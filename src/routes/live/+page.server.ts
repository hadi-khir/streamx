import { requireConnection } from '$lib/server/connections';
import { getLiveCategories, getLiveStreams } from '$lib/server/xtream';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const conn = requireConnection(locals.user!);

	let categories: { category_id: string; category_name: string }[] = [];
	try {
		categories = await getLiveCategories(conn);
	} catch {
		// keep empty; page shows an error hint
	}

	const selected = url.searchParams.get('cat') ?? categories[0]?.category_id ?? 'all';

	let channels: { stream_id: number; name: string; stream_icon: string }[] = [];
	let loadError = '';
	try {
		const list = await getLiveStreams(conn, selected === 'all' ? null : selected);
		channels = (list ?? []).map((c) => ({
			stream_id: c.stream_id,
			name: c.name,
			stream_icon: c.stream_icon
		}));
	} catch (e) {
		loadError = e instanceof Error ? e.message : 'Failed to load channels';
	}

	return { connId: conn.id, categories, selected, channels, loadError };
};
