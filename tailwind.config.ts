import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './content/**/*.{md,mdx}',
    './.contentlayer/generated/**/*.{ts,tsx}',
    './.contentlayer2/generated/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        canvas: {
          DEFAULT: 'hsl(var(--canvas))',
          2: 'hsl(var(--canvas-2))'
        },
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          subtle: 'hsl(var(--ink-subtle))'
        },
        line: 'hsl(var(--line))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          2: 'hsl(var(--accent-2))'
        }
      },
      boxShadow: {
        hairline: '0 0 0 1px hsl(var(--line))'
      }
    }
  },
  plugins: [typography]
};

export default config;
