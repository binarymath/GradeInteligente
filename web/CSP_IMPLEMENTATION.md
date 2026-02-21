# 🧠 Implementação CSP - Constraint Satisfaction Problem

## Objetivo
Reduzir o número de erros na geração de grades de 52 para zero (ou próximo disso) utilizando algoritmos avançados de otimização.

## 🎯 Problema Original
O algoritmo **Greedy (Guloso)** anterior tinha limitações:
- Ordenava atividades e alocava na primeira oportunidade
- Não reconsiderava decisões anteriores
- Deixava muitos "buracos" na grade
- Gerava ~52 erros/pendências

## ✨ Solução: Constraint Satisfaction Problem (CSP)

### O que é CSP?
CSP é um paradigma matemático para resolver problemas com:
- **Variáveis**: Cada atividade (aula) é uma variável
- **Domínios**: Conjunto de possíveis slots (dia, hora) para cada atividade
- **Restrições**: Regras que devem ser satisfeitas

### Algoritmos Implementados

#### 1. **Arc Consistency (AC-3)**
Reduz domínios de variáveis eliminando valores que NUNCA podem ser parte de uma solução válida.

**Benefício**: Reduz drasticamente o espaço de busca antes de iniciar backtracking.

```javascript
// Antes: 490 atividades × 5 dias × 10 slots = 24.500 possibilidades
// Depois AC-3: ~3.000-5.000 possibilidades restantes
```

**Exemplo**:
- Aula de Professor A, Turma 1 às 2ª-feira 14:00
- Se AC-3 detectar conflito, remove essa opção do domínio

#### 2. **Backtracking com MRV (Minimum Remaining Values)**
Em vez de alocar de forma sequencial, escolhe a atividade com **menos opções** primeiro.

**Raciocínio**: Se uma atividade tem apenas 3 slots viáveis, aloca primeiro. Se falhar, detecta cedo e faz backtrack.

```javascript
// MRV heurística:
// 1. Aula com 2 slots viáveis (crítica)
// 2. Aula com 5 slots viáveis
// 3. Aula com 20 slots viáveis (flexível)
```

#### 3. **LCV (Least Constraining Value)**
Ao escolher um slot para uma atividade, escolhe o que **deixa mais opções** para outras atividades.

```javascript
// Se atividade X pode ir em Slot A ou Slot B:
// A: Afeta 3 outras atividades
// B: Afeta 15 outras atividades
// → Escolhe A (menos restritivo)
```

#### 4. **Constraint Propagation**
Após cada atribuição, atualiza domínios de variáveis relacionadas.

```javascript
// Se Aula X alocada em Seg-14:00,
// remova Seg-14:00 do domínio de todas atividades do mesmo profesor/turma
```

## 📊 Estratégia de Integração

### Fase 1: Detecção de Problema Altamente Restringido
```javascript
const constraintRatio = (atividades × dias × slotsEsperados) / slotsDisponíveis;
if (constraintRatio > 2.0) → Use CSP como estratégia primária
```

### Fase 2: Greedy com Refinamento CSP
```javascript
1. Execute Greedy (250 iterações)
2. Se pendências > 10 → Ative CSP refinement
3. Compare resultados: use o melhor
```

## 🔧 Implementação Técnica

### Arquivo: `CSPScheduleManager.js`

```javascript
class CSPScheduleManager {
  // 1. Inicializar domínios
  _initializeDomains()
  
  // 2. Arc Consistency (AC-3)
  _arcConsistency()
  _revise(xiId, xjId)
  
  // 3. Backtracking com MRV
  _backtrackingSearch()
  _selectUnassignedVariable()  // MRV
  _orderDomainValues()          // LCV
  
  // 4. Constraint Propagation
  _constraintPropagation()
}
```

### Restrições Implementadas

**Hard Constraints** (Devem ser satisfeitas):
- ✅ Professor não pode estar em 2 lugares simultaneamente
- ✅ Turma não pode ter 2 aulas no mesmo horário
- ✅ Respeitar disponibilidade do professor
- ✅ Respeitar turno da turma
- ✅ Aulas duplas devem ser em slots consecutivos

**Soft Constraints** (Preferências):
- ⭐ Preferências de horário do professor
- ⭐ Preferências de horário da matéria

## 📈 Resultados Esperados

| Métrica | Antes | Depois |
|---------|-------|--------|
| Pendências | 52 | 0-5 |
| Tempo (ms) | ~500ms | ~200ms |
| Iterações Greedy | 250 | 25-50 |
| Arc Consistency | - | ~98% redução |

## 🚀 Como Usar

1. **Automático**: O algoritmo detecta automaticamente quando usar CSP
2. **Detalhes no Log**: 
   - "🧠 Problema altamente restringido. Usando CSP..." → CSP primária
   - "🧠 Ativando refinamento com CSP..." → CSP refinement
   - "✅ CSP encontrou uma solução melhor..." → CSP melhorou resultado

## 💡 Vantagens

1. **Redução de Erros**: De 52 para próximo de 0
2. **Mais Rápido**: Menos iterações greedy necessárias
3. **Determinístico**: Garante solução ótima se existir
4. **Escalável**: Funciona bem em problemas complexos

## ⚠️ Quando Usar Cada Um

| Situação | Algoritmo |
|----------|-----------|
| Poucos conflitos | Greedy (rápido) |
| Muitos conflitos (>10) | CSP Refinement |
| Sistema altamente restringido | CSP Primária |
| Necessário solução perfeita | CSP + Repair |

## 🔍 Debugging

Ver estatísticas CSP no log:
```
🧠 Iniciando geração CSP...
🔗 Arc Consistency: Reduzido de 24500 para 3200 valores
🔄 Iniciando Backtracking com MRV...
✅ Solução perfeita encontrada!
📈 Backtracking Steps: 150
📈 Arc Consistency Reductions: 45
```

## Próximos Passos (Possíveis Melhorias)

1. **Forward Checking**: Verificar viabilidade antes de fazer assignment
2. **Constraint Learning**: Aprender de conflicts anteriores
3. **Heurística k-consistency**: Mais avançado que AC-3
4. **Hybrid Approach**: CSP + Local Search para refinamento final
