# StreamX

A self-hosted IPTV player for Xtream Codes providers, rebuilt on a modern stack.
Successor to [iptv-player](https://github.com/hadi-khir/iptv-player).

## Features

- **Live TV** — category browsing with a lazy-loaded now/next program guide (EPG) per channel
- **Movies & Series** — full VOD catalog with detail pages, season/episode navigation
- **TMDB enrichment** — posters, backdrops, ratings, and plots when a `TMDB_API_KEY` is set
- **Continue watching** — resume positions sync server-side and surface on the home screen
- **Favorites & history** — per user, across multiple provider connections
- **Search** — one query across live channels, movies, and series
- **Multi-user** — session-based auth (argon2 + httpOnly cookies), each user brings their own connections
- **Credential-safe streaming** — all streams proxy through the backend; provider URLs and
  passwords never reach the browser. HLS playlists are rewritten on the fly, VOD supports
  Range requests for seeking.

## Stack

SvelteKit 2 + Svelte 5 (runes) · TypeScript · Tailwind CSS 4 · Drizzle ORM + better-sqlite3 · hls.js · adapter-node

## Quick start (development)

```bash
npm install
npm run dev
```

Open http://localhost:5173, register an account, then add your Xtream Codes connection
(server URL, username, password) under Settings.

## Docker

```bash
docker compose up -d --build
```

The app listens on port 3000; the SQLite database lands in `./data`. Set `ORIGIN` to your
public URL (e.g. `https://tv.example.com`) and optionally `TMDB_API_KEY` — see
[.env.example](.env.example).

## Environment variables

| Variable       | Default            | Purpose                                        |
| -------------- | ------------------ | ---------------------------------------------- |
| `DATABASE_URL` | `./data/streamx.db`| SQLite file path                               |
| `TMDB_API_KEY` | _(unset)_          | Enables TMDB poster/rating/plot enrichment     |
| `ORIGIN`       | _(unset)_          | Public origin, required for forms behind a proxy |

## Notes

- Xtream provider credentials are stored **in plain text** in the SQLite database — they are
  needed to construct upstream stream URLs. Host StreamX only on hardware you trust.
- Registration is open by default. If you expose the app publicly, put it behind a reverse
  proxy with auth or firewall it.
- Database migrations run automatically at startup (`drizzle/`).
