/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Paper & ink
        cream: '#fbf6ed',
        paper: '#ffffff',
        ink: '#2a2438',
        ink2: '#5c5470',
        ink3: '#8a829a',
        rule: '#e8dfd0',

        // Pastel accents
        lilac: '#c9b8ff',
        lilacDeep: '#8b6cf5',
        mint: '#a8ecd0',
        mintDeep: '#2fb579',
        peach: '#ffc9a8',
        peachDeep: '#ef7c3a',
        rose: '#ffb4c1',
        roseDeep: '#e0446a',
        butter: '#ffe07a',
        butterDeep: '#c99208',
        sky: '#bfe2ff',
        skyDeep: '#2e89c7',
      },
      boxShadow: {
        paper: '0 1px 0 rgba(42,36,56,0.04), 0 12px 32px -18px rgba(42,36,56,0.20)',
        paperLg:
          '0 2px 0 rgba(42,36,56,0.04), 0 30px 60px -25px rgba(42,36,56,0.25)',
        pressed: 'inset 0 2px 4px rgba(42,36,56,0.08)',
      },
      keyframes: {
        dash: {
          to: { strokeDashoffset: '-16' },
        },
        inkflow: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        wobble: {
          '0%, 100%': { transform: 'rotate(-1deg)' },
          '50%': { transform: 'rotate(1deg)' },
        },
      },
      animation: {
        dash: 'dash 1.2s linear infinite',
        inkflow: 'inkflow 8s linear infinite',
        bob: 'bob 3s ease-in-out infinite',
        wobble: 'wobble 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
