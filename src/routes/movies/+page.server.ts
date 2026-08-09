import { requireConnection } from '$lib/server/connections';
import { getVodCategories, getVodStreams } from '$lib/server/xtream';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const conn = requireConnection(locals.user!);

	let categories: { category_id: string; category_name: string }[] = [];
	try {
		categories = await getVodCategories(conn);
	} catch {
		// page shows loadError from the streams call instead
	}

	const selected = url.searchParams.get('cat') ?? categories[0]?.category_id ?? 'all';

	let movies: {
		stream_id: number;
		name: string;
		stream_icon: string;
		rating: string | null;
		ext: string;
	}[] = [];
	let loadError = '';
	try {
		const list = await getVodStreams(conn, selected === 'all' ? null : selected);
		movies = (list ?? []).map((m) => ({
			stream_id: m.stream_id,
			name: m.name,
			stream_icon: m.stream_icon,
			rating: m.rating ? String(m.rating) : null,
			ext: m.container_extension
		}));
	} catch (e) {
		loadError = e instanceof Error ? e.message : 'Failed to load movies';
	}

	return { connId: conn.id, categories, selected, movies, loadError };
};
