/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#3b82f6",
          hover: "#2563eb",
        },
        secondary: {
          DEFAULT: "#6b7280",
          hover: "#4b5563",
        },
      },
      borderRadius: {
        container: "0.75rem",
      },
      boxShadow: {
        'neo-glow-dark': '0 0 15px rgba(41, 237, 94, 0.8)',
        'neo-glow-border': '0 0 0 1px rgba(41, 237, 94, 0.8), 0 0 10px 2px rgba(41, 237, 94, 0.6)',
      },
      backgroundImage: {
        'market-gradient': 'linear-gradient(90deg, #29903B 0%, #4CAF50 50%, #8BC34A 100%)',
        'button-gradient': 'linear-gradient(90deg, #29903B 0%, #4CAF50 100%)',
        'button-hover': 'linear-gradient(90deg, #1e7a2e 0%, #3d8b40 100%)',
      },
    },
  },
  plugins: [],
};
