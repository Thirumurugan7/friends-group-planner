import { prisma } from "@/lib/db";
import type { RouteResult } from "@/lib/engine/types";
import { localDate, localHHMM } from "@/lib/time";
import type { RoutesProvider } from "./types";

const k = (n: number) => n.toFixed(4);

export function cachedRoutes(inner: RoutesProvider, ttlMs = 24 * 3600_000): RoutesProvider {
  return {
    name: inner.name,
    async route(from, to, mode, departAt) {
      const hour = localHHMM(departAt).slice(0, 2);
      const key = [inner.name, mode, k(from.lat), k(from.lng), k(to.lat), k(to.lng), localDate(departAt), hour].join(":");
      const hit = await prisma.routeCache.findUnique({ where: { key } });
      if (hit && hit.expiresAt > new Date()) return hit.result as unknown as RouteResult;
      const result = await inner.route(from, to, mode, departAt);
      await prisma.routeCache.upsert({
        where: { key },
        create: { key, result: result as object, expiresAt: new Date(Date.now() + ttlMs) },
        update: { result: result as object, expiresAt: new Date(Date.now() + ttlMs) },
      });
      return result;
    },
  };
}
