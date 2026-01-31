# 🧪 GUIA DE TESTE - Aulas Síncronas

## Passo 1: Preparar os dados

Na interface do sistema:

1. **Crie 2 turmas:**
   - ID: `7A` | Nome: `7º Ano A`
   - ID: `7B` | Nome: `7º Ano B`

2. **Crie uma matéria:**
   - ID: `MAT` | Nome: `Matemática`
   - Marque como **"Sincronizar entre turmas"**

3. **Configure a sincronização granular:**
   - Clique em "Matemática" → "Configurar Sincronização"
   - Adicione **turmas: 7A e 7B**
   - Reserve um horário específico: **Segunda-feira, slot 0** (ou seu horário preferido)
   - Salve a configuração

4. **Adicione professores e atividades:**
   - Professor: `Prof. João` (qualquer nome)
   - Atividade 1: 7A + Matemática (1 aula)
   - Atividade 2: 7B + Matemática (1 aula)

## Passo 2: Gerar a grade

1. Clique em **"Gerar Grade"**
2. Aguarde a geração

## Passo 3: Verificar resultados

✅ **Esperado:**

```
🔒 Isolando X atividades síncronas do algoritmo principal.
✅ [Validator] Config Granular Detectada: granular-MAT-config-1
🔍 Verificando posições de aulas síncronas...
✅ X aula(s) síncrona(s) corrigida(s).
```

✅ **Na grade final:**
- Matemática aparece em **7A** em Segunda-feira, slot 0
- Matemática aparece em **7B** em Segunda-feira, slot 0 **(MESMO HORÁRIO)**
- Ambas têm o mesmo professor

## Passo 4: Validação Visual

1. Abra a **Seção de Agenda**
2. Procure por Matemática nas turmas 7A e 7B
3. **Elas devem estar no EXATO mesmo dia e horário**

## 🔍 Sinais de que funciona

✅ Ambas as aulas estão sincronizadas no mesmo slot
✅ Log mostra detecção de configuração granular
✅ Não há conflitos reportados
✅ Aulas respeitam o horário reservado

## ❌ Sinais de que não funciona

❌ As aulas aparecem em horários diferentes
❌ Uma turma não tem a aula
❌ Log mostra erros de sincronização
❌ Validador não detecta as aulas como síncronas

## 📊 Debug: Verificar Console

Abra o **DevTools** (F12) e procure por:

```
✅ [Validator] Config Granular Detectada: granular-MAT-config-1, Slot: Monday-slot0
```

Se VER esta mensagem = validador está funcionando ✅
Se NÃO VER = configuração pode estar incorreta

## 🎯 Teste avançado

Se tudo funcionou, teste com:
- 3 turmas sincronizadas (7A, 7B, 7C)
- 2 matérias síncronas (Matemática + Português)
- Diferentes professores para mesma matéria em turmas diferentes

---

**Sucesso quando:** Todas as restrições são respeitadas automaticamente ✨
