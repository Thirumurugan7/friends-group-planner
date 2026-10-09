// src/app/(app)/outings/[id]/page.tsx
import OutingScreen from "@/components/outing/OutingScreen";

export default async function OutingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OutingScreen id={id} />;
}
