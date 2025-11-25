# 📚 Grade Inteligente

**Sistema inteligente de geração automática de horários escolares**

Uma solução moderna e completa para criar grades horárias otimizadas, respeitando preferências de professores, restrições de matérias e necessidades das turmas. Desenvolvido com React, Vite e TailwindCSS.

---

## ✨ Recursos Principais

### 🎯 Geração Inteligente
Algoritmo avançado que cria automaticamente a grade horária ideal, considerando:
- Priorização de aulas duplas
- Distribuição equilibrada (máximo 3 aulas/dia por professor, preferencialmente 2)
- Respeito às preferências de horário das matérias
- Limitação de repetição da mesma matéria (máximo 2 aulas/dia)
- Detecção e prevenção automática de conflitos

### 📊 Gestão Completa
- **Professores**: Cadastro com turnos de trabalho e disponibilidade de horários
- **Matérias**: Configuração de preferências e bloqueios por horário
- **Turmas**: Definição de turno e seleção de horários ativos
- **Atribuições**: Vínculo entre Professor + Matéria + Turma com carga horária semanal

### 🔄 Visualização Dinâmica
- Filtros por Turma, Professor ou Matéria
- Ajuste automático de horários por turno
- Edição inline de todos os cadastros
- Interface intuitiva e responsiva

### 📤 Exportações Profissionais
- **PDF**: Grade formatada pronta para impressão
- **Excel**: Planilha detalhada com todas as aulas
- **ICS**: Agenda digital compatível com Google Calendar, Outlook e outros

### 🎓 Recursos Pedagógicos
- Cadastro de férias e feriados
- Eventos escolares integrados à agenda
- Turnos flexíveis (Manhã, Tarde, Noite, Integral)
- Validação inteligente de conflitos com motivos detalhados

---

## 🗂️ Estrutura do Projeto

```
src/
├── App.jsx                    # Gerenciamento de estado e navegação
├── main.jsx                   # Ponto de entrada React
├── index.css                  # Estilos globais
├── utils.js                   # Funções utilitárias
├── models/
│   └── ScheduleManager.js     # Motor de geração inteligente
└── components/
    ├── ActivitiesSection.jsx       # Gerenciamento de atribuições
    ├── DataInputSection.jsx        # Cadastros (Professores/Matérias/Turmas)
    ├── TimeSettingsSection.jsx     # Configuração de horários
    └── TimetableSection.jsx        # Visualização e exportações
```

---

## 🚀 Começando

### Pré-requisitos
- Node.js 18 ou superior
- npm ou yarn

### Instalação

```powershell
# Clone o repositório
git clone https://github.com/binarymath/GradeInteligente.git

# Entre na pasta do projeto
cd GradeInteligente

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

Acesse `http://localhost:5173` no seu navegador.

---

## 🎯 Como Usar

### 1️⃣ Configure os Horários
Defina os períodos de aula com horário de início, fim, tipo e turno correspondente.

### 2️⃣ Cadastre os Dados Básicos
- **Professores**: Adicione os docentes e selecione seus turnos de trabalho
- **Matérias**: Registre as disciplinas e configure preferências de horário
- **Turmas**: Crie as turmas e defina quais horários estão disponíveis

### 3️⃣ Crie as Atribuições
Vincule cada professor a uma matéria e turma, informando:
- Quantidade de aulas semanais
- Preferência por aulas duplas (quando aplicável)

### 4️⃣ Gere a Grade
O sistema criará automaticamente uma grade otimizada, respeitando todas as restrições e preferências configuradas.

### 5️⃣ Visualize e Exporte
- Consulte a grade por turma, professor ou matéria
- Exporte em PDF, Excel ou formato de agenda (.ics)
- Configure o ano letivo e eventos para exportação precisa

---

## 🧪 Testes

O projeto inclui uma suite completa de testes automatizados.

```powershell
# Executar todos os testes
npm test

# Interface visual de testes
npm run test:ui

# Relatório de cobertura
npm run test:coverage
```

---

## ⚙️ Tecnologias Utilizadas

- **React 18** - Framework JavaScript
- **Vite** - Build tool ultra-rápido
- **TailwindCSS** - Framework CSS utilitário
- **Lucide React** - Biblioteca de ícones
- **jsPDF** - Geração de PDF
- **SheetJS** - Exportação Excel
- **Vitest** - Framework de testes

---

## 💡 Detalhes Técnicos

### Sistema de Turnos
O sistema classifica automaticamente cada horário pelo período do dia:
- **Manhã**: antes das 12:00
- **Tarde**: entre 12:00 e 18:00
- **Noite**: após 18:00

Turnos integrais expandem para múltiplos períodos, facilitando a gestão de professores com jornada estendida.

### Algoritmo de Geração
O motor inteligente utiliza um sistema de pontuação para otimizar a alocação:
- **+10 pontos**: Horários preferenciais da matéria
- **+5 pontos**: Primeiro dia de aula do professor
- **+2 pontos**: Dias com apenas 1 aula
- **-5 pontos**: Terceira aula no mesmo dia (penalização)

