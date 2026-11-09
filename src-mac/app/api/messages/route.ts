import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { seedMessages } from "@/lib/demo";
import type { ChatMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

function toDto(row: typeof chatMessages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    platform: row.platform as ChatMessage["platform"],
    author: row.author,
    color: row.color,
    text: row.text,
    kind: row.kind as ChatMessage["kind"],
    badges: row.badges ?? [],
    amount: row.amount,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    let rows = await db.select().from(chatMessages).orderBy(desc(chatMessages.id)).limit(120);

    if (rows.length === 0) {
      const seed = seedMessages(46);
      await db.insert(chatMessages).values(
        seed.map((m) => ({
          platform: m.platform,
          author: m.author,
          color: m.color,
          text: m.text,
          kind: m.kind,
          badges: m.badges,
          amount: m.amount,
          currency: m.currency,
          createdAt: new Date(m.createdAt),
        })),
      );
      rows = await db.select().from(chatMessages).orderBy(desc(chatMessages.id)).limit(120);
    }

    return NextResponse.json({ messages: rows.map(toDto).reverse() });
  } catch (error) {
    console.error("GET /api/messages", error);
    return NextResponse.json({ messages: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ChatMessage>;
    const [row] = await db
      .insert(chatMessages)
      .values({
        platform: body.platform ?? "twitch",
        author: body.author ?? "yawaside",
        color: body.color ?? "#0A84FF",
        text: String(body.text ?? "").slice(0, 500),
        kind: body.kind ?? "message",
        badges: body.badges ?? [],
        amount: body.amount ?? null,
        currency: body.currency ?? null,
      })
      .returning();
    return NextResponse.json({ message: toDto(row) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/messages", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
