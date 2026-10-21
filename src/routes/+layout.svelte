<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import TopBar from '$lib/components/TopBar.svelte';

	let { data, children } = $props();

	// The player brings its own header (back, title, favorite) and wants the
	// whole viewport, so the floating bar steps aside there.
	const immersive = $derived(page.url.pathname.startsWith('/watch/'));
	// Billboard pages run their artwork up under the transparent bar
	const underBar = $derived(
		page.url.pathname === '/' || /^\/(movies|series)\/[^/]+/.test(page.url.pathname)
	);
</script>

{#if data.user}
	{#if !immersive}
		<TopBar user={data.user} connections={data.connections} />
	{/if}
	<!-- The bar floats over the content, so the scroll container clears its height -->
	<main class="h-dvh overflow-y-auto {immersive || underBar ? '' : 'pt-16'}">
		{@render children()}
	</main>
{:else}
	{@render children()}
{/if}
