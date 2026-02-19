import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { TavilySearchAPIRetriever } from "@langchain/community/retrievers/tavily_search_api";
import { createClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "./env.js";

type MemoryRow = {
  id: number;
  content: string | null;
  similarity?: number | null;
};

// ─── Detección de intención ───────────────────────────────────────────────────

/**
 * Pregunta sobre experiencias, recuerdos o vida personal del usuario.
 * → Consultar memorias de Supabase.
 * Ejemplos: "¿qué hice ayer?", "¿de qué hablé con mi tío?", "¿cuáles son mis metas?"
 */
const MEMORY_TRIGGER_PATTERNS = [
  /\b(recuerda|recuerdas|acuerdo|acuerdas|ayer|anteayer|la semana pasada|el mes pasado)\b/i,
  /\b(hice|fui|estuve|visité|fui a|hablé|conversé|platiqu[eé]|dije|mencioné)\b/i,
  /\b(mi vida|mis metas|mis planes|mis notas|mis recuerdos|lo que viví|lo que pasó)\b/i,
  /\b(qué (tengo|quiero|pienso|estoy|estaba)|cuáles son mis|cuándo (fui|estuve|hablé))\b/i,
  /\b(carrera|universidad|estudios|estudiar|ingeniería|tío|familia|amigos)\b/i,
];

/**
 * Pregunta sobre información factual externa que puede haber cambiado
 * o que el usuario no tendría en sus memorias personales.
 * → Buscar en la web con Tavily.
 * Ejemplos: "¿cuál es la mejor universidad?", "¿qué es machine learning?"
 */
const WEB_TRIGGER_PATTERNS = [
  /\b(qué es|cómo funciona|cómo se hace|cuál es la mejor|cuáles son las mejores)\b/i,
  /\b(define|definición|explica|explicame|dime sobre|información sobre)\b/i,
  /\b(noticias|actualidad|últimas|reciente|hoy en día|actualmente)\b/i,
  /\b(precio|costo|dónde (comprar|estudiar|trabajar)|requisitos para|pasos para)\b/i,
  /\b(universidad|carrera de|ingeniería de|campo laboral|salario|trabajo)\b/i,
];

function requiresMemory(prompt: string): boolean {
  return MEMORY_TRIGGER_PATTERNS.some((p) => p.test(prompt));
}

function requiresWebSearch(prompt: string): boolean {
  return WEB_TRIGGER_PATTERNS.some((p) => p.test(prompt));
}

// ─── System Prompt base ───────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `Eres un asistente personal inteligente y amigable.

Tu objetivo es ayudar al usuario respondiendo sus preguntas de forma natural, clara y cercana.

INSTRUCCIONES:
- Responde siempre en español con un tono amable y conversacional.
- Para saludos, agradecimientos o charla general, responde directamente sin usar ningún contexto.
- Nunca inventes información. Si no sabes algo, dilo con honestidad.
- Si tienes contexto disponible (memorias personales o búsqueda web), úsalo de forma fluida en tu respuesta, sin citarlo de forma robótica.
- Recuerdas toda la conversación actual y puedes hacer referencia a lo que el usuario dijo antes.

EJEMPLOS de cuándo NO usar herramientas:
- "Hola" → Saluda naturalmente
- "Gracias" → Responde amablemente
- "¿Cómo estás?" → Responde de forma conversacional

EJEMPLOS de cuándo usar MEMORIAS PERSONALES:
- "¿De qué hablé con mi tío?" → Busca en memorias y responde con lo registrado
- "¿Cuáles son mis metas?" → Extrae la información de las notas personales
- "¿Qué hice la semana pasada?" → Consulta el historial de memorias

EJEMPLOS de cuándo usar BÚSQUEDA WEB:
- "¿Qué es la ingeniería en sistemas?" → Busca información actualizada en la web
- "¿Cuáles son las mejores universidades?" → Busca resultados relevantes en la web
- "¿Cuánto gana un ingeniero?" → Busca datos actuales en la web`;

// ─── Función principal ────────────────────────────────────────────────────────

export async function buildAgentResponse(userPrompt: string): Promise<string> {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
  const model = new ChatOpenAI({ model: "gpt-4.1-mini", temperature: 0.7 });

  const needsMemory = requiresMemory(userPrompt);
  const needsWeb = requiresWebSearch(userPrompt);

  let memoryContext = "";
  let tavilyContext = "";

  // ── Tool 1: Memorias personales (Supabase) ──
  if (needsMemory) {
    const queryEmbedding = await embeddings.embedQuery(userPrompt);
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: queryEmbedding,
      match_count: 5,
    });

    if (error) throw new Error(`Supabase RPC error: ${error.message}`);

    const memories = (data ?? []) as MemoryRow[];
    const valid = memories.filter((m) => m.content?.trim());

    if (valid.length > 0) {
      memoryContext = valid
        .map((m, i) => `[${i + 1}] ${m.content}`)
        .join("\n");
    }
  }

  // ── Tool 2: Búsqueda web (Tavily) ──
  if (needsWeb && process.env.TAVILY_API_KEY) {
    const retriever = new TavilySearchAPIRetriever({
      k: 5,
      apiKey: process.env.TAVILY_API_KEY,
    });
    const docs = await retriever._getRelevantDocuments(userPrompt);
    const valid = docs.filter((d) => d.pageContent?.trim());

    if (valid.length > 0) {
      tavilyContext = valid
        .map((doc, i) => {
          const title = doc.metadata?.title ? ` - ${doc.metadata.title}` : "";
          const url = doc.metadata?.url ? ` (${doc.metadata.url})` : "";
          return `[W${i + 1}]${title}${url} ${doc.pageContent}`.trim();
        })
        .join("\n");
    }
  }

  // ── Construir system prompt final ──
  let systemPrompt = BASE_SYSTEM_PROMPT;

  if (memoryContext) {
    systemPrompt +=
      "\n\n---\nMEMORIAS PERSONALES DEL USUARIO (úsalas para responder sobre su vida y experiencias):\n" +
      memoryContext;
  }

  if (tavilyContext) {
    systemPrompt +=
      "\n\n---\nRESULTADOS DE BÚSQUEDA WEB (úsalos para responder con información actualizada):\n" +
      tavilyContext;
  }

  if (needsMemory && !memoryContext) {
    systemPrompt +=
      "\n\n---\nNota: No encontré memorias personales relacionadas con esta pregunta. " +
      "Informa al usuario de forma amable que no tienes ese recuerdo registrado.";
  }

  if (needsWeb && !tavilyContext) {
    systemPrompt +=
      "\n\n---\nNota: No se encontraron resultados web relevantes para esta pregunta.";
  }

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  return String(response.content ?? "");
}