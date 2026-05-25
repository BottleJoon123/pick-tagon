const plugin = require('tailwindcss/plugin')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './public/js/**/*.js',
  ],
  corePlugins: {
    // Avoid conflicts with existing index.html base resets
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        dark:    '#080808',
        ufcRed:  '#E10600',
        ufcBlue: '#2563eb',
        gold:    '#f59e0b',
      },
      fontFamily: {
        barlow: ['Barlow Condensed', 'sans-serif'],
        inter:  ['Inter', 'sans-serif'],
        oswald: ['Oswald', 'sans-serif'],
      },
      // Non-standard opacity values used as color modifiers (e.g. border-white/6)
      // Default Tailwind scale only includes multiples of 5; add fine-grained steps
      opacity: {
        '2':  '0.02',
        '3':  '0.03',
        '4':  '0.04',
        '6':  '0.06',
        '7':  '0.07',
        '8':  '0.08',
      },
    },
  },
  plugins: [
    // tailwind-scrollbar-hide v4 is ESM-only; inline equivalent for v3 CJS compat
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width':    'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        '.scrollbar-default': {
          '-ms-overflow-style': 'auto',
          'scrollbar-width':    'auto',
          '&::-webkit-scrollbar': { display: 'block' },
        },
      })
    }),
  ],
}
