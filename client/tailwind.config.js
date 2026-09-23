/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        heading: ['LibreBaskerville_700Bold'],
        body: ['BricolageGrotesque_400Regular'],
        label: ['BricolageGrotesque_600SemiBold'],
      },
      colors: {
        sage: {
          50: '#f5f7f1',
          100: '#e9eee1',
          200: '#d3ddc5',
          300: '#b3c49f',
          400: '#93aa7d',
          500: '#7a9264',
          600: '#61754e',
          700: '#4d5d3f',
          800: '#404b36',
          900: '#37402f',
        },
        cream: {
          50: '#fffdf9',
          100: '#fdf8ee',
          200: '#f8efd9',
          300: '#f0e2bd',
          400: '#e4cd94',
        },
      },
    },
  },
  plugins: [],
};
