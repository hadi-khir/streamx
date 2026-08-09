<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	interface CategoryWithPin {
		id: string;
		name: string;
		pinned: boolean;
	}

	let {
		basePath,
		allLabel,
		categories,
		selected,
		connId,
		contentType
	}: {
		basePath: string;
		allLabel: string;
		categories: CategoryWithPin[];
		selected: string;
		connId: number;
		contentType: 'live' | 'vod' | 'series';
	} = $props();

	async function togglePin(categoryId: string) {
		await fetch('/api/pins', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ connectionId: connId, contentType, categoryId })
		}).catch(() => null);
		await invalidateAll();
	}
</script>

<aside class="hidden w-60 shrink-0 overflow-y-auto border-r border-surface-800 p-3 lg:block">
	<h2 class="px-2 pb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Categories</h2>
	<nav class="space-y-0.5">
		<a
			href="{basePath}?cat=all"
			class="block truncate rounded-lg px-3 py-1.5 text-sm {selected === 'all'
				? 'bg-accent/15 font-medium text-accent'
				: 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-200'}"
		>
			{allLabel}
		</a>
		{#each categories as cat (cat.id)}
			<div class="group/cat relative">
				<a
					href="{basePath}?cat={encodeURIComponent(cat.id)}"
					class="block truncate rounded-lg py-1.5 pr-8 pl-3 text-sm {selected === cat.id
						? 'bg-accent/15 font-medium text-accent'
						: 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-200'}"
				>
					{cat.name}
				</a>
				<button
					onclick={() => togglePin(cat.id)}
					class="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 transition-opacity
						{cat.pinned
						? 'text-accent opacity-100'
						: 'text-zinc-500 opacity-0 group-hover/cat:opacity-100 hover:text-zinc-200'}"
					title={cat.pinned ? 'Unpin category' : 'Pin category to top'}
				>
					<svg class="h-3.5 w-3.5" fill={cat.pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 3.75c-1.5 0-2.75 1.06-2.75 2.5v5.25l-2.06 2.06a.75.75 0 0 0 .53 1.28h8.56a.75.75 0 0 0 .53-1.28l-2.06-2.06V6.25c0-1.44-1.25-2.5-2.75-2.5ZM12 15v5.25" />
					</svg>
				</button>
			</div>
		{/each}
	</nav>
</aside>
