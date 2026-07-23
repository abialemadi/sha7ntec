import type { Config } from 'tailwindcss';

// Design tokens merged from the MVP prototype: a brighter blue + green
// enterprise identity on cool, blue-tinted neutrals. Token NAMES are kept
// stable so every existing utility class shifts to the new palette at once.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class', // never auto-invert; we force light only (see layout meta)
  theme: {
    extend: {
      colors: {
        bg: '#F3F8FB',
        panel: '#FFFFFF',
        panelAlt: '#F6FAFC',
        border: '#D9E8F0',
        borderStrong: '#BFDCEA',
        navy: '#13314A',
        ink: '#1A2B3D',
        dim: '#5C7488',
        faint: '#9AB0BF',
        blue: '#2E8FE0',
        blueBright: '#4FA8F0',
        green: '#1FAE6E',
        amber: '#E0A23A',
        gold: '#D9A62E',
        violet: '#7B6FD0',
        red: '#E0604A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(20,60,90,0.05)',
        cardHover: '0 4px 16px rgba(20,60,90,0.08)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2E8FE0, #1FAE6E)',
      },
    },
  },
  plugins: [],
};

export default config;
