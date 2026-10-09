import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const dot = Math.round(size * 0.38);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#17162a" }}>
        <div style={{ width: dot, height: dot, borderRadius: 9999, background: "#ffb454", boxShadow: `0 0 0 ${Math.round(size * 0.05)}px rgba(255,180,84,0.25)` }} />
      </div>
    ),
    { width: size, height: size }
  );
}
