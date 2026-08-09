<script lang="ts">
	import MediaCard from '$lib/components/MediaCard.svelte';
	import { visible } from '$lib/actions/visible';

	let { data } = $props();

	const CHUNK = 60;
	let limit = $state(CHUNK);
	$effect(() => {
		data.selected;
		limit = CHUNK;
	});

	const shown = $derived(data.movies.slice(0, limit));
</script>

<svelte:head><title>Movies — StreamX</title></svelte:head>

<div class="flex h-full">
	<aside class="hidden w-60 shrink-0 overflow-y-auto border-r border-surface-800 p-3 lg:block">
		<h2 class="px-2 pb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Categories</h2>
		<nav class="space-y-0.5">
			<a
				href="/movies?cat=all"
				class="block truncate rounded-lg px-3 py-1.5 text-sm {data.selected === 'all'
					? 'bg-accent/15 font-medium text-accent'
					: 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-200'}"
			>
				All movies
			</a>
			{#each data.categories as cat (cat.category_id)}
				<a
					href="/movies?cat={encodeURIComponent(cat.category_id)}"
					class="block truncate rounded-lg px-3 py-1.5 text-sm {data.selected === cat.category_id
						? 'bg-accent/15 font-medium text-accent'
						: 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-200'}"
				>
					{cat.category_name}
				</a>
			{/each}
		</nav>
	</aside>

	<div class="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
		<div class="mb-4 flex items-center justify-between gap-3">
			<h1 class="text-xl font-bold">Movies</h1>
			<select
				class="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm lg:hidden"
				onchange={(e) => (location.href = `/movies?cat=${encodeURIComponent(e.currentTarget.value)}`)}
			>
				<option value="all" selected={data.selected === 'all'}>All movies</option>
				{#each data.categories as cat (cat.category_id)}
					<option value={cat.category_id} selected={data.selected === cat.category_id}>
						{cat.category_name}
					</option>
				{/each}
			</select>
		</div>

		{#if data.loadError}
			<p class="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{data.loadError}</p>
		{:else if data.movies.length === 0}
			<p class="py-16 text-center text-sm text-zinc-500">No movies in this category.</p>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
				{#each shown as movie (movie.stream_id)}
					<MediaCard
						href="/movies/{movie.stream_id}"
						image={movie.stream_icon}
						title={movie.name}
						badge={movie.rating && movie.rating !== '0' ? `★ ${movie.rating}` : ''}
					/>
				{/each}
			</div>

			{#if limit < data.movies.length}
				{#key limit}
					<div use:visible={() => (limit += CHUNK)} class="py-6 text-center text-xs text-zinc-600">
						Showing {shown.length} of {data.movies.length} movies…
					</div>
				{/key}
			{/if}
		{/if}
	</div>
</div>
