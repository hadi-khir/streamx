import { requireConnection } from '$lib/server/connections';
import { getSeriesCategories, getSeries } from '$lib/server/xtream';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const conn = requireConnection(locals.user!);

	let categories: { category_id: string; category_name: string }[] = [];
	try {
		categories = await getSeriesCategories(conn);
	} catch {
		// page shows loadError from the series call instead
	}

	const selected = url.searchParams.get('cat') ?? categories[0]?.category_id ?? 'all';

	let series: { series_id: number; name: string; cover: string; rating: string | null }[] = [];
	let loadError = '';
	try {
		const list = await getSeries(conn, selected === 'all' ? null : selected);
		series = (list ?? []).map((s) => ({
			series_id: s.series_id,
			name: s.name,
			cover: s.cover,
			rating: s.rating ? String(s.rating) : null
		}));
	} catch (e) {
		loadError = e instanceof Error ? e.message : 'Failed to load series';
	}

	return { connId: conn.id, categories, selected, series, loadError };
};
