/**
 * Composable for polling character location and ship from ESI.
 * Polls every 30s, respects ETag caching.
 */

import { onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from 'src/stores/auth';
import { useLocationStore } from 'src/stores/location';
import { useHistoryStore } from 'src/stores/history';
import {
  getCharacterLocation,
  getCharacterShip,
  getSolarSystem,
  getUniverseType,
} from 'src/services/esi/location';

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
  const historyStore = useHistoryStore();

  try {
    const token = authStore.accessToken;
    const character = authStore.character;
    if (!token || !character) return;
    console.log('📍 Fetching location for', character.characterName, '...');

    locationStore.setLoading(true);

    try {
      const etags = locationStore.getEtags();

      // Fetch location and ship in parallel
      const [locResponse, shipResponse] = await Promise.all([
        getCharacterLocation(character.characterId, token, etags.location ?? undefined),
        getCharacterShip(character.characterId, token, etags.ship ?? undefined),
      ]);

      // Fetch system info (only if location changed or no cached data)
      const needSystemFetch =
        locResponse.data !== null &&
        locResponse.data.solar_system_id !== locationStore.location?.solar_system_id;

      const systemId = locResponse.data?.solar_system_id ?? locationStore.location?.solar_system_id;

      if (systemId && (needSystemFetch || locationStore.solarSystem === null)) {
        const [systemResponse, typeResponse] = await Promise.all([
          getSolarSystem(systemId),
          shipResponse.data
            ? getUniverseType(shipResponse.data.ship_type_id)
            : Promise.resolve(null),
        ]);
        console.log('✅ Location updated:', systemResponse.data?.name);

        if (locResponse.data && systemResponse.data) {
          locationStore.updateLocation(locResponse.data, locResponse.etag, systemResponse.data);
        }
        if (shipResponse.data && typeResponse?.data) {
          locationStore.updateShip(shipResponse.data, shipResponse.etag, typeResponse.data);
        }
      } else {
        // System unchanged — update ship type if ship changed
        if (
          shipResponse.data &&
          shipResponse.data.ship_type_id !== locationStore.ship?.ship_type_id
        ) {
          const typeResponse = await getUniverseType(shipResponse.data.ship_type_id);
          if (typeResponse.data) {
            locationStore.updateShip(shipResponse.data, shipResponse.etag, typeResponse.data);
          }
        } else if (shipResponse.data && locationStore.shipType) {
          locationStore.updateShip(shipResponse.data, shipResponse.etag, locationStore.shipType);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error fetching location';
      locationStore.setError(message);
    } finally {
      locationStore.setLoading(false);
    }

    // Record the observation in the immutable history log. The history store
    // no-ops when the effective (system + ship) key hasn't changed, so this
    // is safe to call after every poll.
    try {
      await historyStore.recordSelfLocation();
    } catch {
      // recording failures shouldn't break the polling loop
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
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onMounted(() => {
    stopAuthWatcher = watch(
      () => authStore.isAuthenticated,
      (isAuthenticated) => {
        if (isAuthenticated) {
          startPolling();
          return;
        }

        stopPolling();
        locationStore.clear();
      },
      { immediate: true },
    );
  });

  onUnmounted(() => {
    stopPolling();
    stopAuthWatcher?.();
  });

  return { refresh: refreshLocation };
}
