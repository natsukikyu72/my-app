import "dotenv/config";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// データベース接続の準備
const pool = new Pool({ connectionString: process.env.DATABASE_URL,ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const app = express();
const PORT = process.env.PORT || 8888;
const upload = multer({
  storage: multer.memoryStorage(),
});

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

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

  const {
    email,
    password,
    name,
    campus,
    department,
    grade
  } = req.body;
  // 必須チェック
  if (
    !email ||
    !password ||
    !name ||
    !campus ||
    !department ||
    !grade
  ) {
    return res.render("signup", {
      error: "すべての項目を入力してください。"
    });
  }

  // 慶應メールチェック
  if (!email.endsWith("@keio.jp")) {
    return res.render("signup", {
      error: "keio.jp のメールアドレスのみ登録できます。"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        campus,
        department,
        grade
      },
    });

    res.redirect("/login");
  } catch (e) {
    console.error(e);


    return res.render("signup", {
      error: "このメールアドレスはすでに登録されています。"
    });
  }
});

// --- 2. ログイン（Login） ---
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", async (req, res) => {
  const {
    email,
    password
  } = req.body;

  if(!email || !password){
    return res.render("login",{
      error:"メールアドレスとパスワードを入力してください。"
    });
  }

  const user = await prisma.user.findUnique({
    where: {
      email
    },
  });

  if (!user) {
    return res.render("login", {
      error:"メールアドレスまたはパスワードが違います。"
    });
  }

  const ok = await bcrypt.compare(
    password,
    user.password
  );

  if (!ok) {
    return res.render("login", {
      error:"メールアドレスまたはパスワードが違います。"
    });
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
    myId: req.session.userId,
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
app.post(
    "/listing",
    requireLogin,
    upload.single("image"),
    async (req: any, res) => {

        const {
            bookId,
            price,
            condition
        } = req.body;

        let imageUrl: string | null = null;

        // -------------------------
        // Cloudinaryへアップロード
        // -------------------------

        if (req.file) {

            const result = await new Promise<any>((resolve, reject) => {

                const uploadStream = cloudinary.uploader.upload_stream(

                    {
                        folder: "textbook-market"
                    },

                    (error, result) => {

                        if (error) {

                            reject(error);

                        } else {

                            resolve(result);

                        }

                    }

                );

                streamifier
                    .createReadStream(req.file.buffer)
                    .pipe(uploadStream);

            });

            imageUrl = result.secure_url;

        }

        // -------------------------
        // Prismaへ保存
        // -------------------------

        await prisma.listing.create({

            data: {

                sellerId: req.session.userId,

                bookId: Number(bookId),

                price: Number(price),

                condition: condition || null,

                imageUrl: imageUrl

            }

        });

        res.redirect("/");

    }
);


// ==============================
// ユーザープロフィール
// ==============================
app.get("/user/:id", requireLogin, async(req:any, res)=>{

  const userId = parseInt(req.params.id);


  const user = await prisma.user.findUnique({

    where:{
      id:userId
    },

    include:{

      listings:{
        include:{
          book:true
        },

        orderBy:{
          createdAt:"desc"
        }
      },

      reviewsReceived:{
        include:{
          reviewer:true
        },

        orderBy:{
          createdAt:"desc"
        }
      }

    }

  });

  // ==============================
// 評価一覧
// ==============================
app.get("/user/:id/reviews", requireLogin, async(req:any,res)=>{

  const userId = parseInt(req.params.id);


  const reviews = await prisma.review.findMany({

    where:{
      reviewedId:userId
    },

    include:{
      reviewer:true
    },

    orderBy:{
      createdAt:"desc"
    }

  });


  res.render("reviews",{
    reviews
  });

});


  if(!user){
    return res.status(404).send("ユーザーが存在しません");
  }


  res.render("user",{
    user
  });

});

app.get("/listing/:id", requireLogin, async (req: any, res) => {

    const id = parseInt(req.params.id);

    const listing = await prisma.listing.findUnique({
        where:{
      id
    },

    include:{
      book:true,
      seller:true,
      reviews:true,

      chatRooms:{
        include:{
          buyer:true,
          messages:{
            orderBy:{
              createdAt:"desc"
            },
            take:1
          }
        }
      }
    }

});

    if (!listing) {
        return res.status(404).send("出品が見つかりません");
    }

    res.render("listing_detail", {
        listing,
        myId: req.session.userId
    });

});


app.post("/chat/start/:listingId", async (req: any, res) => {

  const userId = req.session.userId;

  // ログインチェック
  if (!userId) {
    return res.redirect("/login");
  }


  const listingId = parseInt(req.params.listingId);


  // 出品情報を取得
  const listing = await prisma.listing.findUnique({
    where: {
      id: listingId
    }
  });


  if (!listing) {
    return res.status(404).send("出品が存在しません");
  }


  // 自分の商品には相談できない
  if (listing.sellerId === userId) {
    return res.send("自分の商品には購入相談できません");
  }


  // 既存のチャットがあるか確認
  const existingRoom = await prisma.chatRoom.findFirst({
    where: {
      listingId: listingId,
      buyerId: userId,
      sellerId: listing.sellerId
    }
  });


  // すでに存在する場合
  if (existingRoom) {

    return res.redirect(`/chat/${existingRoom.id}`);

  }


  // 新規作成
  const chatRoom = await prisma.chatRoom.create({

    data: {
      listingId: listingId,
      buyerId: userId,
      sellerId: listing.sellerId
    }

  });


  res.redirect(`/chat/${chatRoom.id}`);

});

app.get("/chat/:id", async (req: any, res) => {

  const userId = req.session.userId;

  // ログイン確認
  if (!userId) {
    return res.redirect("/login");
  }


  const chatId = parseInt(req.params.id);


  // チャット情報取得
  const chatRoom = await prisma.chatRoom.findUnique({

    where: {
      id: chatId
    },

    include: {

      listing: {
        include: {
          book: true
        }
      },

      buyer: true,

      seller: true,

      messages: {
        include: {
          sender: true
        },

        orderBy: {
          createdAt: "asc"
        }
      }

    }

  });


  if (!chatRoom) {
    return res.status(404).send("チャットが存在しません");
  }


  // 関係者以外は見られない
  if (
    chatRoom.buyerId !== userId &&
    chatRoom.sellerId !== userId
  ) {
    return res.status(403).send("アクセスできません");
  }


  res.render("chat", {
    chatRoom,
    myId: userId
  });

});

app.post("/chat/:id/message", async (req: any, res) => {

  const userId = req.session.userId;


  if (!userId) {
    return res.redirect("/login");
  }


  const chatRoomId = parseInt(req.params.id);


  const content = req.body.content;


  if (!content) {
    return res.redirect(`/chat/${chatRoomId}`);
  }


  // チャット参加者か確認
  const chatRoom = await prisma.chatRoom.findUnique({

    where: {
      id: chatRoomId
    }

  });


  if (!chatRoom) {
    return res.status(404).send("チャットがありません");
  }


  if (
    chatRoom.buyerId !== userId &&
    chatRoom.sellerId !== userId
  ) {
    return res.status(403).send("アクセスできません");
  }


  // Message作成
  await prisma.message.create({

    data: {

      chatRoomId: chatRoomId,

      senderId: userId,

      content: content

    }

  });


  // チャット画面へ戻る
  res.redirect(`/chat/${chatRoomId}`);

});

app.post("/chat/:id/accept", async (req:any,res)=>{

    const userId = req.session.userId;

    if(!userId){
        return res.redirect("/login");
    }


    const chatRoomId = parseInt(req.params.id);


    const chatRoom = await prisma.chatRoom.findUnique({
        where:{
            id:chatRoomId
        }
    });


    if(!chatRoom){
        return res.status(404).send("チャットがありません");
    }


    // 出品者本人か確認
    if(chatRoom.sellerId !== userId){
        return res.status(403).send("権限がありません");
    }


    // Listing更新

    await prisma.listing.update({

        where:{
            id:chatRoom.listingId
        },

        data:{
            status:"RESERVED",
            buyerId:chatRoom.buyerId
        }

    });


    res.redirect(`/chat/${chatRoomId}`);

});

// 受け渡し完了 → SOLD
app.post("/listing/:id/complete", async (req:any, res)=>{

  const userId = req.session.userId;

  if(!userId){
    return res.redirect("/login");
  }


  const listingId = parseInt(req.params.id);


  const listing = await prisma.listing.findUnique({
    where:{
      id: listingId
    }
  });


  if(!listing){
    return res.status(404).send("商品が存在しません");
  }


  // 出品者または購入者だけ実行可能
  if(
    listing.sellerId !== userId &&
    listing.buyerId !== userId
  ){
    return res.status(403).send("権限がありません");
  }


  // RESERVED → SOLD
  await prisma.listing.update({

    where:{
      id: listingId
    },

    data:{
      status:"SOLD"
    }

  });


  res.redirect(`/listing/${listingId}`);

});


app.post("/review", requireLogin, async(req:any, res)=>{

  const userId = req.session.userId;

  const {
    listingId,
    rating,
    comment
  } = req.body;


  const listing = await prisma.listing.findUnique({

    where:{
      id: Number(listingId)
    }

  });


  if(!listing){
    return res.status(404).send("商品がありません");
  }


  // 取引関係者か確認
  if(
    listing.sellerId !== userId &&
    listing.buyerId !== userId
  ){
    return res.status(403).send("評価できません");
  }


  // 相手を決定
  const reviewedId =
    listing.sellerId === userId
      ? listing.buyerId
      : listing.sellerId;


  if(!reviewedId){
    return res.status(400).send("購入者が設定されていません");
  }


  await prisma.review.create({

    data:{
      listingId: Number(listingId),

      reviewerId: userId,

      reviewedId: reviewedId,

      rating: Number(rating),

      comment: comment || null
    }

  });


  res.redirect(`/listing/${listingId}`);

});

app.get("/review/new/:listingId", requireLogin, async(req:any, res)=>{

  const listingId = parseInt(req.params.listingId);


  const listing = await prisma.listing.findUnique({

    where:{
      id: listingId
    },

    include:{
      seller:true,
      buyer:true,
      book:true
    }

  });


  if(!listing){
    return res.status(404).send("商品がありません");
  }


  res.render("review_new",{
    listing
  });

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