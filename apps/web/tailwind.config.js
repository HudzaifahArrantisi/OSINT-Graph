/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Pure Monochrome Dark & White Design System — Modern, Minimalist, Anti-Slop
        app: '#050505',
        surface: {
          DEFAULT: '#0a0a0a',
          2: '#121212',
          3: '#1a1a1a',
          hover: '#222222',
        },
        border: {
          subtle: '#181818',
          DEFAULT: '#262626',
          strong: '#404040',
        },
        text: {
          DEFAULT: '#ededed',
          secondary: '#a1a1a1',
          muted: '#666666',
        },
        primary: {
          DEFAULT: '#ffffff',
          hover: '#e5e5e5',
          muted: '#ffffff15',
        },
        accent: {
          cyan: '#ffffff',
          'cyan-muted': '#ffffff15',
        },
        status: {
          success: '#ededed',
          'success-muted': '#ffffff12',
          warning: '#d4d4d4',
          'warning-muted': '#ffffff12',
          danger: '#ffffff',
          'danger-muted': '#ffffff12',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'graph-label': ['0.75rem', { lineHeight: '1rem' }],
        metadata: ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
        '4xl': '40px',
        '5xl': '48px',
      },
      borderRadius: {
        card: '8px',
        input: '6px',
        button: '6px',
        badge: '999px',
        'graph-node': '8px',
        modal: '10px',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-in-right': 'slideInRight 150ms ease-out',
        'slide-in-up': 'slideInUp 150ms ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideInRight: {
          from: { transform: 'translateX(12px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideInUp: {
          from: { transform: 'translateY(6px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      transitionDuration: {
        micro: '100ms',
        panel: '150ms',
        modal: '180ms',
      },
    },
  },
  plugins: [],
};
