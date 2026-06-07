import { createContext, useState, useEffect } from 'react'

export const ThemeContext = createContext()

const lightTheme = {
  name: 'light',
  bg: '#ffffff',
  bgSecondary: '#f8fafc',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  shadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
  colors: {
    primary: '#0f766e',      // teal
    secondary: '#2563eb',    // blue
    success: '#16a34a',      // green
    danger: '#dc2626',       // red
    warning: '#ea580c',      // orange
    info: '#0284c7',         // light blue
    neutral: '#6b7280',      // gray
  }
}

const darkTheme = {
  name: 'dark',
  bg: '#0f172a',
  bgSecondary: '#1e293b',
  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  border: '#334155',
  shadow: '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)',
  shadowMd: '0 4px 6px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.4)',
  colors: {
    primary: '#14b8a6',      // teal
    secondary: '#3b82f6',    // blue
    success: '#22c55e',      // green
    danger: '#ef4444',       // red
    warning: '#f97316',      // orange
    info: '#06b6d4',         // light blue
    neutral: '#9ca3af',      // gray
  }
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? saved === 'dark' : false
  })

  const theme = isDark ? darkTheme : lightTheme

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ theme, isDark, setIsDark }}>
      {children}
    </ThemeContext.Provider>
  )
}
