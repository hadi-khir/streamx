<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const open = $derived(data.reports.filter((r) => r.status === 'open'));
	const done = $derived(data.reports.filter((r) => r.status === 'done'));

	const label = (kind: string) => (kind === 'bug' ? 'Bug' : 'Idea');
	const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

	const prompt = $derived(
		[
			'Please work through these open Vesper reports in this repo. If one is unclear, ask instead of guessing.',
			...open.map((r) =>
				[
					`#${r.id} [${label(r.kind)}] ${r.message}`,
					r.page && `Page: ${r.page}`,
					r.userAgent && `Browser: ${r.userAgent}`,
					`Reported: ${day(r.createdAt)}`
				]
					.filter(Boolean)
					.join('\n')
			)
		].join('\n\n')
	);

	let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
	let copyTimer: ReturnType<typeof setTimeout>;
	async function copyForClaude() {
		clearTimeout(copyTimer);
		try {
			await navigator.clipboard.writeText(prompt);
			copyState = 'copied';
			copyTimer = setTimeout(() => (copyState = 'idle'), 2000);
		} catch {
			// Clipboard access is refused outside https; show the text to copy by hand
			copyState = 'failed';
		}
	}
</script>

<svelte:head><title>Bugs & ideas — Vesper</title></svelte:head>

{#snippet report(r: (typeof data.reports)[number])}
	<div class="flex items-start gap-3 rounded-xl border border-surface-800 bg-surface-900 px-4 py-3">
		<div class="min-w-0 flex-1">
			<p class="flex items-center gap-2 text-xs text-zinc-500">
				<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase {r.kind === 'bug' ? 'bg-red-500/10 text-red-400' : 'bg-accent/15 text-accent'}">
					{label(r.kind)}
				</span>
				#{r.id} · {day(r.createdAt)}
			</p>
			<p class="mt-1.5 text-sm break-words whitespace-pre-wrap {r.status === 'done' ? 'text-zinc-500' : 'text-zinc-200'}">{r.message}</p>
			{#if r.page}
				<p class="mt-1 truncate text-xs text-zinc-600">{r.page}</p>
			{/if}
		</div>
		<form method="POST" action="?/status" use:enhance>
			<input type="hidden" name="id" value={r.id} />
			<input type="hidden" name="status" value={r.status === 'open' ? 'done' : 'open'} />
			<button class="rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-accent hover:text-accent">
				{r.status === 'open' ? 'Mark done' : 'Reopen'}
			</button>
		</form>
	</div>
{/snippet}

<div class="mx-auto max-w-3xl p-6">
	<h1 class="text-2xl">Bugs & ideas</h1>

	{#if form?.error}
		<div class="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{form.error}</div>
	{:else if form?.success}
		<div class="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
			{form.success}
		</div>
	{/if}

	<form
		method="POST"
		action="?/add"
		use:enhance
		class="mt-6 space-y-4 rounded-xl border border-surface-800 bg-surface-900 p-5"
	>
		<input type="hidden" name="page" value={data.from} />
		<label class="block">
			<span class="mb-1 block text-xs font-medium text-zinc-400">Type</span>
			<select
				name="kind"
				class="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
			>
				<option value="bug">Bug</option>
				<option value="idea">Improvement</option>
			</select>
		</label>
		<label class="block">
			<span class="mb-1 block text-xs font-medium text-zinc-400">What happened, or what would be better?</span>
			<textarea
				name="message"
				required
				rows="4"
				maxlength="5000"
				class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
			></textarea>
		</label>
		{#if data.from}
			<p class="truncate text-xs text-zinc-500">Reporting from {data.from}</p>
		{/if}
		<button class="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover">
			Save report
		</button>
	</form>

	<section class="mt-10">
		<div class="flex items-center justify-between gap-3">
			<h2 class="font-sans text-sm font-semibold tracking-wide text-zinc-400 uppercase">Open ({open.length})</h2>
			{#if open.length > 0}
				<button
					onclick={copyForClaude}
					class="rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-accent hover:text-accent"
				>
					{copyState === 'copied' ? 'Copied' : 'Copy for Claude'}
				</button>
			{/if}
		</div>
		{#if copyState === 'failed' && open.length > 0}
			<textarea
				readonly
				rows="8"
				value={prompt}
				aria-label="Reports to copy"
				class="mt-3 w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-zinc-300 outline-none"
			></textarea>
		{/if}
		<div class="mt-3 space-y-2">
			{#each open as r (r.id)}
				{@render report(r)}
			{:else}
				<p class="rounded-xl border border-dashed border-surface-700 px-4 py-6 text-center text-sm text-zinc-500">
					Nothing open.
				</p>
			{/each}
		</div>
	</section>

	{#if done.length > 0}
		<section class="mt-10">
			<h2 class="font-sans text-sm font-semibold tracking-wide text-zinc-400 uppercase">Done ({done.length})</h2>
			<div class="mt-3 space-y-2">
				{#each done as r (r.id)}
					{@render report(r)}
				{/each}
			</div>
		</section>
	{/if}
</div>
