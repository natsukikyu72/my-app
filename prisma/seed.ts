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
  await prisma.bookMaster.deleteMany();
  await prisma.bookMaster.createMany({
    data: [
        {
        title: "線形代数",
        courseName: "情報数学Ⅰ",
        originalPrice: 2800,
        },
        {
        title: "微分積分",
        courseName: "情報数学Ⅱ",
        originalPrice: 3000,
        },
        {
        title: "離散数学",
        courseName: "離散数学",
        originalPrice: 2900,
        },
        {
        title: "確率・統計入門",
        courseName: "確率統計",
        originalPrice: 3200,
        },
        {
        title: "C言語入門",
        courseName: "プログラミングⅠ",
        originalPrice: 3300,
        },
        {
        title: "Javaプログラミング",
        courseName: "プログラミングⅡ",
        originalPrice: 3400,
        },
        {
        title: "Pythonによるデータ分析",
        courseName: "データサイエンス",
        originalPrice: 3600,
        },
        {
        title: "SQL実践",
        courseName: "データベース",
        originalPrice: 3000,
        },
        {
        title: "コンピュータネットワーク",
        courseName: "ネットワーク",
        originalPrice: 3500,
        },
        {
        title: "オペレーティングシステム",
        courseName: "OS",
        originalPrice: 3600,
        },
        {
        title: "アルゴリズムとデータ構造",
        courseName: "アルゴリズム",
        originalPrice: 3400,
        },
        {
        title: "情報セキュリティ",
        courseName: "情報セキュリティ",
        originalPrice: 3200,
        },
        {
        title: "人工知能入門",
        courseName: "人工知能",
        originalPrice: 3800,
        },
        {
        title: "機械学習",
        courseName: "機械学習",
        originalPrice: 4200,
        },
        {
        title: "Webプログラミング",
        courseName: "Webプログラミング",
        originalPrice: 3500,
        },
    ],
    });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });