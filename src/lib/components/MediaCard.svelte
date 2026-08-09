<script lang="ts">
	import { tmdbFallback } from '$lib/images';

	let {
		href,
		image,
		title,
		subtitle = '',
		badge = '',
		progress = 0,
		landscape = false
	}: {
		href: string;
		image: string | null;
		title: string;
		subtitle?: string;
		badge?: string;
		progress?: number;
		landscape?: boolean;
	} = $props();

	// On error, retry dead provider-mirror artwork on TMDB's CDN before giving up
	let errors = $state(0);
	$effect(() => {
		image;
		errors = 0;
	});
	const src = $derived(errors === 0 ? image : errors === 1 ? tmdbFallback(image) : null);
</script>

<a
	{href}
	class="group block overflow-hidden rounded-xl border border-surface-800 bg-surface-900 transition-colors hover:border-surface-600"
>
	<div class="relative {landscape ? 'aspect-video' : 'aspect-[2/3]'} overflow-hidden bg-surface-800">
		{#if src}
			<img
				{src}
				alt=""
				loading="lazy"
				onerror={() => (errors += 1)}
				class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 {landscape ? 'object-contain p-4' : ''}"
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
