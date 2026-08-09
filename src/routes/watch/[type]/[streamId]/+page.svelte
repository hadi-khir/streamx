<script lang="ts">
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';

	let { data } = $props();

	let favorited = $state(false);
	$effect(() => {
		favorited = data.favorited;
	});

	const nowPlaying = $derived(data.epg.find((e) => e.now));

	async function toggleFavorite() {
		favorited = !favorited;
		const res = await fetch('/api/favorites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				connectionId: data.connectionId,
				streamType: data.type,
				streamId: data.streamId,
				name: data.name,
				icon: data.icon,
				ext: data.ext
			})
		}).catch(() => null);
		if (res?.ok) {
			favorited = (await res.json()).favorited;
		}
	}

	function reportProgress(position: number, duration: number) {
		navigator.sendBeacon?.(
			'/api/progress',
			new Blob(
				[
					JSON.stringify({
						connectionId: data.connectionId,
						streamType: data.progressType,
						streamId: data.streamId,
						seriesId: data.seriesId,
						name: data.name,
						icon: data.icon,
						ext: data.ext,
						position,
						duration
					})
				],
				{ type: 'application/json' }
			)
		);
	}

	function fmtTime(unix: number): string {
		return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head><title>{data.name} — StreamX</title></svelte:head>

<div class="flex h-full min-h-dvh flex-col bg-black">
	<div class="z-10 flex items-center gap-3 bg-surface-900/90 px-4 py-3 backdrop-blur-sm">
		<button
			onclick={() => history.back()}
			class="text-zinc-400 transition-colors hover:text-white"
			title="Back"
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm text-white">{nowPlaying?.title ?? data.name}</p>
			<p class="truncate text-xs text-zinc-500">
				{data.type === 'live' ? 'Live TV' : data.type === 'movie' ? 'Movie' : 'Series'}
				{nowPlaying ? ` — ${data.name}` : ''}
			</p>
		</div>
		{#if data.type === 'live' || data.type === 'movie'}
			<button
				onclick={toggleFavorite}
				class="rounded-lg p-2 transition-colors {favorited ? 'text-red-400' : 'text-zinc-400 hover:text-white'}"
				title={favorited ? 'Remove from favorites' : 'Add to favorites'}
			>
				<svg class="h-5 w-5" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
				</svg>
			</button>
		{/if}
	</div>

	<div class="flex min-h-0 flex-1 items-center justify-center bg-black">
		<div class="w-full max-w-6xl">
			<VideoPlayer
				attempts={data.attempts}
				live={data.type === 'live'}
				initialPosition={data.savedPosition}
				onProgress={reportProgress}
			/>
		</div>
	</div>

	{#if data.type === 'live' && data.epg.length > 0}
		<div class="max-h-56 overflow-y-auto border-t border-surface-800 bg-surface-900 p-4">
			<h3 class="mb-3 text-sm font-semibold text-white">Program Guide</h3>
			<div class="space-y-2">
				{#each data.epg as item, i (i)}
					<div
						class="flex items-start gap-3 rounded-lg p-2 {item.now ? 'border border-accent/20 bg-accent/10' : ''}"
					>
						<span class="mt-0.5 text-xs whitespace-nowrap text-zinc-500 tabular-nums">
							{fmtTime(item.start)} – {fmtTime(item.end)}
						</span>
						<div class="min-w-0 flex-1">
							<p class="text-sm {item.now ? 'font-medium text-accent' : 'text-zinc-300'}">{item.title}</p>
							{#if item.description}
								<p class="mt-0.5 line-clamp-1 text-xs text-zinc-500">{item.description}</p>
							{/if}
						</div>
						{#if item.now}
							<span class="shrink-0 rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">NOW</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
