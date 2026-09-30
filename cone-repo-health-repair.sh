#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package.json || ! -f quasar.config.ts || ! -d src ]]; then
  echo "Run this script from the root of nuforge/citizens-of-new-eden." >&2
  exit 1
fi

python - <<'PY'
from pathlib import Path
import json

def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old!r}")
    p.write_text(text.replace(old, new))

# Repository metadata: no dependency change, so package-lock remains valid.
p = Path("package.json")
pkg = json.loads(p.read_text())
pkg["name"] = "citizens-of-new-eden"
pkg["description"] = "A causal, variable-resolution simulation game layered on EVE Online."
pkg["author"] = "nuForge Development"
p.write_text(json.dumps(pkg, indent=2) + "\n")

p = Path("package-lock.json")
lock = json.loads(p.read_text())
lock["name"] = "citizens-of-new-eden"
if "" in lock.get("packages", {}):
    lock["packages"][""]["name"] = "citizens-of-new-eden"
p.write_text(json.dumps(lock, indent=2) + "\n")

# Keep a trackable environment template.
p = Path(".gitignore")
gitignore = p.read_text()
if "!.env.example" not in gitignore:
    gitignore = gitignore.replace(".env*\n", ".env*\n!.env.example\n")
p.write_text(gitignore)

Path(".env.example").write_text(
    "VITE_EVE_CLIENT_ID=\n"
    "VITE_EVE_REDIRECT_URI=http://localhost:9000/callback\n"
)

Path("env.d.ts").write_text("""/**
 * Application environment variables exposed through Vite.
 */
interface ImportMetaEnv {
  readonly VITE_EVE_CLIENT_ID: string;
  readonly VITE_EVE_REDIRECT_URI: string;
}
""")

# OAuth callbacks need a normal path. History mode requires an index fallback in production hosting.
p = Path("quasar.config.ts")
cfg = p.read_text()
if 'vueRouterMode: "hash"' in cfg:
    p.write_text(cfg.replace('vueRouterMode: "hash"', 'vueRouterMode: "history"'))
elif 'vueRouterMode: "history"' not in cfg:
    raise SystemExit("Expected vueRouterMode setting not found in quasar.config.ts")

# The scaffold CSP currently blocks EVE SSO/ESI and EVE image requests.
p = Path("index.html")
html = p.read_text()
old_csp = '''content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';<% if (ctx.dev) { %> connect-src 'self' ws://localhost:*; worker-src 'self' blob:;<% } %>"'''
new_csp = '''content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.evetech.net; connect-src 'self' https://login.eveonline.com https://esi.evetech.net<% if (ctx.dev) { %> ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*<% } %>; worker-src 'self' blob:;"'''
if "images.evetech.net" not in html:
    if old_csp not in html:
        raise SystemExit("Expected scaffold CSP was not found in index.html")
    p.write_text(html.replace(old_csp, new_csp))

# Current Quasar scaffold uses @/ aliases. Remove transplanted legacy src/ aliases.
alias_replacements = {
    "src/stores/auth.ts": [
        ("from 'src/types/sso'", "from '@/types/sso'"),
    ],
    "src/services/sso.ts": [
        ("from 'src/types/sso'", "from '@/types/sso'"),
    ],
    "src/services/esi/client.ts": [
        ("from 'src/types/esi'", "from '@/types/esi'"),
        ("data: null as unknown as T,", "data: null,"),
    ],
    "src/services/esi/location.ts": [
        ("from 'src/types/esi'", "from '@/types/esi'"),
    ],
}
for path, reps in alias_replacements.items():
    for old, new in reps:
        replace(path, old, new)

# ESI 304 responses have no body, so make that nullability explicit.
replace(
    "src/types/esi.ts",
    "readonly data: T;",
    "readonly data: T | null;",
)

# Session is persisted in sessionStorage, not memory-only.
replace(
    "src/types/sso.ts",
    "// Stored auth session (in-memory only)",
    "// Stored auth session (sessionStorage-backed for the browser session)",
)

# Robust base64url payload decoding.
p = Path("src/services/sso.ts")
sso = p.read_text()
old = """  // Restore Base64 padding
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(padded);
"""
new = """  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const decoded = atob(padded);
"""
if old not in sso:
    raise SystemExit("Expected JWT decode block not found")
p.write_text(sso.replace(old, new))
PY

cat > src/stores/location.ts <<'EOF'
import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  CharacterLocation,
  CharacterShip,
  SolarSystem,
  UniverseType
} from "@/types/esi";

