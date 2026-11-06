<script lang="ts">
	import { tmdbFallback } from '$lib/images';
	import { displayName, yearIn } from '$lib/titles';
	import TitleCard from '$lib/components/TitleCard.svelte';

	let {
		href,
		image,
		title,
		subtitle = '',
		badge = '',
		rank = 0,
		progress = 0,
		landscape = false,
		contain = false,
		caption = undefined,
		onRemove = undefined,
		removeLabel = 'Remove'
	}: {
		href: string;
		image: string | null;
		title: string;
		subtitle?: string;
		badge?: string;
		/** Position in a ranked row */
		rank?: number;
		progress?: number;
		landscape?: boolean;
		/** Fit logos/stills inside the frame instead of cropping them */
		contain?: boolean;
		/** Name under the artwork; off by default only where a title card already shows it */
		caption?: boolean;
		onRemove?: (() => void) | undefined;
		removeLabel?: string;
	} = $props();

	// On error, retry dead provider-mirror artwork on TMDB's CDN before giving up
	let errors = $state(0);
	$effect(() => {
		image;
		errors = 0;
	});
	const src = $derived(errors === 0 ? image : errors === 1 ? tmdbFallback(image) : null);
	const fit = $derived(contain || landscape);
	const name = $derived(displayName(title));
	const showCaption = $derived(caption ?? (!!src || !!subtitle || !!badge || rank > 0));
</script>

<div class="group/card relative">
	<a
		{href}
		class="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-950"
		aria-label={name}
	>
		<div
			class="relative {landscape ? 'aspect-video' : 'aspect-[2/3]'} overflow-hidden rounded-md bg-surface-800 shadow-sm ring-1 ring-white/10 transition duration-300 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-xl group-hover/card:shadow-black/50 group-hover/card:ring-accent/70"
		>
			{#if src}
				<img
					{src}
					alt=""
					loading="lazy"
					onerror={() => (errors += 1)}
					class="h-full w-full {fit ? 'object-contain p-4' : 'object-cover'}"
				/>
			{:else}
				<TitleCard title={name} year={landscape ? null : yearIn(title)} {landscape} />
			{/if}

			{#if progress > 0}
				<div class="absolute inset-x-0 bottom-0 h-[3px] bg-black/60">
					<div class="h-full bg-accent" style="width: {Math.min(100, progress * 100)}%"></div>
				</div>
			{/if}
		</div>
		{#if showCaption}
			<div class="flex items-baseline gap-2 pt-2">
				{#if rank}
					<span class="font-serif text-xl leading-none text-accent">{rank}</span>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-medium text-zinc-200 transition-colors group-hover/card:text-white sm:text-sm" title={name}>{name}</p>
					{#if subtitle || badge}
						<p class="truncate text-[11px] text-zinc-500 sm:text-xs">
							{#if badge}<span class="text-accent/90">{badge}</span>{/if}{#if badge && subtitle}&ensp;{/if}{subtitle}
						</p>
					{/if}
				</div>
			</div>
		{/if}
	</a>

	{#if onRemove}
		<button
			onclick={onRemove}
			class="absolute top-1.5 right-1.5 z-20 rounded-full bg-black/70 p-1 text-zinc-200 backdrop-blur-sm opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-white focus-visible:opacity-100 max-md:opacity-80"
			title={removeLabel}
			aria-label={removeLabel}
		>
			<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
			</svg>
		</button>
	{/if}
</div>
