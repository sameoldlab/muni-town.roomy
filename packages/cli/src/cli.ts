#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { authenticate } from "./auth.js";
import { createSpace, listSpaces } from "./spaces.js";
import { listRooms } from "./rooms.js";
import { sendMessage, readMessages } from "./messages.js";

const program = new Command();
export { program };

program
  .name("roomy-cli")
  .description("CLI tool for Roomy - agent testing and space management")
  .version("0.2.0");

// ── spaces ────────────────────────────────────────────────────────────────

program
  .command("spaces")
  .description("List all spaces")
  .action(async () => {
    try {
      const config = loadConfig();
      const { xrpc } = await authenticate(config);
      const spaces = await listSpaces(xrpc);
      for (const s of spaces) {
        const name = s.name ?? "(unnamed)";
        const handle = s.handle ? ` @${s.handle}` : "";
        console.log(`${s.id}  ${name}${handle}  [${s.isAdmin ? "admin" : "member"}]  ${s.unreadCount} unread`);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command("create-space")
  .description("Create a new Roomy space")
  .requiredOption("--name <name>", "Space name")
  .option("--description <description>", "Space description")
  .action(async (options: { name: string; description?: string }) => {
    try {
      const config = loadConfig();
      const { xrpc } = await authenticate(config);
      const { spaceId } = await createSpace(xrpc, {
        name: options.name,
        description: options.description,
      });
      console.log(`Created space: ${spaceId}`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ── rooms ─────────────────────────────────────────────────────────────────

program
  .command("rooms")
  .description("List rooms in a space")
  .requiredOption("--space <id>", "Space ID")
  .action(async (options: { space: string }) => {
    try {
      const config = loadConfig();
      const { xrpc } = await authenticate(config);
      const { categories, orphans } = await listRooms(xrpc, options.space);
      for (const cat of categories) {
        console.log(`\n# ${cat.name}`);
        for (const ch of cat.channels) {
          const name = ch.name ?? "(unnamed)";
          console.log(`  ${ch.id}  ${name}  [${ch.unreadCount} unread]`);
        }
      }
      if (orphans.length > 0) {
        console.log("\n# (orphans)");
        for (const ch of orphans) {
          const name = ch.name ?? "(unnamed)";
          console.log(`  ${ch.id}  ${name}  [${ch.unreadCount} unread]`);
        }
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ── send ──────────────────────────────────────────────────────────────────

program
  .command("send")
  .description("Send a message to a room")
  .requiredOption("--space <id>", "Space ID")
  .requiredOption("--room <id>", "Room ID")
  .option("--text <text>", "Message text")
  .action(async (options: { space: string; room: string; text?: string }) => {
    try {
      const text = options.text ?? await readStdin();
      const config = loadConfig();
      const { xrpc } = await authenticate(config);
      const { messageId } = await sendMessage(xrpc, options.space, options.room, text);
      console.error(`Message sent: ${messageId}`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// ── read ──────────────────────────────────────────────────────────────────

program
  .command("read")
  .description("Read messages from a room")
  .requiredOption("--room <id>", "Room ID")
  .option("--limit <n>", "Max messages", "20")
  .action(async (options: { room: string; limit: string }) => {
    try {
      const config = loadConfig();
      const { xrpc } = await authenticate(config);
      const messages = await readMessages(xrpc, options.room, Number(options.limit));
      for (const m of messages) {
        const ts = new Date(m.timestamp).toISOString();
        console.log(`[${ts}] ${m.authorName} (${m.authorDid}): ${m.content}`);
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error("No input provided. Use --text or pipe content to stdin.");
  }
  const chunks: Buffer[] = [];
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  process.stdin.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  process.stdin.on("end", () => {
    const content = Buffer.concat(chunks).toString("utf-8").trim();
    if (!content) {
      reject(new Error("Empty input. Nothing to send."));
      return;
    }
    resolve(content);
  });
  process.stdin.on("error", (err: Error) => {
    reject(new Error(`Failed to read stdin: ${err.message}`));
  });
  return promise;
}

// ── parse ─────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(2);
});
