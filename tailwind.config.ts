import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Essence v3.0 Core Palette
        blue: {
          50: "hsl(var(--essence-core-blue-50))",
          100: "hsl(var(--essence-core-blue-100))",
          300: "hsl(var(--essence-core-blue-300))",
          500: "hsl(var(--essence-core-blue-500))",
          600: "hsl(var(--essence-core-blue-600))",
          700: "hsl(var(--essence-core-blue-700))",
          800: "hsl(var(--essence-core-blue-800))",
          950: "hsl(var(--essence-core-blue-950))",
        },
        neutral: {
          0: "hsl(var(--essence-core-neutral-0))",
          50: "hsl(var(--essence-core-neutral-50))",
          100: "hsl(var(--essence-core-neutral-100))",
          200: "hsl(var(--essence-core-neutral-200))",
          400: "hsl(var(--essence-core-neutral-400))",
          600: "hsl(var(--essence-core-neutral-600))",
          700: "hsl(var(--essence-core-neutral-700))",
          800: "hsl(var(--essence-core-neutral-800))",
          900: "hsl(var(--essence-core-neutral-900))",
          950: "hsl(var(--essence-core-neutral-950))",
        },
        
        // Essence Semantic Tokens
        surface: {
          canvas: "hsl(var(--essence-surface-canvas))",
          primary: "hsl(var(--essence-surface-primary))",
          secondary: "hsl(var(--essence-surface-secondary))",
          tertiary: "hsl(var(--essence-surface-tertiary))",
        },
        content: {
          primary: "hsl(var(--essence-content-primary))",
          secondary: "hsl(var(--essence-content-secondary))",
          tertiary: "hsl(var(--essence-content-tertiary))",
          inverse: "hsl(var(--essence-content-inverse))",
        },
        accent: {
          DEFAULT: "hsl(var(--essence-accent-default))",
          hover: "hsl(var(--essence-accent-hover))",
          text: "hsl(var(--essence-accent-text))",
        },
        semantic: {
          success: "hsl(var(--essence-semantic-success))",
          warning: "hsl(var(--essence-semantic-warning))",
          error: "hsl(var(--essence-semantic-error))",
        },
        glass: {
          surface: "hsl(var(--essence-glass-surface))",
          border: "hsl(var(--essence-glass-border))",
        },
        
        // Shadcn Compatibility
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1.5rem",
        "2xl": "2rem",
        "3xl": "3rem",
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'sm': 'var(--essence-shadows-sm)',
        'md': 'var(--essence-shadows-md)',
        'lg': 'var(--essence-shadows-lg)',
        'xl': '0 25px 50px -12px rgba(0, 0, 0, 0.12)',
        '2xl': '0 35px 60px -15px rgba(0, 0, 0, 0.15)',
        'inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.04)',
        'glass': '0 10px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      },
      fontSize: {
        // Essence v3.0 Typography Scale with Optical Letter Spacing
        'caption-2': ['0.6875rem', { letterSpacing: '0.025em' }],  // 11px
        'caption-1': ['0.75rem', { letterSpacing: '0.02em' }],     // 12px
        'footnote': ['0.8125rem', { letterSpacing: '0.015em' }],   // 13px
        'body-sm': ['0.875rem', { letterSpacing: '0.01em' }],      // 14px
        'body': ['1rem', { letterSpacing: '0em' }],                // 16px
        'subhead': ['1.125rem', { letterSpacing: '-0.005em' }],    // 18px
        'title-3': ['1.25rem', { letterSpacing: '-0.01em' }],      // 20px
        'title-2': ['1.5rem', { letterSpacing: '-0.015em' }],      // 24px
        'title-1': ['1.875rem', { letterSpacing: '-0.02em' }],     // 30px
        'large-title': ['2.25rem', { letterSpacing: '-0.025em' }], // 36px
        'display': ['3rem', { letterSpacing: '-0.03em' }],         // 48px
      },
      fontWeight: {
        light: '300',
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        black: '900',
      },
      backdropBlur: {
        sm: 'blur(8px)',
        md: 'blur(16px)',
        lg: 'blur(24px)',
        xl: 'blur(40px)',
      },
      backdropSaturate: {
        DEFAULT: 'saturate(180%)',
        high: 'saturate(200%)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)",
        "accordion-up": "accordion-up 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)",
        "fade-in": "fade-in 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)",
        "slide-up": "slide-up 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
        "shimmer": "shimmer 2s linear infinite",
      },
      transitionDuration: {
        '75': '75ms',
        '150': '150ms',
        '250': '250ms',
        '400': '400ms',
        '700': '700ms',
      },
      transitionTimingFunction: {
        'standard': 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        'decelerate': 'cubic-bezier(0.0, 0.0, 0.2, 1)',
        'accelerate': 'cubic-bezier(0.4, 0.0, 1, 1)',
        'dynamic': 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
        'apple': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
