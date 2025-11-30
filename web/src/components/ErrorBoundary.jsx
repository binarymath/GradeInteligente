import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'system-ui', maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ color: '#dc2626' }}>Erro ao Carregar Aplicação</h1>
          <p style={{ color: '#64748b' }}>Ocorreu um erro inesperado. Por favor, recarregue a página.</p>
          <details style={{ marginTop: '20px', padding: '12px', background: '#f1f5f9', borderRadius: '6px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Detalhes do Erro</summary>
            <pre style={{ marginTop: '10px', fontSize: '12px', overflow: 'auto' }}>
              {this.state.error?.toString()}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
