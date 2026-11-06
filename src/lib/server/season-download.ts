import { randomBytes } from 'node:crypto';
import { getSeriesInfo, buildStreamUrl } from '$lib/server/xtream';
import { listConnections } from '$lib/server/connections';
import { groupEpisodes, type SeriesEpisode } from '$lib/server/series';
import { displayName } from '$lib/titles';
import type { Connection } from '$lib/server/db/schema';

/**
 * A whole season as one file. Browsers block a burst of separate downloads, and
 * providers allow few connections, so episodes are fetched strictly one at a time
 * into a single tar: it needs no compression or checksums, so it can be sent as it
 * arrives, and its total size is known up front for the browser's progress bar.
 *
 * Downloads prefer a login nobody's watching on. Where there's only the one, they
 * share it: playback always wins, and the download picks up from the same byte.
 */

const UA = 'StreamX/1.0';
const BLOCK = 512;
const PROBE_TIMEOUT = 15_000;
const HEADER_TIMEOUT = 30_000;
// The player reports in every few seconds, so this long without a word means it stopped
const IDLE_AFTER = 45_000;
// A provider takes a moment to notice a connection has gone
const RELEASE_WAIT = 1_500;
const RETRY_WAIT = 5_000;
const GIVE_UP_AFTER = 30 * 60 * 1000;
const PREPARED_FOR = 10 * 60 * 1000;

// While paused nothing arrives, and a silent connection gets cut by whatever proxy
// sits in front (nginx allows 60 seconds). So a little of what's already been read
// is always held back, to trickle out during a pause. Long enough for any film.
const RESERVE_BYTES = 64 * 1024;
const TRICKLE_EVERY = 20_000;
const TRICKLE_BYTES = 16;

interface Entry {
	episode: SeriesEpisode;
	path: string;
	size: number;
}

interface Prepared {
	userId: string;
	conn: Connection;
	filename: string;
	entries: Entry[];
	total: number;
	expires: number;
}

const prepared = new Map<string, Prepared>();
const lastPlayback = new Map<number, number>();
/** What's downloading on each login: abort() frees its provider connection */
const active = new Map<number, { upstream: AbortController | null }>();

/** Someone is watching on this login. Called on every sign of playback. */
export function notePlayback(connectionId: number) {
	lastPlayback.set(connectionId, Date.now());
}

function isWatching(connectionId: number): boolean {
	const last = lastPlayback.get(connectionId);
	return last != null && Date.now() - last < IDLE_AFTER;
}

/** Playback is starting: if a download holds this login, take its connection back. */
export async function yieldForPlayback(connectionId: number): Promise<void> {
	notePlayback(connectionId);
	const job = active.get(connectionId);
	if (!job?.upstream) return;
	job.upstream.abort();
	job.upstream = null;
	await new Promise((resolve) => setTimeout(resolve, RELEASE_WAIT));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanPart(text: string): string {
	return text
		.replace(/[\\/:*?"<>|]/g, ' ')
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/\s+/g, ' ')
		.replace(/^\.+/, '')
		.trim();
}

/** Trim to a byte length, without cutting a multi-byte character in half. */
function clip(text: string, bytes: number): string {
	const raw = Buffer.from(text);
	return raw.length <= bytes ? text : raw.subarray(0, bytes).toString().replace(/�+$/, '');
}

/** "S01E07 - Pilot.mkv", from an episode title that often just repeats the show. */
function episodeFile(show: string, ep: SeriesEpisode): string {
	const code = `S${ep.season.padStart(2, '0')}E${String(ep.num).padStart(2, '0')}`;
	let title = displayName(ep.title);
	if (title.toLowerCase().startsWith(show.toLowerCase())) title = title.slice(show.length);
	title = cleanPart(title.replace(/\bS\d+\s*E\d+\b/gi, '').replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, ''));
	const ext = /^[a-zA-Z0-9]{1,10}$/.test(ep.ext) ? ep.ext : 'mp4';
	return `${clip(title ? `${code} - ${title}` : code, 95)}.${ext}`;
}

function octal(value: number, width: number): string {
	return value.toString(8).padStart(width - 1, '0') + '\0';
}

/** One ustar header block. */
export function tarHeader(path: string, size: number, mtime: number): Buffer {
	const slash = path.lastIndexOf('/');
	const header = Buffer.alloc(BLOCK);
	header.write(path.slice(slash + 1), 0, 100);
	header.write(octal(0o644, 8), 100);
	header.write(octal(0, 8), 108);
	header.write(octal(0, 8), 116);
	if (size < 8 ** 11) {
		header.write(octal(size, 12), 124);
	} else {
		// Too big for the octal field: GNU's base-256, which tar tools all read
		header[124] = 0x80;
		header.writeBigUInt64BE(BigInt(size), 128);
	}
	header.write(octal(mtime, 12), 136);
	header.write('        ', 148);
	header.write('0', 156);
	header.write('ustar\u000000', 257, 'latin1');
	header.write(path.slice(0, Math.max(slash, 0)), 345, 155);
	let sum = 0;
	for (const byte of header) sum += byte;
	header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
	return header;
}

const padFor = (size: number) => (BLOCK - (size % BLOCK)) % BLOCK;

/** An episode's exact size, or null if this login can't get at it right now. */
async function probeSize(conn: Connection, ep: SeriesEpisode): Promise<number | 'missing' | null> {
	const url = buildStreamUrl(conn, 'series', ep.id, ep.ext);
	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt) await wait(RELEASE_WAIT);
		try {
			const res = await fetch(url, {
				headers: { 'User-Agent': UA, Range: 'bytes=0-0' },
				redirect: 'follow',
				signal: AbortSignal.timeout(PROBE_TIMEOUT)
			});
			const range = res.headers.get('content-range')?.match(/\/(\d+)\s*$/)?.[1];
			const length = res.headers.get('content-length');
			res.body?.cancel().catch(() => {});
			if (res.status === 404 || res.status === 410) return 'missing';
			if (res.ok && range) return Number(range);
			if (res.status === 200 && length) return Number(length);
		} catch {
			// Timed out or refused: try again, then let the caller try another login
		}
	}
	return null;
}

