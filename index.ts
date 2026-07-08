import "dotenv/config";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
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

app.use(session({
  secret: "secret-key", // 本来は環境変数にするのが安全じゃ
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1時間有効
}));


// --- 1. 新規登録（Signup） ---
app.post("/signup", async (req, res) => {
  const { email, password, name ,department, grade } = req.body;

  // --- ドメインチェックを追加 ---
  // 文字列の最後が "@keio.jp" で終わっているか確認するのじゃ
  if (!email.endsWith("@keio.jp")) {
    return res.status(400).send("keio.jp のメールアドレスのみ登録可能です。");
  }
  // -------------------------

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await prisma.user.create({
      data: { email, password: hashedPassword, name, department: department || null,
        grade: grade ? parseInt(grade) : null }
    });
    res.redirect("/login");
  } catch (e) {
    res.status(400).send("登録に失敗しました");
  }
});


// --- 2. ログイン（Login） ---
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  // ユーザーがいて、かつパスワードが合っているか確認する
  if (user && await bcrypt.compare(password, user.password)) {
    // セッションにユーザー情報を保存（これで「ログイン中」になる）
    (req.session as any).userId = user.id;
    (req.session as any).userName = user.name;
    res.redirect("/");
  } else {
    res.status(401).send("メールアドレスかパスワードが違います。");
  }
});

// --- 3. ログアウト（Logout） ---
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// --- 表示（GET） ---
app.get("/", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.redirect("/login"); // ログインしてなければ飛ばす

  const users = await prisma.user.findMany();
  res.render("index", { users, myName: (req.session as any).userName });
});

app.get("/login", (req, res) => res.render("login"));
app.get("/signup", (req, res) => res.render("signup"));

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));