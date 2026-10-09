import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
export const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_TEST });

export function isoDay(offset: number) {
  // City-local (UTC+05:30) calendar date, offset in days from today.
  const d = new Date(Date.now() + 330 * 60_000 + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}