export const useLocationStore = defineStore("location", () => {
  const location = ref<CharacterLocation | null>(null);
  const ship = ref<CharacterShip | null>(null);
  const solarSystem = ref<SolarSystem | null>(null);
  const shipType = ref<UniverseType | null>(null);
  const locationEtag = ref<string | null>(null);
  const shipEtag = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastUpdated = ref<Date | null>(null);

  const systemName = computed(() => solarSystem.value?.name ?? "—");
  const shipName = computed(() => ship.value?.ship_name ?? "—");
  const shipTypeName = computed(() => shipType.value?.name ?? "—");

  function setLoading(value: boolean): void {
    loading.value = value;
  }

  function setError(message: string | null): void {
    error.value = message;
  }

  function updateLocation(
    newLocation: CharacterLocation,
    etag: string | null,
    newSystem: SolarSystem
  ): void {
    location.value = newLocation;
    locationEtag.value = etag;
    solarSystem.value = newSystem;
    lastUpdated.value = new Date();
    error.value = null;
  }

  function updateShip(
    newShip: CharacterShip,
    etag: string | null,
    type: UniverseType
  ): void {
    ship.value = newShip;
    shipEtag.value = etag;
    shipType.value = type;
    lastUpdated.value = new Date();
  }

  function clear(): void {
    location.value = null;
    ship.value = null;
    solarSystem.value = null;
    shipType.value = null;
    locationEtag.value = null;
    shipEtag.value = null;
    loading.value = false;
    error.value = null;
    lastUpdated.value = null;
  }

  return {
    location,
    ship,
    solarSystem,
    shipType,
    loading,
    error,
    lastUpdated,
    systemName,
    shipName,
    shipTypeName,
    setLoading,
    setError,
    updateLocation,
    updateShip,
    clear,
    getEtags: () => ({
      location: locationEtag.value,
      ship: shipEtag.value
    })
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLocationStore, import.meta.hot));
}
EOF

cat > src/composables/useLocation.ts <<'EOF'
import { onMounted, onUnmounted, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useLocationStore } from "@/stores/location";
import {
  getCharacterLocation,
  getCharacterShip,
  getSolarSystem,
  getUniverseType
} from "@/services/esi/location";

const POLL_INTERVAL_MS = 30_000;

export interface UseLocationReturn {
  refresh: () => Promise<void>;
}

let refreshInFlight = false;

export async function refreshLocation(): Promise<void> {
  if (refreshInFlight) return;

  refreshInFlight = true;
  const authStore = useAuthStore();
  const locationStore = useLocationStore();

  try {
    const token = authStore.accessToken;
    const character = authStore.character;
    if (!token || !character) return;

    locationStore.setLoading(true);

    try {
      const etags = locationStore.getEtags();
      const [locResponse, shipResponse] = await Promise.all([
        getCharacterLocation(
          character.characterId,
          token,
          etags.location ?? undefined
        ),
        getCharacterShip(
          character.characterId,
          token,
          etags.ship ?? undefined
        )
      ]);

      const needSystemFetch =
        locResponse.data !== null &&
        locResponse.data.solar_system_id !==
          locationStore.location?.solar_system_id;

      const systemId =
        locResponse.data?.solar_system_id ??
        locationStore.location?.solar_system_id;

      if (
        systemId &&
        (needSystemFetch || locationStore.solarSystem === null)
      ) {
        const [systemResponse, typeResponse] = await Promise.all([
          getSolarSystem(systemId),
          shipResponse.data
            ? getUniverseType(shipResponse.data.ship_type_id)
            : Promise.resolve(null)
        ]);

        if (locResponse.data && systemResponse.data) {
          locationStore.updateLocation(
            locResponse.data,
            locResponse.etag,
            systemResponse.data
          );
        }

        if (shipResponse.data && typeResponse?.data) {
          locationStore.updateShip(
            shipResponse.data,
            shipResponse.etag,
            typeResponse.data
          );
        }
      } else if (
        shipResponse.data &&
        shipResponse.data.ship_type_id !== locationStore.ship?.ship_type_id
      ) {
        const typeResponse = await getUniverseType(
          shipResponse.data.ship_type_id
        );
        if (typeResponse.data) {
          locationStore.updateShip(
            shipResponse.data,
            shipResponse.etag,
            typeResponse.data
          );
        }
      } else if (shipResponse.data && locationStore.shipType) {
        locationStore.updateShip(
          shipResponse.data,
          shipResponse.etag,
          locationStore.shipType
        );
      }
    } catch (error) {
      locationStore.setError(
        error instanceof Error
          ? error.message
          : "Unknown error fetching location"
      );
    } finally {
      locationStore.setLoading(false);
    }
  } finally {
    refreshInFlight = false;
  }
}

