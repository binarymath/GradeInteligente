// Script para debugar activeSlotsByDay das turmas
// Execute isso no console do navegador para investigar o problema

function debugActiveSlotsByDay() {
  // Recupera dados do localStorage
  const dataStr = localStorage.getItem('scheduleAppData');
  if (!dataStr) {
    console.log('❌ Nenhum dado encontrado no localStorage');
    return;
  }
  
  const data = JSON.parse(dataStr);
  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  
  console.log('\n📋 ===== DEBUG activeSlotsByDay =====\n');
  
  // Mostra todos os timeSlots com seus IDs
  console.log('🕐 TIMESLOTS COM IDs:');
  data.timeSlots.forEach((slot, idx) => {
    console.log(`  [${idx}] ${slot.start}-${slot.end} | ID: ${slot.id}`);
  });
  
  console.log('\n📚 CLASSES E SEUS SLOTS PERMITIDOS:');
  
  data.classes.forEach(cls => {
    console.log(`\n▪️ ${cls.name} (${cls.shift})`);
    
    if (!cls.activeSlotsByDay || Object.keys(cls.activeSlotsByDay).length === 0) {
      console.log(`   ❌ Sem activeSlotsByDay definido`);
      if (cls.activeSlots) {
        console.log(`   (Legado) activeSlots: [${cls.activeSlots.map(id => {
          const slot = data.timeSlots.find(s => s.id === id);
          return slot ? `${slot.start}-${slot.end}` : id;
        }).join(', ')}]`);
      }
      return;
    }
    
    console.log(`   activeSlotsByDay por dia:`);
    DAYS.forEach((day, dayIdx) => {
      const slotsForDay = cls.activeSlotsByDay[dayIdx];
      if (!slotsForDay || slotsForDay.length === 0) {
        console.log(`     ${day}: NENHUM SLOT`);
      } else {
        const slotStrings = slotsForDay.map(slotId => {
          const slot = data.timeSlots.find(s => s.id === slotId);
          if (!slot) {
            return `❌ ID ${slotId} (NÃO ENCONTRADO!)`;
          }
          return `${slot.start}-${slot.end}`;
        });
        console.log(`     ${day}: [${slotStrings.join(', ')}]`);
      }
    });
  });
  
  console.log('\n\n📊 VERIFICAR COMPATIBILIDADE:');
  
  data.classes.forEach(cls => {
    if (!cls.activeSlotsByDay || Object.keys(cls.activeSlotsByDay).length === 0) return;
    
    let hasIssue = false;
    DAYS.forEach((day, dayIdx) => {
      const slotsForDay = cls.activeSlotsByDay[dayIdx];
      if (!slotsForDay) return;
      
      slotsForDay.forEach(slotId => {
        const slot = data.timeSlots.find(s => s.id === slotId);
        if (!slot) {
          console.log(`⚠️  ${cls.name} - ${day}: Slot ID ${slotId} NÃO ENCONTRADO nos timeSlots!`);
          hasIssue = true;
        }
      });
    });
    
    if (!hasIssue) {
      console.log(`✅ ${cls.name}: Todos os slot IDs estão válidos`);
    }
  });
}

// Executa o debug
debugActiveSlotsByDay();
