<script lang="ts">
	import Hls from 'hls.js';
	import { onDestroy } from 'svelte';

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
		onPlayNext
	}: {
		attempts: Attempt[];
		live?: boolean;
		initialPosition?: number;
		onProgress?: (position: number, duration: number) => void;
		/** Shown as an up-next card when playback ends; omit to disable autoplay. */
		nextUp?: { title: string; image: string | null } | null;
		onPlayNext?: () => void;
	} = $props();

	/** Seconds the up-next card counts down before playing automatically. */
	const NEXT_DELAY = 10;

	const VOLUME_KEY = 'streamx:volume';
	const MUTED_KEY = 'streamx:muted';

	let video: HTMLVideoElement;
	let container: HTMLDivElement;
	let hls: Hls | null = null;

	let status = $state<'loading' | 'playing' | 'error'>('loading');
	let buffering = $state(false);
	let needsGesture = $state(false);
	let debugInfo = $state<string[]>([]);
	let playing = $state(false);
	let muted = $state(false);
	let volume = $state(1);
	let currentTime = $state(0);
	let duration = $state(0);
	let fullscreen = $state(false);
	let showControls = $state(true);

	// Audio handling
	let audioSilent = $state(false);
	let audioNoticeDismissed = $state(false);
	let audioTracks = $state<{ id: number; name: string }[]>([]);
	let currentAudioTrack = $state(-1);
	let audioCheckGen = $state(0);

	let countdown = $state(0);

	let attempt = 0; // generation counter to invalidate stale callbacks
	let seeked = false;
	let hideTimer: ReturnType<typeof setTimeout>;
	let audioCheckTimer: ReturnType<typeof setTimeout>;
	let countdownTimer: ReturnType<typeof setInterval>;

	function log(line: string) {
		debugInfo = [...debugInfo.slice(-7), line];
	}

	function cleanup() {
		if (hls) {
			hls.destroy();
			hls = null;
		}
	}

	function attemptPlay() {
		video.play().catch((e) => {
			// Autoplay with sound blocked: surface a tap-to-play button instead of hanging
			if (e?.name === 'NotAllowedError') needsGesture = true;
		});
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

	function tryDirect(label: string, url: string, onSuccess: () => void, onFail: () => void) {
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
				onFail();
			}
		};
		const onCanPlay = () => finish(true);
		const onErr = () => finish(false);

		video.addEventListener('canplay', onCanPlay);
		video.addEventListener('error', onErr);
		video.src = url;
		video.load();

		setTimeout(() => finish(false), 15_000);
	}

	function start() {
		status = 'loading';
		buffering = false;
		needsGesture = false;
		debugInfo = [];
		audioSilent = false;
		audioNoticeDismissed = false;
		audioTracks = [];
		currentAudioTrack = -1;
		seeked = false;
		cancelNext();
		attempt++;
		const generation = attempt;
		const stale = () => attempt !== generation;

		let idx = 0;
		const tryNext = () => {
			if (stale()) return;
			if (idx >= attempts.length) {
				status = 'error';
				return;
			}
			const current = attempts[idx++];

			const onSuccess = () => {
				if (!stale()) status = 'playing';
			};
			const onFail = () => {
				if (!stale()) tryNext();
			};

			if (current.method === 'hls') tryHls(current.label, current.url, onSuccess, onFail);
			else tryDirect(current.label, current.url, onSuccess, onFail);
		};
		tryNext();
	}

	$effect(() => {
		attempts; // restart when the attempt list changes
		start();
		return () => {
			attempt++;
			cleanup();
		};
	});

	// Restore persisted volume/mute once
	$effect(() => {
		const savedVolume = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
		if (isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) video.volume = savedVolume;
		video.muted = localStorage.getItem(MUTED_KEY) === '1';
	});

	// Detect video that plays without any decoded audio (e.g. AC-3 in Chrome)
	$effect(() => {
		audioCheckGen; // re-check after an audio track switch
		if (status !== 'playing' || muted || volume === 0) {
			audioSilent = false;
			return;
		}
		audioCheckTimer = setTimeout(() => {
			const v = video as any;
			if (typeof v.webkitAudioDecodedByteCount === 'number') {
				audioSilent = v.webkitAudioDecodedByteCount === 0;
			} else if (typeof v.mozHasAudio === 'boolean') {
				audioSilent = !v.mozHasAudio;
			}
		}, 5000);
		return () => clearTimeout(audioCheckTimer);
	});

	// Periodic progress reporting for VOD
	$effect(() => {
		if (!onProgress || live) return;
		const timer = setInterval(() => {
			if (video && video.currentTime > 0 && isFinite(video.duration)) {
				onProgress(video.currentTime, video.duration);
			}
		}, 10_000);
		return () => clearInterval(timer);
	});

	onDestroy(() => {
		clearTimeout(hideTimer);
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

	function onLoadedMetadata() {
		if (!seeked && !live && initialPosition > 0 && video.duration > 0 && initialPosition < video.duration - 5) {
			video.currentTime = initialPosition;
			seeked = true;
		}
	}

	function resetHideTimer() {
		showControls = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (playing) showControls = false;
		}, 3000);
	}

	function togglePlay() {
		if (video.paused) attemptPlay();
		else video.pause();
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
		// Mark the episode finished so it resumes from the start, not the last
		// periodic ping a few seconds short of the end.
		if (isFinite(video.duration) && video.duration > 0) onProgress?.(video.duration, video.duration);
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
	}

	function seek(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		video.currentTime = pct * duration;
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
		if (tag === 'INPUT' || tag === 'SELECT') return;
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
			case 'ArrowRight':
				e.preventDefault();
				video.currentTime += 10;
				break;
			case 'ArrowLeft':
				e.preventDefault();
				video.currentTime -= 10;
				break;
			case 'ArrowUp':
				e.preventDefault();
				video.volume = Math.min(1, video.volume + 0.1);
				break;
			case 'ArrowDown':
				e.preventDefault();
				video.volume = Math.max(0, video.volume - 0.1);
				break;
		}
		resetHideTimer();
	}

	function formatTime(s: number): string {
		if (!isFinite(s)) return '--:--';
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = Math.floor(s % 60);
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}
</script>

