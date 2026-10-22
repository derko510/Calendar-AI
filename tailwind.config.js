/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        paper: '#F5F2EC',
        surface: '#FFFFFF',
        line: '#E6E1D7',
        ink: { DEFAULT: '#1D1C1A', soft: '#3A3833' },
        muted: '#7A746A',
        accent: { DEFAULT: '#C4502B', soft: '#F6E3DA' },
      },
    },
  },
  plugins: [],
}
