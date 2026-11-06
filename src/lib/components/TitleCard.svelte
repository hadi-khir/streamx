<script lang="ts">
	import { tintFor } from '$lib/tint';

	let {
		title,
		year = null,
		seed = title,
		landscape = false
	}: {
		title: string;
		year?: string | null;
		/** What picks the colour, when it shouldn't be the title itself */
		seed?: string;
		landscape?: boolean;
	} = $props();

	// Sized to the frame, so it holds up from a small row to a large grid. A long
	// title gets smaller type, and the longest word always has to fit on one line.
	const fontSize = $derived.by(() => {
		const longestWord = Math.max(...title.split(/\s+/).map((word) => word.length), 1);
		const fitsWidth = (landscape ? 70 : 74) / (longestWord * 0.56);
		const fitsLength = (landscape ? 42 : 58) / Math.sqrt(Math.max(title.length, 1));
		return Math.max(landscape ? 5 : 7.5, Math.min(fitsWidth, fitsLength, landscape ? 11 : 16));
	});
</script>

<div class="@container relative h-full w-full" style="background: {tintFor(seed)}">
	<div class="absolute inset-[5cqw] flex flex-col items-center justify-center border border-accent/30 px-[5cqw] py-[6cqw] text-center">
		{#if !landscape}
			<svg class="mb-[6cqw] h-[8cqw] w-[8cqw] text-accent/80" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
				<path d="M32 2c1.9 20.2 9.8 28.1 30 30-20.2 1.9-28.1 9.8-30 30-1.9-20.2-9.8-28.1-30-30 20.2-1.9 28.1-9.8 30-30z" />
			</svg>
		{/if}
		<span class="font-serif leading-[1.12] text-zinc-100 {landscape ? 'line-clamp-2' : 'line-clamp-5'}" style="font-size: {fontSize}cqw">{title}</span>
		{#if year}
			<span class="mt-[5cqw] text-[6cqw] tracking-[0.2em] text-accent/80">{year}</span>
		{/if}
	</div>
</div>
