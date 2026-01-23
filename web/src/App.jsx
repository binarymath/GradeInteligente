import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Layout, Settings, Clock, BookOpen, Calendar, Menu, X, ChevronLeft, ChevronRight, Upload, Download, AlertTriangle, Info, Edit3, Rocket
} from 'lucide-react';
import { DAYS } from './utils';
import { migrateData } from './services/DataMigration';
import { cleanSchedule } from './services/scheduleHelpers';
import SidebarItem from './components/SidebarItem';
import TimeSettingsSection from './components/TimeSettingsSection';
import DataInputSection from './components/DataInputSection';
import ActivitiesSection from './components/ActivitiesSection';
import TimetableSection from './components/TimetableSection';
import AgendaSection from './components/AgendaSection';
import AboutSection from './components/AboutSection';
import ManualEditSection from './components/ManualEditSection';
import ApiConfigModal from './components/ApiConfigModal';
import { exportBackup, importBackup } from './services/stateService';
import { generateScheduleAsync, smartRepairAsync } from './services/scheduleService';

const INITIAL_STATE = {
  timeSlots: [],
  teachers: [],
  subjects: [],
  classes: [],
  activities: [],
  schedule: {},
  scheduleConflicts: []
};

const App = () => {
  const [data, setData] = useState(INITIAL_STATE);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    setHasApiKey(!!localStorage.getItem('gemini_api_key'));
  }, [isApiModalOpen]); // Checa quando fecha o modal

  // Restauração de navegação salva no localStorage (view, subView, viewMode, selectedEntity, sidebarOpen)
  const getInitialNav = () => {
    try {
      const raw = localStorage.getItem('app_nav');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Always start collapsed (mobile/tablet/desktop)
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
        return {
          view: parsed.view || 'about',
          subView: parsed.subView || 'teachers',
          viewMode: parsed.viewMode || 'class',
          selectedEntity: parsed.selectedEntity || '',
          sidebarOpen: false
        };
      }
    } catch (e) {
      // ignore and fall back to defaults
    }
    // Default first load: open "Sobre o Sistema" (about) and sidebar collapsed
    return { view: 'about', subView: 'subjects', viewMode: 'class', selectedEntity: '', sidebarOpen: false };
  };
  const initialNav = getInitialNav();
  // Default view changed to 'generate' so Grade Inteligente is homepage
  const [view, setView] = useState(initialNav.view);
  const [subView, setSubView] = useState(initialNav.subView);
  const [sidebarOpen, setSidebarOpen] = useState(initialNav.sidebarOpen);
  const [generating, setGenerating] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [isVerified, setIsVerified] = useState(false); // Controla se já verificou a grade
  const [generationLog, setGenerationLog] = useState([]);
  const [viewMode, setViewMode] = useState(initialNav.viewMode);
  const [selectedEntity, setSelectedEntity] = useState(initialNav.selectedEntity);
  const [selectedShift, setSelectedShift] = useState('Todos');
  const [calendarSettings, setCalendarSettings] = useState({
    schoolYearStart: '2025-02-01',
    schoolYearEnd: '2025-12-15',
    events: []
  });

  const fileInputRef = useRef(null);
  const logContainerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(false); // Desktop starts collapsed
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-scroll para o log quando há novos registros
  useEffect(() => {
    if (logContainerRef.current && generationLog.length > 0) {
      setTimeout(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [generationLog]);

  // Persiste navegação para manter a página/visualização após reload
  useEffect(() => {
    try {
      const nav = { view, subView, viewMode, selectedEntity, sidebarOpen };
      localStorage.setItem('app_nav', JSON.stringify(nav));
    } catch (e) {
      // ignore quota or serialization errors
    }
  }, [view, subView, viewMode, selectedEntity, sidebarOpen]);

  // Carregar estado persistente via Electron (se disponível) ao iniciar
  useEffect(() => {
    const loadPersisted = async () => {
      try {
        if (window && window.grade) {
          const persistedData = await window.grade.get('data');
          const persistedCalendar = await window.grade.get('calendarSettings');
          if (persistedData && typeof persistedData === 'object') {
            let migratedData = migrateData(persistedData);
            if (migratedData) {
              if (migratedData.schedule) {
                migratedData.schedule = cleanSchedule(migratedData);
              }
              setData(prev => ({ ...prev, ...migratedData }));
            }
          }
          if (persistedCalendar && typeof persistedCalendar === 'object') {
            setCalendarSettings(prev => ({ ...prev, ...persistedCalendar }));
          }
        } else {
          // Fallback para LocalStorage se não estiver no Electron
          const lsData = localStorage.getItem('grade_data');
          if (lsData) {
            const parsed = JSON.parse(lsData);
            if (parsed && typeof parsed === 'object') {
              let migratedData = migrateData(parsed);
              if (migratedData) {
                // DEEP CLEAN: Remove ghost allocations on load
                if (migratedData.schedule) {
                  migratedData.schedule = cleanSchedule(migratedData);
                }
                setData(prev => ({ ...prev, ...migratedData }));
              }
            }
          }

          const lsCalendar = localStorage.getItem('grade_calendar');
          if (lsCalendar) {
            const parsed = JSON.parse(lsCalendar);
            if (parsed && typeof parsed === 'object') setCalendarSettings(prev => ({ ...prev, ...parsed }));
          }
        }
      } catch (e) {
        // ignore IPC errors
      }
    };
    loadPersisted();
  }, []);

  // Salvar estado persistente via Electron ou LocalStorage quando mudar
  useEffect(() => {
    const savePersisted = async () => {
      try {
        if (window && window.grade) {
          await window.grade.set('data', data);
        } else {
          localStorage.setItem('grade_data', JSON.stringify(data));
        }
      } catch (e) {
        // ignore errors
      }
    };
    savePersisted();
  }, [data]);

  useEffect(() => {
    const saveCalendar = async () => {
      try {
        if (window && window.grade) {
          await window.grade.set('calendarSettings', calendarSettings);
        } else {
          localStorage.setItem('grade_calendar', JSON.stringify(calendarSettings));
        }
      } catch (e) {
        // ignore errors
      }
    };
    saveCalendar();
  }, [calendarSettings]);

  const handleExportState = useCallback(() => exportBackup(data), [data]);

  const handleImportState = useCallback((e) => {
    importBackup(e.target.files[0], (rawParsed) => {
      // 1. Migrar para garantir formato atual (v1 data -> v2 structures)
      let newData = migrateData(rawParsed);

      if (newData) {
        // 2. Limpar (apenas se tiver dados mínimos válidos, senão cleanSchedule protege)
        if (newData.schedule) {
          const cleaned = cleanSchedule(newData);
          // Se cleanSchedule retornar algo vazio quando HAVIA dados, é sinal de perigo. 
          // Mas como adicionamos validação no cleanSchedule para retornar o original se faltar deps, é seguro.
          newData.schedule = cleaned;
        }
        setData(newData);
      }
    });
    setIsVerified(false); // Ao restaurar, volta para modo "Verificar"
  }, []);

  const verifySchedule = useCallback(() => {
    setGenerating(true);
    setGenerationLog(['🔍 Verificando grade restaurada...']);

    setTimeout(() => {
      const log = ['🔍 Verificando grade restaurada...'];

      if (!data.schedule || Object.keys(data.schedule).length === 0) {
        log.push('⚠️ Nenhuma grade encontrada.');
        setGenerationLog(log);
        setGenerating(false);
        return;
      }

      // PRÉ-PROCESSAR: Criar mapas para lookups O(1) em vez de O(n)
      const classMap = new Map((data.classes || []).map(c => [c.id, c]));
      const subjectMap = new Map((data.subjects || []).map(s => [s.id, s]));
      const teacherMap = new Map((data.teachers || []).map(t => [t.id, t]));

      const totalSlots = Object.keys(data.schedule).length;
      log.push(`✅ Grade contém ${totalSlots} aula(s) alocada(s).`);

      // Validar se alguma aula foi colocada fora do horário permitido da turma
      const invalidSlots = [];
      for (const [key, entry] of Object.entries(data.schedule)) {
        const [classId, dayStr, slotStr] = key.split('-');
        const slotIdx = parseInt(slotStr, 10);
        const classData = classMap.get(classId);
        const slot = data.timeSlots[slotIdx];

        if (!classData || !slot || Number.isNaN(slotIdx)) continue;

        const slotId = slot.id || String(slotIdx);
        let allowed = true;

        if (classData.activeSlotsByDay && Object.keys(classData.activeSlotsByDay).length > 0) {
          const dayIdx = DAYS.indexOf(dayStr);
          const activeForDay = dayIdx >= 0 ? classData.activeSlotsByDay[dayIdx] : null;
          if (!activeForDay || !activeForDay.includes(slotId)) {
            allowed = false;
          }
        } else if (classData.activeSlots && Array.isArray(classData.activeSlots) && classData.activeSlots.length > 0) {
          if (!classData.activeSlots.includes(slotId)) {
            allowed = false;
          }
        }

        if (!allowed) {
          const className = classData?.name || classId;
          const subjectName = subjectMap.get(entry.subjectId)?.name || entry.subjectId;
          const timeLabel = `${dayStr} ${slot.start || '?'}-${slot.end || '?'}`;
          invalidSlots.push(`${className} - ${subjectName} em ${timeLabel}`);
        }
      }

      if (invalidSlots.length > 0) {
        log.push('⚠️ Há aulas em horários/dias não permitidos para a turma:');
        invalidSlots.slice(0, 10).forEach(item => log.push(`   • ${item}`));
        if (invalidSlots.length > 10) {
          log.push(`   ... mais ${invalidSlots.length - 10} ocorrência(s).`);
        }
      }

      // Coletar todas as alocações por (matéria-turma-professor)
      const allocations = {};
      for (const [key, entry] of Object.entries(data.schedule)) {
        if (!entry.classId || !entry.subjectId) {
          continue;
        }
        const actKey = `${entry.classId}-${entry.subjectId}-${entry.teacherId || 'none'}`;
        if (!allocations[actKey]) {
          allocations[actKey] = [];
        }
        allocations[actKey].push({ key, entry });
      }

      // Verifica pendências baseado em (matéria-turma-professor)
      const demandMap = {};
      for (const activity of data.activities) {
        const key = `${activity.classId}-${activity.subjectId}-${activity.teacherId || 'none'}`;
        if (!demandMap[key]) demandMap[key] = { totalNeeded: 0, activity };
        demandMap[key].totalNeeded += Number(activity.quantity) || 0;
      }

      let pending = 0;
      let excess = 0;
      const excessDetails = [];
      const pendingDetails = [];

      for (const [key, demand] of Object.entries(demandMap)) {
        const allocated = allocations[key]?.length || 0;
        if (allocated < demand.totalNeeded) {
          const missing = demand.totalNeeded - allocated;
          pending += missing;
          const [classId, subjectId, teacherId] = key.split('-');
          const className = classMap.get(classId)?.name || classId;
          const subjectName = subjectMap.get(subjectId)?.name || subjectId;
          const teacherName = teacherId !== 'none'
            ? (teacherMap.get(teacherId)?.name || teacherId)
            : 'Sem professor';
          pendingDetails.push({
            subject: subjectName,
            class: className,
            teacher: teacherName,
            allocated,
            expected: demand.totalNeeded,
            missing
          });
        } else if (allocated > demand.totalNeeded) {
          const excessQty = allocated - demand.totalNeeded;
          excess += excessQty;
          const [classId, subjectId, teacherId] = key.split('-');
          const className = classMap.get(classId)?.name || classId;
          const subjectName = subjectMap.get(subjectId)?.name || subjectId;
          const teacherName = teacherId !== 'none'
            ? (teacherMap.get(teacherId)?.name || teacherId)
            : 'Sem professor';

          // Coletar localização (dia/horário) das aulas excedentes
          const locations = allocations[key].map(alloc => {
            const slot = data.timeSlots[alloc.entry.slotIdx];
            const dayName = data.schedule[alloc.key]?.dayLabel || 'Dia?';
            return `${dayName} ${slot?.start || '?'}-${slot?.end || '?'}`;
          });

          excessDetails.push({
            subject: subjectName,
            class: className,
            teacher: teacherName,
            allocated,
            expected: demand.totalNeeded,
            excessQty,
            locations
          });
        }
      }

      if (pending > 0) {
        log.push(`⚠️ ${pending} aula(s) pendente(s):`);
        pendingDetails.forEach(d => {
          log.push(`   • ${d.subject} - ${d.class}: ${d.allocated}/${d.expected} (faltam ${d.missing}) - Prof: ${d.teacher}`);
        });
      }

      if (excess > 0) {
        log.push(`⚠️ ${excess} aula(s) excedente(s):`);
        excessDetails.forEach(d => {
          log.push(`   • ${d.subject} - ${d.class} (Prof: ${d.teacher}): ${d.allocated} alocada(s), ${d.expected} esperada(s)`);
          log.push(`      Excesso: ${d.excessQty} aula(s) em: ${d.locations.join(', ')}`);
        });
      }

      if (pending === 0 && excess === 0) {
        log.push('✅ Grade está completa e balanceada!');
      } else {
        log.push('💡 Use "Ajustar" para corrigir pendências/excessos.');
      }

      // === ANÁLISE DE SATISFAÇÃO POR ENTIDADE ===
      // Mostrar apenas se estiver tudo perfeito para não poluir
      if (pending === 0 && excess === 0) {
        log.push('');
        log.push('📋 ANÁLISE DE SATISFAÇÃO');

        // Satisfação por Professor
        log.push('');
        log.push('👨‍🏫 Status por Professor:');
        const teacherStatus = new Map();
        for (const activity of data.activities) {
          const teacherId = activity.teacherId || 'nenhum';
          if (!teacherStatus.has(teacherId)) {
            const t = teacherMap.get(teacherId);
            teacherStatus.set(teacherId, {
              name: t?.name || teacherId,
              expected: 0,
              allocated: 0
            });
          }
          const qty = Number(activity.quantity) || 0;
          teacherStatus.get(teacherId).expected += qty;
        }

        for (const [key, entry] of Object.entries(allocations)) {
          const [, , teacherId] = key.split('-');
          const actualTeacherId = teacherId === 'none' ? 'nenhum' : teacherId;
          if (teacherStatus.has(actualTeacherId)) {
            teacherStatus.get(actualTeacherId).allocated += entry.length;
          }
        }

        for (const [_, status] of teacherStatus) {
          const pct = status.expected > 0 ? Math.round((status.allocated / status.expected) * 100) : 100;
          const emoji = pct === 100 ? '✅' : pct >= 80 ? '⚠️' : '❌';
          log.push(`   ${emoji} ${status.name}: ${status.allocated}/${status.expected} aulas (${pct}%)`);
        }

        // Satisfação por Disciplina
        log.push('');
        log.push('📚 Status por Disciplina:');
        const subjectStatus = new Map();
        for (const activity of data.activities) {
          const subjectId = activity.subjectId;
          if (!subjectStatus.has(subjectId)) {
            const s = subjectMap.get(subjectId);
            subjectStatus.set(subjectId, { name: s?.name || subjectId, expected: 0, allocated: 0 });
          }
          const qty = Number(activity.quantity) || 0;
          subjectStatus.get(subjectId).expected += qty;
        }

        for (const [key, entry] of Object.entries(allocations)) {
          const [, subjectId] = key.split('-');
          if (subjectStatus.has(subjectId)) {
            subjectStatus.get(subjectId).allocated += entry.length;
          }
        }

        for (const [_, status] of subjectStatus) {
          const pct = status.expected > 0 ? Math.round((status.allocated / status.expected) * 100) : 100;
          const emoji = pct === 100 ? '✅' : pct >= 80 ? '⚠️' : '❌';
          log.push(`   ${emoji} ${status.name}: ${status.allocated}/${status.expected} aulas (${pct}%)`);
        }

        // Satisfação por Turma
        log.push('');
        log.push('🏫 Status por Turma (Aulas + Disciplinas):');
        const classStatus = new Map();
        const classSubjects = new Map(); // Rastrear disciplinas únicas por turma

        for (const activity of data.activities) {
          const classId = activity.classId;
          if (!classStatus.has(classId)) {
            const c = classMap.get(classId);
            classStatus.set(classId, { name: c?.name || classId, expected: 0, allocated: 0 });
            classSubjects.set(classId, new Set());
          }
          const qty = Number(activity.quantity) || 0;
          classStatus.get(classId).expected += qty;
          classSubjects.get(classId).add(activity.subjectId);
        }

        for (const [key, entry] of Object.entries(allocations)) {
          const [classId] = key.split('-');
          if (classStatus.has(classId)) {
            classStatus.get(classId).allocated += entry.length;
          }
        }

        for (const [classId, status] of classStatus) {
          const pct = status.expected > 0 ? Math.round((status.allocated / status.expected) * 100) : 100;
          const emoji = pct === 100 ? '✅' : pct >= 80 ? '⚠️' : '❌';
          const uniqueSubjects = classSubjects.get(classId)?.size || 0;
          log.push(`   ${emoji} ${status.name}: ${status.allocated}/${status.expected} aulas | ${uniqueSubjects} disciplina(s)`);
        }
      }

      // === ANÁLISE DE SLOTS LIVRES ===
      const slotsDetails = [];

      // Contar slots usados por turma (otimizado)
      const usedByClass = new Map();
      for (const entry of Object.values(data.schedule)) {
        if (entry.classId) {
          usedByClass.set(entry.classId, (usedByClass.get(entry.classId) || 0) + 1);
        }
      }

      // Calcular slots livres por turma
      let totalPossible = 0;
      let totalUsed = 0;
      const freeSlotsWarn = [];
      for (const cls of (data.classes || [])) {
        // Total de slots = contagem REAL de slots permitidos por dia, não soma de IDs
        let totalSlots = 0;
        if (cls.activeSlotsByDay && Object.keys(cls.activeSlotsByDay).length > 0) {
          // activeSlotsByDay[dayIdx] é um ARRAY de IDs permitidos, contar o .length de cada
          for (const daySlots of Object.values(cls.activeSlotsByDay)) {
            if (Array.isArray(daySlots)) {
              totalSlots += daySlots.length;
            }
          }
        } else if (cls.activeSlots && Array.isArray(cls.activeSlots)) {
          // Fallback legado: activeSlots aplicável a todos os dias
          totalSlots = cls.activeSlots.length * DAYS.length;
        } else {
          // Sem informação: assumir 7 aulas/dia
          totalSlots = 7 * DAYS.length;
        }

        const usedSlots = usedByClass.get(cls.id) || 0;
        const freeSlots = totalSlots - usedSlots;

        totalPossible += totalSlots;
        totalUsed += usedSlots;

        const pct = totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0;
        slotsDetails.push(`   ${cls.name}: ${usedSlots}/${totalSlots} ocupado(s) (${freeSlots} livre(s), ${100 - pct}% disponível)`);

        // Se há slots livres, marcar para alerta específico
        if (freeSlots > 0) {
          freeSlotsWarn.push(`${cls.name}: ${freeSlots} slot(s) livre(s)`);
        }
      }

      if (pending === 0 && excess === 0) {
        log.push('');
        log.push('📊 ANÁLISE DE SLOTS:');
        slotsDetails.forEach(line => log.push(line));

        if (totalPossible > 0) {
          const gridPct = Math.round((totalUsed / totalPossible) * 100);
          const freeTotal = totalPossible - totalUsed;
          log.push(`   TOTAL: ${totalUsed}/${totalPossible} slots ocupados (${freeTotal} livres, ${100 - gridPct}% capacidade disponível)`);
        }
      }

      if (freeSlotsWarn.length > 0) {
        log.push('⚠️ Slots livres não utilizados (verifique se deveriam virar pendência):');
        freeSlotsWarn.slice(0, 10).forEach(item => log.push(`   • ${item}`));
        if (freeSlotsWarn.length > 10) {
          log.push(`   ... mais ${freeSlotsWarn.length - 10} turma(s) com slots livres.`);
        }
      }

      // Mapa diário: cada turma deveria ter 7 aulas por dia (7*5 = 35 semanais)
      const dailyCountByClass = new Map();
      for (const cls of (data.classes || [])) {
        dailyCountByClass.set(cls.id, Array(DAYS.length).fill(0));
      }

      for (const [scheduleKey, entry] of Object.entries(data.schedule)) {
        // Parse schedule key format: classId-dayName-slotIdx
        const parts = scheduleKey.split('-');
        if (parts.length >= 3) {
          const classId = parts[0];
          const dayName = parts[1];
          const dayIdx = DAYS.indexOf(dayName);

          if (classId && dayIdx >= 0 && dayIdx < DAYS.length && dailyCountByClass.has(classId)) {
            const arr = dailyCountByClass.get(classId);
            arr[dayIdx] = (arr[dayIdx] || 0) + 1;
          }
        }
      }
      log.push('');
      log.push('🗓️ Aulas por dia (esperado: 7 por dia, 35 semanais):');
      for (const cls of (data.classes || [])) {
        // Recalcular com validação: apenas contar aulas que estão em slots permitidos
        const dailyByDay = Array(DAYS.length).fill(0);
        const validAllocations = new Map(); // rastrear o que é válido

        for (const [scheduleKey, entry] of Object.entries(data.schedule)) {
          if (entry.classId !== cls.id) continue;

          const parts = scheduleKey.split('-');
          if (parts.length < 3) continue;
          const [, dayName, slotStr] = parts;
          const slotIdx = parseInt(slotStr, 10);
          const dayIdx = DAYS.indexOf(dayName);

          if (dayIdx < 0 || dayIdx >= DAYS.length) continue;

          const slot = data.timeSlots[slotIdx];
          if (!slot) continue;

          const slotId = slot.id || String(slotIdx);
          let isValidForDay = false;

          // Validar se slot está permitido neste dia específico
          if (cls.activeSlotsByDay && Object.keys(cls.activeSlotsByDay).length > 0) {
            const activeForDay = cls.activeSlotsByDay[dayIdx];
            if (activeForDay && Array.isArray(activeForDay) && activeForDay.includes(slotId)) {
              isValidForDay = true;
            }
          } else if (cls.activeSlots && Array.isArray(cls.activeSlots) && cls.activeSlots.includes(slotId)) {
            // Fallback: se só tem activeSlots (sem dia específico), é válido se está em activeSlots
            isValidForDay = true;
          }

          if (isValidForDay) {
            dailyByDay[dayIdx]++;
            validAllocations.set(scheduleKey, true);
          }
        }

        const weekly = dailyByDay.reduce((a, b) => a + b, 0);
        const parts = dailyByDay.map((n, idx) => `${DAYS[idx].slice(0, 3)}:${n}`);

        // Calcular esperado corretamente
        let expectedPerDay = 7;
        let expectedWeekly = 35;
        if (cls.activeSlotsByDay && Object.keys(cls.activeSlotsByDay).length > 0) {
          const firstDaySlots = Object.values(cls.activeSlotsByDay)[0];
          expectedPerDay = Array.isArray(firstDaySlots) ? firstDaySlots.length : 7;
          expectedWeekly = 0;
          for (const daySlots of Object.values(cls.activeSlotsByDay)) {
            if (Array.isArray(daySlots)) expectedWeekly += daySlots.length;
          }
        } else if (cls.activeSlots && Array.isArray(cls.activeSlots)) {
          expectedPerDay = cls.activeSlots.length;
          expectedWeekly = expectedPerDay * DAYS.length;
        }

        log.push(`   ${cls.name}: ${weekly}/${expectedWeekly} semanais | ${parts.join(' ')}`);
      }

      log.push('');
      log.push('Legenda: ✅ = 100% | ⚠️ = 80-99% | ❌ = < 80%');

      setGenerationLog(log);
      setIsVerified(true); // Marca como verificado
      setGenerating(false);
    }, 100);
  }, [data]);

  const generateSchedule = useCallback(() => {
    setIsVerified(true); // Ao gerar, marca como verificado
    generateScheduleAsync(data, setData, setGenerationLog, setGenerating);
  }, [data]);

  const handleSmartRepair = useCallback(() =>
    smartRepairAsync(data, setData, setGenerationLog, setRepairing),
    [data]
  );


  const isElectron = typeof window !== 'undefined' && window.grade;

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      {/* Overlay para fechar sidebar em mobile/tablet */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
        />
      )}
      <aside className={`bg-white border-r border-slate-200 flex flex-col shadow-lg transition-all duration-300 ease-in-out ${isMobile ? (sidebarOpen ? 'w-64 z-50' : 'w-0') : sidebarOpen ? 'w-64' : 'w-16'} lg:relative shrink-0`}>
        <div className={`border-b border-slate-100 flex items-center ${sidebarOpen ? 'p-6 justify-between' : 'p-3 justify-center'} overflow-hidden whitespace-nowrap ${isMobile && !sidebarOpen ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2 text-indigo-700 mb-1">
            <Layout className="w-6 h-6 shrink-0" />
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="font-extrabold text-xl tracking-tight leading-none">Grade Inteligente</span>
                <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold mt-0.5">Atualizado em {__BUILD_DATE__}</span>
              </div>
            )}
          </div>
          {sidebarOpen && isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600" title="Fechar">
              <X size={20} />
            </button>
          )}
          {sidebarOpen && !isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600" title="Colapsar">
              <ChevronLeft size={20} />
            </button>
          )}
          {!sidebarOpen && !isMobile && (
            <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-slate-600" title="Expandir">
              <ChevronRight size={20} />
            </button>
          )}
        </div>
        {/* Botão de toggle lateral (desktop) */}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Colapsar' : 'Expandir'}
            className={`absolute top-1/2 -translate-y-1/2 right-[-14px] bg-white border border-slate-200 shadow-sm rounded-full p-1 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors ${sidebarOpen ? '' : ''} ${isMobile && !sidebarOpen ? 'hidden' : ''}`}
            aria-label={sidebarOpen ? 'Colapsar menu lateral' : 'Expandir menu lateral'}
          >
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        )}
        <div className={`flex-1 py-4 space-y-1 overflow-hidden whitespace-nowrap overflow-y-auto ${isMobile && !sidebarOpen ? 'hidden' : ''}`}>
          {sidebarOpen && <div className="px-4 pb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Menu Principal</div>}
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Info} label="Sobre o Sistema" active={view === 'about'} onClick={() => { setView('about'); if (isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Clock} label="Configure os Horários" active={view === 'data' && subView === 'timeSettings'} onClick={() => { setView('data'); setSubView('timeSettings'); if (isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Settings} label="Cadastro" active={view === 'data' && subView !== 'timeSettings'} onClick={() => { setView('data'); setSubView('subjects'); if (isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={BookOpen} label="Atribuições" active={view === 'activities'} onClick={() => { setView('activities'); if (isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Rocket} label="Gerar/Visualizar" active={view === 'generate'} onClick={() => { setView('generate'); if (isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Edit3} label="Edição Manual" active={view === 'manualEdit'} onClick={() => { setView('manualEdit'); if (isMobile) setSidebarOpen(false); }} />
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Settings} label="Configurar Gemini" active={false} onClick={() => { setIsApiModalOpen(true); if (isMobile) setSidebarOpen(false); }} />
          <div className="my-4 border-t border-slate-100"></div>
          {sidebarOpen && <div className="px-4 pb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Operações</div>}
          <SidebarItem collapsed={!sidebarOpen && !isMobile} icon={Calendar} label="Agenda e Grade" active={view === 'agenda'} onClick={() => { setView('agenda'); if (isMobile) setSidebarOpen(false); }} />
          <div className="my-4 border-t border-slate-100"></div>
          {sidebarOpen && <div className="px-4 pb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Contato</div>}
          <a href="https://github.com/binarymath" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-md transition-colors mx-2">
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            {sidebarOpen && <span className="font-medium">GitHub</span>}
          </a>
          <a href="https://www.linkedin.com/in/fabiomatech/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors mx-2">
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            {sidebarOpen && <span className="font-medium">LinkedIn</span>}
          </a>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-100 transition-all duration-300">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shadow-sm z-0 relative shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            {isMobile && !sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-md" title="Abrir menu">
                <Menu size={24} />
              </button>
            )}
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate">
              {view === 'about' ? 'Sobre o Sistema' : view === 'data' && subView === 'timeSettings' ? 'Configuração de Horários' : view === 'data' ? 'Dados Institucionais' : view === 'activities' ? 'Atribuições' : view === 'manualEdit' ? 'Edição Manual da Grade' : view === 'agenda' ? 'Agenda e Grade' : 'Gerar/Visualizar Grade'}
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 ml-2">
                {__BUILD_DATE__}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {/* Status da API e Configuração */}
            <div className="flex items-center gap-2 mr-2 border-r border-slate-200 pr-4">
              {hasApiKey ? (
                <span className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200" title="API Conectada">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  API OK
                </span>
              ) : (
                <span className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-200" title="API Não Configurada">
                  ⚠ Sem IA
                </span>
              )}
              <button
                onClick={() => setIsApiModalOpen(true)}
                className={`p-1.5 rounded-md transition-colors ${hasApiKey ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-amber-600 hover:bg-amber-100'}`}
                title="Configurar Chave API Gemini"
              >
                <Settings size={20} />
              </button>
            </div>

            <input type="file" ref={fileInputRef} onChange={handleImportState} style={{ display: 'none' }} accept=".json" />
            <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors text-sm font-medium" title="Importar Backup"><Upload size={16} /> <span className="hidden sm:inline">Restaurar</span></button>
            <button onClick={handleExportState} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors text-sm font-medium" title="Salvar Backup"><Download size={16} /> <span className="hidden sm:inline">Backup</span></button>
          </div>
        </header>
        <div className="flex-1 p-2 lg:p-4 overflow-y-auto">
          {view === 'about' && <AboutSection />}
          {view === 'data' && subView === 'timeSettings' && <TimeSettingsSection data={data} setData={setData} />}
          {view === 'data' && subView !== 'timeSettings' && <DataInputSection data={data} setData={setData} subView={subView} setSubView={setSubView} />}
          {view === 'activities' && <ActivitiesSection data={data} setData={setData} />}
          {view === 'manualEdit' && <ManualEditSection data={data} setData={setData} />}
          {view === 'generate' && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800">Gerar Grade</h2>
                <div className="flex items-center gap-2">
                  {isVerified && (
                    <button
                      onClick={handleSmartRepair}
                      disabled={generating || repairing || !data.schedule || Object.keys(data.schedule || {}).length === 0}
                      className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      aria-busy={repairing}
                      title="Ajustar grade atual sem regenerar"
                    >
                      {repairing ? 'Ajustando...' : 'Ajustar'}
                    </button>
                  )}
                  <button
                    onClick={isVerified ? generateSchedule : verifySchedule}
                    disabled={generating || repairing}
                    className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-busy={generating}
                  >
                    {generating ? (isVerified ? 'Gerando...' : 'Verificando...') :
                      (isVerified ? 'Gerar Novamente' :
                        (Object.keys(data.schedule || {}).length > 0 ? 'Verificar' : 'Gerar Agora'))}
                  </button>
                </div>
              </div>
              {generationLog.length > 0 && (
                <div
                  ref={logContainerRef}
                  className="bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100 p-4 rounded-lg border-l-4 border-emerald-500 shadow-lg max-h-96 overflow-y-auto"
                  role="log"
                  aria-live="polite"
                  aria-label="Log de geração da grade"
                >
                  <div className="mb-3 font-bold text-emerald-400 text-sm">📋 Log de Operação:</div>
                  {generationLog.map((logLine, i) => {
                    // Colorir diferentes tipos de mensagens
                    let textColor = 'text-slate-300';
                    let bgColor = '';
                    let fontWeight = '';

                    if (logLine.includes('✅')) {
                      textColor = 'text-emerald-300';
                      fontWeight = 'font-semibold';
                    } else if (logLine.includes('❌') || logLine.includes('⚠️')) {
                      textColor = 'text-orange-300';
                      fontWeight = 'font-semibold';
                    } else if (logLine.includes('🧹')) {
                      textColor = 'text-blue-300';
                      fontWeight = 'font-semibold';
                    } else if (logLine.includes('💡')) {
                      textColor = 'text-amber-300';
                    } else if (logLine.includes('📍')) {
                      textColor = 'text-cyan-300';
                      fontWeight = 'font-medium';
                    } else if (logLine.includes('•')) {
                      textColor = 'text-slate-400';
                      bgColor = 'bg-slate-800/50';
                    } else if (logLine.includes('🔧') || logLine.includes('⏳')) {
                      textColor = 'text-violet-300';
                      fontWeight = 'font-semibold';
                    }

                    return (
                      <div
                        key={i}
                        className={`text-xs py-1 px-2 ${textColor} ${bgColor} ${fontWeight} leading-relaxed`}
                        style={{ fontFamily: 'menlo, monospace' }}
                      >
                        {logLine}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-6 mb-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-600 mb-1">Visualizar Grade</label>
                  <select value={viewMode} onChange={e => { setViewMode(e.target.value); setSelectedEntity(''); }} className="border p-2 rounded text-sm bg-white shadow-sm">
                    <option value="class">Turmas</option>
                    <option value="teacher">Professores</option>
                    <option value="subject">Matérias</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-600 mb-1">Turno</label>
                  <select value={selectedShift} onChange={e => { setSelectedShift(e.target.value); setSelectedEntity(''); }} className="border p-2 rounded text-sm bg-white shadow-sm min-w-[180px]">
                    <option value="Todos">Todos</option>
                    <option value="Manhã">Manhã</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Noite">Noite</option>
                    <option value="Integral (Manhã e Tarde)">Integral (Manhã e Tarde)</option>
                    <option value="Integral (Tarde e Noite)">Integral (Tarde e Noite)</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-slate-600 mb-1">{viewMode === 'class' ? 'Selecione a Turma' : viewMode === 'teacher' ? 'Selecione o Professor' : 'Selecione a Matéria'}</label>
                  <select value={selectedEntity} onChange={e => setSelectedEntity(e.target.value)} className="border p-2 rounded text-sm bg-white shadow-sm min-w-[180px]">
                    <option value="">{viewMode === 'class' ? 'Escolha a turma...' : viewMode === 'teacher' ? 'Escolha o professor...' : 'Escolha a matéria...'}</option>
                    <option value="all">📋 Todos</option>
                    {viewMode === 'class' && data.classes
                      .filter(c => selectedShift === 'Todos' ? true : c.shift === selectedShift)
                      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {viewMode === 'teacher' && data.teachers
                      .filter(t => selectedShift === 'Todos' ? true : (t.shifts || []).includes(selectedShift))
                      .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    {viewMode === 'subject' && data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {selectedEntity && selectedEntity !== 'all' && (
                <TimetableSection
                  data={data}
                  viewMode={viewMode}
                  selectedEntity={selectedEntity}
                  calendarSettings={calendarSettings}
                  setCalendarSettings={setCalendarSettings}
                  filterShift={selectedShift}
                  showAgendaControls={false}
                />
              )}
              {selectedEntity === 'all' && (
                <div className="space-y-4">
                  {viewMode === 'class' && data.classes
                    .filter(cls => selectedShift === 'Todos' ? true : cls.shift === selectedShift)
                    .map(cls => (
                      <div key={cls.id} className="border-t-4 border-indigo-500 pt-4">
                        <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm">{cls.name}</span>
                        </h3>
                        <TimetableSection
                          data={data}
                          viewMode={viewMode}
                          selectedEntity={cls.id}
                          calendarSettings={calendarSettings}
                          setCalendarSettings={setCalendarSettings}
                          filterShift={selectedShift}
                          showAgendaControls={false}
                        />
                      </div>
                    ))}
                  {viewMode === 'teacher' && data.teachers
                    .filter(teacher => selectedShift === 'Todos' ? true : (teacher.shifts || []).includes(selectedShift))
                    .map(teacher => (
                      <div key={teacher.id} className="border-t-4 border-emerald-500 pt-4">
                        <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm">{teacher.name}</span>
                        </h3>
                        <TimetableSection
                          data={data}
                          viewMode={viewMode}
                          selectedEntity={teacher.id}
                          calendarSettings={calendarSettings}
                          setCalendarSettings={setCalendarSettings}
                          filterShift={selectedShift}
                          showAgendaControls={false}
                        />
                      </div>
                    ))}
                  {viewMode === 'subject' && data.subjects.map(subject => (
                    <div key={subject.id} className="border-t-4 border-violet-500 pt-4">
                      <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full text-sm">{subject.name}</span>
                      </h3>
                      <TimetableSection
                        data={data}
                        viewMode={viewMode}
                        selectedEntity={subject.id}
                        calendarSettings={calendarSettings}
                        setCalendarSettings={setCalendarSettings}
                        filterShift={selectedShift}
                        showAgendaControls={false}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {view === 'agenda' && (
            <AgendaSection
              data={data}
              calendarSettings={calendarSettings}
              setCalendarSettings={setCalendarSettings}
            />
          )}
        </div>
      </main>

      <ApiConfigModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
      />
    </div >
  );
};

export default App;
