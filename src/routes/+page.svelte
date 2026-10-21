<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import MediaCard from '$lib/components/MediaCard.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import Billboard from '$lib/components/Billboard.svelte';
	import { page } from '$app/state';
	import type { Favorite } from '$lib/server/db/schema';

	let { data } = $props();

	type RecentEntry = (typeof data.recents)[number];

	async function removeRecent(entry: RecentEntry) {
		const payload =
			entry.kind === 'series'
				? { seriesId: entry.seriesId, connectionId: entry.connectionId, ids: entry.absorbed }
				: { id: entry.id, ids: entry.absorbed };
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

	const star = (rating: number | null) => (rating ? `★ ${rating.toFixed(1)}` : '');

	type Pick = { kind: 'movie' | 'series'; id: number; name: string; image: string; rating: number | null; ext?: string };

	function pickUrl(p: Pick): string {
		return p.kind === 'movie' ? `/movies/${p.id}?conn=${data.connId}` : `/series/${p.id}?conn=${data.connId}`;
	}

	/** Movies play straight away; a show plays where you left off (or S1E1). */
	function playUrl(p: Pick & { backdrop?: string | null }): string {
		if (p.kind === 'series') return `/series/${p.id}?conn=${data.connId}&play=1`;
		const q = new URLSearchParams({ name: p.name, icon: p.image ?? '', conn: String(data.connId) });
		if (p.ext) q.set('ext', p.ext);
		return `/watch/movie/${p.id}?${q}`;
	}

	const poster = 'w-28 shrink-0 snap-start sm:w-36 md:w-40 xl:w-44';
	const wide = 'w-44 shrink-0 snap-start sm:w-56 xl:w-64';
</script>

<svelte:head><title>Home — StreamX</title></svelte:head>

{#snippet pickRow(title: string, items: Pick[], href = '')}
	{#if items.length}
		<MediaRow {title} {href}>
			{#each items as item (item.kind + item.id)}
				<div class={poster}>
					<MediaCard href={pickUrl(item)} image={item.image} title={item.name} badge={star(item.rating)} />
				</div>
			{/each}
		</MediaRow>
	{/if}
{/snippet}

{#snippet top10(items: Pick[])}
	{#if items.length >= 5}
		<MediaRow title="Top 10 This Week">
			{#each items.slice(0, 10) as item, i (item.kind + item.id)}
				<a
					href={pickUrl(item)}
					class="group/top relative flex shrink-0 snap-start items-end {i === 9 ? 'w-48 sm:w-64' : 'w-40 sm:w-52'}"
					aria-label="#{i + 1} {item.name}"
				>
					<span class="rank-numeral -mr-5 text-[8.5rem] select-none sm:-mr-7 sm:text-[11rem]" aria-hidden="true">{i + 1}</span>
					<div class="relative w-24 shrink-0 overflow-hidden rounded shadow-lg transition duration-300 group-hover/top:scale-[1.06] sm:w-32">
						<div class="aspect-[2/3] bg-surface-800">
							<img src={item.image} alt="" loading="lazy" class="h-full w-full object-cover" />
						</div>
					</div>
				</a>
			{/each}
		</MediaRow>
	{/if}
{/snippet}

{#snippet recentsRow(art: Record<number, string>)}
	<MediaRow title="Continue Watching for {page.data.user?.username ?? 'you'}">
		{#each data.recents as entry (entry.kind + entry.id)}
			<div class={entry.kind === 'live' ? wide : poster}>
				<MediaCard
					href={recentUrl(entry)}
					image={(entry.seriesId != null ? art[entry.seriesId] : null) ?? entry.icon}
					title={entry.title}
					subtitle={entry.subtitle}
					progress={entry.progress}
					landscape={entry.kind === 'live'}
					placeholder={entry.kind === 'live' ? 'tv' : 'video'}
					onRemove={() => removeRecent(entry)}
					removeLabel="Remove from Continue Watching"
				/>
			</div>
		{/each}
	</MediaRow>
{/snippet}

{#snippet loadingRow(title: string, isWide = false)}
	<MediaRow {title}>
		{#each Array.from({ length: 8 }) as _, i (i)}
			<div class={isWide ? wide : poster}>
				<div class="{isWide ? 'aspect-video' : 'aspect-[2/3]'} animate-pulse rounded bg-surface-900"></div>
			</div>
		{/each}
	</MediaRow>
{/snippet}

{#if !data.hasConnection}
	<div class="gutter flex min-h-dvh items-center justify-center bg-gradient-to-b from-black to-surface-950">
		<div class="max-w-lg text-center">
			<h1 class="text-3xl font-black sm:text-5xl">Unlimited TV, movies and more.</h1>
			<p class="mt-4 text-lg text-zinc-300">
				Add your Xtream Codes provider to start watching live TV, movies and series.
			</p>
			<a href="/settings?setup=1" class="btn-play mt-8 !bg-accent !text-white hover:!bg-accent-hover">
				Add connection
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
			</a>
		</div>
	</div>
{:else}
	{#await data.hero}
		<div class="h-[75vh] min-h-[480px] animate-pulse bg-gradient-to-b from-surface-900 to-surface-950 sm:h-[85vh] sm:max-h-[56.25vw] sm:min-h-[560px]"></div>
	{:then hero}
		{#if hero}
			<Billboard
				title={hero.name}
				backdrop={hero.backdrop}
				poster={hero.image}
				overview={hero.overview}
				meta={[hero.year, hero.kind === 'series' ? 'Series' : 'Movie', ...hero.genres].filter((x): x is string => !!x)}
				reason={hero.reason}
			>
				<a href={playUrl(hero)} class="btn-play">
					<svg class="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
					Play
				</a>
				<a href={pickUrl(hero)} class="btn-secondary">
					<svg class="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
					More Info
				</a>
			</Billboard>
		{:else}
			<div class="h-24"></div>
		{/if}
	{/await}

	<!-- Rows ride up over the billboard's fade, as on Netflix -->
	<div class="relative z-10 -mt-[8vh] pb-20 sm:-mt-[12vh]">
		{#if data.recents.length}
			{#await data.seriesArt}
				{@render recentsRow({})}
			{:then art}
				{@render recentsRow(art)}
			{/await}
		{/if}

		{#await data.personalRows}
			{#if data.recents.length}{@render loadingRow('Top Picks for You')}{/if}
		{:then rows}
			{#if rows[0]}{@render pickRow(rows[0].title, rows[0].items)}{/if}
			{#await data.trending then items}{@render top10(items)}{/await}
			{#each rows.slice(1, 3) as row (row.title)}
				{@render pickRow(row.title, row.items)}
			{/each}
		{/await}

		{#await data.popularShows}
			{@render loadingRow('Popular TV Shows')}
		{:then shows}
			{@render pickRow('Popular TV Shows', shows.map((s) => ({ ...s, kind: 'series' as const })), '/series')}
		{/await}

		{#await data.newArrivals then items}
			{@render pickRow('New Releases', items)}
		{/await}

		{#await data.personalRows then rows}
			{#each rows.slice(3) as row (row.title)}
				{@render pickRow(row.title, row.items)}
			{/each}
		{/await}

		{#await data.popularMovies}
			{@render loadingRow('Popular Movies')}
		{:then movies}
			{@render pickRow('Popular Movies', movies.map((m) => ({ ...m, kind: 'movie' as const })), '/movies')}
		{/await}

		{#if data.favorites.length}
			<MediaRow title="My List" href="/favorites">
				{#each data.favorites as fav (fav.id)}
					<div class={fav.streamType === 'live' ? wide : poster}>
						<MediaCard
							href={favUrl(fav)}
							image={fav.icon}
							title={fav.name}
							landscape={fav.streamType === 'live'}
							placeholder={fav.streamType === 'live' ? 'tv' : 'video'}
						/>
					</div>
				{/each}
			</MediaRow>
		{/if}

		{#await data.liveChannels}
			{@render loadingRow('Live TV', true)}
		{:then channels}
			{#if channels.length}
				<MediaRow title="Live TV" href="/live">
					{#each channels as channel (channel.id)}
						<div class={wide}>
							<MediaCard href={liveUrl(channel)} image={channel.image} title={channel.name} landscape placeholder="tv" />
						</div>
					{/each}
				</MediaRow>
			{/if}
		{/await}

		{#if !data.recents.length && !data.favorites.length}
			<p class="gutter pt-10 text-sm text-zinc-500">
				Watch something and this page learns what you like — picks, “Because you watched” rows and more.
			</p>
		{/if}
	</div>
{/if}
