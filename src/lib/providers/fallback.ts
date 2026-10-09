import type { PlacesProvider, RoutesProvider } from "./types";

export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export function placesWithFallback(primary: PlacesProvider, fallback: PlacesProvider | null): PlacesProvider {
  return {
    name: fallback ? `${primary.name}+${fallback.name}` : primary.name,
    async search(center, radiusM, kind) {
      try {
        return await retryOnce(() => primary.search(center, radiusM, kind));
      } catch (err) {
        if (!fallback) throw err;
        console.warn(`[places] ${primary.name} failed, falling back`, err);
        return retryOnce(() => fallback.search(center, radiusM, kind));
      }
    },
  };
}

export function routesWithFallback(primary: RoutesProvider, fallback: RoutesProvider | null): RoutesProvider {
  return {
    name: fallback ? `${primary.name}+${fallback.name}` : primary.name,
    async route(from, to, mode, departAt) {
      try {
        return await retryOnce(() => primary.route(from, to, mode, departAt));
      } catch (err) {
        if (!fallback) throw err;
        console.warn(`[routes] ${primary.name} failed, falling back`, err);
        return retryOnce(() => fallback.route(from, to, mode, departAt));
      }
    },
  };
}
