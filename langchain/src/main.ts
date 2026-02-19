import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createClient } from "@supabase/supabase-js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type MemoryRow = {
  id: number;
  content: string | null;
  similarity?: number | null;
};

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en .env");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
  });

  const model = new ChatOpenAI({
    model: "gpt-4.1-mini",
    temperature: 0.7,
  });

  const rl = readline.createInterface({ input, output });
  const userPrompt = await rl.question("Escribe tu pregunta: ");
  rl.close();

  const queryEmbedding = await embeddings.embedQuery(userPrompt);
  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: queryEmbedding,
    match_count: 5,
  });

  if (error) {
    throw new Error(`Supabase RPC error: ${error.message}`);
  }

  const memories = (data ?? []) as MemoryRow[];
  const context = memories
    .map((memory, index) => `[${index + 1}] ${memory.content ?? ""}`)
    .join("\n");

  const systemPrompt =
    "Responde usando solo el contexto. Si el contexto no contiene la respuesta, di que no lo sabes." +
    `\n\nContexto:\n${context}`;

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  console.log(response.content);
}

main();
