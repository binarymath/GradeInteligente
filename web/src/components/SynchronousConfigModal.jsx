import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Copy, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { DAYS } from '../utils';
import SynchronousConfigService from '../services/SynchronousConfigService';

const SynchronousConfigModal = ({ subject, data, onSave, onClose }) => {
  const [configs, setConfigs] = useState(SynchronousConfigService.getSubjectConfigs(subject));
  const [editingId, setEditingId] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);
  const [selectedDayForSlots, setSelectedDayForSlots] = useState(DAYS[0]);
  const [classSearch, setClassSearch] = useState('');
  const [currentStep, setCurrentStep] = useState(1); // 1: Nome, 2: Dias, 3: Horários, 4: Turmas

  const handleAddConfig = () => {
    const newConfig = SynchronousConfigService.createEmptyConfig(`Configuração ${configs.length + 1}`);
    setConfigs([...configs, newConfig]);
    setEditingId(newConfig.id);
    setEditingConfig(newConfig);
    setSelectedDayForSlots(DAYS[0]);
    setCurrentStep(1);
  };

  const handleEditConfig = (config) => {
    setEditingId(config.id);
    setEditingConfig({ ...config });
  };

  const handleSaveEdit = () => {
    const validation = SynchronousConfigService.validateConfig(editingConfig, data);
    if (!validation.isValid) {
      // Inline feedback: keep using alert for now, but we also render helper text below
      alert(`Erro na configuração:\n${validation.errors.join('\n')}`);
      return;
    }

    setConfigs(configs.map(c => c.id === editingId ? editingConfig : c));
    setEditingId(null);
    setEditingConfig(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingConfig(null);
  };

  const handleDeleteConfig = (configId) => {
    if (confirm('Deseja remover esta configuração?')) {
      setConfigs(configs.filter(c => c.id !== configId));
    }
  };

  const handleDuplicateConfig = (config) => {
    const newConfig = SynchronousConfigService.duplicateConfig(config);
    setConfigs([...configs, newConfig]);
  };

  const handleToggleActive = (configId) => {
    setConfigs(configs.map(c => c.id === configId ? { ...c, isActive: !c.isActive } : c));
  };

  const handleSaveAll = () => {
    // Valida todas as configurações antes de salvar
    const allValid = configs.every(config => {
      const validation = SynchronousConfigService.validateConfig(config, data);
      return validation.isValid;
    });

    if (!allValid) {
      alert('Existem erros em algumas configurações. Corrija antes de salvar.');
      return;
    }

    onSave(configs);
  };
  const allSlots = useMemo(() => {
    const slots = [];
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      const day = DAYS[dayIdx];
      for (let slotIdx = 0; slotIdx < data.timeSlots.length; slotIdx++) {
        const slot = data.timeSlots[slotIdx];
        if (slot.type === 'aula') {
          slots.push({
            key: `${day}-${slotIdx}`,
            day,
            slotIdx,
            start: slot.start,
            end: slot.end,
            label: `${day} ${slot.start}-${slot.end}`
          });
        }
      }
    }
    return slots;
  }, [data.timeSlots]);

  const filteredClasses = useMemo(() => {
    const needle = classSearch.trim().toLowerCase();
    if (!needle) return data.classes;
    return data.classes.filter(cls => (cls.name || '').toLowerCase().includes(needle));
  }, [classSearch, data.classes]);

  const quickSelectByGrade = (gradeNumber) => {
    if (!editingConfig) return;
    const next = new Set(editingConfig.classes);
    data.classes.forEach(cls => {
      const name = (cls.name || '').toLowerCase();
      // Match numbers like "6", "6º", "6 ano" at start
      const matches = new RegExp(`^${gradeNumber}(?:º|°|\s|\.)`).test(name);
      if (matches) next.add(cls.id);
    });
    setEditingConfig({ ...editingConfig, classes: Array.from(next) });
  };

  const toggleAllFilteredClasses = (select) => {
    if (!editingConfig) return;
    const ids = filteredClasses.map(c => c.id);
    const current = new Set(editingConfig.classes);
    if (select) ids.forEach(id => current.add(id));
    else ids.forEach(id => current.delete(id));
    setEditingConfig({ ...editingConfig, classes: Array.from(current) });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 flex justify-between items-center border-b">
          <div>
            <h2 className="text-2xl font-bold">{subject.name}</h2>
            <p className="text-blue-100 text-sm mt-1">Configuração Síncrona Granular</p>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Explicação */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-slate-700">
              <strong>ℹ️ Configuração Granular:</strong> Defina múltiplas configurações para esta aula síncrona.
              Exemplo: OE Matemática pode ter diferentes turmas em diferentes horários.
            </p>
          </div>

          {/* Stepper */}
          {editingId && (
            <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
              {[1,2,3,4].map(step => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setCurrentStep(step)}
                  className={`px-3 py-1 rounded border ${currentStep===step ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                >
                  {step===1 && 'Nome'}
                  {step===2 && 'Dias'}
                  {step===3 && 'Horários'}
                  {step===4 && 'Turmas'}
                </button>
              ))}
            </div>
          )}

          {/* Lista de Configurações */}
          <div className="space-y-3">
            {configs.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                Nenhuma configuração. Clique em "Adicionar" para começar.
              </div>
            ) : (
              configs.map(config => (
                <div
                  key={config.id}
                  className={`border rounded-lg p-4 transition-all ${
                    editingId === config.id
                      ? 'border-blue-500 bg-blue-50'
                      : `border-slate-200 ${!config.isActive ? 'opacity-50 bg-slate-50' : 'bg-white'}`
                  }`}
                >
                  {editingId === config.id ? (
                    // Modo edição com stepper
                    <div className="space-y-4">
                      {/* Nome (Step 1) */}
                      {currentStep === 1 && (
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Nome da Configuração</label>
                          <input
                            type="text"
                            value={editingConfig.name}
                            onChange={e => setEditingConfig({ ...editingConfig, name: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="Ex: 6º e 7º anos - 1ª/2ª aula"
                          />
                          <p className="mt-1 text-[10px] text-slate-500">Dê um nome claro para identificar esta configuração.</p>
                          <div className="flex justify-end mt-3">
                            <button onClick={() => setCurrentStep(2)} className="px-3 py-2 rounded bg-blue-600 text-white text-xs flex items-center gap-1"><span>Continuar</span><ChevronRight size={14} /></button>
                          </div>
                        </div>
                      )}

                      {/* Dias (Step 2) */}
                      {currentStep === 2 && (
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Dias da Semana</label>
                          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                            {DAYS.map(day => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => {
                                  const updated = editingConfig.days.includes(day)
                                    ? editingConfig.days.filter(d => d !== day)
                                    : [...editingConfig.days, day];
                                  setEditingConfig({ ...editingConfig, days: updated });
                                  setSelectedDayForSlots(day);
                                }}
                                className={`px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                                  editingConfig.days.includes(day)
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {day.substring(0, 3)}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">Selecione os dias em que esta aula pode ocorrer.</p>
                          <div className="flex justify-between mt-3">
                            <button onClick={() => setCurrentStep(1)} className="px-3 py-2 rounded bg-slate-200 text-slate-700 text-xs">Voltar</button>
                            <button onClick={() => setCurrentStep(3)} className="px-3 py-2 rounded bg-blue-600 text-white text-xs flex items-center gap-1"><span>Continuar</span><ChevronRight size={14} /></button>
                          </div>
                        </div>
                      )}

                      {/* Horários (Step 3) */}
                      {currentStep === 3 && (
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Horários</label>
                          {/* Filtro por dia */}
                          <div className="mb-2">
                            <div className="flex gap-1 flex-wrap">
                              {DAYS.map(day => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => setSelectedDayForSlots(day)}
                                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${selectedDayForSlots === day ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                                >
                                  {day.substring(0,3)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-3 bg-white space-y-1">
                            {allSlots.filter(s => s.day === selectedDayForSlots).map(slot => (
                              <button
                                key={slot.key}
                                type="button"
                                onClick={() => {
                                  const updated = editingConfig.timeSlots.includes(slot.key)
                                    ? editingConfig.timeSlots.filter(s => s !== slot.key)
                                    : [...editingConfig.timeSlots, slot.key];
                                  setEditingConfig({ ...editingConfig, timeSlots: updated });
                                }}
                                className={`w-full text-left px-3 py-2 rounded text-[11px] transition-colors ${
                                  editingConfig.timeSlots.includes(slot.key)
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {slot.start}-{slot.end}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">Selecione os horários dentro dos dias escolhidos.</p>
                          <div className="flex justify-between mt-3">
                            <button onClick={() => setCurrentStep(2)} className="px-3 py-2 rounded bg-slate-200 text-slate-700 text-xs">Voltar</button>
                            <button onClick={() => setCurrentStep(4)} className="px-3 py-2 rounded bg-blue-600 text-white text-xs flex items-center gap-1"><span>Continuar</span><ChevronRight size={14} /></button>
                          </div>
                        </div>
                      )}

                      {/* Turmas (Step 4) */}
                      {currentStep === 4 && (
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Turmas</label>
                          {/* Ferramentas */}
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={classSearch}
                              onChange={e => setClassSearch(e.target.value)}
                              className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                              placeholder="Pesquisar turmas (ex: 6º, 9A, Fundamental)"
                              aria-label="Pesquisar turmas"
                            />
                            <button onClick={() => toggleAllFilteredClasses(true)} className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-[11px]">Selecionar filtradas</button>
                            <button onClick={() => toggleAllFilteredClasses(false)} className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-[11px]">Limpar filtradas</button>
                          </div>
                          <div className="flex gap-1 mb-2">
                            {[5,6,7,8,9].map(n => (
                              <button key={n} type="button" onClick={() => quickSelectByGrade(n)} className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-[11px] hover:bg-slate-200">{n}º</button>
                            ))}
                          </div>
                          <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-3 bg-white space-y-1">
                            {filteredClasses.map(cls => (
                              <button
                                key={cls.id}
                                type="button"
                                onClick={() => {
                                  const updated = editingConfig.classes.includes(cls.id)
                                    ? editingConfig.classes.filter(id => id !== cls.id)
                                    : [...editingConfig.classes, cls.id];
                                  setEditingConfig({ ...editingConfig, classes: updated });
                                }}
                                className={`w-full text-left px-3 py-2 rounded text-[11px] transition-colors ${
                                  editingConfig.classes.includes(cls.id)
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {cls.name}
                              </button>
                            ))}
                          </div>
                          <div className="flex justify-between mt-3">
                            <button onClick={() => setCurrentStep(3)} className="px-3 py-2 rounded bg-slate-200 text-slate-700 text-xs">Voltar</button>
                          </div>
                        </div>
                      )}

                      {/* Botões de Ação */}
                      <div className="flex gap-2 justify-end pt-2 border-t">
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-2 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <X size={16} /> Cancelar
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <Check size={16} /> Salvar
                        </button>
                      </div>
                      {/* Inline validation helper */}
                      {(() => {
                        const v = SynchronousConfigService.validateConfig(editingConfig, data);
                        if (v.isValid) return null;
                        return (
                          <div className="mt-2 text-[11px] text-red-600">
                            {v.errors.join(' • ')}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    // Modo visualização
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-700">{config.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {config.days.length > 0 && (
                            <>
                              📅 {config.days.join(', ')}{' '}
                              {config.timeSlots.length > 0 && '•'}{' '}
                            </>
                          )}
                          {config.timeSlots.length > 0 && (
                            <>
                              🕐 {config.timeSlots.map(key => {
                                const slot = allSlots.find(s => s.key === key);
                                return slot ? `${slot.start}-${slot.end}` : key;
                              }).join(', ')}{' '}
                              {config.classes.length > 0 && '•'}{' '}
                            </>
                          )}
                          {config.classes.length > 0 && (
                            <>
                              👥 {config.classes.map(id => data.classes.find(c => c.id === id)?.name || id).join(', ')}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleToggleActive(config.id)}
                          title={config.isActive ? 'Desativar' : 'Ativar'}
                          className={`p-2 rounded-lg transition-colors ${
                            config.isActive
                              ? 'text-blue-600 hover:bg-blue-50'
                              : 'text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          {config.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                        <button
                          onClick={() => handleDuplicateConfig(config)}
                          title="Duplicar"
                          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => handleEditConfig(config)}
                          title="Editar"
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(config.id)}
                          title="Remover"
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Botão Adicionar */}
          <button
            onClick={handleAddConfig}
            disabled={editingId !== null}
            className="w-full py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Adicionar Configuração
          </button>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-50 border-t p-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors font-medium"
          >
            Cancelar
          </button>
          {(() => {
            const allValid = configs.every(c => SynchronousConfigService.validateConfig(c, data).isValid);
            const disabled = editingId !== null || !allValid;
            return (
              <button
                onClick={handleSaveAll}
                disabled={disabled}
                title={disabled ? (editingId ? 'Conclua a edição antes de salvar' : 'Há erros nas configurações') : 'Salvar todas as configurações'}
                className={`px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 ${disabled ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
              >
                <Check size={18} /> Salvar Configurações
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default SynchronousConfigModal;
