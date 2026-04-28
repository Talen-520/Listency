import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#070B14",
        section: "#0B1020",
        surface: "#10182B",
        elevated: "#16203A",
        text: "#F5F7FB",
        muted: "#7F8AA3",
        cyan: "#3EE7FF",
        violet: "#7C5CFF",
        pink: "#F36BFF",
        green: "#3BF4A3",
        yellow: "#FFC857",
        red: "#FF6B8A",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 24px 80px rgba(5,10,20,0.42), 0 0 40px rgba(62,231,255,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
