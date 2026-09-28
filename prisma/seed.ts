/**
 * Seed del database con le leggi e i ministri di partenza.
 * Uso: `npm run db:seed` (richiede DATABASE_URL).
 * Se DATABASE_URL manca, esce senza errore: l'app usera' il seed in-memory.
 */

import { PrismaClient } from "@prisma/client";
import { SEED_LAWS, SEED_MINISTERS } from "../lib/seed-data";
import { toPrismaData } from "../lib/db";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("DATABASE_URL non configurato: seed saltato (verranno usati i dati in-memory).");
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const law of SEED_LAWS) {
      const data = toPrismaData(law);
      await prisma.law.upsert({
        where: { eli: law.eli },
        create: { eli: law.eli, ...data },
        update: data,
      });
    }

    for (const ministro of SEED_MINISTERS) {
      const data = {
        nome: ministro.nome,
        dicastero: ministro.dicastero,
        partito: ministro.partito,
        competenze: ministro.competenze,
      };
      await prisma.minister.upsert({
        where: { slug: ministro.slug },
        create: { slug: ministro.slug, ...data },
        update: data,
      });
    }

    console.log(`Seed completato: ${SEED_LAWS.length} leggi, ${SEED_MINISTERS.length} ministri.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed fallito:", error);
  process.exitCode = 1;
});
