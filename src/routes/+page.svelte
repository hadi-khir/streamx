<script lang="ts">
	import MediaCard from '$lib/components/MediaCard.svelte';
	import type { WatchProgress, Favorite } from '$lib/server/db/schema';

	let { data } = $props();

	function resumeUrl(row: WatchProgress): string {
		const type = row.streamType === 'movie' ? 'movie' : 'series';
		const q = new URLSearchParams({
			name: row.name,
			icon: row.icon ?? '',
			conn: String(row.connectionId)
		});
		if (row.ext) q.set('ext', row.ext);
		if (row.seriesId) q.set('series', String(row.seriesId));
		return `/watch/${type}/${row.streamId}?${q}`;
	}

	function liveUrl(row: WatchProgress | Favorite): string {
		const q = new URLSearchParams({
			name: row.name,
			icon: row.icon ?? '',
			conn: String(row.connectionId)
		});
		return `/watch/live/${row.streamId}?${q}`;
	}

	function favUrl(f: Favorite): string {
		if (f.streamType === 'live') return liveUrl(f);
		if (f.streamType === 'movie') return `/movies/${f.streamId}?conn=${f.connectionId}`;
		return `/series/${f.streamId}?conn=${f.connectionId}`;
	}
</script>

<svelte:head><title>Home — StreamX</title></svelte:head>

<div class="mx-auto max-w-6xl p-4 md:p-6">
	<h1 class="text-xl font-bold">Home</h1>

	{#if !data.hasConnection}
		<div class="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-6">
			<h2 class="font-semibold">Welcome to StreamX</h2>
			<p class="mt-1 text-sm text-zinc-400">
				Add an Xtream Codes connection to start watching live TV, movies, and series.
			</p>
			<a
				href="/settings?setup=1"
				class="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
			>
				Add connection
			</a>
		</div>
	{:else}
		{#if data.continueWatching.length}
			<section class="mt-6">
				<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Continue watching</h2>
				<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
					{#each data.continueWatching as row (row.id)}
						<MediaCard
							href={resumeUrl(row)}
							image={row.icon}
							title={row.name}
							subtitle={row.streamType === 'episode' ? 'Episode' : 'Movie'}
							progress={row.duration > 0 ? row.position / row.duration : 0}
						/>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.recentLive.length}
			<section class="mt-8">
				<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Recent channels</h2>
				<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
					{#each data.recentLive as row (row.id)}
						<a
							href={liveUrl(row)}
							class="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900 p-3 transition-colors hover:border-surface-600"
						>
							<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-800">
								{#if row.icon}
									<img src={row.icon} alt="" loading="lazy" class="max-h-full max-w-full object-contain" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
								{/if}
							</div>
							<p class="truncate text-sm text-zinc-200">{row.name}</p>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if data.favorites.length}
			<section class="mt-8">
				<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Favorites</h2>
				<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
					{#each data.favorites as fav (fav.id)}
						<MediaCard href={favUrl(fav)} image={fav.icon} title={fav.name} landscape={fav.streamType === 'live'} />
					{/each}
				</div>
			</section>
		{/if}

		{#if !data.continueWatching.length && !data.recentLive.length && !data.favorites.length}
			<div class="mt-6 grid gap-4 sm:grid-cols-3">
				<a href="/live" class="rounded-2xl border border-surface-800 bg-surface-900 p-6 transition-colors hover:border-surface-600">
					<h3 class="font-semibold">Live TV</h3>
					<p class="mt-1 text-sm text-zinc-500">Browse channels with the program guide.</p>
				</a>
				<a href="/movies" class="rounded-2xl border border-surface-800 bg-surface-900 p-6 transition-colors hover:border-surface-600">
					<h3 class="font-semibold">Movies</h3>
					<p class="mt-1 text-sm text-zinc-500">The full VOD catalog from your provider.</p>
				</a>
				<a href="/series" class="rounded-2xl border border-surface-800 bg-surface-900 p-6 transition-colors hover:border-surface-600">
					<h3 class="font-semibold">Series</h3>
					<p class="mt-1 text-sm text-zinc-500">Shows with season and episode tracking.</p>
				</a>
			</div>
		{/if}
	{/if}
</div>
