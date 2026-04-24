/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#050607',
          card: '#101318',
          border: '#2a3340',
          text: '#f4f5f7',
          muted: '#9ca6b5',
        }
      }
    },
  },
  plugins: [],
}
