import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';


const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Elemento #root não encontrado no DOM!');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>
  );
}
