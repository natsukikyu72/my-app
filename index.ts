import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// データベース接続の準備
const pool = new Pool({ connectionString: process.env.DATABASE_URL,ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

const app = express();
const PORT = process.env.PORT || 8888;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));

// ユーザー一覧を表示する
app.get("/", async (req, res) => {
  const users = await prisma.user.findMany();
  res.render("index", { users });
});

// 新しいユーザーを追加する
app.post("/users", async (req, res) => {
  const name = req.body.name;
  const age = req.body.age ? parseInt(req.body.age) : null; // 年齢を数値に変える
  if (name) {
    await prisma.user.create({ 
      data: { name, age } 
    });
  }
  res.redirect("/");
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
