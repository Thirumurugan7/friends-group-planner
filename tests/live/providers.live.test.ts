import { describe } from "vitest";
import { placesContract, routesContract } from "../providers/contract";
import { OverpassPlaces } from "@/lib/providers/osm";
import { OsrmRoutes } from "@/lib/providers/osrm";
import { GooglePlaces, GoogleRoutes } from "@/lib/providers/google";

describe("live OSM", () => placesContract(() => new OverpassPlaces()));
describe("live OSRM", () => routesContract(() => new OsrmRoutes(), { transitApproximate: true }));

const key = process.env.GOOGLE_MAPS_API_KEY;
describe.skipIf(!key)("live Google Places", () => placesContract(() => new GooglePlaces(key!)));
describe.skipIf(!key)("live Google Routes", () => routesContract(() => new GoogleRoutes(key!), { transitApproximate: false }));
