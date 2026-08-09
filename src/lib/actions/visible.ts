/** Svelte action: calls the callback once when the element first enters the viewport. */
export function visible(node: HTMLElement, callback: () => void) {
	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				observer.disconnect();
				callback();
			}
		},
		{ rootMargin: '200px' }
	);
	observer.observe(node);
	return {
		destroy() {
			observer.disconnect();
		}
	};
}
