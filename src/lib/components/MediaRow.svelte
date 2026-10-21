<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		href = '',
		seeAll = 'Explore all',
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

<section class="group/row relative mt-6 first:mt-0 sm:mt-9">
	<div class="gutter mb-2 flex items-baseline gap-3">
		{#if href}
			<a {href} class="group/title flex items-baseline gap-2">
				<h2 class="text-base font-bold text-zinc-100 sm:text-xl">{title}</h2>
				<span class="hidden translate-x-[-4px] items-center text-xs font-semibold text-sky-400 opacity-0 transition-all duration-300 group-hover/row:translate-x-0 group-hover/row:opacity-100 sm:flex">
					{seeAll}
					<svg class="ml-0.5 h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
				</span>
			</a>
		{:else}
			<h2 class="text-base font-bold text-zinc-100 sm:text-xl">{title}</h2>
		{/if}
	</div>

	<div class="relative">
		<!-- Vertical padding gives hover-scaled cards room inside the scroller's clip -->
		<div
			bind:this={scroller}
			onscroll={measure}
			class="gutter no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-1.5 overflow-x-auto scroll-smooth py-3 sm:scroll-px-8 sm:gap-2 lg:scroll-px-14"
		>
			{@render children()}
		</div>

		<!-- Rows scroll by touch and trackpad; the edge panels give a pointer a target -->
		{#each [-1, 1] as direction (direction)}
			<button
				onclick={() => nudge(direction)}
				disabled={direction === -1 ? atStart : atEnd}
				aria-label={direction === -1 ? 'Scroll left' : 'Scroll right'}
				class="absolute inset-y-3 z-20 hidden w-8 items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-black/70 disabled:pointer-events-none disabled:!opacity-0 sm:flex lg:w-12
					{direction === -1 ? 'left-0 rounded-r' : 'right-0 rounded-l'}"
			>
				<svg class="h-7 w-7 transition-transform hover:scale-125" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d={direction === -1 ? 'M15.75 19.5 8.25 12l7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
				</svg>
			</button>
		{/each}
	</div>
</section>
