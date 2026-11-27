Streamer runs entirely on your computer: it serves itself on `127.0.0.1` and keeps its
database there. Open it, register an account, then add your Xtream Codes connection in
Settings.

None of these builds are signed, so each system asks once before opening them.

**Mac** (Apple Silicon): open the `.dmg` and drag Streamer to Applications. If macOS says it
can't check the app, open System Settings → Privacy & Security and choose Open Anyway.

**Windows**: run `Streamer-Setup-….exe`. If SmartScreen stops it, choose More info → Run anyway.

**Linux**: install the `.deb` with `sudo apt install ./streamer_…_amd64.deb`, or make the
`.AppImage` executable and run it. On Ubuntu 24.04 and later, use the `.deb`.

Titles with AC-3 or DTS audio need ffmpeg to play with sound: `brew install ffmpeg` on a
Mac, `winget install ffmpeg` on Windows, `sudo apt install ffmpeg` on Linux.
