<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in — StreamX</title></svelte:head>

<div class="relative flex min-h-dvh items-center justify-center bg-black p-4 sm:bg-[radial-gradient(ellipse_at_top,_#3a0a0d_0%,_#000_60%)]">
	<a href="/" class="absolute top-5 left-5 text-3xl font-black tracking-tighter text-accent uppercase sm:top-6 sm:left-10 sm:text-4xl">Stream<span class="text-white/90">X</span></a>
	<div class="w-full max-w-md rounded-md bg-black/75 px-6 py-10 sm:px-14 sm:py-14">
		<h1 class="mb-6 text-3xl font-bold">Sign In</h1>

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
				<p class="rounded bg-[#e87c03] px-4 py-3 text-sm text-white">{form.error}</p>
			{/if}

			<label class="block">
				<span class="mb-1.5 block text-sm text-zinc-400">Username</span>
				<input
					name="username"
					required
					autocomplete="username"
					value={form?.username ?? ''}
					class="w-full rounded border border-zinc-600 bg-zinc-900/70 px-4 py-3.5 text-base text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
				/>
			</label>

			<label class="block">
				<span class="mb-1.5 block text-sm text-zinc-400">Password</span>
				<input
					name="password"
					type="password"
					required
					autocomplete="current-password"
					class="w-full rounded border border-zinc-600 bg-zinc-900/70 px-4 py-3.5 text-base text-white outline-none focus:border-white focus:ring-1 focus:ring-white"
				/>
			</label>

			<button
				disabled={submitting}
				class="!mt-6 w-full rounded bg-accent py-3 text-base font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{submitting ? 'Signing in…' : 'Sign in'}
			</button>

			<p class="pt-4 text-base text-zinc-500">
				New to StreamX? <a href="/register" class="font-medium text-white hover:underline">Sign up now</a>
			</p>
		</form>
	</div>
</div>
