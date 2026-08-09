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

	const shown = $derived(data.series.slice(0, limit));
</script>

<svelte:head><title>Series — StreamX</title></svelte:head>

<div class="flex h-full">
	<CategorySidebar
		basePath="/series"
		allLabel="All series"
		categories={data.categories}
		selected={data.selected}
		connId={data.connId}
		contentType="series"
	/>

	<div class="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
		<div class="mb-4 flex items-center justify-between gap-3">
			<h1 class="text-xl font-bold">Series</h1>
			<CategorySelect
				basePath="/series"
				allLabel="All series"
				categories={data.categories}
				selected={data.selected}
			/>
		</div>

		{#if data.loadError}
			<p class="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{data.loadError}</p>
		{:else if data.series.length === 0}
			<p class="py-16 text-center text-sm text-zinc-500">No series in this category.</p>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
				{#each shown as item (item.series_id)}
					<MediaCard
						href="/series/{item.series_id}"
						image={item.cover}
						title={item.name}
						badge={item.rating && item.rating !== '0' ? `★ ${item.rating}` : ''}
					/>
				{/each}
			</div>

			{#if limit < data.series.length}
				{#key limit}
					<div use:visible={() => (limit += CHUNK)} class="py-6 text-center text-xs text-zinc-600">
						Showing {shown.length} of {data.series.length} series…
					</div>
				{/key}
			{/if}
		{/if}
	</div>
</div>
