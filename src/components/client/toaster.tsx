"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" };

export function toast(message: string, tone: Toast["tone"] = "success") {
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, tone } }));
}

/** Accessible toast region (announced by screen readers via aria-live). */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail as Toast;
      const id = Date.now() + Math.random();
      setItems((t) => [...t, { id, message, tone }]);
      setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 5000);
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto animate-fade-up rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${t.tone === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}
          role={t.tone === "error" ? "alert" : "status"}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
