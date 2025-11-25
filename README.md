# Grade Inteligente

Sistema web para gerenciamento e geração de grade horária escolar com suporte a professores, turmas, matérias, preferências, restrições e exportações (PDF, Excel e Agenda .ics). Construído com React + Vite e TailwindCSS.

## ✨ Principais Funcionalidades
- **Cadastro Estruturado**: Professores (com múltiplos turnos), Matérias (preferências e bloqueios por horário) e Turmas (turno + seleção de horários ativos).
- **Turnos Avançados**: Suporte a Manhã, Tarde, Noite e combinações "Integral (Manhã e Tarde)" e "Integral (Tarde e Noite)".
- **Atribuições**: Registro de aulas por Professor/Matéria/Turma com quantidade semanal e preferência por aula dupla.
- **Edição Inline**: Professores, Matérias, Turmas, Horários e Atribuições podem ser editados diretamente nas listagens.
- **Grade Horária Dinâmica**: Visualização por Turma, Professor ou Matéria, filtrando automaticamente horários por turno.
- **Geração Inteligente**: Algoritmo automático que prioriza aulas duplas, respeita preferências de matérias e aloca otimizando restrições.
- **Validação de Conflitos**: Detecção automática de sobreposição de professores com mensagens intuitivas.
- **Eventos Escolares**: Cadastro de Férias e Feriados que excluem aulas da exportação de Agenda.
- **Exportações**:
  - PDF (layout tabular da grade)
  - Excel (linhas detalhadas com Professor/Materia/Turma/Dia/Horário)
  - ICS (agenda semanal recorrente com exclusões por eventos)
- **Preferências de Matérias**: Ciclo Disponível → Bloqueado → Preferencial por slot (clique sequencial).
- **Testes Automatizados**: Suite de testes unitários para garantir qualidade e confiabilidade.

## 🗂 Estrutura de Pastas (Resumo)
```
src/
  App.jsx                # Estado global e roteamento de views
  main.jsx               # Bootstrap React/Vite
  index.css              # Tailwind + estilos globais
  utils.js               # Utilidades (uid, constantes de dias, cores, slots)
  models/
    ScheduleManager.js   # Lógica (expansível) de geração/gestão de agenda
  components/
    ActivitiesSection.jsx      # Atribuições: criar/editar/excluir
    DataInputSection.jsx       # Professores, Matérias e Turmas (cadastro/restrições)
    TimeSettingsSection.jsx    # Grade Horária (slots de tempo + edição de tipo/turno)
    TimetableSection.jsx       # Visualização + exportações
    AgendaSection.jsx          # Página de Agenda e eventos (.ics)
```

## 🔄 Fluxo de Uso
1. **Config. Horários**: Defina os slots (início/fim, tipo e turno). Edite conforme necessário.
2. **Inserções**:
   - Professores: cadastre e selecione turnos; marque indisponibilidades (H. Extra Classe).
   - Matérias: cadastre e defina bloqueios/preferências por horário.
   - Turmas: cadastre e marque os horários que a turma realmente usa.
3. **Atribuições**: Relacione Professor + Matéria + Turma e informe a carga (Qtd. Aulas), marcando se prefere aulas duplas.
4. **Grade Inteligente**: Visualize a matriz por Turma ou Professor (horários do professor já filtrados por turno).
5. **Agenda & Grade**: Ajuste ano letivo e eventos (Férias/Feriados) e exporte a Agenda (.ics). PDF/Excel permanecem na visão de grade.

## 🧠 Lógica de Turnos
Classificação automática de cada slot pelo horário de início:
- < 12:00 → Manhã
- < 18:00 → Tarde
- ≥ 18:00 → Noite

Turnos "Integral" expandem para dois períodos internos. A visualização do Professor só exibe slots dos seus turnos expandidos.

## 🗓 Exportação ICS (Agenda)
Cada aula vira um evento semanal recorrente até a data final do ano letivo:
- `RRULE:FREQ=WEEKLY;UNTIL=...`
- Eventos de Férias/Feriado geram múltiplos `EXDATE` excluindo ocorrências nos dias correspondentes.
- Timezone fixo: `America/Sao_Paulo`.

## 🚀 Instalação & Execução
Pré-requisitos: Node.js (>= 18), npm.

```powershell
# Instalar dependências
npm install

# Ambiente de desenvolvimento (hot reload)
npm run dev

# Build de produção
npm run build

# Servir build (pré-visualização)
npm run preview
```
Acesse normalmente via endereço mostrado pelo Vite (ex: `http://localhost:5173`).

## 🧪 Scripts Principais
| Script | Ação |
| ------ | ---- |
| `dev` | Inicia servidor Vite com HMR |
| `build` | Gera bundle otimizado em `dist/` |
| `preview` | Servidor estático para testar build |
| `test` | Executa testes unitários com Vitest |
| `test:ui` | Interface visual para testes |
| `test:coverage` | Relatório de cobertura de testes |

## ⚙️ Tecnologias
- React 18 + Vite
- TailwindCSS
- lucide-react (ícones)
- jsPDF + jspdf-autotable (PDF)
- xlsx + file-saver (Excel)


## 🧩 Próximos Passos / Roadmap
- [x] UI de exportações: botões individuais (ícones) — implementado com ExportButtons (PDF, Excel, ICS).
- [x] Algoritmo automático de geração/otimização de grade — implementado com priorização por restrições e preferências.
- [x] Validação de conflitos (professor em duas turmas simultâneas) — implementado com detecção de sobreposição e motivo intuitivo.
- [x] Agrupamento de aulas duplas na geração final — aulas duplas são alocadas em slots consecutivos.
- [x] Testes automatizados (unitários para utilidades e componentes críticos) — suite de testes com Vitest.

## 🛠 Personalização
Todos os estados iniciais estão em `App.jsx`. Para adicionar novos tipos de slot (ex: "reforço"), inclua nas seleções de `TimeSettingsSection.jsx` e ajuste cores conforme necessário.

## ❓ Perguntas Frequentes (FAQ)
**1. Por que alguns horários não aparecem na visão do Professor?**
Porque são filtrados pelos turnos selecionados para esse professor. Ajuste os turnos na aba Professores.

**2. Como remover um evento do calendário?**
Acesse Agenda & Grade e clique no ícone de lixeira na lista de eventos.

**3. ICS não inclui aulas em certo dia.**
Verifique se as datas do Ano Letivo cobrem aquele dia e se não há evento de Férias/Feriado excluindo-o.

## 🤝 Contribuição
1. Fork / Clone.
2. Crie branch: `git checkout -b feature/nova-funcionalidade`.
3. Commit: `git commit -m "feat: adiciona ..."`.
4. Push: `git push origin feature/nova-funcionalidade`.
5. Abra Pull Request descrevendo mudança e impacto.

## 📄 Licença
Defina uma licença antes de distribuição pública (ex: MIT). Adicione arquivo `LICENSE` apropriado.

## 🧭 Créditos
Interface e lógica evoluídas iterativamente conforme requisitos funcionais (turnos integrais, preferências, filtragens, eventos e exportações).

---
Se algo estiver incorreto ou faltar explicação específica, abra uma issue ou solicite ajuste direto. Boa organização! ✨
