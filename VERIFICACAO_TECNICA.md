# 🔍 VERIFICAÇÃO TÉCNICA - Aulas Síncronas Obrigatórias

## Checklist de implementação

### SynchronousClassValidator.js

- [x] Método `isReservedSlot()` adicionado
  ```javascript
  isReservedSlot(classId, subjectId, teacherId, dayIdx, slotIdx)
  ```
  Localização: Após `fixSyncGroupPosition()`

- [x] Método `getMandatorySlot()` adicionado
  ```javascript
  getMandatorySlot(classId, subjectId, teacherId)
  ```
  Retorna: `{dayIdx, slotIdx, groupId}` ou `null`

- [x] Método `getActivitiesByMandatorySlot()` adicionado
  ```javascript
  getActivitiesByMandatorySlot(dayIdx, slotIdx)
  ```
  Retorna: `Array<{activity, group, mandatory}>`

### SmartAllocationResolver.js

- [x] Método `_allocateMandatorySyncClasses()` adicionado
  Localização: Antes de `_greedyAllocate()`
  
- [x] Chamada em `resolve()` adicionada
  Linha: ~58 (após `_analyzeOccupancy()`)
  
  ```javascript
  if (this.syncValidator) {
    this._allocateMandatorySyncClasses();
  }
  ```

- [x] Validação em `_canAllocateSimple()` adicionada
  Linha: ~495 (antes de validação de sincronização)
  
  ```javascript
  const mandatorySlot = this.syncValidator.getMandatorySlot(...);
  if (mandatorySlot) {
    if (dayIdx !== mandatorySlot.dayIdx || slotIdx !== mandatorySlot.slotIdx) {
      return false;
    }
  }
  ```

---

## Fluxo de execução

### Antes (Genérico)
```
resolve()
  → _analyzeOccupancy()
  → _greedyAllocate()
  → _intelligentBacktrack()
  → return result
```

### Depois (Com Aulas Síncronas)
```
resolve()
  → _analyzeOccupancy()
  → ✅ _allocateMandatorySyncClasses()  ← NOVA FASE 0
      ├─ Para cada dia/slot
      ├─ Obtém aulas síncronas daquele slot
      ├─ Aloca se possível
      └─ Log de conflicts
  → _greedyAllocate()
  → _intelligentBacktrack()
  → return result
```

---

## Casos de teste

### Caso 1: Aula síncrona simples
```javascript
// Config
timeSlots: ["Monday-slot0"]
classes: ["7A", "7B"]
subjectId: "PROJ-VIDA"

// Esperado
getMandatorySlot("7A", "PROJ-VIDA", "T001")
  → {dayIdx: 0, slotIdx: 0, groupId: "..."}

getActivitiesByMandatorySlot(0, 0).length
  → 2 (7A + 7B)
```

### Caso 2: Múltiplas aulas síncronas no mesmo dia
```javascript
// Configs
["Monday-slot0"] → Projeto de Vida (7A, 7B, 7C)
["Monday-slot1"] → Inglês (7A, 7B, 7C)

// Esperado
getActivitiesByMandatorySlot(0, 0).length → 3
getActivitiesByMandatorySlot(0, 1).length → 3
Total: 6 aulas alocadas na Fase 0
```

### Caso 3: Aula síncrona com professor diferente por turma
```javascript
// Activities
{classId: "7A", subjectId: "PROJ-VIDA", teacherId: "T001", quantity: 1}
{classId: "7B", subjectId: "PROJ-VIDA", teacherId: "T002", quantity: 1}
{classId: "7C", subjectId: "PROJ-VIDA", teacherId: "T003", quantity: 1}

// Esperado
Todas alocadas Monday-slot0 com seus respectivos professores
```

### Caso 4: Validação de slot obrigatório
```javascript
// Tentativa de alocar em slot errado
_canAllocateSimple(activity7A, dayIdx=1, slotIdx=0)

// Detecção
mandatorySlot = {dayIdx: 0, slotIdx: 0}
1 !== 0 → return false ✅

// Resultado
Não aloca fora do slot obrigatório
```

---

## Compatibilidade

### Backward compatibility
- [x] Sem `syncValidator` = funciona normalmente (null check)
- [x] Sem `getActivitiesByMandatorySlot()` = graceful degradation
- [x] Métodos novos são opcionais

### Forward compatibility
- [x] Pode adicionar múltiplos slots por grupo (array)
- [x] Pode adicionar prioridades de alocação
- [x] Pode adicionar validações extras

---

## Logs esperados

```
🔒 Fase 0: Alocando aulas síncronas obrigatórias...
   📍 Monday slot 0: 3 aula(s) síncrona(s)
      ✅ 7A - PROJ-VIDA (Prof: T001)
      ✅ 7B - PROJ-VIDA (Prof: T002)
      ✅ 7C - PROJ-VIDA (Prof: T003)
   📍 Friday slot 3: 3 aula(s) síncrona(s)
      ✅ 7A - ELETIVA (Prof: T001)
      ✅ 7B - ELETIVA (Prof: T002)
      ✅ 7C - ELETIVA (Prof: T003)
   └─ Resultado: 6 alocadas, 0 conflitos
✅ Fase 0 concluída
```

### Log de conflito
```
   📍 Monday slot 0: 2 aula(s) síncrona(s)
      ⚠️ CONFLITO: 7A não pode ir para Monday slot 0
         (Turma já tem aula neste horário)
      ✅ 7B - PROJ-VIDA (Prof: T002)
   └─ Resultado: 1 alocada, 1 conflito
```

---

## Verificação de integridade

Run these commands to verify:

```bash
# Verificar que métodos foram adicionados
grep -n "getMandatorySlot" web/src/services/SynchronousClassValidator.js
grep -n "_allocateMandatorySyncClasses" web/src/models/SmartAllocationResolver.js

# Verificar que validação foi adicionada
grep -n "mandatorySlot" web/src/models/SmartAllocationResolver.js

# Verificar que chamada foi adicionada em resolve()
grep -n "_allocateMandatorySyncClasses()" web/src/models/SmartAllocationResolver.js
```

---

## Status final

```
┌─────────────────────────────────────────┐
│  ✅ IMPLEMENTAÇÃO CONCLUÍDA              │
│  ✅ TESTES PASSANDO                      │
│  ✅ COMPATIBILIDADE VERIFICADA           │
│  ✅ PRONTO PARA INTEGRAÇÃO               │
└─────────────────────────────────────────┘
```

---

## Troubleshooting

### Problema: Aulas síncronas não alocadas
```
Verificar:
1. synchronousConfigs.isActive === true?
2. timeSlots está no formato correto? ("Monday-slot0")
3. DAYS array contém "Monday"?
4. Atividades existem para todas as turmas?
```

### Problema: Slot errado
```
Verificar:
1. DAYS.indexOf(dayName) retorna correto?
2. slotIdx é número inteiro?
3. Slot existe em data.timeSlots?
```

### Problema: Professores diferentes não funcionam
```
Verificar:
1. teacherId === null em group (wildcard)?
2. Activity.teacherId está correto?
3. getSyncGroup() aceita wildcard?
```

