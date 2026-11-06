<script lang="ts">
	let { class: className = 'text-2xl' }: { class?: string } = $props();
</script>

<span class="inline-flex items-center gap-[0.35em] font-serif leading-none font-medium tracking-tight text-zinc-100 {className}">
	<svg class="h-[0.75em] w-[0.75em] text-accent" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
		<path d="M32 2c1.9 20.2 9.8 28.1 30 30-20.2 1.9-28.1 9.8-30 30-1.9-20.2-9.8-28.1-30-30 20.2-1.9 28.1-9.8 30-30z" />
	</svg>
	Vesper
</span>
