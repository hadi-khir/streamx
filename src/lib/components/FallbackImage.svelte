<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		sources,
		alt = '',
		imgClass = '',
		fallback
	}: {
		sources: (string | null | undefined)[];
		alt?: string;
		imgClass?: string;
		/** Shown once every source has failed */
		fallback?: Snippet;
	} = $props();

	const list = $derived(sources.filter((s): s is string => !!s));
	let idx = $state(0);
	$effect(() => {
		list; // restart the chain when the source list changes
		idx = 0;
	});
</script>

{#if idx < list.length}
	<img src={list[idx]} {alt} loading="lazy" class={imgClass} onerror={() => (idx += 1)} />
{:else if fallback}
	{@render fallback()}
{/if}
