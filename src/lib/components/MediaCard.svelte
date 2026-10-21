<script lang="ts">
	import { tmdbFallback } from '$lib/images';
	import { displayName } from '$lib/titles';

	let {
		href,
		image,
		title,
		subtitle = '',
		badge = '',
		progress = 0,
		landscape = false,
		contain = false,
		placeholder = 'video',
		caption = undefined,
		onRemove = undefined,
		removeLabel = 'Remove'
	}: {
		href: string;
		image: string | null;
		title: string;
		subtitle?: string;
		badge?: string;
		progress?: number;
		landscape?: boolean;
		/** Fit logos/stills inside the frame instead of cropping them */
		contain?: boolean;
		/** Which glyph stands in when there is no artwork to show */
		placeholder?: 'video' | 'tv';
		/** Name under the artwork; posters carry their own title, so off for them by default */
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
	const showCaption = $derived(caption ?? (!!subtitle || landscape));
</script>

<div class="group/card relative">
	<a
		{href}
		class="block rounded outline-none focus-visible:ring-2 focus-visible:ring-white"
		aria-label={name}
	>
		<div
			class="relative {landscape ? 'aspect-video' : 'aspect-[2/3]'} overflow-hidden rounded bg-surface-800 shadow-md transition duration-300 ease-out group-hover/card:z-10 group-hover/card:scale-[1.06] group-hover/card:shadow-2xl group-hover/card:shadow-black/60 group-hover/card:delay-150"
		>
			{#if src}
				<img
					{src}
					alt=""
					loading="lazy"
					onerror={() => (errors += 1)}
					class="h-full w-full {fit ? 'object-contain p-4' : 'object-cover'}"
				/>
			{:else if placeholder === 'tv'}
				<!-- Channel logos go missing often; a named tile beats a blank frame -->
				<div class="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-800 to-surface-900 px-3 text-zinc-500">
					<svg class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="1.25" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z" />
					</svg>
					<span class="line-clamp-2 text-center text-[11px] leading-tight text-zinc-400">{name}</span>
				</div>
			{:else}
				<!-- No poster: the title itself, set like key art -->
				<div class="flex h-full w-full flex-col justify-end bg-gradient-to-br from-surface-700 via-surface-800 to-black p-3">
					<span class="line-clamp-4 text-base leading-tight font-bold text-white transition-opacity group-hover/card:opacity-0">{name}</span>
				</div>
			{/if}

			<!-- Hover: title, rating and a play glyph -->
			<div class="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 group-hover/card:delay-150">
				<div class="flex items-center gap-2">
					<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black">
						<svg class="ml-0.5 h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
					</span>
					{#if badge}
						<span class="text-xs font-semibold text-green-400">{badge}</span>
					{/if}
				</div>
				<p class="mt-1.5 line-clamp-2 text-xs leading-snug font-semibold text-white">{name}</p>
			</div>

			{#if progress > 0}
				<div class="absolute inset-x-2 bottom-2 h-[3px] bg-zinc-600/90">
					<div class="h-full bg-accent" style="width: {Math.min(100, progress * 100)}%"></div>
				</div>
			{/if}
		</div>
		{#if showCaption}
			<div class="pt-1.5">
				<p class="truncate text-xs font-medium text-zinc-300 sm:text-sm" title={name}>{name}</p>
				{#if subtitle}
					<p class="truncate text-[11px] text-zinc-500 sm:text-xs">{subtitle}</p>
				{/if}
			</div>
		{/if}
	</a>

	{#if onRemove}
		<button
			onclick={onRemove}
			class="absolute top-1.5 right-1.5 z-20 rounded-full border border-white/40 bg-black/70 p-1 text-zinc-200 opacity-0 transition-opacity group-hover/card:opacity-100 hover:border-white hover:text-white focus-visible:opacity-100 max-md:opacity-80"
			title={removeLabel}
			aria-label={removeLabel}
		>
			<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
			</svg>
		</button>
	{/if}
</div>
