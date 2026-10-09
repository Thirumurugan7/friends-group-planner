import { prisma } from "@/lib/db";
import { runDailyOutcomes } from "@/lib/outings/outcomes";

runDailyOutcomes()
  .then((r) => console.log(`[outcomes] decided=${r.decided} reminded=${r.reminded}`))
  .catch((err) => {
    console.error("[outcomes] failed", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
