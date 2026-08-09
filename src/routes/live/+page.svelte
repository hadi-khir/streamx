<script lang="ts">
	import CategorySidebar from '$lib/components/CategorySidebar.svelte';
	import CategorySelect from '$lib/components/CategorySelect.svelte';
	import EpgNow from '$lib/components/EpgNow.svelte';
	import { visible } from '$lib/actions/visible';

	let { data } = $props();

	const CHUNK = 120;
	let limit = $state(CHUNK);
	$effect(() => {
		data.selected; // reset paging when the category changes
		limit = CHUNK;
	});

	const shown = $derived(data.channels.slice(0, limit));

	function watchUrl(c: { stream_id: number; name: string; stream_icon: string }): string {
		const q = new URLSearchParams({ name: c.name, icon: c.stream_icon ?? '', conn: String(data.connId) });
		return `/watch/live/${c.stream_id}?${q}`;
	}
</script>

<svelte:head><title>Live TV — StreamX</title></svelte:head>

<div class="flex h-full">
	<CategorySidebar
		basePath="/live"
		allLabel="All channels"
		categories={data.categories}
		selected={data.selected}
		connId={data.connId}
		contentType="live"
	/>

	<div class="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
		<div class="mb-4 flex items-center justify-between gap-3">
			<h1 class="text-xl font-bold">Live TV</h1>
			<CategorySelect
				basePath="/live"
				allLabel="All channels"
				categories={data.categories}
				selected={data.selected}
			/>
		</div>

		{#if data.loadError}
			<p class="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{data.loadError}</p>
		{:else if data.channels.length === 0}
			<p class="py-16 text-center text-sm text-zinc-500">No channels in this category.</p>
		{:else}
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
				{#each shown as channel (channel.stream_id)}
					<a
						href={watchUrl(channel)}
						class="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900 p-3 transition-colors hover:border-surface-600"
					>
						<div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-800">
							{#if channel.stream_icon}
								<img src={channel.stream_icon} alt="" loading="lazy" class="max-h-full max-w-full object-contain" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
							{:else}
								<svg class="h-5 w-5 text-zinc-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 20.25h12M12 17.25v3M3.375 17.25h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z" /></svg>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-zinc-200">{channel.name}</p>
							<EpgNow connId={data.connId} streamId={channel.stream_id} />
						</div>
					</a>
				{/each}
			</div>

			{#if limit < data.channels.length}
				{#key limit}
					<div use:visible={() => (limit += CHUNK)} class="py-6 text-center text-xs text-zinc-600">
						Showing {shown.length} of {data.channels.length} channels…
					</div>
				{/key}
			{/if}
		{/if}
	</div>
</div>
