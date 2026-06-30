/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // สามารถเพิ่มสีประจำโรงเรียนเทพศิรินทร์พุแคไว้ตรงนี้ได้ในอนาคตครับ
      fontFamily: {
        sans: ['Noto Sans Thai', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#1B813E',
        secondary: '#FEE12B',
      }
    },
  },
  plugins: [],
}
