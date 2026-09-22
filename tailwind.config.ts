import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        // Client-app tokens; values come from [data-app-theme] in globals.css.
        app: {
          bg: 'var(--app-bg)',
          surface: 'var(--app-surface)',
          surface2: 'var(--app-surface-2)',
          border: 'var(--app-border)',
          text: 'var(--app-text)',
          muted: 'var(--app-muted)',
          accent: 'var(--app-accent)',
          'accent-text': 'var(--app-accent-text)',
          good: 'var(--app-good)',
          warn: 'var(--app-warn)',
        },
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
    },
  },
  plugins: [],
};
export default config;
