import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customSounds } from "@/db/schema";

export const dynamic = "force-dynamic";

export interface CustomSoundDto {
  id: number;
  name: string;
  scope: "alert" | "reward";
  data: string;
}

function toDto(row: typeof customSounds.$inferSelect): CustomSoundDto {
  return { id: row.id, name: row.name, scope: row.scope as "alert" | "reward", data: row.data };
}

export async function GET() {
  try {
    const rows = await db.select().from(customSounds).orderBy(desc(customSounds.id));
    return NextResponse.json({ sounds: rows.map(toDto) });
  } catch (error) {
    console.error("GET /api/sounds", error);
    return NextResponse.json({ sounds: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; scope?: string; data?: string };
    if (!body.name || !body.data || !body.data.startsWith("data:audio")) {
      return NextResponse.json({ error: "bad payload" }, { status: 400 });
    }
    if (body.data.length > 1_400_000) {
      return NextResponse.json({ error: "file too large (max ~1 MB)" }, { status: 413 });
    }
    const [row] = await db
      .insert(customSounds)
      .values({
        name: String(body.name).slice(0, 60),
        scope: body.scope === "reward" ? "reward" : "alert",
        data: body.data,
      })
      .returning();
    return NextResponse.json({ sound: toDto(row) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/sounds", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await db.delete(customSounds).where(eq(customSounds.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/sounds", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
