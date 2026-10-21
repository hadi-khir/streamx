<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import MediaCard from '$lib/components/MediaCard.svelte';
	import type { Favorite } from '$lib/server/db/schema';

	let { data } = $props();

	const empty = $derived(!data.live.length && !data.movies.length && !data.series.length);

	function liveUrl(f: Favorite): string {
		const q = new URLSearchParams({ name: f.name, icon: f.icon ?? '', conn: String(f.connectionId) });
		return `/watch/live/${f.streamId}?${q}`;
	}

	async function remove(f: Favorite) {
		await fetch('/api/favorites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				connectionId: f.connectionId,
				streamType: f.streamType,
				streamId: f.streamId
			})
		}).catch(() => null);
		await invalidateAll();
	}
</script>

<svelte:head><title>My List — StreamX</title></svelte:head>

<div class="gutter pt-6 pb-20">
	<h1 class="text-2xl font-bold sm:text-3xl">My List</h1>

	{#if empty}
		<div class="py-20 text-center">
			<p class="text-lg text-zinc-300">You haven't added any titles to your list yet.</p>
			<p class="mt-2 text-sm text-zinc-500">Press <span class="font-semibold text-zinc-300">+</span> on a show, movie or channel to save it here.</p>
		</div>
	{/if}

	{#if data.movies.length || data.series.length}
		<section class="mt-6">
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
				{#each [...data.series, ...data.movies].sort((a, b) => b.createdAt - a.createdAt) as fav (fav.id)}
					<MediaCard
						href="/{fav.streamType === 'movie' ? 'movies' : 'series'}/{fav.streamId}?conn={fav.connectionId}"
						image={fav.icon}
						title={fav.name}
						onRemove={() => remove(fav)}
						removeLabel="Remove from My List"
					/>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.live.length}
		<section class="mt-10">
			<h2 class="mb-3 text-base font-semibold text-zinc-300">Channels</h2>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
				{#each data.live as fav (fav.id)}
					<MediaCard
						href={liveUrl(fav)}
						image={fav.icon}
						title={fav.name}
						landscape
						placeholder="tv"
						onRemove={() => remove(fav)}
						removeLabel="Remove from My List"
					/>
				{/each}
			</div>
		</section>
	{/if}
</div>
