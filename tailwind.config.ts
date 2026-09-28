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
        // Inchiostro (testo e tratti chiari)
        inchiostro: {
          DEFAULT: "#1a1714",
          soft: "#4a4238",
          faint: "#776c5b",
        },
        // Notte (sfondi scuri)
        notte: {
          DEFAULT: "#121110",
          soft: "#1b1916",
          deep: "#302b24",
        },
        // Nebbia (testo e tratti scuri)
        nebbia: {
          DEFAULT: "#f3efe4",
          soft: "#b9b0a0",
          faint: "#8b8172",
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
      },
      maxWidth: {
        editoriale: "68rem",
      },
    },
  },
  plugins: [],
};

export default config;
