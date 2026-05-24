# SaveFromGravity Development — Process Log

Documentation for the sfgravity.online / gravity-web static platform.

## Active Stack

- **gravity-web/** — SaveFromGravity mobile web shell (HTML/CSS/JS, Gravity init, Vercel edge)
- **androidApp/** — APK WebView wrapper (com.gravity.app)
- **Local dev** — `npm run dev:web` → http://localhost:3001 with COOP/COEP + geo query testing

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:web` | Local preview with slug rewrites, WASM headers, mock API |
| `npm run apk:debug` | Build debug APK |

## Geo testing locally

Append `?geo=US` or `?geo=IN` to any URL to simulate regional copy and ad tiers.
