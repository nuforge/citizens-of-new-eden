import { esiGet } from "./client";
import type {
  CharacterLocation,
  CharacterShip,
  SolarSystem,
  UniverseType,
  EsiResponse
} from "@/types/esi";

export async function getCharacterLocation(
  characterId: number,
  token: string,
  etag?: string
): Promise<EsiResponse<CharacterLocation>> {
  return esiGet<CharacterLocation>(
    `/characters/${characterId}/location/`,
    token,
    etag
  );
}

export async function getCharacterShip(
  characterId: number,
  token: string,
  etag?: string
): Promise<EsiResponse<CharacterShip>> {
  return esiGet<CharacterShip>(`/characters/${characterId}/ship/`, token, etag);
}

export async function getSolarSystem(
  systemId: number,
  etag?: string
): Promise<EsiResponse<SolarSystem>> {
  return esiGet<SolarSystem>(`/universe/systems/${systemId}/`, undefined, etag);
}

export async function getUniverseType(
  typeId: number,
  etag?: string
): Promise<EsiResponse<UniverseType>> {
  return esiGet<UniverseType>(`/universe/types/${typeId}/`, undefined, etag);
}
