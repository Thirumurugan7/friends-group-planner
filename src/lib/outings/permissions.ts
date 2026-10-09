import type { Outing, Role } from "@prisma/client";
import { HttpError } from "@/lib/http";

export function requireOrganiser(outing: Outing, userId: string, role: Role) {
  if (outing.createdById !== userId && role !== "admin") {
    throw new HttpError(403, "Only the organiser or admin can do that.");
  }
}

export function requireStatus(outing: Outing, ...allowed: Outing["status"][]) {
  if (!allowed.includes(outing.status)) {
    throw new HttpError(409, `This outing is ${outing.status}.`);
  }
}
