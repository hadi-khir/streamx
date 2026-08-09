<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Register — StreamX</title></svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight">
				Stream<span class="text-accent">X</span>
			</h1>
			<p class="mt-2 text-sm text-zinc-400">Create your account</p>
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
					minlength="8"
					autocomplete="new-password"
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>

			<label class="block">
				<span class="mb-1 block text-xs font-medium text-zinc-400">Confirm password</span>
				<input
					name="confirm"
					type="password"
					required
					autocomplete="new-password"
					class="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm outline-none focus:border-accent"
				/>
			</label>

			<button
				disabled={submitting}
				class="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{submitting ? 'Creating…' : 'Create account'}
			</button>

			<p class="text-center text-xs text-zinc-500">
				Already have an account? <a href="/login" class="text-accent hover:underline">Sign in</a>
			</p>
		</form>
	</div>
</div>
