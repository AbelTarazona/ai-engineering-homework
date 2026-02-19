import "dotenv/config";
import { createAgent, tool } from "langchain";
import * as z from "zod";

const getWeather = tool(
  (input) => "El clima en " + input.city + " es soleado y 25 grados Celsius.",
  {
    name: "getWeather",
    description: "Get the weather for a city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  },
);

const agent = createAgent({
  model: "gpt-4.1-mini",
  tools: [getWeather],
});

console.log(
  await agent.invoke({
    messages: [
      {
        role: "user",
        content: "¿Cuál es el clima en Lima?",
      },
    ],
  }),
);
