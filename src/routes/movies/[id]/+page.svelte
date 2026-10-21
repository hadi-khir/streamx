<script lang="ts">
	import { downloadUrl } from '$lib/download';
	import Billboard from '$lib/components/Billboard.svelte';
	import MediaCard from '$lib/components/MediaCard.svelte';
	import { displayName } from '$lib/titles';

	let { data } = $props();

	let favorited = $state(false);
	$effect(() => {
		favorited = data.favorited;
	});

	const watchUrl = $derived.by(() => {
		const q = new URLSearchParams({
			name: data.name,
			icon: data.poster ?? '',
			conn: String(data.connId),
			ext: data.ext
		});
		return `/watch/movie/${data.streamId}?${q}`;
	});

	const saveUrl = $derived(
		downloadUrl({
			connId: data.connId,
			type: 'movie',
			streamId: data.streamId,
			ext: data.ext,
			name: data.name
		})
	);

	const resumePct = $derived(
		data.progress && data.progress.duration > 0
			? Math.min(100, (data.progress.position / data.progress.duration) * 100)
			: 0
	);

	async function toggleFavorite() {
		favorited = !favorited;
		const res = await fetch('/api/favorites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				connectionId: data.connId,
				streamType: 'movie',
				streamId: data.streamId,
				name: data.name,
				icon: data.poster,
				ext: data.ext
			})
		}).catch(() => null);
		if (res?.ok) favorited = (await res.json()).favorited;
	}

	const resuming = $derived(resumePct > 0 && resumePct < 95);
	const meta = $derived(
		[data.year, data.durationSecs ? fmtDuration(data.durationSecs) : null, ...data.genres.slice(0, 3)].filter(
			(x): x is string => !!x
		)
	);

	function fmtDuration(secs: number): string {
		const h = Math.floor(secs / 3600);
		const m = Math.round((secs % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
</script>

<svelte:head><title>{displayName(data.name)} — StreamX</title></svelte:head>

<Billboard
	short
	title={displayName(data.name)}
	backdrop={data.backdrop}
	poster={data.poster}
	overview={data.overview}
	rating={data.rating}
	{meta}
>
	<a href={watchUrl} class="btn-play">
		<svg class="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
		{resuming ? 'Resume' : 'Play'}
	</a>
	<button
		onclick={toggleFavorite}
		class="btn-round"
		title={favorited ? 'Remove from My List' : 'Add to My List'}
		aria-label={favorited ? 'Remove from My List' : 'Add to My List'}
	>
		{#if favorited}
			<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
		{:else}
			<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
		{/if}
	</button>
	<a href={saveUrl} download class="btn-round" title="Download for offline viewing" aria-label="Download for offline viewing">
		<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
		</svg>
	</a>
</Billboard>

<div class="gutter relative z-10 -mt-[6vh] pb-20">
	{#if resuming}
		<div class="mb-6 flex max-w-md items-center gap-3">
			<div class="h-1 flex-1 bg-zinc-700">
				<div class="h-full bg-accent" style="width: {resumePct}%"></div>
			</div>
			<span class="text-xs text-zinc-400">{Math.round(100 - resumePct)}% left</span>
		</div>
	{/if}

	{#if data.cast || data.director || data.genres.length}
		<div class="max-w-3xl space-y-1.5 text-sm">
			{#if data.cast}
				<p class="line-clamp-2 text-zinc-500">Cast: <span class="text-zinc-300">{data.cast}</span></p>
			{/if}
			{#if data.director}
				<p class="text-zinc-500">Director: <span class="text-zinc-300">{data.director}</span></p>
			{/if}
			{#if data.genres.length}
				<p class="text-zinc-500">Genres: <span class="text-zinc-300">{data.genres.join(', ')}</span></p>
			{/if}
		</div>
	{/if}

	{#await data.similar then similar}
		{#if similar.length}
			<h2 class="mt-10 mb-3 text-xl font-bold sm:text-2xl">More Like This</h2>
			<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
				{#each similar as item (item.kind + item.id)}
					<MediaCard
						href={item.kind === 'movie' ? `/movies/${item.id}?conn=${data.connId}` : `/series/${item.id}?conn=${data.connId}`}
						image={item.image}
						title={item.name}
						badge={item.rating ? `★ ${item.rating.toFixed(1)}` : ''}
					/>
				{/each}
			</div>
		{/if}
	{/await}
</div>
