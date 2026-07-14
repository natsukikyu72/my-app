import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  await prisma.bookMaster.createMany({
    data: [
      {
        title: "線形代数",
        courseName: "情報数学Ⅰ",
        originalPrice: 2800,
      },
      {
        title: "C言語入門",
        courseName: "プログラミングⅠ",
        originalPrice: 3300,
      },
      {
        title: "SQL実践",
        courseName: "データベース",
        originalPrice: 3000,
      },
    ],
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });