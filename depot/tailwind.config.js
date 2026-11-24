/** @type {import('tailwindcss').Config} */
// Neutral colors are CSS variables (RGB channels) so the whole UI flips between
// dark and light themes by changing :root[data-theme]. See src/index.css.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix, steps) => Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        white: v('contrast'),
        coal: { DEFAULT: v('coal-900'), ...scale('coal', [900, 850, 800, 700, 600]) },
        slate: scale('slate', [100, 200, 300, 400, 500, 600]),
        phantom: { DEFAULT: '#F59E0B', soft: v('phantom-soft'), deep: '#B45309' },
        critical: { DEFAULT: '#FF3B5C', soft: v('critical-soft'), deep: '#9F1239' },
        healthy: { DEFAULT: '#10B981', soft: v('healthy-soft'), deep: '#065F46' },
        surge: { DEFAULT: '#38BDF8', soft: v('surge-soft'), deep: '#0369A1' },
        void: { DEFAULT: '#A78BFA', soft: v('void-soft'), deep: '#5B21B6' },
      },
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glowAmber: '0 0 0 1px rgba(245,158,11,.5), 0 0 18px rgba(245,158,11,.35)',
        glowRed: '0 0 0 1px rgba(255,59,92,.55), 0 0 18px rgba(255,59,92,.4)',
      },
      keyframes: {
        flicker: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: { flicker: 'flicker 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
};
