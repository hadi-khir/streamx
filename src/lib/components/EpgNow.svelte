<script lang="ts" module>
	// Shared across all instances so re-mounts don't refetch
	const epgCache = new Map<string, Promise<{ listings: EpgEntry[] }>>();

	export interface EpgEntry {
		title: string;
		description: string;
		start: number;
		end: number;
		now: boolean;
	}
</script>

<script lang="ts">
	import { visible } from '$lib/actions/visible';

	let { connId, streamId }: { connId: number; streamId: number } = $props();

	let listings = $state<EpgEntry[] | null>(null);

	function load() {
		const key = `${connId}:${streamId}`;
		let promise = epgCache.get(key);
		if (!promise) {
			promise = fetch(`/api/epg/${connId}/${streamId}?limit=2`).then((r) =>
				r.ok ? r.json() : { listings: [] }
			);
			epgCache.set(key, promise);
		}
		promise.then((data) => (listings = data.listings)).catch(() => (listings = []));
	}

	const nowShow = $derived(listings?.find((l) => l.now));
	const nextShow = $derived(listings?.find((l) => !l.now && l.start > Date.now() / 1000));
	const pct = $derived(
		nowShow ? ((Date.now() / 1000 - nowShow.start) / (nowShow.end - nowShow.start)) * 100 : 0
	);

	function fmt(unix: number): string {
		return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div use:visible={load} class="min-h-8">
	{#if nowShow}
		<p class="truncate text-xs text-zinc-400">{nowShow.title}</p>
		<div class="mt-1 h-0.5 w-full rounded-full bg-surface-700">
			<div class="h-full rounded-full bg-accent/70" style="width: {Math.min(100, Math.max(0, pct))}%"></div>
		</div>
		{#if nextShow}
			<p class="mt-1 truncate text-[11px] text-zinc-600">{fmt(nextShow.start)} · {nextShow.title}</p>
		{/if}
	{:else if listings != null && listings.length === 0}
		<p class="text-[11px] text-zinc-700">No guide data</p>
	{/if}
</div>
