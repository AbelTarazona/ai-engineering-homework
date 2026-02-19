import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { ChatOpenAI } from "npm:@langchain/openai";
import { OpenAIEmbeddings } from "npm:@langchain/openai";
import { HumanMessage, SystemMessage } from "npm:@langchain/core/messages";
import { TavilySearchAPIRetriever } from "npm:@langchain/community/retrievers/tavily_search_api";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatwootWebhookPayload = {
  event?: string;
  message_type?: string;
  content?: string;
  conversation?: {
    id?: number;
  };
};

type MemoryRow = {
  id: number;
  content: string | null;
  similarity?: number | null;
};

// ─── Patrones de detección ────────────────────────────────────────────────────

const MEMORY_TRIGGER_PATTERNS = [
  /\b(recuerda|recuerdas|acuerdo|acuerdas|ayer|anteayer|la semana pasada|el mes pasado)\b/i,
  /\b(hice|fui|estuve|visité|fui a|hablé|conversé|platiqué|dije|mencioné)\b/i,
  /\b(mi vida|mis metas|mis planes|mis notas|mis recuerdos|lo que viví|lo que pasó)\b/i,
  /\b(qué (tengo|quiero|pienso|estoy|estaba)|cuáles son mis|cuándo (fui|estuve|hablé))\b/i,
  /\b(carrera|universidad|estudios|estudiar|ingeniería|tío|familia|amigos)\b/i,
];

const WEB_TRIGGER_PATTERNS = [
  /\b(qué es|cómo funciona|cómo se hace|cuál es la mejor|cuáles son las mejores)\b/i,
  /\b(define|definición|explica|explicame|dime sobre|información sobre)\b/i,
  /\b(noticias|actualidad|últimas|reciente|hoy en día|actualmente)\b/i,
  /\b(precio|costo|dónde (comprar|estudiar|trabajar)|requisitos para|pasos para)\b/i,
  /\b(universidad|carrera de|ingeniería de|campo laboral|salario|trabajo)\b/i,
];

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

// ─── Funciones auxiliares ─────────────────────────────────────────────────────

function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Variable de entorno requerida no encontrada: ${key}`);
  }
  return value;
}

function requiresMemory(prompt: string): boolean {
  return MEMORY_TRIGGER_PATTERNS.some((p) => p.test(prompt));
}

function requiresWebSearch(prompt: string): boolean {
  return WEB_TRIGGER_PATTERNS.some((p) => p.test(prompt));
}

async function verifyChatwootSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) {
    return false;
  }

  const encoder = new TextEncoder();
  const secretData = encoder.encode(secret);
  const bodyData = encoder.encode(rawBody);

  const key = await crypto.subtle.importKey("raw", secretData, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);

  const signature = await crypto.subtle.sign("HMAC", key, bodyData);
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signatureHeader === expected;
}

async function sendChatwootMessage(conversationId: number, content: string): Promise<void> {
  const apiUrl = getRequiredEnv("CHATWOOT_API_URL");
  const accountId = getRequiredEnv("CHATWOOT_ACCOUNT_ID");
  const apiToken = getRequiredEnv("CHATWOOT_API_TOKEN");

  const response = await fetch(
    `${apiUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_access_token": apiToken,
      },
      body: JSON.stringify({
        content,
        message_type: "outgoing",
        private: false,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chatwoot API error: ${response.status} ${errorText}`);
  }
}

async function buildAgentResponse(userPrompt: string): Promise<string> {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });
  const model = new ChatOpenAI({ model: "gpt-4-turbo", temperature: 0.7 });

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
  if (needsWeb && Deno.env.get("TAVILY_API_KEY")) {
    const retriever = new TavilySearchAPIRetriever({
      k: 5,
      apiKey: Deno.env.get("TAVILY_API_KEY")!,
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

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Solo procesar POST requests
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método no permitido" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtener el body raw para verificación de firma
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody) as ChatwootWebhookPayload;

    // Verificar firma (opcional, si está configurada)
    const secret = Deno.env.get("CHATWOOT_WEBHOOK_SECRET");
    if (secret) {
      const signatureHeader = req.headers.get("x-chatwoot-signature");
      const isValid = await verifyChatwootSignature(rawBody, signatureHeader, secret);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Firma inválida" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verificar que sea un mensaje entrante
    const event = payload.event;
    const messageType = payload.message_type;
    const conversationId = payload.conversation?.id;
    const content = payload.content ?? "";

    const senderType = (payload as { sender?: { type?: string } })?.sender?.type;
    const contentPreview = content.slice(0, 120);

    console.log(
      `[chatwoot] event=${event} message_type=${messageType} sender_type=${senderType} conversation_id=${conversationId} content="${contentPreview}"`
    );

    // Ignorar si no es un mensaje entrante
    if (event !== "message_created" || messageType !== "incoming") {
      return new Response(JSON.stringify({ status: "ignored" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conversationId || !content.trim()) {
      return new Response(JSON.stringify({ error: "Payload incompleto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limpiar el contenido (remover HTML)
    const cleanContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // Construir respuesta
    const responseText = await buildAgentResponse(cleanContent);

    // Enviar respuesta a Chatwoot
    await sendChatwootMessage(conversationId, responseText);

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[chatwoot-webhook] Error:", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
