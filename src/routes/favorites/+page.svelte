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

<svelte:head><title>Favorites — StreamX</title></svelte:head>

<div class="mx-auto max-w-6xl p-4 md:p-6">
	<h1 class="text-xl font-bold">Favorites</h1>

	{#if empty}
		<p class="py-16 text-center text-sm text-zinc-500">
			Nothing here yet — tap the heart on a channel or movie to save it.
		</p>
	{/if}

	{#if data.live.length}
		<section class="mt-6">
			<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Live channels</h2>
			<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
				{#each data.live as fav (fav.id)}
					<div class="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900 p-3 transition-colors hover:border-surface-600">
						<a href={liveUrl(fav)} class="flex min-w-0 flex-1 items-center gap-3">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-800">
								{#if fav.icon}
									<img src={fav.icon} alt="" loading="lazy" class="max-h-full max-w-full object-contain" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
								{/if}
							</div>
							<p class="truncate text-sm text-zinc-200">{fav.name}</p>
						</a>
						<button
							onclick={() => remove(fav)}
							class="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
							title="Remove from favorites"
						>
							<svg class="h-4 w-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
								<path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.movies.length}
		<section class="mt-8">
			<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Movies</h2>
			<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
				{#each data.movies as fav (fav.id)}
					<MediaCard
						href="/movies/{fav.streamId}?conn={fav.connectionId}"
						image={fav.icon}
						title={fav.name}
					/>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.series.length}
		<section class="mt-8">
			<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Series</h2>
			<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
				{#each data.series as fav (fav.id)}
					<MediaCard
						href="/series/{fav.streamId}?conn={fav.connectionId}"
						image={fav.icon}
						title={fav.name}
					/>
				{/each}
			</div>
		</section>
	{/if}
</div>
