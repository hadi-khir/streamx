/**
 * Link that saves a title to the device. Streams through the same proxy the
 * player uses — provider credentials stay on the server — with a filename and
 * an attachment header so the browser writes a file instead of navigating.
 */
export function downloadUrl(item: {
	connId: number;
	type: 'movie' | 'series';
	streamId: number;
	ext: string | null;
	name: string;
}): string {
	const q = new URLSearchParams({
		ext: item.ext || 'mp4',
		download: '1',
		name: item.name
	});
	return `/api/stream/${item.connId}/${item.type}/${item.streamId}?${q}`;
}
