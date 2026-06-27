/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "media",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        norfood: {
          orange: "#FF7A00",
          orangeDark: "#FF5A00",
          orangeSoft: "#FF9100",
          ink: "#1A1A1A",
          muted: "#6B7280",
          cream: "#FFF4E8",
          surface: "#F6F7F9",
        },
      },
      fontFamily: {
        display: ["Manrope_800ExtraBold"],
        body: ["Manrope_500Medium"],
      },
      boxShadow: {
        card: "0 18px 50px rgba(26, 26, 26, 0.1)",
      },
    },
  },
  plugins: [],
};
