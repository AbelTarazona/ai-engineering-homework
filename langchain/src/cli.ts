import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildAgentResponse } from "./agent.js";

export async function runCli() {
  const rl = readline.createInterface({ input, output });
  const userPrompt = await rl.question("Escribe tu pregunta: ");
  rl.close();

  const response = await buildAgentResponse(userPrompt);
  console.log(response);
}
