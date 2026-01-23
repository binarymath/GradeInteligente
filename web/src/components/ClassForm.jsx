import React, { useState } from 'react';
import { Calendar, Coffee, Utensils } from 'lucide-react';
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
    <div className="border-t border-slate-200 pt-3">
      <h4 className="flex items-center gap-1 text-xs font-bold text-slate-700 mb-2">
        <Calendar size={12} /> Horários Ativos por Dia da Semana
      </h4>
      
      {/* Seletor de Dia */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {DAYS.map((day, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedDay(idx)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              selectedDay === idx
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Grid de Slots para o Dia Selecionado */}
      <div className="max-h-48 overflow-y-auto border rounded p-2 bg-white scrollbar-elegant">
        <div className="grid grid-cols-1 gap-1">
          {filteredSlots.map(slot => {
            const isSelectedForDay = (activeSlotsByDay[selectedDay] || []).includes(slot.id);
            const allDaysHaveSlot = DAYS.every((_, dayIdx) => (activeSlotsByDay[dayIdx] || []).includes(slot.id));
            
            return (
              <div key={slot.id} className="flex items-center gap-2 p-2 rounded border border-slate-100 hover:bg-slate-50">
                <label className={`flex items-center gap-3 cursor-pointer flex-1 ${isSelectedForDay ? 'bg-blue-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelectedForDay}
                    onChange={() => toggleSlotForDay(slot.id, selectedDay)}
                    className="text-blue-500 rounded focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-700 w-20">{slot.start} - {slot.end}</span>
                    {slot.type === 'aula' && <span className="text-slate-500 bg-slate-100 px-1 rounded">Aula</span>}
                    {slot.type === 'intervalo' && <span className="text-orange-600 bg-orange-50 px-1 rounded flex items-center gap-1"><Coffee size={10} /> Intervalo</span>}
                    {slot.type === 'almoco' && <span className="text-red-600 bg-red-50 px-1 rounded flex items-center gap-1"><Utensils size={10} /> Almoço</span>}
                    {slot.type === 'jantar' && <span className="text-indigo-600 bg-indigo-50 px-1 rounded flex items-center gap-1"><Utensils size={10} /> Jantar</span>}
                  </div>
                </label>
                {/* Botão para aplicar em todos os dias */}
                <button
                  onClick={() => toggleSlotForAllDays(slot.id)}
                  className={`text-[10px] px-2 py-1 rounded transition-colors whitespace-nowrap ${
                    allDaysHaveSlot
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title={allDaysHaveSlot ? 'Remover de todos os dias' : 'Aplicar em todos os dias'}
                >
                  {allDaysHaveSlot ? '✓ Todos' : '+ Todos'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        Selecione os horários ativos para <strong>{DAYS[selectedDay]}</strong>. Use "+ Todos" para aplicar um horário em todos os dias.
      </p>
    </div>
  );
};

export default ClassForm;
