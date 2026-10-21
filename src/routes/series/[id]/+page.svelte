<script lang="ts">
	import { goto } from '$app/navigation';
	import FallbackImage from '$lib/components/FallbackImage.svelte';
	import { tmdbFallback } from '$lib/images';
	import { episodeWatchUrl, type EpisodeLink } from '$lib/episodes';
	import { downloadUrl } from '$lib/download';
	import Billboard from '$lib/components/Billboard.svelte';
	import MediaCard from '$lib/components/MediaCard.svelte';
	import { displayName } from '$lib/titles';

	let { data } = $props();

	let favorited = $state(false);
	let selectedSeason = $state('');
	$effect(() => {
		favorited = data.favorited;
	});
	$effect(() => {
		if (!data.seasons.some((s) => s.season === selectedSeason)) {
			selectedSeason = data.seasons[0]?.season ?? '';
		}
	});

	const season = $derived(data.seasons.find((s) => s.season === selectedSeason));
	const allEpisodes = $derived(data.seasons.flatMap((s) => s.episodes));

	function episodeUrl(ep: EpisodeLink): string {
		return episodeWatchUrl(
			{
				seriesId: data.seriesId,
				seriesName: data.name,
				connId: data.connId,
				poster: data.poster
			},
			ep
		);
	}

	function episodeDownloadUrl(ep: EpisodeLink): string {
		return downloadUrl({
			connId: data.connId,
			type: 'series',
			streamId: ep.id,
			ext: ep.ext,
			name: `${data.name} - ${ep.title}`
		});
	}

	/** Jump to a random episode across every season. */
	function playRandomEpisode() {
		if (!allEpisodes.length) return;
		const ep = allEpisodes[Math.floor(Math.random() * allEpisodes.length)];
		goto(episodeUrl(ep));
	}

	async function toggleFavorite() {
		favorited = !favorited;
		const res = await fetch('/api/favorites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				connectionId: data.connId,
				streamType: 'series',
				streamId: data.seriesId,
				name: data.name,
				icon: data.poster
			})
		}).catch(() => null);
		if (res?.ok) favorited = (await res.json()).favorited;
	}

	const meta = $derived(
		[
			data.year,
			data.seasons.length ? `${data.seasons.length} Season${data.seasons.length === 1 ? '' : 's'}` : null,
			...data.genres.slice(0, 3)
		].filter((x): x is string => !!x)
	);
	const showName = $derived(displayName(data.name));

	/** Episode titles repeat the show ("Superstore (2015) - S01E07"); keep what's left. */
	function episodeTitle(title: string): string {
		const stripped = title
			.replace(new RegExp('^' + data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
			.replace(/^[\s\-–—:|]+/, '')
			.trim();
		return stripped || title;
	}

	function fmtDuration(secs: number): string {
		const m = Math.round(secs / 60);
		return `${m}m`;
	}
</script>

<svelte:head><title>{showName} — StreamX</title></svelte:head>

<Billboard
	short
	title={showName}
	backdrop={data.backdrop}
	poster={data.poster}
	overview={data.overview}
	rating={data.rating}
	{meta}
>
	{#if data.upNext}
		<a href={episodeUrl(data.upNext.episode)} class="btn-play">
			<svg class="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
			{data.upNext.label}
		</a>
	{/if}
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
	{#if allEpisodes.length > 1}
		<button onclick={playRandomEpisode} class="btn-round" title="Play a random episode" aria-label="Play a random episode">
			<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
				<path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="m4 4 5 5" />
			</svg>
		</button>
	{/if}
</Billboard>

<div class="gutter relative z-10 -mt-[6vh] pb-20">
	{#if data.cast || data.genres.length}
		<div class="mb-8 max-w-3xl space-y-1.5 text-sm">
			{#if data.cast}
				<p class="line-clamp-2 text-zinc-500">Cast: <span class="text-zinc-300">{data.cast}</span></p>
			{/if}
			{#if data.genres.length}
				<p class="text-zinc-500">Genres: <span class="text-zinc-300">{data.genres.join(', ')}</span></p>
			{/if}
		</div>
	{/if}

	<div class="max-w-5xl">
		<div class="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
			<h2 class="text-xl font-bold sm:text-2xl">Episodes</h2>
			{#if data.seasons.length > 1}
				<select
					bind:value={selectedSeason}
					class="rounded border border-zinc-500 bg-surface-900 px-3 py-2 text-sm font-semibold text-white outline-none sm:text-base"
					aria-label="Season"
				>
					{#each data.seasons as s (s.season)}
						<option value={s.season}>Season {s.season}</option>
					{/each}
				</select>
			{:else if data.seasons.length === 1}
				<span class="text-sm text-zinc-400">Season {data.seasons[0].season}</span>
			{/if}
		</div>

		{#if data.seasons.length === 0}
			<div class="py-10 text-center">
				<p class="text-sm text-zinc-400">The provider hasn't published any playable episodes for this title yet.</p>
				{#if data.providerSeasons.length}
					<p class="mt-2 text-xs text-zinc-600">
						Listed: {data.providerSeasons
							.map((s) => `${s.name}${s.episodeCount ? ` (${s.episodeCount} episodes)` : ''}`)
							.join(' · ')}
					</p>
				{/if}
			</div>
		{:else}
			<ol>
				{#each season?.episodes ?? [] as ep (ep.id)}
					{@const current = data.upNext?.episode.id === ep.id}
					<li class="group/ep flex items-center gap-2 border-b border-white/10 sm:gap-4 {current ? 'bg-surface-800' : ''}">
						<a href={episodeUrl(ep)} class="flex min-w-0 flex-1 items-center gap-3 rounded px-1 py-4 transition-colors hover:bg-surface-800 sm:gap-5 sm:px-4">
							<span class="hidden w-6 shrink-0 text-center text-2xl text-zinc-400 sm:block">{ep.num}</span>
							<div class="relative aspect-video w-28 shrink-0 overflow-hidden rounded bg-surface-800 sm:w-36">
								<FallbackImage
									sources={[ep.image, tmdbFallback(ep.image), data.poster]}
									imgClass="h-full w-full object-cover"
								/>
								<span class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/ep:opacity-100">
									<span class="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-black/50">
										<svg class="ml-0.5 h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
									</span>
								</span>
								{#if ep.progressPct > 0}
									<div class="absolute inset-x-0 bottom-0 h-1 bg-zinc-600/90">
										<div class="h-full bg-accent" style="width: {ep.progressPct * 100}%"></div>
									</div>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline justify-between gap-3">
									<p class="truncate text-sm font-semibold text-zinc-100 sm:text-base">
										<span class="sm:hidden">{ep.num}. </span>{episodeTitle(ep.title)}
									</p>
									{#if ep.durationSecs}
										<span class="shrink-0 text-sm text-zinc-400">{fmtDuration(ep.durationSecs)}</span>
									{/if}
								</div>
								{#if ep.plot}
									<p class="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">{ep.plot}</p>
								{/if}
							</div>
						</a>
						<a
							href={episodeDownloadUrl(ep)}
							download
							class="shrink-0 rounded-full p-2 text-zinc-500 transition-colors hover:bg-surface-800 hover:text-white"
							title="Download this episode"
							aria-label="Download episode {ep.num}"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
							</svg>
						</a>
					</li>
				{/each}
			</ol>
		{/if}
	</div>

	{#await data.similar then similar}
		{#if similar.length}
			<h2 class="mt-12 mb-3 text-xl font-bold sm:text-2xl">More Like This</h2>
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
