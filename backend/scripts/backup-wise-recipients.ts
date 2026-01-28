/**
 * Backup wise_recipients table before schema changes.
 * Run this before any `prisma db push` that modifies the WiseRecipient model.
 *
 * Usage: npx tsx scripts/backup-wise-recipients.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("Backing up wise_recipients table...");

  const recipients = await prisma.wiseRecipient.findMany();

  if (recipients.length === 0) {
    console.log("No recipients to backup.");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "../backups");
  const backupFile = path.join(backupDir, `wise-recipients-${timestamp}.json`);

  // Create backups directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Write backup
  fs.writeFileSync(backupFile, JSON.stringify(recipients, null, 2));

  console.log(`✅ Backed up ${recipients.length} recipients to:`);
  console.log(`   ${backupFile}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
