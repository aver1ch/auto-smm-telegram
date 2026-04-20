import process from "node:process";
import { createInterface } from "node:readline/promises";

import { TelegramClient } from "telegram/client/TelegramClient.js";
import { StringSession } from "telegram/sessions/StringSession.js";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main(): Promise<void> {
  const apiIdRaw = await rl.question("Telegram API ID: ");
  const apiHash = await rl.question("Telegram API Hash: ");
  const apiId = Number(apiIdRaw);

  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error("API ID must be a positive integer");
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash.trim(), {
    connectionRetries: 5
  });

  await client.start({
    phoneNumber: async () => (await rl.question("Phone number (+7999...): ")).trim(),
    password: async () => (await rl.question("2FA password (leave blank if none): ")).trim(),
    phoneCode: async () => (await rl.question("Code from Telegram: ")).trim(),
    onError: (error) => {
      throw error;
    }
  });

  const sessionString = client.session.save();
  console.log("\nStringSession:\n");
  console.log(sessionString);
  console.log("\nUse this value in /account_add.");

  await client.disconnect();
}

try {
  await main();
} finally {
  rl.close();
}
