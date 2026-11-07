import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';

const UA = 'StreamX/1.0';
const PROBE_TIMEOUT = 20_000;
// How long a provider takes to notice a dropped connection and allow a new one
const RELEASE_WAIT = 1_500;

/**
 * Audio a browser can't decode — AC-3, E-AC-3, DTS, TrueHD — is common in
 * IPTV VOD, and Chrome and Firefox play such a file as silent video. The fix
 * is to leave the picture alone and re-encode only the sound to AAC, which is
 * cheap enough to do live: one ffmpeg per viewer, the video stream copied.
 */
export const BROWSER_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'mp2']);

export interface ProbeResult {
	duration: number | null;
	video: string | null;
	audio: { index: number; codec: string; language: string | null; title: string | null }[];
}

const probes = new Map<string, { data: ProbeResult; time: number }>();
const PROBE_TTL = 6 * 60 * 60 * 1000;

export async function probe(source: string, cacheKey: string): Promise<ProbeResult> {
	const hit = probes.get(cacheKey);
	if (hit && Date.now() - hit.time < PROBE_TTL) return hit.data;

	const out = await new Promise<string>((resolve, reject) => {
		const proc = spawn('ffprobe', [
			'-v', 'error',
			'-user_agent', UA,
			'-show_entries', 'format=duration:stream=index,codec_type,codec_name:stream_tags=language,title',
			'-of', 'json',
			source
		]);
		let stdout = '';
		proc.stdout.on('data', (d) => (stdout += d));
		const timer = setTimeout(() => proc.kill('SIGKILL'), PROBE_TIMEOUT);
		proc.on('error', reject);
		proc.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve(stdout);
			else reject(new Error(`ffprobe exited with ${code}`));
		});
	});

	const json = JSON.parse(out);
	const streams: any[] = json.streams ?? [];
	const duration = Number(json.format?.duration);
	const data: ProbeResult = {
		duration: Number.isFinite(duration) && duration > 0 ? duration : null,
		video: streams.find((s) => s.codec_type === 'video')?.codec_name ?? null,
		audio: streams
			.filter((s) => s.codec_type === 'audio')
			.map((s, i) => ({
				index: i,
				codec: s.codec_name,
				language: s.tags?.language ?? null,
				title: s.tags?.title ?? null
			}))
	};
	probes.set(cacheKey, { data, time: Date.now() });
	return data;
}

// Providers cap concurrent connections per login, often at one. A seek
// starts a fresh ffmpeg, and if the previous one is still draining the
// provider refuses the new one — so each connection runs one at a time.
const running = new Map<number, ChildProcess>();

// Titles that needed the audio fix. Episodes of one show share an encode, so
// the next episode starts on the compatible stream instead of rediscovering it.
const needsFix = new Set<string>();

export function rememberFix(connId: number, type: string, streamId: string, seriesId?: string | null) {
	needsFix.add(`${connId}:${type}:${streamId}`);
	if (seriesId) needsFix.add(`${connId}:show:${seriesId}`);
}

export function knownToNeedFix(connId: number, type: string, streamId: number, seriesId?: number | null) {
	return (
		needsFix.has(`${connId}:${type}:${streamId}`) ||
		(seriesId != null && needsFix.has(`${connId}:show:${seriesId}`))
	);
}

/**
 * Playback is starting elsewhere on this login. A feed outlives a page that died
 * without closing it (a reload, a crash), and would hold the provider's one
 * connection until it timed out.
 */
export async function releaseTranscode(connId: number): Promise<void> {
	const proc = running.get(connId);
	if (!proc) return;
	proc.kill('SIGKILL');
	await new Promise((resolve) => setTimeout(resolve, RELEASE_WAIT));
}

/**
 * Stream `source` as fragmented MP4 with the video copied and the chosen audio
 * track as stereo AAC. Fragmented output needs no seekable sink, so it plays
 * as it arrives; seeking is a new request with `start`, since a pipe has no
 * byte ranges to offer.
 */
