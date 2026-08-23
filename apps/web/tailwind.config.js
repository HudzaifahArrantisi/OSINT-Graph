/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system semantic tokens — Tactical OSINT cyber theme
        app: '#080c14',
        surface: {
          DEFAULT: '#0d121c',
          2: '#121927',
          3: '#182234',
          hover: '#1b263a',
        },
        border: {
          subtle: '#1a2334',
          DEFAULT: '#253248',
        },
        text: {
          DEFAULT: '#e2e8f0',
          secondary: '#94a3b8',
          muted: '#64748b',
        },
        primary: {
          DEFAULT: '#0284c7',
          hover: '#0369a1',
          muted: '#0284c725',
        },
        accent: {
          cyan: '#38bdf8',
          'cyan-muted': '#38bdf820',
        },
        status: {
          success: '#10b981',
          'success-muted': '#10b98120',
          warning: '#f59e0b',
          'warning-muted': '#f59e0b20',
          danger: '#f43f5e',
          'danger-muted': '#f43f5e20',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
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
        card: '10px',
        input: '8px',
        button: '8px',
        badge: '999px',
        'graph-node': '10px',
        modal: '12px',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
        'slide-in-up': 'slideInUp 180ms ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideInRight: {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideInUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      transitionDuration: {
        micro: '120ms',
        panel: '200ms',
        modal: '220ms',
      },
    },
  },
  plugins: [],
};
