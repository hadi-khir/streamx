// Runs the site inside the app. The app holds this process's stdin open, so
// however the app ends (quit, crash, force quit), stdin closes and this ends too.
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
await import('./build/index.js');
