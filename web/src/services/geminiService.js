/* eslint-disable no-unused-vars */
// Lista de modelos para fallback - Restrito ao solicitado
const MODELS = [
  "gemini-2.5-flash"
];
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

export const geminiService = {
  getApiKey() {
    const key = localStorage.getItem('gemini_api_key');
    return key ? key.trim() : null;
  },

  async analyzeAndFix(failures, conflicts, currentLimits) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("Chave de API não configurada.");

    // Formatar diagnósticos para a IA
    const simplifiedFailures = failures.slice(0, 15).map(f => ({
      id: `${f.subjectId}-${f.classId}`, // ID Único para priorização
      item: `${f.activityName} (${f.className})`,
      missing: f.remaining,
      reasons: f.diagnosis
    }));

    const prompt = `
      Você é um especialista em algoritmos de alocação de horários escolares.
      O algoritmo falhou em alocar aulas para ${failures.length} itens.

      DADOS DE FALHA (Diagnóstico de slots rejeitados):
      ${JSON.stringify(simplifiedFailures, null, 2)}
      
      LEGENDA DE DIAGNÓSTICO (Motivos de rejeição de slot):
      - PROFESSOR_INDISPONIVEL: Professor marcou indisponibilidade.
      - TURMA_OCUPADA / PROFESSOR_OCUPADO: Slot já tomado.
      - CONFLITO_HORARIO_REAL: Sobreposição de horário real (incompatibilidade de intervalo/horário).
      - LIMITE_AULAS_MATERIA_DIA: Atingiu max aulas desta matéria p/ turma no dia.
      - LIMITE_AULAS_PROF_DIA: Atingiu max aulas deste prof p/ turma no dia.
      
      LIMITES ATUAIS: ${JSON.stringify(currentLimits)}

      TAREFA:
      Analise os diagnósticos e proponha soluções para desbloquear a grade.
      SE DEDIQUE EXCLUSIVAMENTE A RESOLVER OS ERROS LISTADOS EM "DADOS DE FALHA".
      
      ESTRATÉGIAS DE DESBLOQUEIO (Use estas regras):
      1. PRIORIZAÇÃO (priorityFocus):
         - OBRIGATÓRIO: Para cada item listado em "DADOS DE FALHA", DEVOLVA O ID DELE NA LISTA "priorityFocus".
         - Isso garantirá que o algoritmo tente alocá-los primeiro na próxima tentativa.
         - Se houver conflito de horário (CONFLITO_HORARIO_REAL), verifique se o professor não está sobrecarregado.

      2. LIMITES:
         - Se houver 'PROFESSOR_OCUPADO' ou 'TURMA_OCUPADA', AUMENTE 'MAX_SAME_SUBJECT_PER_DAY'.
         - Permitir mais aulas no mesmo dia "compacta" a grade e evita a fragmentação.
      
      RETORNO JSON OBRIGATÓRIO (sem markdown):
      {
        "rationale": "Explicação técnica...",
        "suggestedLimits": {
          "MAX_SAME_SUBJECT_PER_DAY": number, 
          "MAX_TEACHER_LOGGED_PER_DAY": number
        },
        "priorityFocus": ["ID_ITEM1", "ID_ITEM2"],  // Lista de IDs dos itens que falharam e devem ser testados primeiro
        "forceStrategy": "RELAXED"
      }
      {
        "rationale": "Adicionei ID-X e ID-Y ao focus pois falharam por falta de slots. Aumentei limite diário.",
        "suggestedLimits": {
          "MAX_SAME_SUBJECT_PER_DAY": number, 
          "MAX_TEACHER_LOGGED_PER_DAY": number
        },
        "priorityFocus": ["subjectId-classId"],
        "forceStrategy": "RELAXED"
      }
    `;


    try {
      let lastError = null;

      // Tenta modelos em ordem de preferência (Fallback)
      for (const model of MODELS) {
        try {
          const url = `${BASE_URL}${model}:generateContent?key=${apiKey}`;

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { response_mime_type: "application/json" }
            })
          });

          if (!response.ok) {
            const errText = await response.text();

            // Se for erro de quota (429), tentar outro modelo pode não adiantar se a quota for por projeto,
            // mas se for por modelo (rate limit), vale a pena tentar.
            if (response.status === 429) {
              console.warn(`Quota excedida para ${model}, tentando próximo...`);
              lastError = new Error(`⛔ Cota excedida (${model}). Tentando outro...`);
              continue; // Próximo modelo
            }

            if (response.status === 404) {
              console.warn(`Modelo não encontrado ${model}, tentando próximo...`);
              lastError = new Error(`Modelo indisponível (${model}).`);
              continue;
            }

            if (response.status === 400 && errText.includes('API_KEY_INVALID')) {
              localStorage.removeItem('gemini_api_key');
              throw new Error("⛔ CHAVE DE API INVÁLIDA. O sistema removeu a chave incorreta. Configure novamente.");
            }

            throw new Error(`Erro na API (${response.status}): ${errText.substring(0, 100)}...`);
          }

          const data = await response.json();
          if (!data.candidates || !data.candidates[0].content) {
            throw new Error("Resposta da API vazia ou malformada.");
          }

          const text = data.candidates[0].content.parts[0].text;
          // Remover markdown code blocks se houver
          const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
          return JSON.parse(cleanText);

        } catch (err) {
          console.warn(`Falha no modelo ${model}:`, err.message);
          // Armazena erro com detalhes do modelo para debug
          lastError = new Error(`Falha em ${model}: ${err.message}`);

          // Se for erro critico de chave, para tudo
          if (err.message.includes('CHAVE DE API INVÁLIDA')) throw err;
          // Senão continue para o proximo
        }
      }

      // Se chegou aqui, todos falharam. Lança o último erro, que provavelmente é o mais relevante se todos falharam.
      throw lastError || new Error("Falha em todos os modelos de IA.");


    } catch (error) {
      console.error("Gemini Critical Error:", error);
      throw error; // Repassa o erro para o log da UI
    }
  }
};
