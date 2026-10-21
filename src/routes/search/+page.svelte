<script lang="ts">
	import { navigating } from '$app/state';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let { data } = $props();

	const total = $derived(data.live.length + data.movies.length + data.series.length);
	const searching = $derived(navigating.to?.url.pathname === '/search');

	// Films and shows interleave like Netflix's one results grid, best match first
	const titles = $derived.by(() => {
		const out = [];
		const longest = Math.max(data.movies.length, data.series.length);
		for (let i = 0; i < longest; i++) {
			if (data.movies[i]) out.push(data.movies[i]);
			if (data.series[i]) out.push(data.series[i]);
		}
		return out;
	});

	function liveUrl(item: { id: number; name: string; icon: string }): string {
		const q = new URLSearchParams({ name: item.name, icon: item.icon ?? '', conn: String(data.connId) });
		return `/watch/live/${item.id}?${q}`;
	}
</script>

<svelte:head><title>{data.q ? `${data.q} — ` : ''}Search — StreamX</title></svelte:head>

<div class="gutter pt-6 pb-20">
	<!-- The bar's search box is small on phones; this one is the real thing there -->
	<form method="GET" class="md:hidden">
		<div class="relative">
			<svg class="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
			</svg>
			<input
				name="q"
				value={data.q}
				placeholder="Search shows, movies, channels"
				class="w-full rounded bg-surface-800 py-3 pr-4 pl-11 text-base text-white outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-white/40"
			/>
		</div>
	</form>

	{#if searching}
		<div class="flex items-center gap-3 py-6 text-sm text-zinc-400">
			<div class="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			Searching…
		</div>
	{/if}

	{#if data.q.length < 2}
		<p class="py-16 text-center text-zinc-500">Search for a show, movie or channel.</p>
	{:else if data.loadError}
		<p class="mt-6 rounded bg-red-500/10 px-4 py-3 text-sm text-red-400">{data.loadError}</p>
	{:else if total === 0 && !searching}
		<div class="py-16 text-center">
			<p class="text-lg text-zinc-300">Your search for “{data.q}” did not have any matches.</p>
			<p class="mt-2 text-sm text-zinc-500">Try a different title, or a channel name.</p>
			{#if data.partial}
				<p class="mt-4 text-xs text-zinc-600">The catalog is still being indexed — more titles appear over the next few minutes.</p>
			{/if}
		</div>
	{/if}

	<div class="transition-opacity {searching ? 'opacity-50' : ''}">
		{#if titles.length}
			<section class="mt-4">
				<h2 class="mb-3 text-base font-semibold text-zinc-300">Movies &amp; TV</h2>
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
					{#each titles as item (item.type + item.id)}
						<MediaCard href="/{item.type === 'movie' ? 'movies' : 'series'}/{item.id}" image={item.icon} title={item.name} />
					{/each}
				</div>
			</section>
		{/if}

		{#if data.live.length}
			<section class="mt-10">
				<h2 class="mb-3 text-base font-semibold text-zinc-300">Live channels</h2>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
					{#each data.live as item (item.id)}
						<MediaCard href={liveUrl(item)} image={item.icon} title={item.name} landscape placeholder="tv" />
					{/each}
				</div>
			</section>
		{/if}

		{#if data.partial && total > 0}
			<p class="mt-8 text-xs text-zinc-600">The catalog is still being indexed — more results may appear shortly.</p>
		{/if}
	</div>
</div>
