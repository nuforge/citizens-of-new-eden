// ESI: GET /characters/{character_id}/location/
export interface CharacterLocation {
  readonly solar_system_id: number;
  readonly station_id?: number;
  readonly structure_id?: number;
}

// ESI: GET /characters/{character_id}/ship/
export interface CharacterShip {
  readonly ship_item_id: number;
  readonly ship_name: string;
  readonly ship_type_id: number;
}

// ESI: GET /universe/systems/{system_id}/
export interface SolarSystem {
  readonly system_id: number;
  readonly name: string;
  readonly constellation_id: number;
  readonly security_status: number;
  readonly star_id?: number;
}

// ESI: GET /universe/constellations/{constellation_id}/
export interface Constellation {
  readonly constellation_id: number;
  readonly name: string;
  readonly region_id: number;
}

// ESI: GET /universe/regions/{region_id}/
export interface Region {
  readonly region_id: number;
  readonly name: string;
}

// ESI: GET /universe/types/{type_id}/
export interface UniverseType {
  readonly type_id: number;
  readonly name: string;
  readonly description: string;
}

export interface UniverseIdMatch {
  readonly id: number;
  readonly name: string;
}

// ESI: POST /universe/ids/
// Returns only categories that had matches.
export interface UniverseIdsResponse {
  readonly characters?: readonly UniverseIdMatch[];
  readonly corporations?: readonly UniverseIdMatch[];
  readonly alliances?: readonly UniverseIdMatch[];
  readonly factions?: readonly UniverseIdMatch[];
  readonly constellations?: readonly UniverseIdMatch[];
  readonly regions?: readonly UniverseIdMatch[];
  readonly inventory_types?: readonly UniverseIdMatch[];
  readonly stations?: readonly UniverseIdMatch[];
  readonly systems?: readonly UniverseIdMatch[];
}

// Generic ESI response wrapper with ETag support
export interface EsiResponse<T> {
  readonly data: T;
  readonly etag: string | null;
  readonly expires: Date | null;
}

// Error shape from ESI
export interface EsiError {
  readonly error: string;
  readonly error_description?: string;
}
