<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tintFor } from '$lib/tint';

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
	class="relative w-full overflow-hidden {short
		? 'h-[56vh] min-h-[400px] sm:h-[60vh]'
		: 'h-[64vh] min-h-[440px] sm:h-[72vh] sm:max-h-[52vw] sm:min-h-[500px]'}"
	style="background: {tintFor(title)}"
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
			class="absolute top-1/2 right-[8%] hidden h-[70%] -translate-y-1/2 rounded-md shadow-2xl shadow-black ring-1 ring-white/10 md:block"
		/>
	{/if}
	<!-- Dark under the copy, settling into the page below -->
	<div class="absolute inset-0 bg-gradient-to-r from-surface-950/90 via-surface-950/45 to-transparent"></div>
	<div class="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-surface-950 via-surface-950/70 to-transparent"></div>
	<div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-surface-950/70 to-transparent"></div>

	<div class="gutter absolute inset-x-0 bottom-6 sm:bottom-10">
		<div class="max-w-xl animate-fade-in lg:max-w-2xl">
			{#if reason}
				<p class="mb-3 text-xs font-medium tracking-[0.18em] text-accent uppercase">{reason}</p>
			{/if}
			<h1 class="text-4xl leading-[1.05] text-white drop-shadow-lg sm:text-5xl lg:text-6xl">
				{title}
			</h1>
			{#if meta.length || rating}
				<div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-200 sm:text-base">
					{#if rating}
						<span class="font-medium text-accent">★ {rating.toFixed(1)}</span>
					{/if}
					{#each meta as part, i (i)}
						{#if i > 0 || rating}<span class="text-zinc-500">·</span>{/if}
						<span>{part}</span>
					{/each}
				</div>
			{/if}
			{#if overview}
				<p class="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-200 drop-shadow sm:text-base">{overview}</p>
			{/if}
			{#if children}
				<div class="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
					{@render children()}
				</div>
			{/if}
		</div>
	</div>
</section>
