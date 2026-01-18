import React, { useState, useEffect } from 'react';

const ApiConfigModal = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('gemini_api_key');
    if (stored) setApiKey(stored);
  }, [isOpen]);

  const handleSave = () => {
    const cleaned = apiKey.trim();
    if (cleaned && !cleaned.startsWith('AIza')) {
       alert('Atenção: Chaves do Google API geralmente começam com "AIza". Verifique se você copiou o texto correto.');
    }
    if (cleaned.includes(' ') || cleaned.length > 200) {
      alert('Erro: A chave inserida parece conter texto inválido ou log de erros. Por favor cole apenas o código da chave.');
      return;
    }
    
    localStorage.setItem('gemini_api_key', cleaned);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-96">
        <h2 className="text-xl font-bold mb-4">Configurar Gemini AI</h2>
        <p className="text-sm text-gray-600 mb-4">
          Insira sua chave de API do Google Gemini (Flash) para ativar a correção inteligente de grade.
          Isso permite que o sistema analise falhas e sugira correções automáticas.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Cole sua API Key aqui..."
          className="w-full p-2 border rounded mb-4 text-sm font-mono"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiConfigModal;
