<script lang="ts">
	import { goto } from '$app/navigation';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import { episodeWatchUrl } from '$lib/episodes';
	import { downloadUrl } from '$lib/download';

	let { data } = $props();

	let favorited = $state(false);
	$effect(() => {
		favorited = data.favorited;
	});

	const nowPlaying = $derived(data.epg.find((e) => e.now));

	// Live has nothing to save; VOD can go to the device for offline viewing
	const saveUrl = $derived(
		data.type === 'live'
			? null
			: downloadUrl({
					connId: data.connectionId,
					type: data.type,
					streamId: data.streamId,
					ext: data.ext,
					name: data.name
				})
	);

	const next = $derived(data.nextEpisode);
	const nextUp = $derived(
		next ? { title: `S${next.season} E${next.num} · ${next.title}`, image: next.image } : null
	);

	function playNext() {
		if (!next || !data.seriesId) return;
		goto(
			episodeWatchUrl(
				{
					seriesId: data.seriesId,
					seriesName: data.seriesName || data.name,
					connId: data.connectionId,
					poster: data.seriesPoster
				},
				next
			)
		);
	}

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

	let guideOpen = $state(false);

	// Episodes are saved as "Show — Episode"; the player shows them on two lines
	const [titleLine, ...restLines] = $derived(data.name.split(' — '));
	const subtitleLine = $derived(
		data.type === 'live' ? (nowPlaying?.title ?? 'Live TV') : restLines.join(' — ')
	);

	function back() {
		// Arriving by a shared link leaves nothing to go back to
		if (history.length > 1) history.back();
		else goto(data.type === 'live' ? '/live' : data.type === 'movie' ? '/movies' : '/series');
	}

	function fmtTime(unix: number): string {
		return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head><title>{data.name} — StreamX</title></svelte:head>

{#snippet actions()}
	{#if data.type === 'live' && data.epg.length > 0}
		<button
			onclick={() => (guideOpen = !guideOpen)}
			class="rounded-full p-2 transition-colors {guideOpen ? 'text-accent' : 'text-white hover:text-zinc-300'}"
			title="Program guide"
			aria-label="Program guide"
		>
			<svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
			</svg>
		</button>
	{/if}
	{#if saveUrl}
		<a
			href={saveUrl}
			download
			class="rounded-full p-2 text-white transition-colors hover:text-zinc-300"
			title="Download for offline viewing"
			aria-label="Download for offline viewing"
		>
			<svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
			</svg>
		</a>
	{/if}
	{#if data.type === 'live' || data.type === 'movie'}
		<button
			onclick={toggleFavorite}
			class="rounded-full p-2 transition-colors {favorited ? 'text-accent' : 'text-white hover:text-zinc-300'}"
			title={favorited ? 'Remove from My List' : 'Add to My List'}
			aria-label={favorited ? 'Remove from My List' : 'Add to My List'}
		>
			{#if favorited}
				<svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
			{:else}
				<svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
			{/if}
		</button>
	{/if}
{/snippet}

<div class="relative h-dvh w-full overflow-hidden bg-black">
	<VideoPlayer
		attempts={data.attempts}
		live={data.type === 'live'}
		initialPosition={data.savedPosition}
		onProgress={reportProgress}
		{nextUp}
		onPlayNext={nextUp ? playNext : undefined}
		transcode={data.transcode}
		audioCodec={data.audioCodec}
		durationHint={data.durationSecs}
		title={titleLine}
		subtitle={subtitleLine}
		onBack={back}
		{actions}
	/>

	{#if guideOpen && data.type === 'live'}
		<aside class="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col bg-zinc-950/95 shadow-2xl backdrop-blur">
			<div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
				<h3 class="text-base font-semibold text-white">Program guide</h3>
				<button onclick={() => (guideOpen = false)} class="rounded-full p-1 text-zinc-400 hover:text-white" aria-label="Close guide">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
				</button>
			</div>
			<div class="flex-1 space-y-1 overflow-y-auto p-3">
				{#each data.epg as item, i (i)}
					<div class="rounded-md p-3 {item.now ? 'bg-white/10' : ''}">
						<div class="flex items-center gap-2 text-xs text-zinc-500 tabular-nums">
							{fmtTime(item.start)} – {fmtTime(item.end)}
							{#if item.now}
								<span class="rounded-sm bg-accent px-1.5 py-px text-[10px] font-bold text-white">NOW</span>
							{/if}
						</div>
						<p class="mt-1 text-sm {item.now ? 'font-semibold text-white' : 'text-zinc-300'}">{item.title}</p>
						{#if item.description}
							<p class="mt-0.5 line-clamp-2 text-xs text-zinc-500">{item.description}</p>
						{/if}
					</div>
				{/each}
			</div>
		</aside>
	{/if}
</div>
