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
