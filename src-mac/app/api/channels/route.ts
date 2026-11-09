import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { DEFAULT_CHANNELS } from "@/lib/demo";
import type { Channel, PlatformId } from "@/lib/types";

export const dynamic = "force-dynamic";

function toDto(row: typeof channels.$inferSelect): Channel {
  return {
    id: row.id,
    platform: row.platform as PlatformId,
    name: row.name,
    live: row.live,
    viewers: row.viewers,
    enabled: row.enabled,
  };
}

export async function GET() {
  try {
    let rows = await db.select().from(channels).orderBy(asc(channels.id));
    if (rows.length === 0) {
      await db.insert(channels).values(DEFAULT_CHANNELS);
      rows = await db.select().from(channels).orderBy(asc(channels.id));
    }
    return NextResponse.json({ channels: rows.map(toDto) });
  } catch (error) {
    console.error("GET /api/channels", error);
    return NextResponse.json({ channels: DEFAULT_CHANNELS.map((c, i) => ({ id: i + 1, ...c })) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Channel>;
    const [row] = await db
      .insert(channels)
      .values({
        platform: body.platform ?? "twitch",
        name: String(body.name ?? "channel").slice(0, 80),
        live: false,
        viewers: 0,
        enabled: true,
      })
      .returning();
    return NextResponse.json({ channel: toDto(row) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/channels", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id: number; enabled?: boolean; live?: boolean };
    const [row] = await db
      .update(channels)
      .set({ ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}), ...(typeof body.live === "boolean" ? { live: body.live } : {}) })
      .where(eq(channels.id, body.id))
      .returning();
    return NextResponse.json({ channel: row ? toDto(row) : null });
  } catch (error) {
    console.error("PATCH /api/channels", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
