/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // ── Semantic design tokens ────────────────────────────────────────────
        // These reference CSS variables from index.css, supporting Tailwind's
        // opacity modifier syntax: bg-surface/50, border-edge-subtle/30, etc.

        surface: {
          DEFAULT: 'rgb(var(--surface-page) / <alpha-value>)',   // page bg
          subtle:  'rgb(var(--surface-subtle) / <alpha-value>)', // secondary bg
          ui:      'rgb(var(--surface-ui) / <alpha-value>)',     // UI panels
          raised:  'rgb(var(--surface-raised) / <alpha-value>)', // elevated cards
        },
        edge: {
          DEFAULT:  'rgb(var(--edge-subtle) / <alpha-value>)',   // standard borders
          moderate: 'rgb(var(--edge-moderate) / <alpha-value>)', // strong borders
        },
        ink: {
          DEFAULT:   'rgb(var(--ink-primary) / <alpha-value>)',   // primary text
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)', // secondary text
          faint:     'rgb(var(--ink-faint) / <alpha-value>)',     // tertiary text
        },

        // ── Legacy neutral extension ──────────────────────────────────────────
        // Keep neutral-950 as a concrete value for backward compatibility.
        neutral: {
          950: '#0a0a0a',
        },

        // ── Accent colors (no opacity modifiers needed) ───────────────────────
        accent: {
          blue:   '#0ea5e9',
          purple: '#a855f7',
          green:  '#22c55e',
          yellow: '#eab308',
          red:    '#ef4444',
          orange: '#f97316',
          pink:   '#ec4899',
          cyan:   '#06b6d4',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      boxShadow: {
        'elevated': '0 4px 20px rgba(0, 0, 0, 0.5)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
