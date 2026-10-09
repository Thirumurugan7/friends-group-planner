import { redirect } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import { getUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isProfileComplete } from "@/lib/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const id = await getUserId();
  if (!id) redirect("/signin");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/signin");
  if (!isProfileComplete(user)) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}
