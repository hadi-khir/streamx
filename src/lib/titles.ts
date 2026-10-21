/**
 * Strip provider decoration for display: "EN - Dune (2021) [4K]" → "Dune".
 * The raw name stays the identity everywhere else (history, favorites).
 */
export function displayName(name: string): string {
	return (
		name
			.replace(/\[[^\]]*\]/g, '')
			.replace(/^\s*[A-Z0-9+]{1,4}\s*[-|:]\s*/i, '')
			.replace(/\((19|20)\d{2}\)/g, '')
			.replace(/\b(4k|uhd|fhd|multi-?sub)\b/gi, '')
			.replace(/\s{2,}/g, ' ')
			.trim() || name
	);
}

/** "(2021)" in a provider title, if any. */
export function yearIn(name: string): string | null {
	return name.match(/\((19|20)\d{2}\)/)?.[0].slice(1, 5) ?? null;
}
