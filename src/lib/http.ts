import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { isProfileComplete } from "@/lib/profile";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok(data: object, status = 200) {
  return NextResponse.json(data, { status });
}

export function route<P = Record<string, string>>(
  fn: (req: Request, ctx: { params: Promise<P> }) => Promise<Response>
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return ok({ error: err.message }, err.status);
      if (err instanceof ZodError) return ok({ error: err.issues[0]?.message ?? "Invalid request." }, 400);
      console.error("[api] unhandled", err);
      return ok({ error: "Something went wrong." }, 500);
    }
  };
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON.");
  });
  return schema.parse(raw);
}

export async function requireUser() {
  const id = await getUserId();
  if (!id) throw new HttpError(401, "Not signed in.");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(401, "Not signed in.");
  return user;
}

export async function requireCompleteUser() {
  const user = await requireUser();
  if (!isProfileComplete(user)) throw new HttpError(403, "Finish your profile first.");
  return user;
}

export async function requireMember(groupId: string, userId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_groupId: { userId, groupId } },
    include: { group: true },
  });
  if (!membership) throw new HttpError(404, "Not found.");
  const { group, ...rest } = membership;
  return { group, membership: rest };
}

export async function requireAdmin(groupId: string, userId: string) {
  const res = await requireMember(groupId, userId);
  if (res.membership.role !== "admin") throw new HttpError(403, "Only the group admin can do that.");
  return res;
}

export async function requireOutingMember(outingId: string, userId: string) {
  const outing = await prisma.outing.findUnique({ where: { id: outingId } });
  if (!outing) throw new HttpError(404, "Not found.");
  const { membership } = await requireMember(outing.groupId, userId);
  return { outing, membership };
}
