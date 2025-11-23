// Serviço para operações de backup/import do estado.

/** Exporta arquivo JSON de backup. */
export function exportBackup(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `grade_inteligente_backup_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Lê arquivo de backup e atualiza estado via setData. */
export function importBackup(file, setData, onError) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      setData(parsed);
      alert('Backup restaurado com sucesso!');
    } catch (err) {
      alert('Erro ao ler arquivo de backup.');
      if (onError) onError(err);
    }
  };
  reader.readAsText(file);
}
