/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "media",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        honey: {
          deep: "#3D5A40",
          leaf: "#556B57",
          gold: "#D8A03D",
          amber: "#F2C14E",
          cream: "#FAF5EB",
          soft: "#ECE7DD",
        },
      },
      fontFamily: {
        display: ["CormorantGaramond_700Bold"],
        body: ["Manrope_500Medium"],
      },
      boxShadow: {
        card: "0 18px 50px rgba(109, 84, 39, 0.12)",
      },
    },
  },
  plugins: [],
};
