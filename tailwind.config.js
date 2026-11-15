// SPDX-License-Identifier: GPL-2.0-only
/*
 * Copyright (C) 2026 Arthur <arthur.paludo.c@gmail.com>
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './pages/**/*.html',
    './js/**/*.js'
  ],
  darkMode: 'class', // Enforce class mode so Tailwind never activates dark theme via prefers-color-scheme
  theme: {
    extend: {
      colors: {
        gray: {
          900: '#111827',
          800: '#1f2937',
          750: '#2d3748',
          700: '#374151'
        }
      },
      spacing: {
        '4.5': '1.125rem'
      },
      borderRadius: {
        'xs': '0.125rem'
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'xs': '0 1px 2px 0 rgb(0 0 0 / 0.05)'
      },
      scale: {
        '130': '1.3'
      }
    }
  },
  plugins: []
};
