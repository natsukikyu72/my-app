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
  const users = await prisma.users.findMany();
  res.render("index", { users });
});

// 新しいユーザーを追加する
app.post("/users", async (req, res) => {
  // フォームから送られてきたデータを受け取る
  const { email, password, name, department, grade } = req.body;

  try {
    // データベースに保存する
    await prisma.users.create({
      data: {
        email,
        password, // 本番ではパスワードをハッシュ化するのじゃが、今はそのまま進めよう
        name,
        department: department || null,
        grade: grade ? parseInt(grade) : null, // 数値に変換するのを忘れずにな
      },
    });
    res.redirect("/");
  } catch (error) {
    console.error("保存失敗:", error);
    res.status(500).send("保存に失敗しました。メールアドレスの重複かもしれませぬ。");
  }
});



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
