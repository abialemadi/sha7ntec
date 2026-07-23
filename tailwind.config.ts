import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class', // never auto-invert; we force light only (see layout meta)
  theme: {
    extend: {
      colors: {
        bg: '#F0F6FA',
        panel: '#FFFFFF',
        panelAlt: '#F6FAFD',
        border: '#D4E6F0',
        navy: '#0F2C45',
        ink: '#1A3347',
        dim: '#4A6878',
        faint: '#8AAABB',
        blue: '#2280D2',
        green: '#18A865',
        amber: '#D4921E',
        violet: '#6B5EC7',
        red: '#D44A3A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
