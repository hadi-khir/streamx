<script lang="ts">
	import { goto } from '$app/navigation';

	let {
		versions,
		current,
		href
	}: {
		versions: { id: number; label: string }[];
		current: number;
		/** Where a version lives */
		href: (id: number) => string;
	} = $props();

	const label = $derived(versions.find((v) => v.id === current)?.label ?? 'Language');
</script>

{#if versions.length > 1}
	<!-- A native list over a styled pill: the system's menu works everywhere, keyboard included -->
	<label
		class="relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-white/25 bg-black/25 px-4 text-sm font-medium text-zinc-100 backdrop-blur-sm transition-colors focus-within:border-accent hover:border-white/60 sm:h-11"
		title="Switch language"
	>
		<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true">
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.4 3.75-5.4 3.75-9S14.5 5.4 12 3m0 18c-2.5-2.4-3.75-5.4-3.75-9S9.5 5.4 12 3M3.5 9h17M3.5 15h17" />
		</svg>
		<span>{label}</span>
		<svg class="h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" stroke="currentColor" stroke-width="2.25" viewBox="0 0 24 24" aria-hidden="true">
			<path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
		</svg>
		<select
			aria-label="Language"
			class="absolute inset-0 cursor-pointer opacity-0"
			value={current}
			onchange={(e) => goto(href(Number(e.currentTarget.value)))}
		>
			{#each versions as version (version.id)}
				<option value={version.id}>{version.label}</option>
			{/each}
		</select>
	</label>
{/if}
