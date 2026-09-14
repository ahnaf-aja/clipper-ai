import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hash(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain.normalize("NFKC"), salt, 64, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function main() {
  const email = "demo@clipper.ai";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo Creator",
      passwordHash: hash("demo1234"),
      plan: "creator",
      credits: 600,
      creditsMonth: new Date().toISOString().slice(0, 7),
      avatarColor: "violet",
    },
  });

  console.log(`Seeded demo account:\n  email:    ${email}\n  password: demo1234\n  plan:     ${user.plan}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
