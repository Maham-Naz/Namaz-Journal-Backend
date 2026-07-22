import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.prayerRecord.deleteMany({});
  await prisma.user.deleteMany({});
  console.log(`Database tables cleared.`);
}

main().finally(() => prisma.$disconnect());
