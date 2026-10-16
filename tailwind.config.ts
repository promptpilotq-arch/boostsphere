import type { Config } from "tailwindcss";

// Brand colors are CSS variables (set from site settings in the root layout) so the
// brand can be re-themed from the admin dashboard without a rebuild.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
          ink: "rgb(var(--ink) / <alpha-value>)",
        },
      },
      fontFamily: { sans: ["Inter", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"] },
      keyframes: { "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { "fade-up": "fade-up .35s ease-out both" },
    },
  },
  plugins: [],
} satisfies Config;
