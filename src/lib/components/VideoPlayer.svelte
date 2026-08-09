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
		onProgress
	}: {
		attempts: Attempt[];
		live?: boolean;
		initialPosition?: number;
		onProgress?: (position: number, duration: number) => void;
	} = $props();

	let video: HTMLVideoElement;
	let container: HTMLDivElement;
	let hls: Hls | null = null;

	let status = $state<'loading' | 'playing' | 'error'>('loading');
	let statusMsg = $state('Connecting…');
	let debugInfo = $state<string[]>([]);
	let playing = $state(false);
	let muted = $state(false);
	let volume = $state(1);
	let currentTime = $state(0);
	let duration = $state(0);
	let fullscreen = $state(false);
	let showControls = $state(true);

	let attempt = 0; // generation counter to invalidate stale callbacks
	let seeked = false;
	let hideTimer: ReturnType<typeof setTimeout>;
	let progressTimer: ReturnType<typeof setInterval>;

	function cleanup() {
		if (hls) {
			hls.destroy();
			hls = null;
		}
	}

	function tryHls(url: string, onSuccess: () => void, onFail: () => void) {
		cleanup();

		if (!Hls.isSupported()) {
			// Safari native HLS
			if (video.canPlayType('application/vnd.apple.mpegurl')) {
				tryDirect(url, onSuccess, onFail);
				return;
			}
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
			video.play().catch(() => {});
		});

		instance.on(Hls.Events.ERROR, (_, data) => {
			const detail = `${data.type}/${data.details}${data.response ? ` (${data.response.code})` : ''}`;
			debugInfo = [...debugInfo.slice(-4), detail];

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
				instance.destroy();
				if (hls === instance) hls = null;
				onFail();
			}
		}, 12_000);
	}

	function tryDirect(url: string, onSuccess: () => void, onFail: () => void) {
		cleanup();
		let settled = false;

		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			video.removeEventListener('canplay', onCanPlay);
			video.removeEventListener('error', onErr);
			if (ok) {
				onSuccess();
				video.play().catch(() => {});
			} else {
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
		statusMsg = 'Connecting to stream…';
		debugInfo = [];
		seeked = false;
		attempt++;
		const generation = attempt;
		const stale = () => attempt !== generation;

		let idx = 0;
		const tryNext = () => {
			if (stale()) return;
			if (idx >= attempts.length) {
				status = 'error';
				statusMsg = 'Could not play this stream. The server may not support web playback for this format.';
				return;
			}
			const current = attempts[idx++];
			statusMsg = `Trying ${current.label}… (${idx}/${attempts.length})`;

			const onSuccess = () => {
				if (!stale()) status = 'playing';
			};
			const onFail = () => {
				if (!stale()) tryNext();
			};

			if (current.method === 'hls') tryHls(current.url, onSuccess, onFail);
			else tryDirect(current.url, onSuccess, onFail);
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

	// Periodic progress reporting for VOD
	$effect(() => {
		if (!onProgress || live) return;
		progressTimer = setInterval(() => {
			if (video && video.currentTime > 0 && isFinite(video.duration)) {
				onProgress(video.currentTime, video.duration);
			}
		}, 10_000);
		return () => clearInterval(progressTimer);
	});

	onDestroy(() => {
		clearTimeout(hideTimer);
		cleanup();
	});

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
		if (video.paused) video.play().catch(() => {});
		else video.pause();
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
		if ((e.target as HTMLElement).tagName === 'INPUT') return;
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
		}}
		onwaiting={() => {
			if (status === 'playing') statusMsg = 'Buffering…';
		}}
		onplaying={() => (status = 'playing')}
		onloadedmetadata={onLoadedMetadata}
	></video>

	{#if status === 'loading'}
		<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/70">
			<div class="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			<p class="text-sm text-zinc-400">{statusMsg}</p>
			{#each debugInfo as msg, i (i)}
				<p class="mt-1 max-w-md truncate text-xs text-red-400/70">{msg}</p>
			{/each}
		</div>
	{:else if status === 'error'}
		<div class="absolute inset-0 flex items-center justify-center bg-black/80">
			<div class="max-w-md px-6 text-center">
				<svg class="mx-auto mb-3 h-12 w-12 text-zinc-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
				</svg>
				<p class="mb-2 text-sm text-zinc-300">{statusMsg}</p>
				{#each debugInfo as msg, i (i)}
					<p class="truncate text-xs text-red-400/70">{msg}</p>
				{/each}
				<button
					onclick={start}
					class="mt-4 rounded-lg bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent-hover"
				>
					Retry
				</button>
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
