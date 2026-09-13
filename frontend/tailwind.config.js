/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "surface-container-lowest": "#0B0E14",
        "surface": "#10131A",
        "surface-container": "#1D2026",
        "surface-container-high": "#272A31",
        "surface-variant": "#32353C",
        "primary-container": "#00F2FF",
        "secondary": "#DDB7FF",
        "secondary-container": "#6F00BE",
        "tertiary-container": "#67F4B7",
        "error": "#FFB4AB",
        "error-container": "#93000A",
        "on-surface": "#E1E2EB",
        "on-surface-variant": "#B9CACB",
        "outline": "#849495",
        "outline-variant": "#3A494B",
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
