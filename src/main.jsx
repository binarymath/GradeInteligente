import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

console.log('Grade Inteligente - Iniciando aplicação...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Elemento #root não encontrado no DOM!');
} else {
  console.log('Elemento #root encontrado, montando React...');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  console.log('React montado com sucesso!');
}
