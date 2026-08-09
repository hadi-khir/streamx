<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in — StreamX</title></svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight">
				Stream<span class="text-accent">X</span>
			</h1>
			<p class="mt-2 text-sm text-zinc-400">Sign in to your account</p>
		</div>

		<form
			method="POST"
			class="space-y-4 rounded-2xl border border-surface-800 bg-surface-900 p-6"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			{#if form?.error}
				<p class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{form.error}</p>
			{/if}

			<label class="block">
				<span class="mb-1 block text-xs font-medium text-zinc-400">Username</span>
				<input
					name="username"
					required
					autocomplete="username"
					value={form?.username ?? ''}
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>

			<label class="block">
				<span class="mb-1 block text-xs font-medium text-zinc-400">Password</span>
				<input
					name="password"
					type="password"
					required
					autocomplete="current-password"
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>

			<button
				disabled={submitting}
				class="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{submitting ? 'Signing in…' : 'Sign in'}
			</button>

			<p class="text-center text-xs text-zinc-500">
				No account? <a href="/register" class="text-accent hover:underline">Register</a>
			</p>
		</form>
	</div>
</div>
