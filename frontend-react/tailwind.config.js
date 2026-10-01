/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050e1f',
          900: '#0a1628',
          800: '#0f1d35',
          700: '#152642',
        },
        coral: {
          500: '#ff6b4a',
          400: '#ff8568',
          300: '#ffa086',
        },
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        /* 09. Typography — the MeLun brand font used by the logo wordmark. */
        brand: ['Poppins', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}