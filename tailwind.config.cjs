/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        navy: '#1a2332',
        accent: '#00ff88',
        background: '#f5f5f5',
        ink: '#333333'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace']
      },
      boxShadow: {
        card: '0 8px 24px rgba(26, 35, 50, 0.08)'
      }
    }
  },
  plugins: []
};
