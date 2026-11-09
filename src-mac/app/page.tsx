"use client";

import { useEffect, useState } from "react";
import { AppWindow } from "@/components/yawa/app-window";
import { Spotlight } from "@/components/yawa/spotlight";

export default function Page() {
  const [spotlight, setSpotlight] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSpotlight((s) => !s);
      }
      if (e.key === "Escape") setSpotlight(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#131316] font-sans select-none">
      <AppWindow />
      <Spotlight
        open={spotlight}
        onClose={() => setSpotlight(false)}
        onPick={(s) => {
          setSpotlight(false);
          window.dispatchEvent(new CustomEvent("yawa:section", { detail: s }));
        }}
      />
    </main>
  );
}
