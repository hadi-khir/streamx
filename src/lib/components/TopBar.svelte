<script lang="ts">
	import { page } from '$app/state';

	let {
		user,
		connections
	}: {
		user: { username: string; activeConnectionId: number | null };
		connections: { id: number; name: string }[];
	} = $props();

	const toggles = [
		{ href: '/series', label: 'TV', short: 'TV' },
		{ href: '/movies', label: 'Movies', short: 'Movies' },
		{ href: '/live', label: 'Live TV', short: 'Live' }
	];

	const icons = [
		{
			href: '/search',
			label: 'Search',
			path: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'
		},
		{
			href: '/favorites',
			label: 'Favorites',
			path: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z'
		},
		{
			href: '/settings',
			label: 'Settings',
			path: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
		}
	];

	const active = $derived((href: string) => page.url.pathname.startsWith(href));
</script>

<header class="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3">
	<div
		class="pointer-events-auto flex w-full min-w-0 max-w-5xl items-center gap-1 rounded-full border border-surface-800 bg-surface-900/85 p-1.5 shadow-lg shadow-black/40 backdrop-blur-md sm:gap-2"
	>
		<a
			href="/"
			class="shrink-0 rounded-full px-1.5 text-base font-bold tracking-tight sm:px-3"
			title="Home"
		>
			<span class="hidden sm:inline">Stream<span class="text-accent">X</span></span>
			<span class="text-accent sm:hidden">X</span>
		</a>

		<nav class="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
			{#each toggles as item (item.href)}
				<a
					href={item.href}
					class="min-w-0 truncate rounded-full px-2 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm
						{active(item.href)
						? 'bg-accent text-white'
						: 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-100'}"
				>
					<span class="hidden sm:inline">{item.label}</span>
					<span class="sm:hidden">{item.short}</span>
				</a>
			{/each}
		</nav>

		<div class="flex shrink-0 items-center gap-0.5">
			{#if connections.length > 1}
				<form method="POST" action="/settings?/activate" class="hidden lg:block">
					<select
						name="connectionId"
						class="max-w-32 rounded-full border border-surface-700 bg-surface-950 px-2 py-1 text-xs text-zinc-300 outline-none"
						onchange={(e) => e.currentTarget.form?.submit()}
						title="Active connection"
					>
						{#each connections as conn (conn.id)}
							<option value={conn.id} selected={conn.id === user.activeConnectionId}>
								{conn.name}
							</option>
						{/each}
					</select>
				</form>
			{/if}

			{#each icons as item (item.href)}
				<a
					href={item.href}
					title={item.label}
					aria-label={item.label}
					class="rounded-full p-1.5 transition-colors sm:p-2 {active(item.href)
						? 'bg-accent/15 text-accent'
						: 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-100'}"
				>
					<svg class="h-4 w-4 sm:h-4.5 sm:w-4.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d={item.path} />
					</svg>
				</a>
			{/each}

			<form method="POST" action="/logout">
				<button
					class="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-surface-800 hover:text-zinc-200 sm:p-2"
					title="Sign out ({user.username})"
					aria-label="Sign out"
				>
					<svg class="h-4 w-4 sm:h-4.5 sm:w-4.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
					</svg>
				</button>
			</form>
		</div>
	</div>
</header>
