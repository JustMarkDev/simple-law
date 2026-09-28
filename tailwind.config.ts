import type { Config } from "tailwindcss";

/**
 * Palette editoriale "inchiostro su carta".
 *
 * Il tema scuro si attiva con la classe `dark` sull'elemento <html> (next-themes,
 * attribute="class"). Le tinte del semaforo restano separate per non perdere
 * significato.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Carta (sfondi chiari)
        carta: {
          DEFAULT: "#faf8f3",
          soft: "#f3eee3",
          deep: "#eae2d2",
        },
        // Inchiostro (testo e tratti chiari). `faint` rispetta AA su carta (#5f5646).
        inchiostro: {
          DEFAULT: "#1a1714",
          soft: "#4a4238",
          faint: "#5f5646",
        },
        // Notte (sfondi scuri)
        notte: {
          DEFAULT: "#121110",
          soft: "#1b1916",
          deep: "#302b24",
        },
        // Nebbia (testo e tratti scuri). `faint` rispetta AA su notte (#a89d8a).
        nebbia: {
          DEFAULT: "#f3efe4",
          soft: "#b9b0a0",
          faint: "#a89d8a",
        },
        // Tratti e filetti
        regola: {
          DEFAULT: "#ddd5c6",
          scura: "#302b24",
        },
        // Accento per collegamenti e richiami
        accento: {
          DEFAULT: "#9c1f29",
          chiara: "#e2878d",
        },
        tricolore: {
          verde: "#009246",
          bianco: "#ffffff",
          rosso: "#ce2b37",
        },
        // Conservata per compatibilità con i componenti storici.
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          500: "#1d6fd6",
          600: "#155cb8",
          700: "#0f4a92",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["Georgia", "'Times New Roman'", "'Iowan Old Style'", "serif"],
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        editoriale: "68rem",
      },
      screens: {
        xs: "26rem",
        sm: "40rem",
        md: "48rem",
        lg: "64rem",
        xl: "80rem",
        "2xl": "96rem",
      },
      container: {
        center: true,
        padding: {
          DEFAULT: "1rem",
          sm: "1.5rem",
          lg: "2rem",
        },
      },
      keyframes: {
        comparsa: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "comparsa-su": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        comparsa: "comparsa 0.25s ease-out both",
        "comparsa-su": "comparsa-su 0.3s ease-out both",
      },
      minHeight: {
        tocco: "2.75rem",
      },
      minWidth: {
        tocco: "2.75rem",
      },
    },
  },
  plugins: [],
};

export default config;
