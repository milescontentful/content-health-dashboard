import { Component, type ReactNode } from 'react';
import { Note } from '@contentful/f36-components';

// Catches render errors inside a single module so one crashing module
// can't blank the whole dashboard (fatal during a live demo).
export class ModuleErrorBoundary extends Component<
  { children: ReactNode; moduleLabel?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Note variant="negative" title={`${this.props.moduleLabel ?? 'This module'} hit an error`}>
          {this.state.error.message}
        </Note>
      );
    }
    return this.props.children;
  }
}
