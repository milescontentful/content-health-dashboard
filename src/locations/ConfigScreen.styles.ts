import tokens from '@contentful/f36-tokens';
import { CSSProperties } from 'react';

export const styles = {
  container: {
    marginLeft: 0,
    marginRight: 'auto',
    padding: tokens.spacingL,
    maxWidth: '960px',
  } as CSSProperties,

  setupColumn: {
    maxWidth: '400px',
  } as CSSProperties,

  image: {
    border: `1px solid ${tokens.gray300}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: `0 3px 6px ${tokens.gray400}`,
  } as CSSProperties,
};
