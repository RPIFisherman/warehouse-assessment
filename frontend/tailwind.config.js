/** @type {import('tailwindcss').Config} */
const twColors = require('tailwindcss/colors');
export default {
  content: ['./index.html', './src/**/*.{js,ts,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        transparent: 'transparent', current: 'currentColor',
        primary: { DEFAULT: 'var(--bg-primary)', hover: 'var(--bg-primary-hover)', foreground: 'var(--text-primary)', border: 'var(--border-primary)' },
        secondary: { DEFAULT: 'var(--bg-secondary)', hover: 'var(--bg-secondary-hover)', foreground: 'var(--text-secondary)', border: 'var(--border-secondary)' },
        tertiary: { DEFAULT: 'var(--bg-tertiary)', hover: 'var(--bg-tertiary-hover)', foreground: 'var(--text-tertiary)', border: 'var(--border-tertiary)' },
        filled: 'var(--bg-filled)',
        positive: { DEFAULT: 'var(--bg-positive-primary)', hover: 'var(--bg-positive-primary-hover)', secondary: 'var(--bg-positive-secondary)', tertiary: 'var(--bg-positive-tertiary)', foreground: 'var(--text-positive)', border: { DEFAULT: 'var(--border-positive-primary)', secondary: 'var(--border-positive-secondary)', tertiary: 'var(--border-positive-tertiary)' } },
        warning: { DEFAULT: 'var(--bg-warning-primary)', hover: 'var(--bg-warning-primary-hover)', secondary: 'var(--bg-warning-secondary)', tertiary: 'var(--bg-warning-tertiary)', foreground: 'var(--text-warning)', border: { DEFAULT: 'var(--border-warning-primary)', secondary: 'var(--border-warning-secondary)', tertiary: 'var(--border-warning-tertiary)' } },
        danger: { DEFAULT: 'var(--bg-danger-primary)', hover: 'var(--bg-danger-primary-hover)', secondary: 'var(--bg-danger-secondary)', tertiary: 'var(--bg-danger-tertiary)', foreground: 'var(--text-danger)', border: { DEFAULT: 'var(--border-danger-primary)', secondary: 'var(--border-danger-secondary)', tertiary: 'var(--border-danger-tertiary)' } },
        brand: { DEFAULT: 'var(--bg-brand-primary)', hover: 'var(--bg-brand-primary-hover)', secondary: 'var(--bg-brand-secondary)', tertiary: 'var(--bg-brand-tertiary)', foreground: 'var(--text-brand)', border: { DEFAULT: 'var(--border-brand-primary)', secondary: 'var(--border-brand-secondary)', tertiary: 'var(--border-brand-tertiary)' } },
        on: { positive: { primary: 'var(--text-on-positive-primary)', secondary: 'var(--text-on-positive-secondary)' }, warning: { primary: 'var(--text-on-warning-primary)', secondary: 'var(--text-on-warning-secondary)' }, danger: { DEFAULT: 'var(--text-on-danger-primary)', secondary: 'var(--text-on-danger-secondary)' }, brand: 'var(--text-on-brand)' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [
    function ({ addBase }) {
      const c = twColors;
      const vars = {};
      const scales = { black: null, white: null, slate: c.slate, gray: c.gray, zinc: c.zinc, neutral: c.neutral, stone: c.stone, red: c.red, orange: c.orange, amber: c.amber, yellow: c.yellow, lime: c.lime, green: c.green, emerald: c.emerald, teal: c.teal, cyan: c.cyan, sky: c.sky, indigo: c.indigo, violet: c.violet, purple: null, fuchsia: c.fuchsia, pink: c.pink, rose: c.rose };
      // black/white with alpha
      for (const [s, o] of [['black','0,0,0'],['white','255,255,255']]) {
        [50,100,200,300,400,500,600,700,800,900,950].forEach(n => { vars[`--${s}-${n}`] = `rgba(${o}, ${n <= 50 ? 0.05 : n/1000})`; });
        vars[`--${s}-1000`] = s === 'black' ? '#000000' : '#ffffff';
      }
      // custom slate overrides
      const slateCustom = {50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#333847',800:'#2b2f3b',900:'#23262f',950:'#21232b',1000:'#1b1c23'};
      for (const [n,v] of Object.entries(slateCustom)) vars[`--slate-${n}`] = v;
      // custom blue overrides
      const blueCustom = {50:'#e6f1fa',100:'#cce2f6',200:'#99c5ec',300:'#66a8e3',400:'#338bd9',500:'#006ed0',600:'#0058a6',700:'#00427d',800:'#002c53',900:'#00162a',950:'#000012'};
      for (const [n,v] of Object.entries(blueCustom)) vars[`--blue-${n}`] = v;
      // custom purple overrides
      const purpleCustom = {50:'#f1ebfa',100:'#e0d1f3',200:'#c5aae7',300:'#aa83db',400:'#8f5dce',500:'#753bbd',600:'#6935a9',700:'#5d3095',800:'#512a81',900:'#45246e',950:'#391e5a'};
      for (const [n,v] of Object.entries(purpleCustom)) vars[`--purple-${n}`] = v;
      // standard TW colors
      for (const [name, palette] of Object.entries(scales)) {
        if (!palette || ['black','white'].includes(name)) continue;
        if (['slate','blue','purple'].includes(name)) continue; // already handled
        for (const [shade, value] of Object.entries(palette)) {
          if (typeof value === 'string') vars[`--${name}-${shade}`] = value;
        }
      }
      addBase({ ':root': vars });
      addBase({ '.el-button': { 'background-color': 'var(--el-button-bg-color,var(--el-color-white))' } });
    },
  ],
};
