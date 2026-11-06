/** Deep, muted pairs for artwork that doesn't exist. Each title keeps its own. */
const TINTS: [string, string][] = [
	['#4a1c1f', '#21100f'], // oxblood
	['#1f3a30', '#0f1c17'], // forest
	['#1c2a45', '#0d1320'], // midnight
	['#38213f', '#191020'], // plum
	['#4d3a17', '#211a0b'], // ochre
	['#17393d', '#0b1c1e'], // teal
	['#2f3338', '#16181a'], // slate
	['#4f2c1e', '#22130d'] // clay
];

/** A background for `title`: the same every time, and different from its neighbours. */
export function tintFor(title: string): string {
	let hash = 0;
	for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	const [from, to] = TINTS[Math.abs(hash) % TINTS.length];
	return `linear-gradient(160deg, ${from}, ${to})`;
}
