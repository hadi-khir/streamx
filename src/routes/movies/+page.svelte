<script lang="ts">
	import CategorySidebar from '$lib/components/CategorySidebar.svelte';
	import CategorySelect from '$lib/components/CategorySelect.svelte';
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
	<CategorySidebar
		basePath="/movies"
		allLabel="All movies"
		categories={data.categories}
		selected={data.selected}
		connId={data.connId}
		contentType="vod"
	/>

	<div class="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
		<div class="mb-4 flex items-center justify-between gap-3">
			<h1 class="text-xl font-bold">Movies</h1>
			<CategorySelect
				basePath="/movies"
				allLabel="All movies"
				categories={data.categories}
				selected={data.selected}
			/>
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
