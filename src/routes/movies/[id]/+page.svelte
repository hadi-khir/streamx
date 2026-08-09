<script lang="ts">
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

	function fmtDuration(secs: number): string {
		const h = Math.floor(secs / 3600);
		const m = Math.round((secs % 3600) / 60);
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
			<div class="w-48 shrink-0 md:w-64">
				<div class="aspect-[2/3] overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 shadow-2xl">
					{#if data.poster}
						<img src={data.poster} alt="" class="h-full w-full object-cover" />
					{:else}
						<div class="flex h-full items-center justify-center text-zinc-700">
							<svg class="h-16 w-16" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25M3.375 4.5h17.25M5.625 4.5v15m12.75-15v15" /></svg>
						</div>
					{/if}
				</div>
			</div>

			<div class="min-w-0 flex-1">
				<h1 class="text-3xl font-bold">{data.name}</h1>

				<div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
					{#if data.year}<span>{data.year}</span>{/if}
					{#if data.durationSecs}<span>· {fmtDuration(data.durationSecs)}</span>{/if}
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
				{#if data.director}
					<p class="mt-1 text-xs text-zinc-500"><span class="font-medium text-zinc-400">Director:</span> {data.director}</p>
				{/if}

				<div class="mt-7 flex items-center gap-3">
					<a
						href={watchUrl}
						class="flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
					>
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
						{resumePct > 0 && resumePct < 95 ? 'Resume' : 'Play'}
					</a>
					<button
						onclick={toggleFavorite}
						class="rounded-xl border border-surface-700 p-2.5 transition-colors {favorited ? 'border-red-400/40 text-red-400' : 'text-zinc-400 hover:text-white'}"
						title={favorited ? 'Remove from favorites' : 'Add to favorites'}
					>
						<svg class="h-5 w-5" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
						</svg>
					</button>
				</div>

				{#if resumePct > 0 && resumePct < 95}
					<div class="mt-4 max-w-xs">
						<div class="h-1 rounded-full bg-surface-800">
							<div class="h-full rounded-full bg-accent" style="width: {resumePct}%"></div>
						</div>
						<p class="mt-1 text-xs text-zinc-500">{Math.round(resumePct)}% watched</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