### Regras de Distribuição
- Máximo de **3 aulas por dia** por professor
- Recomendação de **2 aulas por dia** (distribuição ideal)
- Máximo de **2 aulas da mesma matéria** por dia
- Aulas duplas são alocadas em **horários consecutivos**

### Exportação de Agenda (.ics)
Gera eventos recorrentes semanais compatíveis com:
- Google Calendar
- Microsoft Outlook
- Apple Calendar
- Qualquer aplicativo que suporte padrão iCalendar

**Características**:
- Recorrência semanal automática (`RRULE:FREQ=WEEKLY`)
- Exclusão de férias e feriados (`EXDATE`)
- Timezone: `America/Sao_Paulo`
- Sincronização automática em aplicativos de calendário

---

## ❓ Perguntas Frequentes

**Por que alguns horários não aparecem na visualização do professor?**  
Os horários são filtrados automaticamente de acordo com os turnos de trabalho configurados para cada professor. Verifique a aba de Professores para ajustar.

**Como funciona a detecção de conflitos?**  
O sistema identifica automaticamente quando um professor está alocado em duas turmas no mesmo horário, exibindo o tempo de sobreposição e as matérias envolvidas.

**Posso editar a grade manualmente após a geração?**  
Atualmente, a edição é feita através das atribuições. Ajuste as configurações e regenere a grade para aplicar mudanças.

**Quantas aulas duplas o sistema consegue agrupar?**  
O algoritmo prioriza o agrupamento de todas as aulas duplas marcadas nas atribuições, respeitando a disponibilidade de horários consecutivos.

---

## 🛠️ Personalização

Todos os dados iniciais e configurações estão centralizados em `App.jsx`. Para customizar:

- **Cores**: Modifique o objeto `COLORS` em `utils.js`
- **Tipos de horário**: Adicione novas opções em `TimeSettingsSection.jsx`
- **Regras de alocação**: Ajuste a lógica em `ScheduleManager.js`

---

## 📈 Roadmap

### ✅ Implementado
- ✅ Sistema de exportação completo (PDF, Excel, ICS)
- ✅ Algoritmo inteligente com otimização por preferências
- ✅ Validação de conflitos com mensagens detalhadas
- ✅ Agrupamento automático de aulas duplas
- ✅ Suite de testes automatizados
- ✅ Distribuição pedagógica equilibrada
- ✅ Limitação de repetição de matérias
- ✅ Interface de edição manual da grade (inclui modo multi-turmas)

### 🎯 Próximas Melhorias
- Dashboard com estatísticas e visualizações
- Histórico de versões de grades
- Notificações de conflitos em tempo real
- Modo de comparação entre grades

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Siga estas etapas:

1. **Fork** o projeto
2. Crie uma **branch** para sua feature
   ```powershell
   git checkout -b feature/minha-feature
   ```
3. **Commit** suas mudanças
   ```powershell
   git commit -m "feat: adiciona nova funcionalidade"
   ```
4. **Push** para a branch
   ```powershell
   git push origin feature/minha-feature
   ```
5. Abra um **Pull Request** detalhando as mudanças

### Padrões de Commit
- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `docs:` Documentação
- `style:` Formatação
- `refactor:` Refatoração de código
- `test:` Testes
- `chore:` Manutenção

---

## 📬 Contato

[![GitHub](https://img.shields.io/badge/GitHub-binarymath-181717?style=for-the-badge&logo=github)](https://github.com/binarymath)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-fabiomatech-0A66C2?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/fabiomatech/)

---

## 📄 Licença

Este projeto está sob análise de licenciamento. Para uso comercial ou distribuição, entre em contato.

---

## 🔐 Privacidade

O sistema não coleta nem envia dados pessoais para servidores. Todo processamento ocorre localmente no navegador.

**Escopo atual:**
- Nomes de professores são ilustrativos/abreviados
- Não há dados de alunos ou informações sensíveis
- Turmas e matérias são identificadores pedagógicos, não pessoais
- Exportações (PDF, Excel, ICS) são geradas 100% localmente

**Sem rastreamento:** nenhuma integração de analytics, cookies de perfil ou publicidade.

**Armazenamento:** memória e (quando usado) `localStorage`; o usuário controla exclusão limpando dados ou removendo arquivos exportados.

**Conflitos e geração:** toda lógica é executada client-side, sem transmissão externa.

Para detalhes e futuras expansões consulte `PRIVACY.md`.

---

## 👥 Créditos

Desenvolvido com foco em resolver desafios reais de coordenação escolar, combinando algoritmos inteligentes com interface intuitiva.

**Tecnologias e Bibliotecas**:
- React Team - Framework base
- Vite Team - Build tooling
- Tailwind Labs - CSS framework
- Lucide - Icon system

---

<div align="center">

**Feito com ❤️ para facilitar a vida de coordenadores e diretores escolares**

[⭐ Star no GitHub](https://github.com/binarymath/GradeInteligente) • [🐛 Reportar Bug](https://github.com/binarymath/GradeInteligente/issues) • [💡 Sugerir Feature](https://github.com/binarymath/GradeInteligente/issues)

</div>
