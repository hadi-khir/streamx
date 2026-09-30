<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		href = '',
		seeAll = 'See all',
		children
	}: { title: string; href?: string; seeAll?: string; children: Snippet } = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let atStart = $state(true);
	let atEnd = $state(true);

	function measure() {
		if (!scroller) return;
		const max = scroller.scrollWidth - scroller.clientWidth;
		atStart = scroller.scrollLeft <= 8;
		atEnd = scroller.scrollLeft >= max - 8;
	}

	function nudge(direction: number) {
		scroller?.scrollBy({ left: direction * scroller.clientWidth * 0.9, behavior: 'smooth' });
	}

	$effect(() => {
		if (!scroller) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		return () => observer.disconnect();
	});
</script>

<section class="mt-8 first:mt-0">
	<div class="mb-3 flex items-baseline justify-between gap-3">
		<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">{title}</h2>
		{#if href}
			<a {href} class="shrink-0 text-xs text-zinc-500 transition-colors hover:text-accent">
				{seeAll} →
			</a>
		{/if}
	</div>

	<div class="group/row relative">
		<div
			bind:this={scroller}
			onscroll={measure}
			class="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto scroll-smooth px-4 pb-1 md:-mx-6 md:scroll-px-6 md:px-6"
		>
			{@render children()}
		</div>

		<!-- Rows scroll by touch and trackpad; arrows give a pointer a target too -->
		{#each [-1, 1] as direction (direction)}
			<button
				onclick={() => nudge(direction)}
				disabled={direction === -1 ? atStart : atEnd}
				aria-label={direction === -1 ? 'Scroll left' : 'Scroll right'}
				class="absolute top-1/2 hidden -translate-y-1/2 rounded-full border border-surface-700 bg-surface-950/90 p-2 text-zinc-300 opacity-0 transition-opacity hover:text-white disabled:pointer-events-none disabled:opacity-0 group-hover/row:opacity-100 md:block
					{direction === -1 ? '-left-3' : '-right-3'}"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d={direction === -1 ? 'M15.75 19.5 8.25 12l7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
				</svg>
			</button>
		{/each}
	</div>
</section>
