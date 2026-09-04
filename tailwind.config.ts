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
      backgroundImage: {
        // Gradiente na mesma direção de cores do pássaro da logo
        "brand-gradient": "linear-gradient(135deg, #3DBFB8 0%, #7EC8E3 55%, #B8A0D0 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, rgba(61,191,184,0.12) 0%, rgba(126,200,227,0.12) 55%, rgba(184,160,208,0.12) 100%)",
      },
      boxShadow: {
        "glow-teal": "0 8px 30px -8px rgba(61,191,184,0.5)",
        "glow-brand": "0 8px 24px -6px rgba(126,200,227,0.4)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
    },
  },
  plugins: [],
};

export default config;
