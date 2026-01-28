import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error"],
});

async function main() {
  try {
    const payments = await prisma.paymentRecord.findMany({
      where: { tenantId: "ca1" },
      select: {
        payeeName: true,
        payeeVendorId: true,
        payeeEmail: true
      },
      distinct: ["payeeVendorId"]
    });

    console.log("CA payees from payment history:");
    payments.forEach(p => console.log(JSON.stringify(p)));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
