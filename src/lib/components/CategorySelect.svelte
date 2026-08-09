<script lang="ts">
	interface CategoryWithPin {
		id: string;
		name: string;
		pinned: boolean;
	}

	let {
		basePath,
		allLabel,
		categories,
		selected
	}: {
		basePath: string;
		allLabel: string;
		categories: CategoryWithPin[];
		selected: string;
	} = $props();

	const pinned = $derived(categories.filter((c) => c.pinned));
	const rest = $derived(categories.filter((c) => !c.pinned));
</script>

<select
	class="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm lg:hidden"
	onchange={(e) => (location.href = `${basePath}?cat=${encodeURIComponent(e.currentTarget.value)}`)}
>
	<option value="all" selected={selected === 'all'}>{allLabel}</option>
	{#if pinned.length}
		<optgroup label="Pinned">
			{#each pinned as cat (cat.id)}
				<option value={cat.id} selected={selected === cat.id}>{cat.name}</option>
			{/each}
		</optgroup>
	{/if}
	{#each rest as cat (cat.id)}
		<option value={cat.id} selected={selected === cat.id}>{cat.name}</option>
	{/each}
</select>
