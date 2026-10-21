<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		backdrop,
		poster = null,
		overview = null,
		meta = [],
		reason = '',
		rating = null,
		short = false,
		children
	}: {
		title: string;
		backdrop: string | null;
		/** Shown, blurred and large, when there's no landscape art */
		poster?: string | null;
		overview?: string | null;
		meta?: string[];
		reason?: string;
		rating?: number | null;
		/** Detail pages: less height, more of the page below */
		short?: boolean;
		/** The buttons */
		children?: Snippet;
	} = $props();

	let loaded = $state(false);
</script>

<section
	class="relative w-full overflow-hidden bg-surface-950 {short
		? 'h-[62vh] min-h-[420px] sm:h-[70vh]'
		: 'h-[75vh] min-h-[480px] sm:h-[85vh] sm:max-h-[56.25vw] sm:min-h-[560px]'}"
>
	{#if backdrop}
		<img
			src={backdrop}
			alt=""
			onload={() => (loaded = true)}
			class="absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 {loaded ? 'opacity-100' : 'opacity-0'}"
		/>
	{:else if poster}
		<img src={poster} alt="" class="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />
		<img
			src={poster}
			alt=""
			class="absolute top-1/2 right-[8%] hidden h-[70%] -translate-y-1/2 rounded shadow-2xl shadow-black md:block"
		/>
	{/if}
	<!-- Netflix's two vignettes: dark under the copy, fading into the rows below -->
	<div class="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent"></div>
	<div class="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-surface-950 via-surface-950/60 to-transparent"></div>
	<div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent"></div>

	<div class="gutter absolute inset-x-0 bottom-[14%] sm:bottom-[22%]">
		<div class="max-w-xl animate-fade-in lg:max-w-2xl">
			{#if reason}
				<p class="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-zinc-200 uppercase sm:text-sm">
					<span class="h-4 w-1 bg-accent"></span>
					{reason}
				</p>
			{/if}
			<h1 class="text-4xl leading-[0.95] font-black tracking-tight text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
				{title}
			</h1>
			{#if meta.length || rating}
				<div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-200 sm:text-base">
					{#if rating}
						<span class="font-semibold text-green-400">★ {rating.toFixed(1)}</span>
					{/if}
					{#each meta as part, i (i)}
						{#if i > 0 || rating}<span class="text-zinc-500">•</span>{/if}
						<span>{part}</span>
					{/each}
				</div>
			{/if}
			{#if overview}
				<p class="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-200 drop-shadow sm:text-lg">{overview}</p>
			{/if}
			{#if children}
				<div class="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
					{@render children()}
				</div>
			{/if}
		</div>
	</div>
</section>