<svelte:window onkeydown={onKey} />
<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement != null)} />

<div
	bind:this={container}
	class="group relative aspect-video w-full bg-black"
	onmousemove={resetHideTimer}
	onmouseleave={() => playing && (showControls = false)}
	role="presentation"
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={video}
		class="h-full w-full"
		playsinline
		onclick={togglePlay}
		onplay={() => (playing = true)}
		onpause={() => (playing = false)}
		ontimeupdate={() => (currentTime = video.currentTime)}
		ondurationchange={() => (duration = video.duration)}
		onvolumechange={() => {
			volume = video.volume;
			muted = video.muted;
			localStorage.setItem(VOLUME_KEY, String(video.volume));
			localStorage.setItem(MUTED_KEY, video.muted ? '1' : '0');
		}}
		onwaiting={() => {
			if (status === 'playing') buffering = true;
		}}
		onplaying={() => {
			status = 'playing';
			buffering = false;
		}}
		onloadedmetadata={onLoadedMetadata}
		onended={onEnded}
	></video>

	{#if status === 'loading'}
		<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/70">
			<div class="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			<p class="text-sm text-zinc-400">Loading stream…</p>
		</div>
	{:else if status === 'error'}
		<div class="absolute inset-0 flex items-center justify-center bg-black/80">
			<div class="max-w-md px-6 text-center">
				<svg class="mx-auto mb-3 h-12 w-12 text-zinc-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
				</svg>
				<p class="text-sm font-medium text-zinc-200">Couldn't play this stream</p>
				<p class="mt-1 text-xs text-zinc-500">
					The format may not be supported for web playback, or the stream is offline.
				</p>
				<button
					onclick={start}
					class="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent-hover"
				>
					Try again
				</button>
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
			<div class="h-10 w-10 animate-spin rounded-full border-2 border-white/60 border-t-transparent drop-shadow"></div>
		</div>
	{/if}

	{#if needsGesture}
		<div class="absolute inset-0 flex items-center justify-center bg-black/60">
			<button
				onclick={() => {
					needsGesture = false;
					attemptPlay();
				}}
				class="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-white shadow-2xl transition-transform hover:scale-105"
				title="Play"
			>
				<svg class="ml-1 h-9 w-9" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
			</button>
		</div>
	{/if}

	{#if audioSilent && !audioNoticeDismissed && status === 'playing'}
		<div class="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 py-1.5 pr-2 pl-3 text-xs text-zinc-300 backdrop-blur">
			<span>
				No audio? {audioTracks.length > 1
					? 'Try another audio track from the controls below.'
					: "This stream's audio codec may not be supported by your browser."}
			</span>
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
		<div class="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
			<div class="w-full max-w-sm rounded-2xl border border-surface-800 bg-surface-900/95 p-4 shadow-2xl">
				<p class="text-xs font-medium tracking-wide text-zinc-500 uppercase">Up next</p>
				<div class="mt-3 flex items-center gap-3">
					{#if nextUp.image}
						<img src={nextUp.image} alt="" class="h-14 w-24 shrink-0 rounded-lg bg-surface-800 object-cover" />
					{/if}
					<p class="min-w-0 flex-1 text-sm font-medium text-zinc-100">{nextUp.title}</p>
				</div>
				<div class="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
					<div
						class="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
						style="width: {(countdown / NEXT_DELAY) * 100}%"
					></div>
				</div>
				<div class="mt-4 flex gap-2">
					<button
						onclick={playNext}
						class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
					>
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
						Play now
					</button>
					<button
						onclick={cancelNext}
						class="rounded-lg border border-surface-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-white"
					>
						Cancel
					</button>
				</div>
				<p class="mt-3 text-center text-xs text-zinc-500">
					Playing in {countdown}s
				</p>
			</div>
		</div>
	{/if}

	<!-- Controls -->
	<div
		class="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pt-12 transition-opacity duration-300
			{showControls && status === 'playing' ? 'opacity-100' : 'pointer-events-none opacity-0'}"
	>
		{#if !live && duration > 0 && isFinite(duration)}
			<div class="group/prog mb-3 cursor-pointer" onclick={seek} role="presentation">
				<div class="h-1 rounded-full bg-white/20 transition-all group-hover/prog:h-1.5">
					<div class="relative h-full rounded-full bg-accent" style="width: {(currentTime / duration) * 100}%">
						<div class="absolute top-1/2 right-0 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover/prog:opacity-100"></div>
					</div>
				</div>
			</div>
		{/if}

		<div class="flex items-center gap-3">
			<button onclick={togglePlay} class="text-white transition-colors hover:text-accent" title={playing ? 'Pause (k)' : 'Play (k)'}>
				{#if playing}
					<svg class="h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
				{:else}
					<svg class="h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
				{/if}
			</button>

			{#if nextUp && onPlayNext}
				<button onclick={playNext} class="text-white transition-colors hover:text-accent" title="Next episode">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5v14l9-7zM16 5h3v14h-3z" /></svg>
				</button>
			{/if}

			{#if live}
				<span class="flex items-center gap-1.5 text-xs text-red-400">
					<span class="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
					LIVE
				</span>
			{:else}
				<span class="text-xs text-white/70 tabular-nums">
					{formatTime(currentTime)} / {formatTime(duration)}
				</span>
			{/if}

			<div class="flex-1"></div>

			{#if audioTracks.length > 1}
				<select
					value={currentAudioTrack}
					onchange={(e) => switchAudioTrack(Number(e.currentTarget.value))}
					class="max-w-32 rounded-lg border border-white/20 bg-black/60 px-2 py-1 text-xs text-white outline-none"
					title="Audio track"
				>
					{#each audioTracks as track (track.id)}
						<option value={track.id}>{track.name}</option>
					{/each}
				</select>
			{/if}

			<button onclick={toggleMute} class="text-white transition-colors hover:text-accent" title="Mute (m)">
				{#if muted || volume === 0}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
				{:else}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
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
					if (v > 0) video.muted = false;
				}}
				class="h-1 w-20 accent-accent"
			/>

			<button onclick={toggleFullscreen} class="text-white transition-colors hover:text-accent" title="Fullscreen (f)">
				{#if fullscreen}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
				{:else}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
				{/if}
			</button>
		</div>
	</div>
</div>
