<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import MediaCard from '$lib/components/MediaCard.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import type { Favorite } from '$lib/server/db/schema';

	let { data } = $props();

	type RecentEntry = (typeof data.recents)[number];

	async function removeRecent(entry: RecentEntry) {
		const payload =
			entry.kind === 'series'
				? { seriesId: entry.seriesId, connectionId: entry.connectionId }
				: { id: entry.id };
		await fetch('/api/progress', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}).catch(() => null);
		await invalidateAll();
	}

	/** Resume where you stopped; once something is finished, go to its page instead. */
	function recentUrl(entry: RecentEntry): string {
		const q = new URLSearchParams({
			name: entry.name,
			icon: entry.icon ?? '',
			conn: String(entry.connectionId)
		});
		if (entry.kind === 'live') return `/watch/live/${entry.streamId}?${q}`;
		if (!entry.resumable) {
			if (entry.kind === 'movie') return `/movies/${entry.streamId}?conn=${entry.connectionId}`;
			if (entry.seriesId) return `/series/${entry.seriesId}?conn=${entry.connectionId}`;
		}
		if (entry.ext) q.set('ext', entry.ext);
		if (entry.seriesId) q.set('series', String(entry.seriesId));
		return `/watch/${entry.kind === 'movie' ? 'movie' : 'series'}/${entry.streamId}?${q}`;
	}

	function favUrl(f: Favorite): string {
		if (f.streamType === 'live') {
			const q = new URLSearchParams({
				name: f.name,
				icon: f.icon ?? '',
				conn: String(f.connectionId)
			});
			return `/watch/live/${f.streamId}?${q}`;
		}
		if (f.streamType === 'movie') return `/movies/${f.streamId}?conn=${f.connectionId}`;
		return `/series/${f.streamId}?conn=${f.connectionId}`;
	}

	function liveUrl(channel: { id: number; name: string; image: string | null }): string {
		const q = new URLSearchParams({
			name: channel.name,
			icon: channel.image ?? '',
			conn: String(data.connId)
		});
		return `/watch/live/${channel.id}?${q}`;
	}

	const star = (rating: number) => `★ ${rating.toFixed(1)}`;
</script>

<svelte:head><title>Home — StreamX</title></svelte:head>

{#snippet loadingRow(title: string, href: string, wide: boolean)}
	<MediaRow {title} {href}>
		{#each Array.from({ length: 6 }) as _, i (i)}
			<div class="shrink-0 {wide ? 'w-44 sm:w-48' : 'w-32 sm:w-36 md:w-40'}">
				<div
					class="{wide ? 'aspect-video' : 'aspect-[2/3]'} animate-pulse rounded-xl bg-surface-900"
				></div>
			</div>
		{/each}
	</MediaRow>
{/snippet}

<div class="mx-auto max-w-6xl p-4 md:p-6">
	{#if !data.hasConnection}
		<div class="rounded-2xl border border-accent/30 bg-accent/10 p-6">
			<h2 class="font-semibold">Welcome to StreamX</h2>
			<p class="mt-1 text-sm text-zinc-400">
				Add an Xtream Codes connection to start watching live TV, movies, and series.
			</p>
			<a
				href="/settings?setup=1"
				class="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
			>
				Add connection
			</a>
		</div>
	{:else}
		{#if data.recents.length}
			<MediaRow title="Recently watched">
				{#each data.recents as entry (entry.kind + entry.id)}
					<div class="w-32 shrink-0 snap-start sm:w-36 md:w-40">
						<MediaCard
							href={recentUrl(entry)}
							image={entry.icon}
							title={entry.title}
							subtitle={entry.subtitle}
							progress={entry.progress}
							contain={entry.kind === 'live'}
							onRemove={() => removeRecent(entry)}
							removeLabel="Remove from recently watched"
						/>
					</div>
				{/each}
			</MediaRow>
		{/if}

		{#await data.popularShows}
			{@render loadingRow('Popular TV shows', '/series', false)}
		{:then shows}
			{#if shows.length}
				<MediaRow title="Popular TV shows" href="/series">
					{#each shows as show (show.id)}
						<div class="w-32 shrink-0 snap-start sm:w-36 md:w-40">
							<MediaCard
								href="/series/{show.id}?conn={data.connId}"
								image={show.image}
								title={show.name}
								badge={star(show.rating)}
							/>
						</div>
					{/each}
				</MediaRow>
			{/if}
		{/await}

		{#await data.popularMovies}
			{@render loadingRow('Popular movies', '/movies', false)}
		{:then movies}
			{#if movies.length}
				<MediaRow title="Popular movies" href="/movies">
					{#each movies as movie (movie.id)}
						<div class="w-32 shrink-0 snap-start sm:w-36 md:w-40">
							<MediaCard
								href="/movies/{movie.id}?conn={data.connId}"
								image={movie.image}
								title={movie.name}
								badge={star(movie.rating)}
							/>
						</div>
					{/each}
				</MediaRow>
			{/if}
		{/await}

		{#await data.liveChannels}
			{@render loadingRow('Live TV', '/live', true)}
		{:then channels}
			{#if channels.length}
				<MediaRow title="Live TV" href="/live">
					{#each channels as channel (channel.id)}
						<div class="w-44 shrink-0 snap-start sm:w-48">
							<MediaCard
								href={liveUrl(channel)}
								image={channel.image}
								title={channel.name}
								landscape
							/>
						</div>
					{/each}
				</MediaRow>
			{/if}
		{/await}

		{#if data.favorites.length}
			<MediaRow title="Favorites" href="/favorites">
				{#each data.favorites as fav (fav.id)}
					<div
						class="shrink-0 snap-start {fav.streamType === 'live'
							? 'w-44 sm:w-48'
							: 'w-32 sm:w-36 md:w-40'}"
					>
						<MediaCard
							href={favUrl(fav)}
							image={fav.icon}
							title={fav.name}
							landscape={fav.streamType === 'live'}
						/>
					</div>
				{/each}
			</MediaRow>
		{/if}

		{#if !data.recents.length && !data.favorites.length}
			<p class="pt-4 text-sm text-zinc-500">
				Nothing watched yet — pick something from
				<a href="/series" class="text-accent hover:underline">TV</a>,
				<a href="/movies" class="text-accent hover:underline">Movies</a>, or
				<a href="/live" class="text-accent hover:underline">Live TV</a>.
			</p>
		{/if}
	{/if}
</div>
