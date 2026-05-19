import { createContext, useContext, type ReactNode } from 'react';
import type { ThemeConfig } from './types';
import { DEFAULT_THEME } from './types';

const ThemeContext = createContext<ThemeConfig>(DEFAULT_THEME);

export function useTheme() {
  return useContext(ThemeContext);
}

interface Props {
  theme: ThemeConfig;
  children: ReactNode;
}

/**
 * Injects CSS custom properties so child components can reference
 * --chd-accent, --chd-bg, etc. without importing Tailwind.
 * Forma 36 components remain unaffected; this only controls the
 * shell chrome (header, background, active tab indicator).
 */
export function StudioThemeProvider({ theme, children }: Props) {
  const cssVars: Record<string, string> = {
    '--chd-accent': theme.accentColor,
    '--chd-accent-light': `${theme.accentColor}22`,
  };

  return (
    <ThemeContext.Provider value={theme}>
      <div style={cssVars as React.CSSProperties} className="chd-theme-root">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