export function useLocation(): UseLocationReturn {
  const authStore = useAuthStore();
  const locationStore = useLocationStore();

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let stopAuthWatcher: (() => void) | null = null;

  function startPolling(): void {
    if (pollTimer !== null) return;
    void refreshLocation();
    pollTimer = setInterval(() => void refreshLocation(), POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    if (pollTimer === null) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  onMounted(() => {
    stopAuthWatcher = watch(
      () => authStore.isAuthenticated,
      isAuthenticated => {
        if (isAuthenticated) {
          startPolling();
          return;
        }

        stopPolling();
        locationStore.clear();
      },
      { immediate: true }
    );
  });

  onUnmounted(() => {
    stopPolling();
    stopAuthWatcher?.();
  });

  return { refresh: refreshLocation };
}
EOF

python - <<'PY'
from pathlib import Path

def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old!r}")
    p.write_text(text.replace(old, new))

for old, new in [
    ("from 'src/stores/auth'", "from '@/stores/auth'"),
    ("from 'src/stores/location'", "from '@/stores/location'"),
    ("from 'src/composables/useSso'", "from '@/composables/useSso'"),
    ("from 'src/assets/eve-sso-login-black-large.png'", "from '@/assets/eve-sso-login-black-large.png'"),
    ("from 'src/assets/eve-sso-login-white-large.png'", "from '@/assets/eve-sso-login-white-large.png'"),
    ("from 'src/assets/eve-sso-login-black-small.png'", "from '@/assets/eve-sso-login-black-small.png'"),
    ("from 'src/assets/eve-sso-login-white-small.png'", "from '@/assets/eve-sso-login-white-small.png'"),
]:
    replace("src/components/LoginButton.vue", old, new)

for old, new in [
    ("from 'src/stores/auth'", "from '@/stores/auth'"),
    ("from 'src/services/sso'", "from '@/services/sso'"),
]:
    replace("src/composables/useSso.ts", old, new)

# Least privilege for the current slice: no wallet code is present.
p = Path("src/composables/useSso.ts")
text = p.read_text()
text = text.replace("  'esi-wallet.read_character_wallet.v1',\n", "")
p.write_text(text)
PY

# Correct filename-based route for the OAuth callback.
cat > src/pages/callback.vue <<'EOF'
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSso } from "@/composables/useSso";

const router = useRouter();
const { handleCallback } = useSso();

const processing = ref(true);
const callbackError = ref<string | null>(null);

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (error) {
    callbackError.value = errorDescription ?? error;
    processing.value = false;
    return;
  }

  if (!code || !state) {
    callbackError.value = "Missing authorization code or state parameter.";
    processing.value = false;
    return;
  }

  try {
    await handleCallback(code, state);
    await router.replace("/");
  } catch (err) {
    callbackError.value =
      err instanceof Error ? err.message : "Unknown error during login.";
    processing.value = false;
  }
});
</script>

<template>
  <div
    class="row items-center justify-center q-pa-lg"
    style="min-height: 100vh"
  >
    <div class="column items-center q-gutter-md">
      <q-spinner-orbit v-if="processing" color="primary" size="4em" />

      <div v-else-if="callbackError" class="text-center">
        <q-icon name="error" color="negative" size="3em" />
        <div class="text-h6 q-mt-sm text-negative">Login Failed</div>
        <div class="text-body2 q-mt-xs">{{ callbackError }}</div>
        <q-btn class="q-mt-md" label="Try Again" color="primary" to="/" />
      </div>
    </div>
  </div>
</template>
EOF

rm -f src/pages/SsoCallbackPage.vue

cat > src/pages/index.vue <<'EOF'
<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-toolbar-title>Citizens of New Eden</q-toolbar-title>
        <LoginButton size="small" />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import LoginButton from "@/components/LoginButton.vue";
import { useLocation } from "@/composables/useLocation";

useLocation();
</script>
EOF

cat > 'src/pages/index/(index).vue' <<'EOF'
<template>
  <q-page class="flex flex-center q-pa-lg">
    <div class="text-center">
      <div class="text-h4">Citizens of New Eden</div>
      <div class="text-body1 text-grey-7 q-mt-sm">
        NuForge / CoNE proof-of-concept shell
      </div>
    </div>
  </q-page>
</template>
EOF

rm -f src/pages/index/second.vue
rm -f src/components/EssentialLink.vue
rm -f src/stores/example-store.ts

mkdir -p .github/workflows
cat > .github/workflows/ci.yml <<'EOF'
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint:check
      - run: npm run typecheck
      - run: npm run build
EOF

cat > README.md <<'EOF'
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
EOF

echo
echo "Repair files written."
echo "Next run:"
echo "  npm ci"
echo "  npm run lint:check"
echo "  npm run typecheck"
echo "  npm run build"
echo
echo "Review with:"
echo "  git diff --stat"
echo "  git diff"
