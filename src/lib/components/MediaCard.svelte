<script lang="ts">
	import { tmdbFallback } from '$lib/images';

	let {
		href,
		image,
		title,
		subtitle = '',
		badge = '',
		progress = 0,
		landscape = false,
		contain = false,
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
</script>

<div class="group relative">
	<a
		{href}
		class="block overflow-hidden rounded-xl border border-surface-800 bg-surface-900 transition-colors hover:border-surface-600"
	>
		<div class="relative {landscape ? 'aspect-video' : 'aspect-[2/3]'} overflow-hidden bg-surface-800">
			{#if src}
				<img
					{src}
					alt=""
					loading="lazy"
					onerror={() => (errors += 1)}
					class="h-full w-full transition-transform duration-300 group-hover:scale-105 {fit ? 'object-contain p-4' : 'object-cover'}"
				/>
			{:else}
				<div class="flex h-full w-full items-center justify-center text-zinc-600">
					<svg class="h-10 w-10" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
					</svg>
				</div>
			{/if}
			{#if badge}
				<span class="absolute top-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
					{badge}
				</span>
			{/if}
			{#if progress > 0}
				<div class="absolute right-0 bottom-0 left-0 h-1 bg-black/50">
					<div class="h-full bg-accent" style="width: {Math.min(100, progress * 100)}%"></div>
				</div>
			{/if}
		</div>
		<div class="p-2.5">
			<p class="truncate text-sm font-medium text-zinc-200" {title}>{title}</p>
			{#if subtitle}
				<p class="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>
			{/if}
		</div>
	</a>

	{#if onRemove}
		<button
			onclick={onRemove}
			class="absolute top-1.5 {badge ? 'left-1.5' : 'right-1.5'} rounded-full bg-black/75 p-1 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white focus-visible:opacity-100"
			title={removeLabel}
			aria-label={removeLabel}
		>
			<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
			</svg>
		</button>
	{/if}
</div>
