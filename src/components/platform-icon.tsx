import * as icons from "simple-icons";
import { cx } from "./ui";

type SimpleIcon = { path: string; title: string };

function lookup(key: string): SimpleIcon | null {
  const name = `si${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof typeof icons;
  const icon = icons[name] as unknown;
  return icon && typeof icon === "object" && "path" in icon ? (icon as SimpleIcon) : null;
}

/** Platform logo (from the CC0 simple-icons set) on a tinted tile; falls back to a monogram. */
export function PlatformIcon({ iconKey, name, color, size = "md", className }: { iconKey: string; name: string; color: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const icon = lookup(iconKey);
  const dims = { sm: "h-8 w-8 rounded-lg", md: "h-11 w-11 rounded-xl", lg: "h-14 w-14 rounded-2xl" }[size];
  const inner = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" }[size];
  // Very light brand colours (e.g. Snapchat yellow) need a dark glyph for contrast.
  const light = parseInt(color.slice(1, 3), 16) * 0.299 + parseInt(color.slice(3, 5), 16) * 0.587 + parseInt(color.slice(5, 7), 16) * 0.114 > 186;
  return (
    <span className={cx("inline-grid shrink-0 place-items-center", dims, className)} style={{ backgroundColor: color }} aria-hidden>
      {icon ? (
        <svg viewBox="0 0 24 24" className={inner} fill={light ? "#0f172a" : "#ffffff"}>
          <path d={icon.path} />
        </svg>
      ) : (
        <span className={cx("font-bold", light ? "text-slate-900" : "text-white")}>{name.charAt(0)}</span>
      )}
    </span>
  );
}