export type PrepareResult =
	| { ok: true; token: string; episodes: number; skipped: number; bytes: number; sharesLogin: boolean }
	| { ok: false; reason: 'not-found' | 'busy' | 'unavailable' };

/**
 * Picks a login and measures the season. Other logins come first so that watching
 * stays untouched; the one you're on is the fallback, and works just the same.
 */
export async function prepareSeason(
	userId: string,
	conn: Connection,
	seriesId: number,
	season: string
): Promise<PrepareResult> {
	const data = await getSeriesInfo(conn, seriesId);
	const episodes = groupEpisodes(data).find((s) => s.season === season)?.episodes ?? [];
	if (!episodes.length) return { ok: false, reason: 'not-found' };

	const host = (c: Connection) => c.serverUrl.replace(/\/+$/, '').toLowerCase();
	const logins = listConnections(userId).filter((c) => host(c) === host(conn));
	const others = logins.filter((c) => c.id !== conn.id);
	const free = [...others, conn].filter((c) => !isWatching(c.id) && !active.has(c.id));
	if (!free.length) return { ok: false, reason: 'busy' };

	const show = cleanPart(displayName(String(data.info?.name ?? ''))) || `Series ${seriesId}`;
	const folder = `${clip(show, 120)}/Season ${clean(season)}`;

	for (const login of free) {
		const entries: Entry[] = [];
		let skipped = 0;
		let failed = false;
		for (const episode of episodes) {
			const size = await probeSize(login, episode);
			if (size === 'missing') skipped++;
			else if (size == null) {
				failed = true;
				break;
			} else entries.push({ episode, size, path: `${folder}/${episodeFile(show, episode)}` });
		}
		if (failed || !entries.length) continue;

		const total = entries.reduce((sum, e) => sum + BLOCK + e.size + padFor(e.size), BLOCK * 2);
		const token = randomBytes(16).toString('hex');
		for (const [key, old] of prepared) if (old.expires < Date.now()) prepared.delete(key);
		prepared.set(token, {
			userId,
			conn: login,
			filename: `${show} - Season ${clean(season)}.tar`,
			entries,
			total,
			expires: Date.now() + PREPARED_FOR
		});
		return { ok: true, token, episodes: entries.length, skipped, bytes: total, sharesLogin: others.length === 0 || login.id === conn.id };
	}
	return { ok: false, reason: 'unavailable' };
}

function clean(text: string): string {
	return cleanPart(text).slice(0, 40) || '1';
}

