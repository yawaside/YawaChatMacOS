"use client";

import { motion } from "framer-motion";
import { Shield, Star, Gem, Zap } from "lucide-react";
import type { AppearEffect, ChatMessage } from "@/lib/types";
import { DENSITY_PAD, tonePalette, type StylePreset, type StyleTone } from "@/lib/styles";
import { PlatformIcon, platformMeta } from "@/lib/platforms";

export interface FeedFx {
  preset: StylePreset;
  tone?: StyleTone;
  effect: AppearEffect;
  /** явный размер шрифта поверх стиля (0 — по стилю) */
  fontSize: number;
  /** явная плотность поверх стиля */
  densityPad?: string;
  /** подсвечивать упоминания канала */
  mentions?: boolean;
}

function timeOf(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function Badge({ kind }: { kind: string }) {
  if (kind === "mod")
    return (
      <span className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] bg-[#30D158]/20 text-[#30D158]" title="Модератор">
        <Shield size={9} fill="currentColor" />
      </span>
    );
  if (kind === "vip")
    return (
      <span className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] bg-[#BF5AF2]/20 text-[#BF5AF2]" title="VIP">
        <Gem size={9} fill="currentColor" />
      </span>
    );
  return (
    <span className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px] bg-[#FFD60A]/20 text-[#FFD60A]" title="Подписчик">
      <Star size={9} fill="currentColor" />
    </span>
  );
}

function Avatar({ author, color, platform, size }: { author: string; color: string; platform: ChatMessage["platform"]; size: number }) {
  return (
    <div
      className="relative grid h-7 w-7 shrink-0 select-none place-items-center rounded-full text-[11px] font-bold text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
      style={{ background: `linear-gradient(160deg, ${color}, ${platformMeta(platform).color})`, width: size, height: size }}
    >
      {author.slice(0, 1).toUpperCase()}
      <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-[#1C1C1F] ring-1 ring-black/40">
        <PlatformIcon id={platform} size={9} />
      </span>
    </div>
  );
}

export function MessageRow({ msg, fx }: { msg: ChatMessage; fx: FeedFx }) {
  const p = fx.preset;
  const pal = tonePalette(p, fx.tone?.id);
  const meta = platformMeta(msg.platform);
  const fontSize = fx.fontSize || p.fontSize;
  const padY = fx.densityPad ?? DENSITY_PAD[p.density];
  const anim =
    fx.effect === "none" ? false : fx.effect === "fade" ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 };

  const textFx: React.CSSProperties = {
    fontSize,
    textTransform: p.nickCase === "upper" ? "uppercase" : undefined,
    WebkitTextStroke: p.outlineWidth > 0 ? `${p.outlineWidth * 0.55}px rgba(0,0,0,0.6)` : undefined,
    textShadow: p.textShadow ? "0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.5)" : undefined,
  };

  const rowChrome: React.CSSProperties = {
    marginBottom: p.spacing,
    borderRadius: p.radius,
    background: p.backdrop ? pal.msgBg : "transparent",
    boxShadow: [
      pal.msgRing !== "transparent" && p.backdrop ? `inset 0 0 0 1px ${pal.msgRing}` : "",
      p.stripe ? `inset 3px 0 0 ${pal.accent}` : "",
      p.decor === "none" && p.id === "glass" ? "0 8px 20px rgba(0,0,0,0.18)" : "",
    ]
      .filter(Boolean)
      .join(", ") || undefined,
    borderBottom: p.separators ? `1px solid ${pal.accent}33` : undefined,
    backdropFilter: p.id === "glass" || p.id === "macos" ? "blur(14px) saturate(1.4)" : undefined,
    borderTopLeftRadius: p.bubble ? Math.min(4, p.radius) : p.radius,
  };

  if (msg.kind === "event") {
    return (
      <motion.div
        initial={anim}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="mx-auto flex w-fit max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] ring-1"
        style={{
          marginBottom: p.spacing + 2,
          color: pal.msgText,
          background: `${pal.accent}14`,
          ["--tw-ring-color" as string]: `${pal.accent}44`,
        }}
      >
        <Zap size={12} style={{ color: pal.accent }} fill={pal.accent} />
        <span className="font-semibold" style={{ color: msg.color }}>
          {msg.author}
        </span>
        <span className="truncate">{msg.text}</span>
        <span className="ml-1 w-8 text-right text-[10px] tabular-nums opacity-40">{timeOf(msg.createdAt)}</span>
      </motion.div>
    );
  }

  if (msg.kind === "donation") {
    return (
      <motion.div
        initial={anim}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
        className="overflow-hidden p-[1px] ring-1 ring-[#FFD60A]/25"
        style={{
          marginBottom: p.spacing + 2,
          borderRadius: p.radius + 2,
          background: "linear-gradient(90deg, rgba(255,214,10,0.14), rgba(255,159,10,0.08), transparent)",
        }}
      >
        <div className="bg-[#191913]/70 px-3.5 py-2.5 backdrop-blur" style={{ borderRadius: p.radius + 1 }}>
          <div className="flex items-center gap-2.5">
            <Avatar author={msg.author} color={msg.color} platform={msg.platform} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold" style={{ color: msg.color }}>
                  {msg.author}
                </span>
                <PlatformIcon id={msg.platform} size={12} />
              </div>
              <div className="mt-0.5 leading-snug" style={{ fontSize, color: "#f5f5f7" }}>
                {msg.text}
              </div>
            </div>
            <div className="w-20 shrink-0 text-right">
              <div className="text-[15px] font-bold tabular-nums text-[#FFD60A]">
                {msg.amount?.toLocaleString("ru-RU")} <span className="text-[11px] font-semibold text-[#FFD60A]/70">₽</span>
              </div>
              <div className="text-[10px] tabular-nums text-white/35">{timeOf(msg.createdAt)}</div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const isMention = fx.mentions === true && /@?yawa/i.test(msg.text);

  const authorNode = (
    <span
      className="truncate font-semibold leading-tight"
      style={{ ...textFx, color: msg.color, fontSize }}
      title={msg.author}
    >
      {msg.author}
    </span>
  );

  const textNode = (
    <span className="break-words leading-snug" style={{ ...textFx, color: pal.msgText }}>
      {p.prompt && (
        <span className="mr-1.5 select-none font-bold" style={{ color: pal.accent }}>
          &gt;
        </span>
      )}
      {msg.text}
    </span>
  );

  if (p.bubble) {
    /* Речевой пузырь: ник внутри, обводка-«бумага», срезанный угол */
    return (
      <motion.div
        initial={anim}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="flex items-start gap-2.5"
        style={{ marginBottom: p.spacing }}
      >
        <Avatar author={msg.author} color={msg.color} platform={msg.platform} size={28} />
        <div
          className="min-w-0 max-w-[85%] px-3 py-2"
          style={{
            background: pal.msgBg,
            borderRadius: p.radius,
            borderTopLeftRadius: Math.min(4, p.radius),
            boxShadow: pal.msgRing !== "transparent" ? `0 0 0 1.5px ${pal.msgRing}, 0 2px 0 rgba(0,0,0,0.25)` : "0 2px 0 rgba(0,0,0,0.25)",
          }}
        >
          <div className="flex items-baseline gap-1.5">
            {authorNode}
            {msg.badges.map((b) => (
              <Badge key={b} kind={b} />
            ))}
          </div>
          <div className="mt-[1px]">{textNode}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={anim}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={`group flex items-start gap-2.5 px-2.5 ${padY}`}
      style={
        isMention
          ? {
              ...rowChrome,
              background: `color-mix(in srgb, ${pal.accent} 16%, ${p.backdrop ? pal.msgBg : "transparent"})`,
              boxShadow: `inset 3px 0 0 ${pal.accent}, inset 0 0 0 1px ${pal.accent}55`,
            }
          : rowChrome
      }
    >
      {p.backdrop || p.id === "rust" ? (
        <Avatar author={msg.author} color={msg.color} platform={msg.platform} size={26} />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          {authorNode}
          {msg.badges.map((b) => (
            <Badge key={b} kind={b} />
          ))}
          <span
            className="ml-auto w-8 shrink-0 text-right text-[10px] tabular-nums opacity-0 transition-opacity group-hover:opacity-50"
            style={{ color: pal.msgText }}
          >
            {timeOf(msg.createdAt)}
          </span>
        </div>
        <div className="mt-[1px]">{textNode}</div>
      </div>
    </motion.div>
  );
}
