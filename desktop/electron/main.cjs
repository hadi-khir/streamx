// The Windows and Linux app: runs the site on this machine and shows it in a window.
// On a Mac, Streamer.swift does the same job with the system's WebKit.
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const { mkdirSync, openSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

// The port is fixed so the page's saved settings (kept per address) survive from one launch to the next
const PORT = 47831;
const SITE = `http://127.0.0.1:${PORT}`;
const INK = '#14110f';

// Up-next autoplay and resume shouldn't wait on a click
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let server = null;

// Two copies would fight over the port
if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', () => {
		if (win?.isMinimized()) win.restore();
		win?.focus();
	});
	app.whenReady().then(() => {
		createWindow();
		startServer();
		loadWhenServing();
	});
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => server?.kill());

// MARK: Server

/** Where the database, catalog cache, settings and log live: %APPDATA%\Streamer, or ~/.config/Streamer. */
const dataFolder = () => app.getPath('userData');

function startServer() {
	if (server && server.exitCode === null) return;
	const data = dataFolder();
	mkdirSync(data, { recursive: true });
	const log = openSync(join(data, 'server.log'), 'w');
	const resources = process.resourcesPath;
	server = spawn(
		join(resources, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'),
		// Optional settings such as TMDB_API_KEY; what's set below wins over the file
		[`--env-file-if-exists=${join(data, '.env')}`, 'main.mjs'],
		{
			cwd: join(resources, 'server'),
			env: {
				...process.env,
				NODE_ENV: 'production',
				HOST: '127.0.0.1',
				PORT: String(PORT),
				ORIGIN: SITE,
				DATABASE_URL: join(data, 'streamer.db')
			},
			// The server ends when its stdin closes, so it can't outlive the app however the app ends
			stdio: ['pipe', log, log],
			windowsHide: true
		}
	);
	server.on('error', (error) => console.error("Streamer's server didn't start:", error));
}

/** The server takes a moment to come up; the launch page covers the wait. */
async function loadWhenServing() {
	for (let attempt = 0; attempt < 100 && server.exitCode === null; attempt++) {
		try {
			await fetch(`${SITE}/login`, { signal: AbortSignal.timeout(2000) });
			break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
	load(SITE);
}

// MARK: Window

function createWindow() {
	win = new BrowserWindow({
		width: 1280,
		height: 800,
		title: 'Streamer',
		backgroundColor: INK,
		autoHideMenuBar: true,
		// Windows takes the icon from the app itself
		icon: process.platform === 'linux' ? join(process.resourcesPath, 'icon.png') : undefined
	});
	Menu.setApplicationMenu(buildMenu());
	showLaunchPage();

	const contents = win.webContents;
	// Links that ask for a new window open in this one, and other sites in the real browser
	contents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith(SITE)) load(url);
		else openOutside(url);
		return { action: 'deny' };
	});
	contents.on('will-navigate', (event, url) => {
		if (url.startsWith(SITE)) return;
		event.preventDefault();
		openOutside(url);
	});
	contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
		// -3 is a load that was stopped, as when a click turns into a download
		if (isMainFrame && code !== -3) showErrorPage();
	});
	contents.on('render-process-gone', () => reload());

	// Electron asks where to save; movies take a while, so the taskbar shows how far along they are
	session.defaultSession.on('will-download', (_event, item) => {
		item.on('updated', () => {
			const total = item.getTotalBytes();
			win?.setProgressBar(total > 0 ? item.getReceivedBytes() / total : 2);
		});
		item.once('done', () => win?.setProgressBar(-1));
	});
}

/** A failed load shows up in did-fail-load, so the promise has nothing to add. */
function load(url) {
	win.loadURL(url).catch(() => {});
}

function openOutside(url) {
	if (/^https?:/.test(url)) shell.openExternal(url);
}

function reload() {
	// After a failed load the current page is the error page, not the site
	if (win.webContents.getURL().startsWith(SITE) && server?.exitCode === null) {
		win.webContents.reload();
	} else {
		showLaunchPage();
		startServer();
		loadWhenServing();
	}
}

function buildMenu() {
	const history = () => win.webContents.navigationHistory;
	return Menu.buildFromTemplate([
		{ role: 'fileMenu' },
		{ role: 'editMenu' },
		{
			label: 'View',
			submenu: [
				{ label: 'Reload', accelerator: 'CmdOrCtrl+R', click: reload },
				{ label: 'Back', accelerator: 'Alt+Left', click: () => history().canGoBack() && history().goBack() },
				{ label: 'Forward', accelerator: 'Alt+Right', click: () => history().canGoForward() && history().goForward() },
				{ type: 'separator' },
				{ role: 'togglefullscreen' }
			]
		}
	]);
}

// MARK: Pages of its own

/** The site's logo, drawn on the same ink as the window, so only the lines show. */
function logo(size) {
	const svg = readFileSync(join(process.resourcesPath, 'server', 'build', 'client', 'favicon.svg'));
	return `<img src="data:image/svg+xml;base64,${svg.toString('base64')}" width="${size}" height="${size}" alt="">`;
}

function showPage(body) {
	const html = `<!doctype html><title>Streamer</title>
		<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;
			background:${INK};color:#cfc5b4;font:15px system-ui,sans-serif">${body}</body>`;
	load(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function showLaunchPage() {
	showPage(`<div style="display:flex;align-items:center;gap:8px;color:#f3ede2;font:500 44px 'Iowan Old Style',Georgia,serif">
		${logo(72)}Streamer</div>`);
}

function showErrorPage() {
	showPage(`<div><h2 style="color:#f3ede2;font:500 26px 'Iowan Old Style',Georgia,serif">Streamer didn't start</h2>
		<p>Press Ctrl+R to try again. If it keeps happening, the reason is in<br>${join(dataFolder(), 'server.log')}</p></div>`);
}
