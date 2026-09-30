# Citizens of New Eden

Citizens of New Eden (CoNE) is an app/browser-based simulation game layered on
EVE Online. The current repository is the clean Quasar/Vue application shell
plus reusable EVE SSO/ESI integration.

## Requirements

- Node.js 22.12+ (or a newer supported version from `package.json`)
- npm

## Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

Register the development callback URL with the EVE developer application:

```text
http://localhost:9000/callback
```

Then set `VITE_EVE_CLIENT_ID` in `.env`.

## Validation

```bash
npm run lint:check
npm run typecheck
npm run build
```

## Routing / hosting

The app uses Vue Router history mode so the EVE OAuth callback can use a normal
`/callback` URL. Production hosting must rewrite unknown application paths to
`index.html`.

## Architecture direction

```text
Quasar / Vue UI
      ↓
EVE adapter (SSO / ESI)
      ↓
CoNE domain rules and models
      ↓
NuForge simulation kernel
```

NuForge and CoNE domain modules are intentionally kept separate from ESI and UI
code as they are introduced.
