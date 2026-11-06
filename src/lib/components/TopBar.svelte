<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Wordmark from '$lib/components/Wordmark.svelte';

	let {
		user,
		connections
	}: {
		user: { username: string; activeConnectionId: number | null };
		connections: { id: number; name: string }[];
	} = $props();

	const links = [
		{ href: '/', label: 'Home' },
		{ href: '/series', label: 'TV Shows' },
		{ href: '/movies', label: 'Movies' },
		{ href: '/live', label: 'Live TV' },
		{ href: '/favorites', label: 'Watchlist' }
	];

	const active = $derived((href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)
	);
	const current = $derived(links.find((l) => active(l.href))?.label ?? 'Browse');

	// Transparent over a billboard, solid once the page scrolls under it.
	// Pages scroll inside their own containers, so listen to every scroll.
	let scrolled = $state(false);
	$effect(() => {
		const onScroll = (e: Event) => {
			const target = e.target instanceof HTMLElement ? e.target : document.scrollingElement;
			scrolled = (target?.scrollTop ?? 0) > 8;
		};
		document.addEventListener('scroll', onScroll, { capture: true, passive: true });
		return () => document.removeEventListener('scroll', onScroll, { capture: true });
	});
	$effect(() => {
		page.url.pathname;
		scrolled = false;
	});

	let searchOpen = $state(false);
	let query = $state('');
	let searchInput: HTMLInputElement | undefined = $state();
	let menuOpen = $state(false);
	let browseOpen = $state(false);

	$effect(() => {
		if (page.url.pathname === '/search') {
			searchOpen = true;
			// While typing, the box is ahead of the URL; don't rewind it
			if (document.activeElement !== searchInput) query = page.url.searchParams.get('q') ?? '';
		}
	});

	function openSearch() {
		searchOpen = true;
		queueMicrotask(() => searchInput?.focus());
	}

	let searchTimer: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		// Search as you type, without a request per keystroke
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			// Clicked away to a result meanwhile: don't yank them back to search
			if (document.activeElement !== searchInput) return;
			if (query.trim().length >= 2) {
				goto(`/search?q=${encodeURIComponent(query.trim())}`, { keepFocus: true, replaceState: page.url.pathname === '/search' });
			}
		}, 400);
	}

	function closeMenus(e: MouseEvent) {
		const t = e.target as HTMLElement;
		if (!t.closest('[data-menu]')) {
			menuOpen = false;
			browseOpen = false;
		}
		if (searchOpen && !query && page.url.pathname !== '/search' && !t.closest('[data-search]')) searchOpen = false;
	}
</script>

<svelte:window onclick={closeMenus} />

<header
	class="gutter fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-4 transition-colors duration-500 lg:gap-10
		{scrolled ? 'bg-surface-950/90 shadow-[0_1px_0_rgb(255_255_255/0.1)] backdrop-blur-md' : 'bg-gradient-to-b from-surface-950/80 to-transparent'}"
>
	<a href="/" class="shrink-0" title="Home" aria-label="Vesper, home">
		<Wordmark class="text-2xl sm:text-[1.65rem]" />
	</a>

	<!-- Desktop: the links inline -->
	<nav class="hidden items-center gap-5 md:flex">
		{#each links as link (link.href)}
			<a
				href={link.href}
				class="border-b py-1 text-sm transition-colors {active(link.href) ? 'border-accent text-white' : 'border-transparent text-zinc-300 hover:text-white'}"
			>
				{link.label}
			</a>
		{/each}
	</nav>

	<!-- Mobile: the links in a menu -->
	<div class="relative md:hidden" data-menu>
		<button onclick={() => (browseOpen = !browseOpen)} class="flex items-center gap-1 text-sm font-semibold text-white">
			{current}
			<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" /></svg>
		</button>
		{#if browseOpen}
			<div class="absolute top-8 left-0 w-44 rounded-lg border border-white/10 bg-surface-900 py-2 shadow-xl">
				{#each links as link (link.href)}
					<a
						href={link.href}
						onclick={() => (browseOpen = false)}
						class="block px-4 py-2 text-sm {active(link.href) ? 'font-semibold text-white' : 'text-zinc-400'}"
					>
						{link.label}
					</a>
				{/each}
			</div>
		{/if}
	</div>

	<div class="flex-1"></div>

	<div class="flex items-center gap-3 sm:gap-5">
		<form
			action="/search"
			data-search
			class="flex items-center border transition-all duration-300 {searchOpen ? 'rounded-full border-white/30 bg-surface-950/80' : 'border-transparent'}"
			onsubmit={(e) => {
				clearTimeout(searchTimer);
				if (!query.trim()) e.preventDefault();
			}}
		>
			<button
				type="button"
				onclick={openSearch}
				class="p-1.5 text-white"
				title="Search"
				aria-label="Search"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
				</svg>
			</button>
			<input
				bind:this={searchInput}
				bind:value={query}
				oninput={onSearchInput}
				name="q"
				placeholder="Titles, channels"
				autocomplete="off"
				class="bg-transparent text-sm text-white outline-none placeholder:text-zinc-500 transition-all duration-300 {searchOpen ? 'w-32 pr-2 sm:w-56' : 'w-0'}"
			/>
		</form>

		<div class="relative" data-menu>
			<button
				onclick={() => (menuOpen = !menuOpen)}
				class="flex items-center gap-1.5"
				aria-label="Account menu"
			>
				<span class="flex h-8 w-8 items-center justify-center rounded-full border border-accent/60 font-serif text-sm text-accent uppercase">
					{user.username.slice(0, 1)}
				</span>
				<svg class="h-3 w-3 text-white transition-transform {menuOpen ? 'rotate-180' : ''}" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" /></svg>
			</button>
			{#if menuOpen}
				<div class="absolute top-11 right-0 w-56 rounded-lg border border-white/10 bg-surface-900 py-2 text-sm shadow-xl">
					<p class="truncate px-4 pt-1 pb-2 text-xs text-zinc-500">Signed in as <span class="text-zinc-300">{user.username}</span></p>
					{#if connections.length > 1}
						<p class="border-t border-white/10 px-4 pt-2 pb-1 text-xs text-zinc-500">Provider</p>
						{#each connections as conn (conn.id)}
							<form method="POST" action="/settings?/activate">
								<input type="hidden" name="connectionId" value={conn.id} />
								<button class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-zinc-300 hover:underline">
									<span class="w-3">{conn.id === user.activeConnectionId ? '✓' : ''}</span>
									<span class="truncate">{conn.name}</span>
								</button>
							</form>
						{/each}
					{/if}
					<div class="mt-1 border-t border-white/10 pt-1">
						<a href="/settings" onclick={() => (menuOpen = false)} class="block px-4 py-2 text-zinc-300 hover:underline">Settings</a>
						<a
							href={page.url.pathname === '/feedback' ? '/feedback' : `/feedback?from=${encodeURIComponent(page.url.pathname + page.url.search)}`}
							onclick={() => (menuOpen = false)}
							class="block px-4 py-2 text-zinc-300 hover:underline"
						>
							Report a bug or idea
						</a>
						<form method="POST" action="/logout">
							<button class="w-full px-4 py-2 text-left text-zinc-300 hover:underline">Sign out</button>
						</form>
					</div>
				</div>
			{/if}
		</div>
	</div>
</header>