export function transcodeAudio(
	connId: number,
	source: string,
	opts: { start: number; live: boolean; audioTrack: number }
): ReadableStream<Uint8Array> {
	running.get(connId)?.kill('SIGKILL');

	const args = [
		'-hide_banner',
		'-loglevel', 'error',
		'-user_agent', UA,
		'-reconnect', '1',
		'-reconnect_delay_max', '5',
		...(opts.live ? ['-reconnect_streamed', '1'] : []),
		// Copied video has to start on the keyframe before `start`. Left accurate, the
		// audio is cut at `start` and its first frame stretched to cover the difference.
		...(opts.start > 0 && !opts.live ? ['-noaccurate_seek', '-ss', String(opts.start)] : []),
		'-i', source,
		'-map', '0:v:0',
		'-map', `0:a:${opts.audioTrack}?`,
		'-c:v', 'copy',
		'-c:a', 'aac',
		'-ac', '2',
		'-b:a', '192k',
		'-sn',
		'-dn',
		'-f', 'mp4',
		'-movflags', 'frag_keyframe+empty_moov+default_base_moof',
		'pipe:1'
	];
	const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
	running.set(connId, proc);

	let stderr = '';
	proc.stderr!.on('data', (d) => {
		stderr = (stderr + d).slice(-2000);
	});
	proc.on('close', (code, signal) => {
		if (running.get(connId) === proc) running.delete(connId);
		if (code && signal !== 'SIGKILL') console.error(`ffmpeg exited ${code}: ${stderr.trim()}`);
	});

	const stdout = proc.stdout!;
	let done = false;
	return new ReadableStream<Uint8Array>({
		start(controller) {
			stdout.on('data', (chunk: Buffer) => {
				if (done) return;
				controller.enqueue(new Uint8Array(chunk));
				// Respect the browser's pace instead of buffering a whole film in memory
				if ((controller.desiredSize ?? 1) <= 0) stdout.pause();
			});
			// Only a clean exit is the end of the title. A newer request killing
			// this one, or ffmpeg failing, must read as an error so the player
			// reconnects instead of believing the film finished.
			proc.on('close', (code) => {
				if (done) return;
				done = true;
				if (code === 0) controller.close();
				else controller.error(new Error(`ffmpeg exited with ${code ?? 'a signal'}`));
			});
			proc.on('error', (e) => {
				if (done) return;
				done = true;
				controller.error(e);
			});
		},
		pull() {
			stdout.resume();
		},
		cancel() {
			// The viewer seeked, switched title or closed the tab
			done = true;
			proc.kill('SIGKILL');
		}
	}, { highWaterMark: 64 });
}

/**
 * WebKit keeps downloading a fetch body whether or not the page is reading it,
 * holding it all in memory, so a film at full copy speed takes the page down in
 * minutes. There the stream is handed over in pieces instead: ffmpeg stays
 * blocked on its pipe until the player asks for more, and a player that stops
 * asking (and stops pinging) has its feed closed, which frees the provider login.
 */
const FEED_CHUNK_BYTES = 4 * 1024 * 1024;
// A slow stream shouldn't sit on a part-filled piece, least of all when starting
const FEED_CHUNK_WAIT = 1_000;
const FEED_IDLE_AFTER = 120_000;

interface Feed {
	id: string;
	userId: string;
	reader: ReadableStreamDefaultReader<Uint8Array>;
	/** A read outlasting one piece carries over to the next */
	reading: Promise<ReadableStreamReadResult<Uint8Array>> | null;
	ended: boolean;
	idle: ReturnType<typeof setTimeout> | undefined;
}

const feeds = new Map<string, Feed>();

export function closeFeed(feed: Feed) {
	clearTimeout(feed.idle);
	feeds.delete(feed.id);
	// Ends ffmpeg
	feed.reader.cancel().catch(() => {});
}

export function keepFeed(feed: Feed) {
	clearTimeout(feed.idle);
	feed.idle = setTimeout(() => closeFeed(feed), FEED_IDLE_AFTER);
}

export function openFeed(userId: string, stream: ReadableStream<Uint8Array>): Feed {
	const feed: Feed = {
		id: randomUUID(),
		userId,
		reader: stream.getReader(),
		reading: null,
		ended: false,
		idle: undefined
	};
	feeds.set(feed.id, feed);
	keepFeed(feed);
	return feed;
}

export function findFeed(id: string, userId: string): Feed | null {
	const feed = feeds.get(id);
	return feed?.userId === userId ? feed : null;
}

/** The next piece of the stream, or null once it has finished cleanly. A failed stream throws. */
export async function readFeed(feed: Feed): Promise<Uint8Array | null> {
	keepFeed(feed);
	const parts: Uint8Array[] = [];
	let size = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const waited = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), FEED_CHUNK_WAIT);
	});
	try {
		while (!feed.ended && size < FEED_CHUNK_BYTES) {
			feed.reading ??= feed.reader.read();
			// Nothing yet means waiting for as long as ffmpeg needs; the piece isn't late until it has something
			const result = size ? await Promise.race([feed.reading, waited]) : await feed.reading;
			if (!result) break;
			feed.reading = null;
			if (result.done) feed.ended = true;
			else {
				parts.push(result.value);
				size += result.value.length;
			}
		}
	} catch (e) {
		// Deliver what arrived first; the failed read is still there for the next request
		if (!size) {
			closeFeed(feed);
			throw e;
		}
	} finally {
		clearTimeout(timer);
	}
	// Closed while waiting isn't the title finishing, which would end playback for good
	if (!feeds.has(feed.id)) throw new Error('The stream was closed');
	keepFeed(feed);
	if (!size) {
		closeFeed(feed);
		return null;
	}
	const piece = new Uint8Array(size);
	let at = 0;
	for (const part of parts) {
		piece.set(part, at);
		at += part.length;
	}
	return piece;
}
