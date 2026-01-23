/**
 * Restore wise_recipients table from backup.
 *
 * Usage: npx tsx scripts/restore-wise-recipients.ts <backup-file>
 * Example: npx tsx scripts/restore-wise-recipients.ts backups/wise-recipients-2026-01-22.json
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface BackupRecipient {
  id: string;
  qboVendorId: string;
  payeeName: string;
  wiseEmail: string;
  targetCurrency: string;
  wiseContactId: string | null;
  wiseRecipientAccountId: number | null;
  createdAt: string;
  updatedAt: string;
}

async function main() {
  const backupFile = process.argv[2];

  if (!backupFile) {
    console.error("Usage: npx tsx scripts/restore-wise-recipients.ts <backup-file>");
    console.error("");
    console.error("Available backups:");
    const backupDir = path.join(__dirname, "../backups");
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".json"));
      files.forEach(f => console.error(`  - backups/${f}`));
    } else {
      console.error("  No backups directory found");
    }
    process.exit(1);
  }

  const filePath = path.isAbsolute(backupFile)
    ? backupFile
    : path.join(__dirname, "..", backupFile);

  if (!fs.existsSync(filePath)) {
    console.error(`Backup file not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Restoring from: ${filePath}`);

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as BackupRecipient[];
  console.log(`Found ${data.length} recipients to restore`);

  let created = 0;
  let updated = 0;

  for (const recipient of data) {
    const existing = await prisma.wiseRecipient.findUnique({
      where: { qboVendorId: recipient.qboVendorId },
    });

    if (existing) {
      await prisma.wiseRecipient.update({
        where: { qboVendorId: recipient.qboVendorId },
        data: {
          payeeName: recipient.payeeName,
          wiseEmail: recipient.wiseEmail,
          targetCurrency: recipient.targetCurrency,
          wiseContactId: recipient.wiseContactId,
          wiseRecipientAccountId: recipient.wiseRecipientAccountId,
        },
      });
      updated++;
    } else {
      await prisma.wiseRecipient.create({
        data: {
          qboVendorId: recipient.qboVendorId,
          payeeName: recipient.payeeName,
          wiseEmail: recipient.wiseEmail,
          targetCurrency: recipient.targetCurrency,
          wiseContactId: recipient.wiseContactId,
          wiseRecipientAccountId: recipient.wiseRecipientAccountId,
        },
      });
      created++;
    }
  }

  console.log(`✅ Restored: ${created} created, ${updated} updated`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
