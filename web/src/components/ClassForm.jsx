import React, { useState } from 'react';
import { Calendar, Coffee, Utensils, Plus } from 'lucide-react';
import { computeSlotShift } from '../utils/time';
import { DAYS } from '../utils';

/**
 * Componente de seleção de horários por dia da semana
 * @param {Object} props
 * @param {Array} props.timeSlots - Lista de todos os slots de horário
 * @param {string} props.selectedShift - Turno selecionado (Manhã, Tarde, Noite, Integral...)
 * @param {Object} props.activeSlotsByDay - Mapa de slots ativos por dia { dayIdx: [slotIds] }
 * @param {Function} props.setActiveSlotsByDay - Função para atualizar activeSlotsByDay
 */
const ClassForm = ({ timeSlots, selectedShift, activeSlotsByDay, setActiveSlotsByDay }) => {
  const [selectedDay, setSelectedDay] = useState(0); // 0 = Segunda

  const toggleSlotForDay = (slotId, dayIdx) => {
    setActiveSlotsByDay(prev => {
      const newMap = { ...prev };
      const daySlots = newMap[dayIdx] || [];

      if (daySlots.includes(slotId)) {
        // Remove slot deste dia
        newMap[dayIdx] = daySlots.filter(id => id !== slotId);
        if (newMap[dayIdx].length === 0) {
          delete newMap[dayIdx];
        }
      } else {
        // Adiciona slot neste dia
        newMap[dayIdx] = [...daySlots, slotId];
      }

      return newMap;
    });
  };

  const toggleSlotForAllDays = (slotId) => {
    // Toggle em todos os dias de uma vez
    const allDaysHaveSlot = DAYS.every((_, dayIdx) => {
      const daySlots = activeSlotsByDay[dayIdx] || [];
      return daySlots.includes(slotId);
    });

    setActiveSlotsByDay(prev => {
      const newMap = { ...prev };

      DAYS.forEach((_, dayIdx) => {
        const daySlots = newMap[dayIdx] || [];

        if (allDaysHaveSlot) {
          // Remove de todos os dias
          newMap[dayIdx] = daySlots.filter(id => id !== slotId);
          if (newMap[dayIdx].length === 0) {
            delete newMap[dayIdx];
          }
        } else {
          // Adiciona em todos os dias que não têm
          if (!daySlots.includes(slotId)) {
            newMap[dayIdx] = [...daySlots, slotId];
          }
        }
      });

      return newMap;
    });
  };

  // Filtra slots baseado no turno selecionado
  const filteredSlots = timeSlots.filter(slot => {
    const slotShift = computeSlotShift(slot);
    if (selectedShift === 'Integral (Manhã e Tarde)') {
      return slotShift === 'Manhã' || slotShift === 'Tarde' || slotShift === 'Integral (Manhã e Tarde)';
    }
    if (selectedShift === 'Integral (Tarde e Noite)') {
      return slotShift === 'Tarde' || slotShift === 'Noite' || slotShift === 'Integral (Tarde e Noite)';
    }
    return slotShift === selectedShift;
  });

  return (
    <div className="border-t border-slate-200 pt-3 max-h-[400px] flex flex-col">
      <h4 className="flex items-center gap-1 text-xs font-bold text-slate-700 mb-2">
        <Calendar size={12} /> Horários Ativos por Dia da Semana
      </h4>

      <div className="overflow-auto scrollbar-elegant border border-slate-200 rounded-lg">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-slate-500 bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-3 py-2 font-bold border-b border-slate-200">Horário</th>
              {DAYS.map((day) => (
                <th key={day} className="px-2 py-2 font-bold text-center border-b border-slate-200 border-l border-slate-100 uppercase text-[10px]">
                  {day.substring(0, 3)}
                </th>
              ))}
              <th className="px-2 py-2 font-bold text-center border-b border-slate-200 border-l border-slate-100" title="Ativar/Desativar em todos os dias">
                Todos
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {filteredSlots.map((slot, index) => {
              const allDaysHaveSlot = DAYS.every((_, dayIdx) => (activeSlotsByDay[dayIdx] || []).includes(slot.id));

              return (
                <tr key={slot.id} className={`hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-700 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{slot.start} - {slot.end}</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {slot.type === 'intervalo' && <span className="text-[9px] text-orange-600 bg-orange-50 px-1 rounded flex items-center gap-0.5 w-fit"><Coffee size={8} /> Intervalo</span>}
                        {slot.type === 'almoco' && <span className="text-[9px] text-red-600 bg-red-50 px-1 rounded flex items-center gap-0.5 w-fit"><Utensils size={8} /> Almoço</span>}
                        {slot.type === 'jantar' && <span className="text-[9px] text-indigo-600 bg-indigo-50 px-1 rounded flex items-center gap-0.5 w-fit"><Utensils size={8} /> Jantar</span>}
                      </div>
                    </div>
                  </td>
                  {DAYS.map((_, dayIdx) => {
                    const isSelected = (activeSlotsByDay[dayIdx] || []).includes(slot.id);
                    return (
                      <td key={dayIdx} className="px-2 py-2 border-b border-l border-slate-100 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSlotForDay(slot.id, dayIdx)}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 border-b border-l border-slate-100 text-center">
                    <button
                      onClick={() => toggleSlotForAllDays(slot.id)}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors mx-auto ${allDaysHaveSlot ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      title={allDaysHaveSlot ? "Remover de todos os dias" : "Adicionar a todos os dias"}
                    >
                      {allDaysHaveSlot ? <div className="w-2 h-2 bg-emerald-600 rounded-full" /> : <Plus size={12} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">
        Marque os checkbox para ativar horários em dias específicos. Use a coluna "Todos" para preencher a linha inteira.
      </p>
    </div>
  );
};

export default ClassForm;
