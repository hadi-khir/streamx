<script lang="ts">
	import TvMark from '$lib/components/TvMark.svelte';

	let { class: className = 'text-2xl' }: { class?: string } = $props();
</script>

<span class="inline-flex items-center gap-[0.35em] font-serif leading-none font-medium tracking-tight text-zinc-100 {className}">
	<TvMark class="h-[1.05em] w-[0.94em] -translate-y-[0.06em] text-accent" />
	Streamer
</span>
