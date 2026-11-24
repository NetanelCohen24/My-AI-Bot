/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        coal: { DEFAULT: '#0B0F19', 900: '#0B0F19', 850: '#0F1422', 800: '#121828', 700: '#1E293B', 600: '#334155' },
        phantom: { DEFAULT: '#F59E0B', soft: '#FBBF24', deep: '#B45309' },
        critical: { DEFAULT: '#FF3B5C', soft: '#FF6B81', deep: '#9F1239' },
        healthy: { DEFAULT: '#10B981', soft: '#34D399', deep: '#065F46' },
        surge: { DEFAULT: '#38BDF8', soft: '#7DD3FC', deep: '#0369A1' },
        void: { DEFAULT: '#A78BFA', soft: '#C4B5FD', deep: '#5B21B6' },
      },
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glowAmber: '0 0 0 1px rgba(245,158,11,.5), 0 0 18px rgba(245,158,11,.35)',
        glowRed: '0 0 0 1px rgba(255,59,92,.55), 0 0 18px rgba(255,59,92,.4)',
        glowGreen: '0 0 14px rgba(16,185,129,.35)',
      },
      keyframes: {
        sweep: { to: { transform: 'rotate(360deg)' } },
        ping2: { '0%': { transform: 'scale(1)', opacity: '.8' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
        scan: { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(-100%)' } },
        flicker: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: {
        sweep: 'sweep 4s linear infinite',
        ping2: 'ping2 1.8s cubic-bezier(0,0,.2,1) infinite',
        scan: 'scan 6s linear infinite',
        flicker: 'flicker 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
