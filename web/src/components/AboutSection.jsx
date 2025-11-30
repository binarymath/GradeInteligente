import React from 'react';
import { Sparkles, Settings, Calendar, Download, Users, HelpCircle, CheckCircle, Github, BookOpen, ExternalLink, AlertTriangle } from 'lucide-react';

// Componente "Sobre o Sistema" simplificado e altamente escaneável.
// Objetivo: transmitir rapidamente o valor, funcionamento e regras principais sem excesso de texto.

const Card = ({ icon: Icon, title, children }) => (
  <div className="flex gap-3 p-4 rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="mt-1 bg-indigo-50 text-indigo-600 rounded-md p-2 h-fit">
      <Icon className="w-5 h-5" />
    </div>
    <div className="text-sm leading-relaxed">
      <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
      {children}
    </div>
  </div>
);

const AboutSection = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-10">
      {/* HERO */}
      <section className="rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <Sparkles className="w-10 h-10" />
          <h1 className="text-3xl font-bold tracking-tight">Grade Inteligente</h1>
        </div>
        <p className="text-indigo-100 text-lg max-w-2xl">
          Gere automaticamente a grade escolar, equilibrando aulas, respeitando preferências e evitando conflitos — simples, claro e eficiente.
        </p>
      </section>

      {/* RESUMO RÁPIDO */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" /> Resumo Rápido</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm"><span className="font-semibold">Geração Automática:</span> organiza aulas respeitando turnos e preferências.</div>
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm"><span className="font-semibold">Aulas Duplas:</span> prioriza blocos consecutivos quando marcadas.</div>
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm"><span className="font-semibold">Conflitos:</span> detecta sobreposição de professor em tempo real.</div>
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm"><span className="font-semibold">Equilíbrio Diário:</span> máximo 3 aulas/dia (ideal 2).</div>
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm"><span className="font-semibold">Matéria Repetida:</span> até 2 aulas da mesma por dia.</div>
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm"><span className="font-semibold">Exportações:</span> PDF, Excel e Agenda (.ics).</div>
        </div>
      </section>

      {/* SEÇÃO DE AVISOS IMPORTANTES */}
      <div className="grid md:grid-cols-2 gap-6">

        {/* AVISO DE BACKUP (ONLINE) */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-2 -mr-2 w-16 h-16 bg-amber-100 rounded-full opacity-50 blur-xl"></div>
          <div className="flex items-start gap-4 relative z-10">
            <div className="bg-amber-100 p-2 rounded-lg text-amber-600 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-amber-900">Atenção: Versão Online</h3>
              <p className="text-sm text-amber-800 leading-relaxed">
                Seus dados são temporários! Eles serão apagados se você <strong>atualizar</strong> ou <strong>fechar</strong> esta janela.
              </p>
              <div className="bg-white/60 rounded-lg p-3 text-sm border border-amber-100">
                <p className="font-semibold text-amber-900 mb-1">Para não perder nada:</p>
                <ul className="list-disc pl-4 text-amber-800 space-y-1">
                  <li>Faça <strong>Backups</strong> frequentes (botão no topo).</li>
                  <li>Salve o arquivo <code className="bg-amber-100 px-1 rounded text-xs">.json</code> em local seguro.</li>
                  <li>Use a opção <strong>Restaurar</strong> para recuperar seus dados.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* DOWNLOAD & SMARTSCREEN */}
        <div className="hidden lg:block bg-indigo-50 border border-indigo-200 rounded-xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-2 -mr-2 w-16 h-16 bg-indigo-100 rounded-full opacity-50 blur-xl"></div>
          <div className="flex items-start gap-4 relative z-10">
            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600 shrink-0">
              <Download className="w-6 h-6" />
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-indigo-900">Baixe para Windows</h3>
              <p className="text-sm text-indigo-800 leading-relaxed">
                Para maior segurança e não depender do navegador, instale o Grade Inteligente no seu computador.
              </p>

              <div className="flex flex-wrap gap-3 my-2">
                <a href="https://github.com/binarymath/GradeInteligenteExecutavel/releases/download/V.0.0.0/Grade-Inteligente-0.0.0-Setup.exe" className="flex-1 bg-indigo-600 text-white text-center px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Instalador (.exe)
                </a>
                <a href="https://github.com/binarymath/GradeInteligenteExecutavel/releases/download/V.0.0.0/Grade-Inteligente-0.0.0-Portable.zip" className="flex-1 bg-white text-indigo-700 border border-indigo-200 text-center px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition-colors shadow-sm flex items-center justify-center gap-2">
                  <BookOpen className="w-4 h-4" /> Portátil (.zip)
                </a>
              </div>

              {/* SmartScreen Info */}
              <div className="text-xs text-indigo-800 bg-indigo-100/50 p-3 rounded-lg border border-indigo-100">
                <p className="font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Apareceu uma tela azul?</p>
                <p className="mb-2">O Windows pode exibir um aviso de proteção pois o app é novo.</p>
                <div className="flex items-center gap-2 font-mono text-[10px] bg-white p-1.5 rounded border border-indigo-100 opacity-90">
                  <span>Mais informações</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-bold text-indigo-700">Executar assim mesmo</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* COMO FUNCIONA */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-600" /> Como Funciona</h2>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3"><span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-xs">1</span><div><strong>Configure horários:</strong> defina períodos e tipos (aula, intervalo, etc.).</div></li>
          <li className="flex gap-3"><span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-xs">2</span><div><strong>Cadastre:</strong> professores (turnos), matérias (preferências) e turmas (slots ativos).</div></li>
          <li className="flex gap-3"><span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-xs">3</span><div><strong>Atribua:</strong> professor + matéria + turma com quantidade semanal e opção de aula dupla.</div></li>
          <li className="flex gap-3"><span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-xs">4</span><div><strong>Gere:</strong> o algoritmo distribui otimizando equilíbrio, preferências e evitando conflitos.</div></li>
          <li className="flex gap-3"><span className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-xs">5</span><div><strong>Exporte:</strong> grade visual ou arquivos para impressão e calendário.</div></li>
        </ol>
      </section>

      {/* VANTAGENS */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-600" /> Principais Vantagens</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card icon={Sparkles} title="Automação Inteligente">
            Reduz trabalho manual e gera distribuição coerente de aulas com poucas entradas.
          </Card>
          <Card icon={Download} title="Exportação Completa">
            Arquivos prontos para impressão, planilhas de análise e agenda digital semanal.
          </Card>
          <Card icon={Users} title="Clareza Operacional">
            Visualização por professor, turma ou matéria facilita revisão rápida.
          </Card>
          <Card icon={CheckCircle} title="Regras Pedagógicas">
            Limites de carga diária e repetição evitam concentração excessiva de conteúdo.
          </Card>
        </div>
      </section>

      {/* REGRAS */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-indigo-600" /> Regras Aplicadas</h2>
        <ul className="text-sm space-y-1 bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <li>• Até 3 aulas por professor no mesmo dia (ideal 2).</li>
          <li>• Até 2 aulas da mesma matéria por dia (permite aula dupla).</li>
          <li>• Aulas duplas exigem dois slots consecutivos livres.</li>
          <li>• Preferências de matéria elevam prioridade de alocação.</li>
          <li>• Conflitos de professor geram alerta imediato com motivo.</li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><HelpCircle className="w-5 h-5 text-indigo-600" /> Perguntas Frequentes</h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
            <p className="font-medium mb-1">Por que não vejo todos os horários?</p>
            <p className="text-slate-600">A visualização de professor filtra pelos turnos configurados. Ajuste o cadastro do docente.</p>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
            <p className="font-medium mb-1">Como identificar conflitos?</p>
            <p className="text-slate-600">Após gerar, aparece um painel listando sobreposições com o motivo detalhado.</p>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
            <p className="font-medium mb-1">Posso editar manualmente?</p>
            <p className="text-slate-600">Altere atribuições ou preferências e gere novamente a grade.</p>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
            <p className="font-medium mb-1">Exportação inclui eventos?</p>
            <p className="text-slate-600">No arquivo .ics férias e feriados são excluídos automaticamente.</p>
          </div>
        </div>
      </section>

      {/* DOCUMENTAÇÃO & CÓDIGO removido conforme solicitação */}

      {/* FOOTER */}
      {/* Rodapé removido conforme solicitação */}
    </div>
  );
};

export default AboutSection;
