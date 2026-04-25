import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Without this, a render error during the setup
 * flow shows as a blank page (only the body background visible). This catches
 * the error and surfaces it on-screen so it can be diagnosed instead of guessed at.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BigaOS] Render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <div style={titleStyle}>Something went wrong</div>
            <div style={msgStyle}>{this.state.error.message}</div>
            {this.state.error.stack && (
              <pre style={preStyle}>{this.state.error.stack}</pre>
            )}
            <button style={buttonStyle} onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const containerStyle: React.CSSProperties = {
  width: '100vw',
  minHeight: '100dvh',
  background: '#0a1929',
  color: '#e0e0e0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  background: 'rgba(239, 83, 80, 0.08)',
  border: '1px solid rgba(239, 83, 80, 0.4)',
  borderRadius: '12px',
  padding: '24px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 700,
  color: '#ef5350',
  marginBottom: '8px',
};

const msgStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  marginBottom: '12px',
};

const preStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  background: 'rgba(0, 0, 0, 0.4)',
  padding: '10px',
  borderRadius: '6px',
  overflow: 'auto',
  maxHeight: '40vh',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const buttonStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '10px 16px',
  background: '#1976d2',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.95rem',
  cursor: 'pointer',
};
