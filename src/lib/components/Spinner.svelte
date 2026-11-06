<div class="spinner" role="status" aria-label="Loading"></div>

<style>
	.spinner {
		position: relative;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 9999px;
		/* A comet: solid at its head, fading away behind it */
		background: conic-gradient(transparent 15%, var(--color-accent));
		mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px));
		animation:
			spinner-in 0.3s ease-out 0.15s both,
			spinner-turn 0.9s linear infinite;
	}

	/* Rounds off the head of the comet */
	.spinner::after {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 9999px;
		background: var(--color-accent);
	}

	@keyframes spinner-turn {
		to {
			rotate: 360deg;
		}
	}

	/* Held back a moment so that a load this quick never shows it at all */
	@keyframes spinner-in {
		from {
			opacity: 0;
			scale: 0.85;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: spinner-in 0.3s ease-out 0.15s both;
		}
	}
</style>
