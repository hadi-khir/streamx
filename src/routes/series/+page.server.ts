import { requireConnection } from '$lib/server/connections';
import { withPins } from '$lib/server/pins';
import { getSeriesCategories, getSeries } from '$lib/server/xtream';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!;
	const conn = requireConnection(user);

	let rawCategories: { category_id: string; category_name: string }[] = [];
	try {
		rawCategories = await getSeriesCategories(conn);
	} catch {
		// page shows loadError from the series call instead
	}
	const categories = withPins(user.id, conn.id, 'series', rawCategories);

	const selected = url.searchParams.get('cat') ?? categories[0]?.id ?? 'all';

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
