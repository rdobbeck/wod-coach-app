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
        // Brand red, so every existing primary-* class on the coach and auth
        // screens follows the same palette as the client app's accent.
        primary: {
          50: '#fdf3f2',
          100: '#fbe4e2',
          200: '#f4c8c5',
          300: '#e89b97',
          400: '#d85f5f',
          500: '#c1272d',
          600: '#c1272d',
          700: '#a01f24',
          800: '#7f181c',
          900: '#5e1215',
        },
      },
    },
  },
  plugins: [],
};
export default config;
