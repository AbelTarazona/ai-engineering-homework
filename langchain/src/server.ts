import express from "express";
import { buildAgentResponse } from "./agent.js";
import { sendChatwootMessage, verifyChatwootSignature } from "./chatwoot.js";
import type { ChatwootWebhookPayload } from "./chatwoot.js";

type RawBodyRequest = express.Request & { rawBody?: Buffer };

export async function runChatwootWebhookServer() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf;
      },
    })
  );

  app.post("/chatwoot", async (req, res) => {
    try {
      const secret = process.env.CHATWOOT_WEBHOOK_SECRET;
      if (secret) {
        const rawBody = (req as RawBodyRequest).rawBody ?? Buffer.from("");
        const signatureHeader = req.header("x-chatwoot-signature") ?? undefined;
        if (!verifyChatwootSignature(rawBody, signatureHeader, secret)) {
          res.status(401).json({ error: "Firma invalida" });
          return;
        }
      }

      const payload = req.body as ChatwootWebhookPayload;
      if (payload.event !== "message_created" || payload.message_type !== "incoming") {
        res.status(200).json({ status: "ignored" });
        return;
      }

      const conversationId = payload.conversation?.id;
      const content = payload.content?.trim();
      if (!conversationId || !content) {
        res.status(400).json({ error: "Payload incompleto" });
        return;
      }

      const responseText = await buildAgentResponse(content);
      await sendChatwootMessage(conversationId, responseText);

      res.status(200).json({ status: "ok" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      res.status(500).json({ error: message });
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Chatwoot webhook escuchando en http://localhost:${port}/chatwoot`);
  });
}
