import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const usersCount = await prisma.user.count();
  const recordsCount = await prisma.prayerRecord.count();
  console.log(`\n\n--- DB CHECK ---`);
  console.log(`Users: ${usersCount}`);
  console.log(`Records: ${recordsCount}`);
  console.log(`----------------\n\n`);
}

main().finally(() => prisma.$disconnect());
