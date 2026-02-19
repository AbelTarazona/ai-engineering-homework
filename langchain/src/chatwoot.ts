import crypto from "node:crypto";
import { getRequiredEnv } from "./env.js";

export type ChatwootWebhookPayload = {
  event?: string;
  message_type?: string;
  content?: string;
  conversation?: {
    id?: number;
  };
};

export function verifyChatwootSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const provided = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(provided, expectedBuffer);
}

export async function sendChatwootMessage(conversationId: number, content: string) {
  const apiUrl = getRequiredEnv("CHATWOOT_API_URL");
  const accountId = getRequiredEnv("CHATWOOT_ACCOUNT_ID");
  const apiToken = getRequiredEnv("CHATWOOT_API_TOKEN");

  const response = await fetch(
    `${apiUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: apiToken,
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
