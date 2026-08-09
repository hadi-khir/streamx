<script lang="ts">
	import { navigating } from '$app/state';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let { data } = $props();

	const total = $derived(data.live.length + data.movies.length + data.series.length);
	const searching = $derived(navigating.to?.url.pathname === '/search');

	function liveUrl(item: { id: number; name: string; icon: string }): string {
		const q = new URLSearchParams({ name: item.name, icon: item.icon ?? '', conn: String(data.connId) });
		return `/watch/live/${item.id}?${q}`;
	}
</script>

<svelte:head><title>Search — StreamX</title></svelte:head>

<div class="mx-auto max-w-6xl p-4 md:p-6">
	<h1 class="text-xl font-bold">Search</h1>

	<form method="GET" class="mt-4">
		<div class="relative max-w-xl">
			<svg class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
			</svg>
			<input
				name="q"
				value={data.q}
				disabled={searching}
				placeholder="Search channels, movies, series… (min 2 characters)"
				class="w-full rounded-xl border border-surface-700 bg-surface-900 py-2.5 pr-4 pl-10 text-sm outline-none focus:border-accent disabled:opacity-60"
			/>
		</div>
		<p class="mt-2 text-xs text-zinc-600">
			The first search per connection builds an index of the full catalog and can take up to a minute.
		</p>
	</form>

	{#if searching}
		<div class="flex flex-col items-center gap-3 py-16">
			<div class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			<p class="text-sm text-zinc-400">Searching…</p>
			<p class="text-xs text-zinc-600">First search on a connection indexes the whole catalog — hang tight.</p>
		</div>
	{:else if data.loadError}
		<p class="mt-6 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{data.loadError}</p>
	{:else if data.q.length >= 2 && total === 0}
		<p class="py-16 text-center text-sm text-zinc-500">No results for “{data.q}”.</p>
	{/if}

	{#if !searching && data.live.length}
		<section class="mt-8">
			<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Live channels</h2>
			<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
				{#each data.live as item (item.id)}
					<a
						href={liveUrl(item)}
						class="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900 p-3 transition-colors hover:border-surface-600"
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-800">
							{#if item.icon}
								<img src={item.icon} alt="" loading="lazy" class="max-h-full max-w-full object-contain" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
							{/if}
						</div>
						<p class="truncate text-sm text-zinc-200">{item.name}</p>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if !searching && data.movies.length}
		<section class="mt-8">
			<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Movies</h2>
			<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
				{#each data.movies as item (item.id)}
					<MediaCard href="/movies/{item.id}" image={item.icon} title={item.name} />
				{/each}
			</div>
		</section>
	{/if}

	{#if !searching && data.series.length}
		<section class="mt-8">
			<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Series</h2>
			<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
				{#each data.series as item (item.id)}
					<MediaCard href="/series/{item.id}" image={item.icon} title={item.name} />
				{/each}
			</div>
		</section>
	{/if}
</div>
