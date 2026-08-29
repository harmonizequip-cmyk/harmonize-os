import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Identidade visual Harmonize já estabelecida em outras ferramentas
        brand: {
          teal: "#3DBFB8",
          "teal-dark": "#2e9a94",
          pink: "#E8789A",
          "pink-dark": "#d85f83",
          blue: "#7EC8E3",
          lilac: "#B8A0D0",
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
