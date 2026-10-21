<script lang="ts">
	import Hls from 'hls.js';
	import { onDestroy, untrack, type Snippet } from 'svelte';

	export interface Attempt {
		label: string;
		method: 'hls' | 'direct';
		url: string;
	}

	let {
		attempts,
		live = false,
		initialPosition = 0,
		onProgress,
		nextUp = null,
		onPlayNext,
		transcode = null,
		audioCodec = null,
		durationHint = null,
		title = '',
		subtitle = '',
		onBack,
		actions
	}: {
		attempts: Attempt[];
		live?: boolean;
		initialPosition?: number;
		onProgress?: (position: number, duration: number) => void;
		/** Shown as an up-next card when playback ends; omit to disable autoplay. */
		nextUp?: { title: string; image: string | null } | null;
		onPlayNext?: () => void;
		/** The same title with its audio re-encoded server-side to AAC */
		transcode?: { url: string; known: boolean } | null;
		/** The provider's probe of the audio, when it ran one */
		audioCodec?: string | null;
		/** Length in seconds — a re-encoded stream can't report its own */
		durationHint?: number | null;
		title?: string;
		subtitle?: string;
		onBack?: () => void;
		/** Extra buttons for the top bar (download, favorite, guide) */
		actions?: Snippet;
	} = $props();

	/** Seconds the up-next card counts down before playing automatically. */
	const NEXT_DELAY = 10;
	const SKIP = 10;

	const VOLUME_KEY = 'streamx:volume';
	const MUTED_KEY = 'streamx:muted';

	// Codecs every browser decodes, and the MSE names to ask about the rest:
	// Safari plays AC-3 and E-AC-3 itself, Chrome and Firefox don't.
	const UNIVERSAL_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'mp2']);
	const AUDIO_MIME: Record<string, string> = {
		ac3: 'ac-3',
		eac3: 'ec-3',
		dts: 'dtsc',
		truehd: 'mlpa'
	};

	let video: HTMLVideoElement;
	let container: HTMLDivElement;
	let bar: HTMLDivElement | undefined = $state();
	let hls: Hls | null = null;

	let status = $state<'loading' | 'playing' | 'error'>('loading');
	let buffering = $state(false);
	let needsGesture = $state(false);
	let debugInfo = $state<string[]>([]);
	let playing = $state(false);
	let muted = $state(false);
	let volume = $state(1);
	let currentTime = $state(0);
	let nativeDuration = $state(0);
	let bufferedEnd = $state(0);
	let fullscreen = $state(false);
	let showControls = $state(true);
	let flash = $state<'play' | 'pause' | 'back' | 'forward' | null>(null);
	let toast = $state('');

	// Audio handling
	/** 'fixed' plays the server's AAC re-encode; time there is offset + video time */
	let mode = $state<'native' | 'fixed'>('native');
	let offset = $state(0);
	let probedDuration = $state<number | null>(null);
	let fixedTracks = $state<{ index: number; name: string }[]>([]);
	let fixedTrack = $state(0);
	let switchedForSilence = false;
	let audioSilent = $state(false);
	let audioNoticeDismissed = $state(false);
	let audioTracks = $state<{ id: number; name: string }[]>([]);
	let currentAudioTrack = $state(-1);
	let audioCheckGen = $state(0);

	// Scrubbing
	let dragging = $state(false);
	let dragPct = $state(0);
	let hoverPct = $state<number | null>(null);

	let countdown = $state(0);

	let attempt = 0; // generation counter to invalidate stale callbacks
	let seeked = false;
	let hideTimer: ReturnType<typeof setTimeout>;
	let flashTimer: ReturnType<typeof setTimeout>;
	let toastTimer: ReturnType<typeof setTimeout>;
	let audioCheckTimer: ReturnType<typeof setTimeout>;
	let countdownTimer: ReturnType<typeof setInterval>;
	let lastTap = { time: 0, side: 0 };
	let fixedRetries = 0;

	const duration = $derived(
		mode === 'fixed' ? (durationHint ?? probedDuration ?? 0) : nativeDuration
	);
	const position = $derived(mode === 'fixed' ? offset + currentTime : currentTime);
	const seekable = $derived(!live && duration > 0 && isFinite(duration));
	const shownPct = $derived(
		dragging ? dragPct : seekable ? Math.min(1, position / duration) : 0
	);
	const bufferedPct = $derived(
		seekable ? Math.min(1, ((mode === 'fixed' ? offset : 0) + bufferedEnd) / duration) : 0
	);

	function log(line: string) {
		debugInfo = [...debugInfo.slice(-7), line];
	}

	function say(message: string) {
		toast = message;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 3500);
	}

	function cleanup() {
		if (hls) {
			hls.destroy();
			hls = null;
		}
	}

	/** Whether this browser can decode `codec` itself, as far as we can tell. */
	function canDecode(codec: string): boolean {
		if (UNIVERSAL_AUDIO.has(codec)) return true;
		const mime = AUDIO_MIME[codec];
		if (!mime) return false;
		const type = `audio/mp4; codecs="${mime}"`;
		return (
			(typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type)) ||
			video.canPlayType(type) !== ''
		);
	}

	function attemptPlay() {
		video.play().catch((e) => {
			// Autoplay with sound blocked: surface a tap-to-play button instead of hanging
			if (e?.name === 'NotAllowedError') needsGesture = true;
		});
	}

	function fixedUrl(start: number): string {
		const params = new URLSearchParams();
		if (start > 0) params.set('start', start.toFixed(1));
		if (fixedTrack > 0) params.set('audio', String(fixedTrack));
		const extra = params.toString();
		return extra ? `${transcode!.url}&${extra}` : transcode!.url;
	}

	/** Learn the length and audio tracks a piped stream can't report itself. */
	async function probeFixed() {
		if (!transcode || live || (durationHint && fixedTracks.length)) return;
		try {
			const res = await fetch(`${transcode.url}&probe=1`, { signal: AbortSignal.timeout(12_000) });
			if (!res.ok) return;
			const info = await res.json();
			if (info.duration) probedDuration = info.duration;
			fixedTracks = (info.audio ?? []).map(
				(a: { index: number; language: string | null; title: string | null; codec: string }) => ({
					index: a.index,
					name: a.title || a.language?.toUpperCase() || `Track ${a.index + 1}`
				})
			);
		} catch {
			// Plays fine without; only the scrubber goes missing
		}
	}

	function tryHls(label: string, url: string, onSuccess: () => void, onFail: () => void) {
		cleanup();

		if (!Hls.isSupported()) {
			// Safari plays HLS natively
			if (video.canPlayType('application/vnd.apple.mpegurl')) {
				tryDirect(label, url, onSuccess, onFail);
				return;
			}
			log(`${label}: MSE not supported in this browser`);
			onFail();
			return;
		}

		const instance = new Hls({
			enableWorker: true,
			lowLatencyMode: live,
			backBufferLength: live ? 30 : 90,
			maxBufferLength: live ? 15 : 60,
			maxMaxBufferLength: live ? 30 : 120,
			liveSyncDurationCount: 3,
			startLevel: -1,
			fragLoadingTimeOut: 20_000,
			manifestLoadingTimeOut: 15_000,
			levelLoadingTimeOut: 15_000
		});

		let settled = false;

		instance.on(Hls.Events.MANIFEST_PARSED, () => {
			if (settled) return;
			settled = true;
			onSuccess();
			attemptPlay();
		});

		instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
			audioTracks = instance.audioTracks.map((t, i) => ({
				id: i,
				name: t.name || t.lang || `Track ${i + 1}`
			}));
			currentAudioTrack = instance.audioTrack;
		});

		instance.on(Hls.Events.ERROR, (_, data) => {
			log(`${label}: ${data.type}/${data.details}${data.response ? ` (${data.response.code})` : ''}`);

			if (data.fatal && !settled) {
				settled = true;
				instance.destroy();
				if (hls === instance) hls = null;
				onFail();
			} else if (data.fatal && settled) {
				if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
					instance.recoverMediaError();
				} else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
					setTimeout(() => instance.startLoad(), 2000);
				}
			}
		});

		instance.loadSource(url);
		instance.attachMedia(video);
		hls = instance;

		setTimeout(() => {
			if (!settled) {
				settled = true;
				log(`${label}: timed out`);
				instance.destroy();
				if (hls === instance) hls = null;
				onFail();
			}
		}, 12_000);
	}

	function tryDirect(
		label: string,
		url: string,
		onSuccess: () => void,
		onFail: () => void,
		timeout = 15_000
	) {
		cleanup();
		let settled = false;

		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			video.removeEventListener('canplay', onCanPlay);
			video.removeEventListener('error', onErr);
			if (ok) {
				onSuccess();
				attemptPlay();
			} else {
				log(`${label}: ${video.error ? `media error ${video.error.code}` : 'timed out'}`);
				video.removeAttribute('src');
				video.load();
				onFail();
			}
		};
		const onCanPlay = () => finish(true);
		const onErr = () => finish(false);

		video.addEventListener('canplay', onCanPlay);
		video.addEventListener('error', onErr);
		video.src = url;
		video.load();

		setTimeout(() => finish(false), timeout);
	}

	/** Play the AAC re-encode from `at` seconds; `then` runs if it fails to start. */
	async function tryFixed(at: number, onSuccess: () => void, onFail: () => void) {
		cleanup();
		mode = 'fixed';
		offset = live ? 0 : at;
		currentTime = 0;
		await probeFixed();
		// ffmpeg has to open the source before the first byte, so give it longer
		tryDirect('Compatible audio', fixedUrl(offset), onSuccess, onFail, 25_000);
	}

	function wantsFixedFirst(): boolean {
		if (!transcode) return false;
		if (transcode.known) return true;
		return audioCodec != null && !canDecode(audioCodec);
	}

	function start(from = initialPosition) {
		status = 'loading';
		buffering = false;
		needsGesture = false;
		debugInfo = [];
		audioSilent = false;
		audioNoticeDismissed = false;
		audioTracks = [];
		currentAudioTrack = -1;
		seeked = false;
		switchedForSilence = false;
		mode = 'native';
		offset = 0;
		cancelNext();
		attempt++;
		const generation = attempt;
		const stale = () => attempt !== generation;

		type Step = { kind: 'attempt'; value: Attempt } | { kind: 'fixed' };
		const steps: Step[] = attempts.map((a) => ({ kind: 'attempt', value: a }));
		// Undecodable audio goes straight to the re-encode; otherwise it's the
		// last resort for containers the browser refuses outright (MKV, AVI).
		if (transcode) {
			if (wantsFixedFirst()) steps.unshift({ kind: 'fixed' });
			else steps.push({ kind: 'fixed' });
		}

		let idx = 0;
		const tryNext = () => {
			if (stale()) return;
			if (idx >= steps.length) {
				status = 'error';
				return;
			}
			const step = steps[idx++];

			const onSuccess = () => {
				if (!stale()) status = 'playing';
			};
			const onFail = () => {
				if (!stale()) tryNext();
			};

			if (step.kind === 'fixed') {
				tryFixed(from, onSuccess, onFail);
				return;
			}
			mode = 'native';
			offset = 0;
			const current = step.value;
			if (current.method === 'hls') tryHls(current.label, current.url, onSuccess, onFail);
			else tryDirect(current.label, current.url, onSuccess, onFail);
		};
		tryNext();
	}

	/** Mid-play: the sound never decoded, so restart on the re-encode here. */
	function switchToFixed() {
		if (!transcode || mode === 'fixed') return;
		const at = position;
		switchedForSilence = true;
		audioSilent = false;
		say('Switching to compatible audio…');
		attempt++;
		const generation = attempt;
		status = 'loading';
		video.pause();
		tryFixed(
			at,
			() => {
				if (attempt === generation) status = 'playing';
			},
			() => {
				if (attempt !== generation) return;
				// The re-encode failed too; go back to the silent original
				say("Couldn't fix the audio for this stream");
				start(at);
			}
		);
	}

	$effect(() => {
		attempts; // restart when the attempt list changes
		// start() reads state it goes on to write; only `attempts` restarts it
		untrack(() => start());
		return () => {
			attempt++;
			cleanup();
		};
	});

	// Restore persisted volume/mute once
	$effect(() => {
		const savedVolume = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
		if (isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1) video.volume = savedVolume;
		video.muted = localStorage.getItem(MUTED_KEY) === '1';
	});

	// Detect video that plays without any decoded audio (e.g. AC-3 in Chrome)
	$effect(() => {
		audioCheckGen; // re-check after an audio track switch
		if (status !== 'playing' || !playing || muted || volume === 0 || mode === 'fixed') {
			audioSilent = false;
			return;
		}
		audioCheckTimer = setTimeout(() => {
			const v = video as any;
			let silent = false;
			if (typeof v.webkitAudioDecodedByteCount === 'number') {
				silent = v.webkitAudioDecodedByteCount === 0 && v.webkitVideoDecodedByteCount > 0;
			} else if (typeof v.mozHasAudio === 'boolean') {
				silent = !v.mozHasAudio;
			}
			if (!silent) return;
			if (transcode && !switchedForSilence && audioTracks.length <= 1) switchToFixed();
			else audioSilent = true;
		}, 3000);
		return () => clearTimeout(audioCheckTimer);
	});

	// Periodic progress reporting for VOD
	$effect(() => {
		if (!onProgress || live) return;
		const timer = setInterval(() => {
			if (video && position > 0 && duration > 0 && isFinite(duration)) {
				onProgress(position, duration);
			}
		}, 10_000);
		return () => clearInterval(timer);
	});

	onDestroy(() => {
		clearTimeout(hideTimer);
		clearTimeout(flashTimer);
		clearTimeout(toastTimer);
		clearTimeout(audioCheckTimer);
		clearInterval(countdownTimer);
		cleanup();
	});

	function switchAudioTrack(id: number) {
		if (!hls) return;
		hls.audioTrack = id;
		currentAudioTrack = id;
		audioSilent = false;
		audioNoticeDismissed = false;
		audioCheckGen++;
	}

	function switchFixedTrack(index: number) {
		fixedTrack = index;
		seekTo(position, true);
	}

	function onLoadedMetadata() {
		if (mode === 'fixed') return; // the start offset is already baked into the stream
		if (!seeked && !live && initialPosition > 0 && video.duration > 0 && initialPosition < video.duration - 5) {
			video.currentTime = initialPosition;
			seeked = true;
		}
	}

	/** Jump to `t` seconds; on the re-encode that means a fresh stream from there. */
	function seekTo(t: number, force = false) {
		if (live) return;
		const target = Math.max(0, duration > 0 ? Math.min(t, duration - 1) : t);
		if (mode === 'fixed') {
			// Within what's already arrived, a plain seek is instant
			const local = target - offset;
			if (!force && local >= 0 && local <= bufferedEnd) {
				video.currentTime = local;
				return;
			}
			offset = target;
			currentTime = 0;
			buffering = true;
			video.src = fixedUrl(target);
			attemptPlay();
			return;
		}
		video.currentTime = target;
	}

	function skip(seconds: number) {
		if (!seekable) return;
		seekTo(position + seconds);
		showFlash(seconds < 0 ? 'back' : 'forward');
	}

	function showFlash(kind: typeof flash) {
		flash = kind;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 500);
	}

	function resetHideTimer() {
		showControls = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (playing && !dragging) showControls = false;
		}, 3000);
	}

	function togglePlay() {
		if (video.paused) {
			attemptPlay();
			showFlash('play');
		} else {
			video.pause();
			showFlash('pause');
		}
	}

	/**
	 * Mouse: click toggles play. Touch: a tap shows or hides the controls, and
	 * a double tap on either half skips like a phone player.
	 */
	function onSurfacePointer(e: PointerEvent) {
		if (e.pointerType === 'mouse') {
			togglePlay();
			return;
		}
		const rect = container.getBoundingClientRect();
		const side = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
		const now = Date.now();
		if (now - lastTap.time < 300 && lastTap.side === side) {
			skip(side * SKIP);
			lastTap = { time: 0, side: 0 };
			return;
		}
		lastTap = { time: now, side };
		if (showControls && playing) {
			showControls = false;
			clearTimeout(hideTimer);
		} else {
			resetHideTimer();
		}
	}

	function cancelNext() {
		clearInterval(countdownTimer);
		countdown = 0;
	}

	function playNext() {
		cancelNext();
		onPlayNext?.();
	}

	function onEnded() {
		if (live) return;
		// A re-encode that ends well short of the title lost its source mid-way;
		// pick up where it dropped rather than calling the film finished.
		if (mode === 'fixed' && duration > 0 && position < duration - 30) {
			seekTo(position, true);
			return;
		}
		// Mark the episode finished so it resumes from the start, not the last
		// periodic ping a few seconds short of the end.
		if (duration > 0 && isFinite(duration)) onProgress?.(duration, duration);
		if (!nextUp || !onPlayNext) return;
		showControls = true;
		countdown = NEXT_DELAY;
		clearInterval(countdownTimer);
		countdownTimer = setInterval(() => {
			countdown -= 1;
			if (countdown <= 0) playNext();
		}, 1000);
	}

	function toggleMute() {
		video.muted = !video.muted;
		if (!video.muted && video.volume === 0) video.volume = 1;
	}

	function pctAt(e: PointerEvent): number {
		const rect = bar!.getBoundingClientRect();
		return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
	}

	function onBarDown(e: PointerEvent) {
		if (!seekable) return;
		bar!.setPointerCapture(e.pointerId);
		dragging = true;
		dragPct = pctAt(e);
	}

	function onBarMove(e: PointerEvent) {
		if (!seekable) return;
		hoverPct = pctAt(e);
		if (dragging) dragPct = hoverPct;
	}

	function onBarUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		seekTo(pctAt(e) * duration);
		resetHideTimer();
	}

	function toggleFullscreen() {
		const isFs = document.fullscreenElement != null;
		if (!isFs) {
			if (container.requestFullscreen) container.requestFullscreen().catch(() => {});
			// iOS: only the video element itself can go fullscreen
			else (video as any).webkitEnterFullscreen?.();
		} else {
			document.exitFullscreen().catch(() => {});
		}
	}

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement).tagName;
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		switch (e.key) {
			case ' ':
			case 'k':
				e.preventDefault();
				togglePlay();
				break;
			case 'f':
				e.preventDefault();
				toggleFullscreen();
				break;
			case 'm':
				e.preventDefault();
				toggleMute();
				break;
			case 'n':
				if (nextUp && onPlayNext) {
					e.preventDefault();
					playNext();
				}
				break;
			case 'ArrowRight':
			case 'l':
				e.preventDefault();
				skip(SKIP);
				break;
			case 'ArrowLeft':
			case 'j':
				e.preventDefault();
				skip(-SKIP);
				break;
			case 'ArrowUp':
				e.preventDefault();
				video.muted = false;
				video.volume = Math.min(1, video.volume + 0.1);
				break;
			case 'ArrowDown':
				e.preventDefault();
				video.volume = Math.max(0, video.volume - 0.1);
				break;
			case 'Escape':
				if (!document.fullscreenElement && countdown === 0) onBack?.();
				break;
		}
		resetHideTimer();
	}

	function formatTime(s: number): string {
		if (!isFinite(s) || s < 0) return '--:--';
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = Math.floor(s % 60);
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	function updateBuffered() {
		const b = video.buffered;
		bufferedEnd = b.length ? b.end(b.length - 1) : 0;
	}

	const controlsVisible = $derived(
		(showControls || !playing || dragging) && status === 'playing' && countdown === 0
	);
</script>

<svelte:window onkeydown={onKey} />
<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement != null)} />