/** The tar's bytes, in order. A null means "nothing yet, still alive": a pause or a retry. */
async function* seasonBytes(job: Prepared, state: { upstream: AbortController | null; cancelled: boolean }) {
	const mtime = Math.floor(Date.now() / 1000);
	for (const entry of job.entries) {
		yield new Uint8Array(tarHeader(entry.path, entry.size, mtime));
		const url = buildStreamUrl(job.conn, 'series', entry.episode.id, entry.episode.ext);
		let offset = 0;
		let lastProgress = Date.now();

		while (offset < entry.size) {
			if (state.cancelled) return;
			if (isWatching(job.conn.id)) {
				// Playback's turn. The clock is for failures, not for this
				lastProgress = Date.now();
				yield null;
				await wait(1_000);
				continue;
			}
			if (Date.now() - lastProgress > GIVE_UP_AFTER) throw new Error('Provider stopped responding');

			const controller = new AbortController();
			state.upstream = controller;
			const headerTimer = setTimeout(() => controller.abort(), HEADER_TIMEOUT);
			try {
				const res = await fetch(url, {
					headers: { 'User-Agent': UA, ...(offset ? { Range: `bytes=${offset}-` } : {}) },
					redirect: 'follow',
					signal: controller.signal
				});
				clearTimeout(headerTimer);
				if (!res.ok || !res.body) {
					res.body?.cancel().catch(() => {});
					throw new Error(`HTTP ${res.status}`);
				}
				// A provider that ignores the range sends it all again: skip what we already have
				let skip = offset && res.status === 200 ? offset : 0;
				const reader = res.body.getReader();
				try {
					while (offset < entry.size) {
						const { value, done } = await reader.read();
						if (done) break;
						let chunk: Uint8Array = value;
						if (skip) {
							const dropped = Math.min(skip, chunk.length);
							skip -= dropped;
							chunk = chunk.subarray(dropped);
							if (!chunk.length) continue;
						}
						if (chunk.length > entry.size - offset) chunk = chunk.subarray(0, entry.size - offset);
						offset += chunk.length;
						lastProgress = Date.now();
						yield chunk;
					}
				} finally {
					reader.cancel().catch(() => {});
				}
			} catch {
				// Dropped, refused, or taken back for playback. All pick up from `offset`
				clearTimeout(headerTimer);
				if (state.cancelled) return;
			} finally {
				if (state.upstream === controller) state.upstream = null;
			}
			if (offset < entry.size) {
				yield null;
				await wait(isWatching(job.conn.id) ? 0 : RETRY_WAIT);
			}
		}
		const pad = padFor(entry.size);
		if (pad) yield new Uint8Array(pad);
	}
	yield new Uint8Array(BLOCK * 2);
}

/** Starts a prepared download. Null if the link is unknown, expired or someone else's. */
export function openSeason(token: string, userId: string) {
	const job = prepared.get(token);
	if (!job || job.userId !== userId || job.expires < Date.now()) return null;
	prepared.delete(token);

	const state: { upstream: AbortController | null; cancelled: boolean } = { upstream: null, cancelled: false };
	const finish = () => {
		state.cancelled = true;
		state.upstream?.abort();
		active.delete(job.conn.id);
	};
	active.set(job.conn.id, state);

	const source = seasonBytes(job, state);
	let reserve: Uint8Array = new Uint8Array(0);
	let lastTrickle = Date.now();

	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				for (;;) {
					const { value, done } = await source.next();
					if (done) {
						if (reserve.length) controller.enqueue(reserve);
						reserve = new Uint8Array(0);
						finish();
						controller.close();
						return;
					}
					if (value === null) {
						if (Date.now() - lastTrickle < TRICKLE_EVERY || reserve.length <= TRICKLE_BYTES) continue;
						lastTrickle = Date.now();
						controller.enqueue(reserve.subarray(0, TRICKLE_BYTES));
						reserve = reserve.subarray(TRICKLE_BYTES);
						return;
					}
					const joined = new Uint8Array(reserve.length + value.length);
					joined.set(reserve);
					joined.set(value, reserve.length);
					if (joined.length <= RESERVE_BYTES) {
						reserve = joined;
						continue;
					}
					const send = joined.length - RESERVE_BYTES;
					reserve = joined.slice(send);
					lastTrickle = Date.now();
					controller.enqueue(joined.subarray(0, send));
					return;
				}
			} catch (e) {
				finish();
				controller.error(e);
			}
		},
		cancel() {
			// Closed the tab or cancelled the download
			finish();
		}
	});

	return { body, filename: job.filename, total: job.total };
}
