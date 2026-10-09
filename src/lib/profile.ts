import { z } from "zod";
import type { User } from "@prisma/client";
import { HHMM_RE } from "@/lib/time";

const PlaceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().min(1).max(80),
});

export const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  age: z.number().int().min(13).max(100),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"], {
    message: "Pick a gender option.",
  }),
  home: PlaceSchema,
  work: PlaceSchema,
  transport: z.enum(["public", "own"]),
  interests: z.array(z.string().trim().min(1).max(30)).max(20),
  openness: z.number().int().min(1).max(5),
  homeBy: z.string().regex(HHMM_RE, "Use HH:MM").nullable(),
});
export type ProfileInput = z.infer<typeof ProfileSchema>;

type CompletenessFields = Pick<
  User,
  "name" | "email" | "age" | "gender" | "homeLat" | "homeLng" | "homeLabel" | "workLat" | "workLng" | "workLabel"
>;

export function isProfileComplete(u: CompletenessFields): boolean {
  return Boolean(
    u.name && u.email && u.age && u.gender &&
      u.homeLat != null && u.homeLng != null && u.homeLabel &&
      u.workLat != null && u.workLng != null && u.workLabel
  );
}