<div
	bind:this={container}
	class="relative h-full w-full overflow-hidden bg-black select-none {controlsVisible || status !== 'playing' ? '' : 'cursor-none'}"
	onpointermove={(e) => e.pointerType === 'mouse' && resetHideTimer()}
	onmouseleave={() => playing && !dragging && (showControls = false)}
	role="presentation"
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={video}
		class="h-full w-full object-contain"
		playsinline
		onplay={() => (playing = true)}
		onpause={() => {
			playing = false;
			showControls = true;
		}}
		ontimeupdate={() => {
			currentTime = video.currentTime;
			updateBuffered();
		}}
		onprogress={updateBuffered}
		ondurationchange={() => (nativeDuration = video.duration)}
		onvolumechange={() => {
			volume = video.volume;
			muted = video.muted;
			try {
				localStorage.setItem(VOLUME_KEY, String(video.volume));
				localStorage.setItem(MUTED_KEY, video.muted ? '1' : '0');
			} catch {
				// Private mode: the setting just won't stick
			}
		}}
		onwaiting={() => {
			if (status === 'playing') buffering = true;
		}}
		onplaying={() => {
			status = 'playing';
			buffering = false;
			fixedRetries = 0;
		}}
		onloadedmetadata={onLoadedMetadata}
		onended={onEnded}
		onerror={() => {
			// The re-encode's source dropped mid-play: reconnect where it left off
			if (status === 'playing' && mode === 'fixed' && !live && fixedRetries++ < 3) {
				seekTo(position, true);
			}
		}}
	></video>

	<!-- Click/tap surface over the picture, under the controls -->
	<div class="absolute inset-0" onpointerup={onSurfacePointer} role="presentation"></div>

	{#if status === 'loading'}
		<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/60">
			<div class="h-14 w-14 animate-spin rounded-full border-[3px] border-accent border-t-transparent"></div>
			{#if title}
				<p class="mt-5 max-w-md truncate px-6 text-center text-lg font-semibold text-white">{title}</p>
			{/if}
			{#if subtitle}
				<p class="mt-1 max-w-md truncate px-6 text-center text-sm text-zinc-400">{subtitle}</p>
			{/if}
		</div>
	{:else if status === 'error'}
		<div class="absolute inset-0 flex items-center justify-center bg-black/85">
			<div class="max-w-md px-6 text-center">
				<svg class="mx-auto mb-3 h-12 w-12 text-zinc-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
				</svg>
				<p class="text-base font-semibold text-zinc-100">Couldn't play this stream</p>
				<p class="mt-1 text-sm text-zinc-500">
					The format may not be supported for web playback, or the stream is offline.
				</p>
				<div class="mt-5 flex justify-center gap-2">
					<button
						onclick={() => start(position || initialPosition)}
						class="rounded bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/80"
					>
						Try again
					</button>
					{#if onBack}
						<button
							onclick={onBack}
							class="rounded bg-white/15 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/25"
						>
							Go back
						</button>
					{/if}
				</div>
				{#if debugInfo.length}
					<details class="mt-4 text-left">
						<summary class="cursor-pointer text-xs text-zinc-600 hover:text-zinc-400">Technical details</summary>
						<div class="mt-2 rounded-lg bg-black/50 p-2">
							{#each debugInfo as msg, i (i)}
								<p class="truncate font-mono text-[11px] text-zinc-500">{msg}</p>
							{/each}
						</div>
					</details>
				{/if}
			</div>
		</div>
	{/if}

	{#if buffering && status === 'playing'}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="h-14 w-14 animate-spin rounded-full border-[3px] border-accent border-t-transparent drop-shadow"></div>
		</div>
	{/if}

	<!-- Netflix-style flash of what a click or key just did -->
	{#if flash}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="animate-ping-once flex h-20 w-20 items-center justify-center rounded-full bg-black/50 text-white">
				{#if flash === 'play'}
					<svg class="ml-1 h-10 w-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
				{:else if flash === 'pause'}
					<svg class="h-10 w-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
				{:else}
					<span class="text-lg font-bold">{flash === 'back' ? '−' : '+'}{SKIP}s</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if needsGesture}
		<div class="absolute inset-0 flex items-center justify-center bg-black/60">
			<button
				onclick={() => {
					needsGesture = false;
					attemptPlay();
				}}
				class="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 text-black shadow-2xl transition-transform hover:scale-105"
				title="Play"
			>
				<svg class="ml-1 h-9 w-9" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
			</button>
		</div>
	{/if}

	{#if toast}
		<div class="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm text-zinc-200 backdrop-blur">
			{toast}
		</div>
	{/if}

	{#if audioSilent && !audioNoticeDismissed && status === 'playing'}
		<div class="absolute top-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 py-1.5 pr-2 pl-4 text-xs text-zinc-300 backdrop-blur">
			<span>
				No audio? {audioTracks.length > 1
					? 'Try another audio track from the controls below.'
					: "This stream's audio couldn't be played."}
			</span>
			{#if transcode && mode === 'native'}
				<button onclick={switchToFixed} class="rounded-full bg-white px-2.5 py-0.5 font-semibold text-black hover:bg-white/80">
					Fix audio
				</button>
			{/if}
			<button
				onclick={() => (audioNoticeDismissed = true)}
				class="rounded-full p-0.5 text-zinc-500 hover:text-white"
				title="Dismiss"
			>
				<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
			</button>
		</div>
	{/if}

	{#if countdown > 0 && nextUp}
		<div class="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 sm:p-10">
			<div class="w-full max-w-sm rounded-md bg-zinc-900/95 p-4 shadow-2xl ring-1 ring-white/10">
				<p class="text-xs font-semibold tracking-widest text-zinc-400 uppercase">Next episode</p>
				<div class="mt-3 flex items-center gap-3">
					{#if nextUp.image}
						<img src={nextUp.image} alt="" class="h-16 w-28 shrink-0 rounded bg-zinc-800 object-cover" />
					{/if}
					<p class="min-w-0 flex-1 text-sm font-semibold text-zinc-100">{nextUp.title}</p>
				</div>
				<div class="mt-4 flex gap-2">
					<button
						onclick={playNext}
						class="relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded bg-white px-4 py-2 text-sm font-bold text-black"
					>
						<span
							class="absolute inset-y-0 left-0 bg-zinc-300 transition-[width] duration-1000 ease-linear"
							style="width: {((NEXT_DELAY - countdown) / NEXT_DELAY) * 100}%"
						></span>
						<svg class="relative h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
						<span class="relative">Play in {countdown}s</span>
					</button>
					<button
						onclick={cancelNext}
						class="rounded bg-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/25"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Top bar: back, title, actions -->
	<div
		class="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 pt-3 pb-10 transition-opacity duration-300 sm:px-6 sm:pt-5
			{controlsVisible || status !== 'playing' ? 'opacity-100' : 'pointer-events-none opacity-0'}"
	>
		{#if onBack}
			<button onclick={onBack} class="rounded-full p-2 text-white transition-transform hover:scale-110" title="Back" aria-label="Back">
				<svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
				</svg>
			</button>
		{/if}
		<div class="min-w-0 flex-1">
			{#if title}<p class="truncate text-base font-semibold text-white sm:text-lg">{title}</p>{/if}
			{#if subtitle}<p class="truncate text-xs text-zinc-300 sm:text-sm">{subtitle}</p>{/if}
		</div>
		{#if actions}{@render actions()}{/if}
	</div>

	<!-- Bottom controls -->
	<div
		class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pt-16 pb-3 transition-opacity duration-300 sm:px-6 sm:pb-5
			{controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}"
	>
		{#if seekable}
			<div class="flex items-center gap-3">
				<div
					bind:this={bar}
					class="group/prog relative flex h-5 flex-1 cursor-pointer touch-none items-center"
					onpointerdown={onBarDown}
					onpointermove={onBarMove}
					onpointerup={onBarUp}
					onpointerleave={() => (hoverPct = null)}
					role="slider"
					tabindex="-1"
					aria-label="Seek"
					aria-valuemin={0}
					aria-valuemax={Math.round(duration)}
					aria-valuenow={Math.round(position)}
				>
					<div class="relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover/prog:h-1.5 {dragging ? 'h-1.5' : ''}">
						<div class="absolute inset-y-0 left-0 rounded-full bg-white/35" style="width: {bufferedPct * 100}%"></div>
						<div class="absolute inset-y-0 left-0 rounded-full bg-accent" style="width: {shownPct * 100}%"></div>
						<div
							class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow transition-transform group-hover/prog:scale-125 {dragging ? 'scale-125' : ''}"
							style="left: {shownPct * 100}%"
						></div>
					</div>
					{#if hoverPct != null || dragging}
						{@const pct = dragging ? dragPct : (hoverPct ?? 0)}
						<div
							class="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded bg-black/90 px-2 py-0.5 text-xs font-medium text-white tabular-nums"
							style="left: clamp(1.5rem, {pct * 100}%, calc(100% - 1.5rem))"
						>
							{formatTime(pct * duration)}
						</div>
					{/if}
				</div>
				<span class="w-16 text-right text-xs text-white tabular-nums sm:text-sm">
					{formatTime(Math.max(0, duration - (dragging ? dragPct * duration : position)))}
				</span>
			</div>
		{/if}

		<div class="mt-1 flex items-center gap-1 sm:gap-3">
			<button onclick={togglePlay} class="rounded-full p-1.5 text-white transition-transform hover:scale-110" title={playing ? 'Pause (k)' : 'Play (k)'}>
				{#if playing}
					<svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
				{:else}
					<svg class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
				{/if}
			</button>

			{#if seekable}
				<button onclick={() => skip(-SKIP)} class="rounded-full p-1.5 text-white transition-transform hover:scale-110" title="Back {SKIP}s (←)">
					<svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
					</svg>
				</button>
				<button onclick={() => skip(SKIP)} class="rounded-full p-1.5 text-white transition-transform hover:scale-110" title="Forward {SKIP}s (→)">
					<svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
					</svg>
				</button>
			{/if}

			<div class="group/vol flex items-center">
				<button onclick={toggleMute} class="rounded-full p-1.5 text-white transition-transform hover:scale-110" title="Mute (m)">
					{#if muted || volume === 0}
						<svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
					{:else}
						<svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
					{/if}
				</button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={muted ? 0 : volume}
					oninput={(e) => {
						const v = parseFloat(e.currentTarget.value);
						video.volume = v;
						video.muted = v === 0;
					}}
					class="hidden h-1 w-0 accent-white opacity-0 transition-all duration-200 group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100 sm:block"
					aria-label="Volume"
				/>
			</div>

			{#if live}
				<span class="ml-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-white">
					<span class="h-2 w-2 animate-pulse rounded-full bg-accent"></span>
					LIVE
				</span>
			{/if}

			<div class="min-w-0 flex-1 truncate px-2 text-center text-sm text-zinc-300 max-md:hidden">
				{#if title}<span class="font-semibold text-white">{title}</span>{/if}
				{#if subtitle}<span class="ml-2">{subtitle}</span>{/if}
			</div>
			<div class="flex-1 md:hidden"></div>

			{#if nextUp && onPlayNext}
				<button onclick={playNext} class="rounded-full p-1.5 text-white transition-transform hover:scale-110" title="Next episode (n)">
					<svg class="h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5v14l9-7zM16 5h3v14h-3z" /></svg>
				</button>
			{/if}

			{#if mode === 'native' && audioTracks.length > 1}
				<select
					value={currentAudioTrack}
					onchange={(e) => switchAudioTrack(Number(e.currentTarget.value))}
					class="max-w-28 rounded border border-white/20 bg-black/70 px-2 py-1 text-xs text-white outline-none"
					title="Audio track"
				>
					{#each audioTracks as track (track.id)}
						<option value={track.id}>{track.name}</option>
					{/each}
				</select>
			{:else if mode === 'fixed' && fixedTracks.length > 1}
				<select
					value={fixedTrack}
					onchange={(e) => switchFixedTrack(Number(e.currentTarget.value))}
					class="max-w-28 rounded border border-white/20 bg-black/70 px-2 py-1 text-xs text-white outline-none"
					title="Audio track"
				>
					{#each fixedTracks as track (track.index)}
						<option value={track.index}>{track.name}</option>
					{/each}
				</select>
			{/if}

			<button onclick={toggleFullscreen} class="rounded-full p-1.5 text-white transition-transform hover:scale-110" title="Fullscreen (f)">
				{#if fullscreen}
					<svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
				{:else}
					<svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
				{/if}
			</button>
		</div>
	</div>
</div>
