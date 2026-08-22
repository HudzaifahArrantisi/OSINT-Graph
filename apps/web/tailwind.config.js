/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system semantic tokens
        app: '#0b0f14',
        surface: {
          DEFAULT: '#111821',
          2: '#17202b',
          3: '#1d2733',
          hover: '#1f2937',
        },
        border: {
          subtle: '#283442',
          DEFAULT: '#374151',
        },
        text: {
          DEFAULT: '#f3f6f9',
          secondary: '#aeb9c6',
          muted: '#74808d',
        },
        primary: {
          DEFAULT: '#7c6cff',
          hover: '#8b7dff',
          muted: '#7c6cff33',
        },
        accent: {
          cyan: '#35c9e8',
          'cyan-muted': '#35c9e833',
        },
        status: {
          success: '#32c48d',
          'success-muted': '#32c48d33',
          warning: '#f2b84b',
          'warning-muted': '#f2b84b33',
          danger: '#ef6262',
          'danger-muted': '#ef626233',
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
