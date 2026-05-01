/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pickle: {
          50: "#f3f7ec",
          100: "#e3edd1",
          200: "#c8dca7",
          300: "#a4c474",
          400: "#84ac4a",
          500: "#65902f",
          600: "#4d7222",
          700: "#3d591d",
          800: "#33481c",
          900: "#2c3d1a",
        },
      },
    },
  },
  plugins: [],
};
