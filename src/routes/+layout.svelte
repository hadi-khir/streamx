<script lang="ts">
	import '../app.css';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import TopBar from '$lib/components/TopBar.svelte';

	let { data, children } = $props();

	// SvelteKit only manages the window's scroll, and pages scroll inside <main>
	let scroller: HTMLElement | undefined = $state();

	afterNavigate(({ from, to }) => {
		// Filtering or searching within a page leaves it where it is
		if (from?.url.pathname !== to?.url.pathname && scroller) scroller.scrollTop = 0;
	});

	// Runs after the reset above, so Back returns to where you were
	export const snapshot = {
		capture: () => scroller?.scrollTop ?? 0,
		restore: (top: number) => {
			if (scroller) scroller.scrollTop = top;
		}
	};

	onNavigate((nav) => {
		const paths = [nav.from?.url.pathname, nav.to?.url.pathname];
		// Back swipes animate themselves, and the player has its own loading state
		if (
			!document.startViewTransition ||
			nav.type === 'popstate' ||
			paths[0] === paths[1] ||
			paths.some((path) => path?.startsWith('/watch/'))
		) {
			return;
		}
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await nav.complete.catch(() => {});
			});
		});
	});

	const loading = $derived(!!navigating.to && navigating.to.url.pathname !== page.url.pathname);

	// The player brings its own header (back, title, favorite) and wants the
	// whole viewport, so the floating bar steps aside there.
	const immersive = $derived(page.url.pathname.startsWith('/watch/'));
	// Billboard pages run their artwork up under the transparent bar
	const underBar = $derived(
		page.url.pathname === '/' || /^\/(movies|series)\/[^/]+/.test(page.url.pathname)
	);
</script>

{#if loading}
	<div class="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left animate-page-load bg-accent" role="progressbar" aria-label="Loading page"></div>
{/if}

{#if data.user}
	{#if !immersive}
		<TopBar user={data.user} connections={data.connections} />
	{/if}
	<!-- The bar floats over the content, so the scroll container clears its height -->
	<main bind:this={scroller} class="h-dvh overflow-y-auto {immersive || underBar ? '' : 'pt-16'}">
		{@render children()}
	</main>
{:else}
	{@render children()}
{/if}
