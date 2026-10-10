import { runDailyOutcomes } from "@/lib/outings/outcomes";

export const maxDuration = 60;

// Vercel Cron calls this daily (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await runDailyOutcomes();
  console.log(`[outcomes] decided=${r.decided} reminded=${r.reminded}`);
  return Response.json(r);
}
