<script lang="ts">
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

	function episodeUrl(ep: { id: number; title: string; ext: string; image: string | null }): string {
		const q = new URLSearchParams({
			name: `${data.name} — ${ep.title}`,
			icon: ep.image ?? data.poster ?? '',
			conn: String(data.connId),
			ext: ep.ext,
			series: String(data.seriesId)
		});
		return `/watch/series/${ep.id}?${q}`;
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

	function fmtDuration(secs: number): string {
		const m = Math.round(secs / 60);
		return `${m}m`;
	}
</script>

<svelte:head><title>{data.name} — StreamX</title></svelte:head>

<div class="relative">
	{#if data.backdrop}
		<div class="absolute inset-x-0 top-0 h-72 overflow-hidden">
			<img src={data.backdrop} alt="" class="h-full w-full object-cover opacity-25 blur-sm" />
			<div class="absolute inset-0 bg-gradient-to-b from-transparent to-surface-950"></div>
		</div>
	{/if}

	<div class="relative mx-auto max-w-5xl p-6 md:p-10">
		<button onclick={() => history.back()} class="mb-6 flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-white">
			<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
			Back
		</button>

		<div class="flex flex-col gap-8 md:flex-row">
			<div class="w-48 shrink-0 md:w-56">
				<div class="aspect-[2/3] overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-2xl">
					{#if data.poster}
						<img src={data.poster} alt="" class="h-full w-full object-cover" />
					{:else}
						<div class="flex h-full items-center justify-center text-zinc-700">
							<svg class="h-16 w-16" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 6.75a1.5 1.5 0 0 0-1.5 1.5v9a1.5 1.5 0 0 0 1.5 1.5h16.5a1.5 1.5 0 0 0 1.5-1.5v-9a1.5 1.5 0 0 0-1.5-1.5M8.25 3l3.75 3.75L15.75 3" /></svg>
						</div>
					{/if}
				</div>
			</div>

			<div class="min-w-0 flex-1">
				<div class="flex items-start justify-between gap-3">
					<h1 class="text-3xl font-bold">{data.name}</h1>
					<button
						onclick={toggleFavorite}
						class="shrink-0 rounded-xl border border-surface-700 p-2.5 transition-colors {favorited ? 'border-red-400/40 text-red-400' : 'text-zinc-400 hover:text-white'}"
						title={favorited ? 'Remove from favorites' : 'Add to favorites'}
					>
						<svg class="h-5 w-5" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
						</svg>
					</button>
				</div>

				<div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
					{#if data.year}<span>{data.year}</span>{/if}
					<span>· {data.seasons.length} season{data.seasons.length === 1 ? '' : 's'}</span>
					{#if data.rating}
						<span class="flex items-center gap-1 text-amber-400">
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
							{data.rating.toFixed(1)}
						</span>
					{/if}
				</div>

				{#if data.genres.length}
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each data.genres as genre (genre)}
							<span class="rounded-full border border-surface-700 px-2.5 py-0.5 text-xs text-zinc-400">{genre}</span>
						{/each}
					</div>
				{/if}

				{#if data.overview}
					<p class="mt-5 max-w-2xl text-sm leading-relaxed text-zinc-300">{data.overview}</p>
				{/if}
				{#if data.cast}
					<p class="mt-4 text-xs text-zinc-500"><span class="font-medium text-zinc-400">Cast:</span> {data.cast}</p>
				{/if}
			</div>
		</div>

		<div class="mt-10">
			{#if data.seasons.length === 0}
				<div class="rounded-xl border border-dashed border-surface-700 px-6 py-8 text-center">
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
				<div class="flex flex-wrap gap-2">
					{#each data.seasons as s (s.season)}
						<button
							onclick={() => (selectedSeason = s.season)}
							class="rounded-lg px-3 py-1.5 text-sm transition-colors {selectedSeason === s.season
								? 'bg-accent font-medium text-white'
								: 'border border-surface-700 text-zinc-400 hover:text-zinc-200'}"
						>
							Season {s.season}
						</button>
					{/each}
				</div>

				<div class="mt-4 space-y-2">
					{#each season?.episodes ?? [] as ep (ep.id)}
						<a
							href={episodeUrl(ep)}
							class="flex items-center gap-4 rounded-xl border border-surface-800 bg-surface-900 p-3 transition-colors hover:border-surface-600"
						>
							<div class="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-800 sm:h-16 sm:w-28">
								{#if ep.image || data.poster}
									<img
										src={ep.image ?? data.poster}
										alt=""
										loading="lazy"
										class="h-full w-full object-cover"
										onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
									/>
								{/if}
								{#if ep.progressPct > 0}
									<div class="absolute right-0 bottom-0 left-0 h-1 bg-black/50">
										<div class="h-full bg-accent" style="width: {ep.progressPct * 100}%"></div>
									</div>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-zinc-200">
									<span class="mr-2 text-zinc-500">E{ep.num}</span>{ep.title}
								</p>
								{#if ep.plot}
									<p class="mt-0.5 line-clamp-2 text-xs text-zinc-500">{ep.plot}</p>
								{/if}
							</div>
							{#if ep.durationSecs}
								<span class="shrink-0 text-xs text-zinc-500">{fmtDuration(ep.durationSecs)}</span>
							{/if}
							<svg class="h-5 w-5 shrink-0 text-zinc-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
