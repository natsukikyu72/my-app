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

app.use(async (req:any, res, next)=>{

  if(req.session.userId){

    const unreadCount = await prisma.message.count({
      where:{
        isRead:false,
        senderId:{
          not:req.session.userId
        },
        chatRoom:{
          OR:[
            {
              buyerId:req.session.userId
            },
            {
              sellerId:req.session.userId
            }
          ]
        }
      }
    });

    res.locals.myId = req.session.userId;
    res.locals.myName = req.session.userName;
    res.locals.unreadCount = unreadCount;
    res.locals.hasUnread = unreadCount > 0;

  }else{

    res.locals.myId = null;
    res.locals.myName = null;
    res.locals.unreadCount = 0;
    res.locals.hasUnread = false;

  }

  next();

});


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
  const campus = (req.query.campus as string) || "";
  const department = (req.query.department as string) || "";
  const grade = (req.query.grade as string) || "";
  const sellingOnly = req.query.sellingOnly !== undefined;
  const sort = (req.query.sort as string) || "new";

  const listings = await prisma.listing.findMany({

  where: {

    ...(sellingOnly && {
      status: "SELLING"
    }),

    seller: {
      ...(campus && { campus }),
      ...(department && { department }),
      ...(grade && { grade })
    },

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
    seller: true,

    chatRooms:{
    where:{
      OR:[
        {
          buyerId:req.session.userId
        },
        {
          sellerId:req.session.userId
        }
      ]
    },
    include:{
      messages:{
        where:{
          senderId:{
            not:req.session.userId
          },
          isRead:false
        }
      }
    }
  }
  },

  orderBy:
    sort === "priceAsc"
      ? { price: "asc" }
      : sort === "priceDesc"
      ? { price: "desc" }
      : { createdAt: "desc" }

});

const unreadCount = await prisma.message.count({
  where:{
    isRead:false,
    senderId:{
      not:req.session.userId
    },
    chatRoom:{
      OR:[
        {
          buyerId:req.session.userId
        },
        {
          sellerId:req.session.userId
        }
      ]
    }
  }
});

  res.render("index", {
    myName: req.session.userName,
    myId: req.session.userId,
    listings,
    keyword,
    campus,
    department,
    grade,
    sellingOnly,
    sort,
    unreadCount
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
    myId:req.session.userId
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
            condition,
            description
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

                description: description || null,

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

    // 出品一覧
    listings:{
      include:{
        book:true,
        seller:true,

        chatRooms:{
          include:{
            buyer:true,

            messages:{
              where:{
                senderId:{
                  not:req.session.userId
                },
                isRead:false
              }
            }
          }
        }

      },

      orderBy:{
        createdAt:"desc"
      }
    },

    // 購入中
    purchases:{
      where:{
        status:"RESERVED"
      },

      include:{
        book:true,
        seller:true,

        chatRooms:{
          where:{
            buyerId:req.session.userId
          },

          include:{
            messages:{
              where:{
                senderId:{
                  not:req.session.userId
                },
                isRead:false
              }
            }
          }
        }
      }
    },

    // 相談中
    buyerChats:{
      where:{
        listing:{
          status:"SELLING"
        }
      },

      include:{
        listing:{
          include:{
            book:true,
            seller:true
          }
        },

        messages:{
          where:{
            senderId:{
              not:req.session.userId
            },
            isRead:false
          }
        }
      }
    },

    // 評価
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

  if(!user){
    return res.status(404).send("ユーザーが存在しません");
  }

  res.render("user",{
    user,
    myId:req.session.userId
  });


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
    reviews,
    myId:req.session.userId
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
                        where:{
                            senderId:{
                              not:req.session.userId
                            },
                            isRead:false
                        },
                        orderBy:{
                            createdAt:"desc"
                        },
                        take:1
                    }
                }
            }
        }
    });

    if(!listing){
        return res.status(404).send("出品が見つかりません");
    }

    // 自分のチャット（購入希望者のみ）
   const myChat = listing.chatRooms.find(chat=>chat.buyerId===req.session.userId);

    res.render("listing_detail",{
        listing,
        myId:req.session.userId,
        myChat
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

app.get("/chat/:id", requireLogin, async (req:any,res)=>{
    const userId=req.session.userId;

    const chatId=parseInt(req.params.id);

    const chatRoom=await prisma.chatRoom.findUnique({

        where:{
            id:chatId
        },

        include:{

            listing:{
                include:{
                    book:true,
                    seller:true
                }
            },

            buyer:true,

            seller:true,

            messages:{
                include:{
                    sender:true
                },

                orderBy:{
                    createdAt:"asc"
                }
            }

        }

    });

    if(!chatRoom){
        return res.status(404).send("チャットが存在しません");
    }

    if(
        chatRoom.buyerId!==userId &&
        chatRoom.sellerId!==userId
    ){
        return res.status(403).send("アクセスできません");
    }

    await prisma.message.updateMany({
      where:{
        chatRoomId:chatId,
        senderId:{
          not:userId
        },
        isRead:false
      },
      data:{
        isRead:true
      }
    });

    res.render("chat",{
        chatRoom,
        myId:userId
    });

});

app.post("/chat/:id/message", requireLogin, async(req:any,res)=>{

    const userId=req.session.userId;

    const chatRoomId=parseInt(req.params.id);

    const content=req.body.content;

    if(!content){
        return res.redirect(`/chat/${chatRoomId}`);
    }

    const chatRoom=await prisma.chatRoom.findUnique({

        where:{
            id:chatRoomId
        },

        include:{
            listing:true
        }

    });

    if(!chatRoom){
        return res.status(404).send("チャットがありません");
    }

    if(
        chatRoom.buyerId!==userId &&
        chatRoom.sellerId!==userId
    ){
        return res.status(403).send("アクセスできません");
    }


    // 他の人と取引成立していたら送信不可
    if(

        chatRoom.listing.status==="RESERVED" &&
        chatRoom.listing.buyerId!==chatRoom.buyerId

    ){

        return res.send("この商品は他の購入者との取引が成立したため、新しいメッセージは送信できません。");

    }

    await prisma.message.create({
      data:{
        chatRoomId,
        senderId:userId,
        content,
        isRead:false
      }
});

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
    listing,
    myId:req.session.userId
  });

});

app.get("/profile/edit", requireLogin, async (req:any, res)=>{

    const user = await prisma.user.findUnique({
        where:{
            id:req.session.userId
        }
    });

    if(!user){
        return res.redirect("/");
    }


    res.render("profile_edit",{
        user,
        myId:req.session.userId
    });

});

app.post("/profile/edit", requireLogin, async(req:any,res)=>{

    const {
        name,
        campus,
        department,
        grade
    } = req.body;

    await prisma.user.update({

        where:{
            id:req.session.userId
        },

        data:{
            name,
            campus,
            department,
            grade
        }

    });

    req.session.userName=name;

    res.redirect(`/user/${req.session.userId}`);

});

// ==============================
// 教科書マスタ一覧（開発用）
// ==============================
app.get("/books", requireLogin, async (req, res) => {
  const books = await prisma.bookMaster.findMany();

  res.render("books", {
    books,
    myId:req.session.userId
  });
});

// ==============================
// サーバ起動
// ==============================
app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});