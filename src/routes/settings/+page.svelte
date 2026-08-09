<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let testing = $state(false);
</script>

<svelte:head><title>Settings — StreamX</title></svelte:head>

<div class="mx-auto max-w-3xl p-6">
	<h1 class="text-2xl font-bold">Settings</h1>

	{#if data.setup}
		<div class="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-zinc-200">
			Welcome! Add your first Xtream Codes connection below to start watching.
		</div>
	{/if}

	{#if form?.error}
		<div class="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{form.error}</div>
	{:else if form?.success}
		<div class="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
			{form.success}
		</div>
	{/if}

	<section class="mt-8">
		<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Connections</h2>
		<div class="mt-3 space-y-2">
			{#each data.connections as conn (conn.id)}
				<div
					class="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900 px-4 py-3"
				>
					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-2 text-sm font-medium">
							{conn.name}
							{#if conn.active}
								<span class="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
									ACTIVE
								</span>
							{/if}
						</p>
						<p class="mt-0.5 truncate text-xs text-zinc-500">{conn.serverUrl} · {conn.username}</p>
					</div>
					{#if !conn.active}
						<form method="POST" action="?/activate" use:enhance>
							<input type="hidden" name="connectionId" value={conn.id} />
							<button class="rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-accent hover:text-accent">
								Use
							</button>
						</form>
					{/if}
					<form
						method="POST"
						action="?/delete"
						use:enhance
						onsubmit={(e) => {
							if (!confirm(`Remove connection "${conn.name}"? Favorites and watch history for it will be deleted.`)) e.preventDefault();
						}}
					>
						<input type="hidden" name="connectionId" value={conn.id} />
						<button class="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400" title="Remove">
							<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
							</svg>
						</button>
					</form>
				</div>
			{:else}
				<p class="rounded-xl border border-dashed border-surface-700 px-4 py-6 text-center text-sm text-zinc-500">
					No connections yet.
				</p>
			{/each}
		</div>
	</section>

	<section class="mt-10">
		<h2 class="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Add connection</h2>
		<form
			method="POST"
			action="?/add"
			class="mt-3 grid gap-4 rounded-xl border border-surface-800 bg-surface-900 p-5 sm:grid-cols-2"
			use:enhance={() => {
				testing = true;
				return async ({ update }) => {
					testing = false;
					await update();
				};
			}}
		>
			<label class="block sm:col-span-2">
				<span class="mb-1 block text-xs font-medium text-zinc-400">Display name</span>
				<input
					name="name"
					required
					placeholder="My provider"
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<label class="block sm:col-span-2">
				<span class="mb-1 block text-xs font-medium text-zinc-400">Server URL</span>
				<input
					name="serverUrl"
					required
					placeholder="http://provider.example:8080"
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<label class="block">
				<span class="mb-1 block text-xs font-medium text-zinc-400">Username</span>
				<input
					name="username"
					required
					autocomplete="off"
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<label class="block">
				<span class="mb-1 block text-xs font-medium text-zinc-400">Password</span>
				<input
					name="password"
					type="password"
					required
					autocomplete="off"
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>
			<div class="sm:col-span-2">
				<button
					disabled={testing}
					class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{testing ? 'Testing connection…' : 'Test & save'}
				</button>
			</div>
		</form>
		<p class="mt-3 text-xs text-zinc-600">
			Xtream credentials are stored in plain text on the server — they are required to build
			stream URLs. Run StreamX only on hardware you trust.
		</p>
	</section>
</div>
