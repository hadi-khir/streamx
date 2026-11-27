// Builds the Windows or Linux app, for the system this runs on: the site, the Node that runs
// it, and an Electron window onto it. Run `npm ci` here and in the repo root first. The Mac
// app is ../build.sh instead. ffmpeg comes from the system at run time.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const stage = join(here, 'stage');
const version = process.env.VERSION || JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
const windows = process.platform === 'win32';
const run = (command, cwd = root, env = process.env) => execSync(command, { cwd, env, stdio: 'inherit' });

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'bin'), { recursive: true });

// The app carries its own Node, so the system's can't break the database module
const nodeDist = 'https://nodejs.org/dist/latest-v22.x';
const [platform, ext] = windows ? ['win', 'zip'] : [process.platform, 'tar.gz'];
const sums = await (await fetch(`${nodeDist}/SHASUMS256.txt`)).text();
const [sum, archive] = sums
	.split('\n')
	.map((line) => line.split(/\s+/))
	.find(([, name]) => name?.endsWith(`-${platform}-${process.arch}.${ext}`)) ?? [];
if (!archive) throw new Error(`No Node for ${platform}-${process.arch}`);
const download = Buffer.from(await (await fetch(`${nodeDist}/${archive}`)).arrayBuffer());
if (createHash('sha256').update(download).digest('hex') !== sum) throw new Error("Node download doesn't match its checksum");
writeFileSync(join(stage, archive), download);
// Windows' own tar reads zip files; Git's, which may come first on the PATH, doesn't
run(`${windows ? `"${process.env.SystemRoot}\\System32\\tar.exe"` : 'tar'} -xf ${archive}`, stage);
const nodeFolder = join(stage, archive.slice(0, -ext.length - 1));
const nodeBin = windows ? nodeFolder : join(nodeFolder, 'bin');
const nodeExe = windows ? 'node.exe' : 'node';
cpSync(join(nodeBin, nodeExe), join(stage, 'bin', nodeExe));

// The site, with its native modules installed for that Node rather than this one
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
const withNode = { ...process.env, [pathKey]: nodeBin + delimiter + process.env[pathKey] };
const server = join(stage, 'server');
run('npm run build');
for (const name of ['build', 'drizzle', 'package.json', 'package-lock.json']) {
	cpSync(join(root, name), join(server, name), { recursive: true });
}
cpSync(join(here, '..', 'server.mjs'), join(server, 'main.mjs'));
// better-sqlite3 loads its own prebuilt binaries; without --ignore-scripts npm would also
// compile it, which on Windows needs Visual Studio
run('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', server, withNode);
rmSync(join(server, '.svelte-kit'), { recursive: true, force: true });

// The icon is the site's favicon, drawn large
const favicon = readFileSync(join(root, 'static', 'favicon.svg'), 'utf8');
writeFileSync(join(stage, 'icon.png'), new Resvg(favicon, { fitTo: { mode: 'width', value: 1024 } }).render().asPng());

const target = process.platform === 'win32' ? '--win' : '--linux';
run(`npx electron-builder ${target} --publish never -c.extraMetadata.version=${version}`, here);
