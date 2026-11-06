<script lang="ts">
	import { enhance } from '$app/forms';
	import Wordmark from '$lib/components/Wordmark.svelte';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Register — Vesper</title></svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center bg-surface-950 bg-[radial-gradient(ellipse_at_top,_#2c2316_0%,_transparent_60%)] p-4">
	<a href="/" class="mb-8" aria-label="Vesper"><Wordmark class="text-4xl" /></a>
	<div class="w-full max-w-sm rounded-xl border border-white/10 bg-surface-900/70 px-6 py-8 sm:px-8 sm:py-10">
		<h1 class="mb-6 text-2xl text-zinc-100">Create your account</h1>

		<form
			method="POST"
			class="space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			{#if form?.error}
				<p class="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">{form.error}</p>
			{/if}

			<label class="block">
				<span class="mb-1.5 block text-sm text-zinc-400">Username</span>
				<input
					name="username"
					required
					autocomplete="username"
					value={form?.username ?? ''}
					class="w-full rounded-lg border border-white/15 bg-surface-950/70 px-4 py-3 text-base text-white outline-none transition-colors focus:border-accent"
				/>
			</label>

			<label class="block">
				<span class="mb-1.5 block text-sm text-zinc-400">Password</span>
				<input
					name="password"
					type="password"
					required
					minlength="8"
					autocomplete="new-password"
					class="w-full rounded-lg border border-white/15 bg-surface-950/70 px-4 py-3 text-base text-white outline-none transition-colors focus:border-accent"
				/>
			</label>

			<label class="block">
				<span class="mb-1.5 block text-sm text-zinc-400">Confirm password</span>
				<input
					name="confirm"
					type="password"
					required
					autocomplete="new-password"
					class="w-full rounded-lg border border-white/15 bg-surface-950/70 px-4 py-3 text-base text-white outline-none transition-colors focus:border-accent"
				/>
			</label>

			<button
				disabled={submitting}
				class="!mt-6 w-full rounded-full bg-accent py-3 text-base font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{submitting ? 'Creating…' : 'Create account'}
			</button>

			<p class="pt-3 text-center text-sm text-zinc-500">
				Already have an account? <a href="/login" class="font-medium text-accent hover:underline">Sign in</a>
			</p>
		</form>
	</div>
</div>
