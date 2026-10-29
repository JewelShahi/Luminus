/** Tailwind CSS v3.4 + daisyUI v4.12 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  // JS files are scanned too, because script.js builds HTML with Tailwind classes
  content: ["./*.html", "./script.js", "./live-scene.js"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
};
