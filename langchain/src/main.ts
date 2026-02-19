import "dotenv/config";
import { runCli } from "./cli.js";
import { runChatwootWebhookServer } from "./server.js";

const mode = process.env.RUN_MODE ?? "cli";
if (mode === "chatwoot") {
  runChatwootWebhookServer();
} else {
  runCli();
}
