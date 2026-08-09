const TMDB_FILE = /\/([A-Za-z0-9]{20,})\.(jpg|jpeg|png)$/i;

/**
 * Many Xtream panels serve TMDB artwork through their own mirror hosts, which
 * frequently go dead. If a URL's filename looks like a TMDB file hash, return
 * the equivalent URL on TMDB's public image CDN (no API key required).
 */
export function tmdbFallback(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		if (u.hostname === 'image.tmdb.org') return null;
		const m = u.pathname.match(TMDB_FILE);
		return m ? `https://image.tmdb.org/t/p/w300/${m[1]}.${m[2].toLowerCase()}` : null;
	} catch {
		return null;
	}
}
