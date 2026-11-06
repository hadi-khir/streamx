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
		scroller?.scrollBy({ left: direction * scroller.clientWidth * 0.85, behavior: 'smooth' });
	}

	$effect(() => {
		if (!scroller) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		return () => observer.disconnect();
	});
</script>

<section class="group/row relative mt-8 first:mt-0 sm:mt-12">
	<div class="gutter mb-1 flex items-baseline justify-between gap-4">
		<h2 class="text-lg text-zinc-100 sm:text-2xl">{title}</h2>
		{#if href}
			<a {href} class="shrink-0 text-xs font-medium text-accent transition-colors hover:text-accent-hover sm:text-sm">{seeAll}</a>
		{/if}
	</div>

	<div class="relative">
		<!-- Vertical padding gives lifted cards room inside the scroller's clip -->
		<div
			bind:this={scroller}
			onscroll={measure}
			class="gutter no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto scroll-smooth py-3 sm:scroll-px-8 sm:gap-4 lg:scroll-px-14"
		>
			{@render children()}
		</div>

		<!-- Rows scroll by touch and trackpad; these give a pointer a target -->
		{#each [-1, 1] as direction (direction)}
			<button
				onclick={() => nudge(direction)}
				disabled={direction === -1 ? atStart : atEnd}
				aria-label={direction === -1 ? 'Scroll left' : 'Scroll right'}
				class="absolute top-[38%] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-950/85 text-zinc-100 opacity-0 shadow-lg backdrop-blur-sm transition-opacity group-hover/row:opacity-100 hover:border-accent hover:text-accent disabled:pointer-events-none disabled:!opacity-0 sm:flex
					{direction === -1 ? 'left-2 lg:left-4' : 'right-2 lg:right-4'}"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d={direction === -1 ? 'M15.75 19.5 8.25 12l7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
				</svg>
			</button>
		{/each}
	</div>
</section>
