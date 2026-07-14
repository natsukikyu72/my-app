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
  secret: "secret-key", 
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } 
}));


function requireLogin(req: any, res: any, next: any) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

// --- 1. 新規登録（Signup） ---

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  const { email, password, name, department, grade } = req.body;

  if (!email.endsWith("@keio.jp")) {
    return res.send(`
      <p>keio.jp のメールアドレスのみ登録できます。</p>
      <a href="/signup">戻る</a>
    `);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        department: department || null,
        grade: grade ? parseInt(grade) : null,
      },
    });

    res.redirect("/login");
  } catch (e) {
    console.error(e);

    res.send(`
      <p>登録に失敗しました。</p>
      <a href="/signup">戻る</a>
    `);
  }
});


// --- 2. ログイン（Login） ---
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.send(`
      <p>メールアドレスまたはパスワードが違います。</p>
      <a href="/login">戻る</a>
    `);
  }

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    return res.send(`
      <p>メールアドレスまたはパスワードが違います。</p>
      <a href="/login">戻る</a>
    `);
  }

  req.session.userId = user.id;
  req.session.userName = user.name;

  res.redirect("/");
});

// --- 3. ログアウト（Logout） ---
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});


// ==============================
// ホーム（検索画面）
// ==============================
app.get("/", requireLogin, async (req: any, res) => {

  const keyword = (req.query.keyword as string) || "";

  const listings = await prisma.listing.findMany({
    where: {
      book: {
        OR: [
          {
            title: {
              contains: keyword,
              mode: "insensitive"
            }
          },
          {
            courseName: {
              contains: keyword,
              mode: "insensitive"
            }
          }
        ]
      }
    },
    include: {
      book: true,
      seller: true
    }
  });

  res.render("index", {
    myName: req.session.userName,
    listings,
    keyword
  });
});

// ==============================
// 出品画面
// ==============================
app.get("/listing/new", requireLogin, async (req, res) => {
  const books = await prisma.bookMaster.findMany({
    orderBy: {
      title: "asc",
    },
  });

  res.render("listing_new", {
    books,
  });
});

// ==============================
// 出品処理
// ==============================
app.post("/listing", requireLogin, async (req: any, res) => {

  const { bookId, price, condition, imageUrl } = req.body;

  await prisma.listing.create({
    data: {
      sellerId: req.session.userId,
      bookId: parseInt(bookId),
      price: parseInt(price),
      condition: condition || null,
      imageUrl: imageUrl || null
    }
  });

  res.redirect("/");
});

// ==============================
// 教科書マスタ一覧（開発用）
// ==============================
app.get("/books", requireLogin, async (req, res) => {
  const books = await prisma.bookMaster.findMany();

  res.render("books", {
    books,
  });
});

// ==============================
// サーバ起動
// ==============================
app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});