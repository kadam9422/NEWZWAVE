const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const cookieSession = require("cookie-session");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Parser = require("rss-parser");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY || process.env.NEWS_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : crypto.randomBytes(32).toString("hex"));
const accountStoreRequired = process.env.NODE_ENV === "production";
const publishedArticles = [];
const memoryUsers = new Map();
const rssParser = new Parser();

if (sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(cookieSession({
  name: "nw_session",
  keys: [sessionSecret],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax"
}));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Try again in 15 minutes." }
});
const newsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many news requests. Try again shortly." }
});
const publishLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many publish requests. Try again shortly." }
});

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const Account = mongoose.model("Account", accountSchema);

const articleSchema = new mongoose.Schema({
  title: String,
  category: String,
  excerpt: String,
  author: String,
  date: String,
  url: String,
  image: String
}, { timestamps: true });
app.use((req, res, next) => {
  let pathname;
  try {
    pathname = decodeURIComponent(req.path).replace(/\\/g, "/").toLowerCase();
  } catch {
    return res.sendStatus(400);
  }
  const segments = pathname.split("/").filter(Boolean);
  const protectedFiles = ["server.js", "app.py", "package.json", "package-lock.json", "readme.md"];
  if (segments.includes(".git") || segments.includes("node_modules") || protectedFiles.includes(segments.at(-1))) {
    return res.sendStatus(404);
  }
  next();
});
app.use(express.static(__dirname, { dotfiles: "deny", index: "index.html" }));

const Article = mongoose.model("Article", articleSchema);

function publicAccount(account) {
  return { id: String(account._id || account.id), name: account.name, email: account.email };
}

function requireAccountStore(req, res, next) {
  if (accountStoreRequired && mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: "Account storage is unavailable. Try again shortly." });
  }
  next();
}

async function findAccount(email) {
  if (mongoose.connection.readyState === 1) return Account.findOne({ email }).lean();
  return memoryUsers.get(email) || null;
}

async function saveAccount(account) {
  if (mongoose.connection.readyState === 1) return Account.create(account);
  memoryUsers.set(account.email, { ...account, id: crypto.randomUUID() });
  return memoryUsers.get(account.email);
}

app.get("/api/auth/me", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ user: req.session?.user || null });
});

app.post("/api/auth/register", authLimiter, requireAccountStore, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: "Enter a valid name and email. Password must be 12–128 characters." });
  }

  try {
    if (await findAccount(email)) return res.status(409).json({ message: "An account with this email already exists." });
    const account = await saveAccount({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    req.session = { user: publicAccount(account) };
    res.set("Cache-Control", "no-store");
    res.status(201).json({ user: req.session.user });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    res.status(500).json({ message: "Account could not be created." });
  }
});

app.post("/api/auth/login", authLimiter, requireAccountStore, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password || email.length > 254 || password.length > 128) {
    return res.status(400).json({ message: "Enter your email and password." });
  }

  try {
    const account = await findAccount(email);
    if (!account || !await bcrypt.compare(password, account.passwordHash)) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }
    req.session = { user: publicAccount(account) };
    res.set("Cache-Control", "no-store");
    res.json({ user: req.session.user });
  } catch (error) {
    res.status(500).json({ message: "Sign-in is temporarily unavailable." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.clearCookie("nw_session");
  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Newz Wave backend is running", liveNewsConfigured: true, newsProvider: GNEWS_API_KEY ? "gnews" : "google-news-rss" });
});

async function getGoogleNewsArticles(category, query) {
  const topicMap = { India: "NATION", World: "WORLD", Technology: "TECHNOLOGY", Sports: "SPORTS", Business: "BUSINESS", Entertainment: "ENTERTAINMENT" };
  const params = new URLSearchParams({ hl: "en-IN", gl: "IN", ceid: "IN:en" });
  let endpoint = "https://news.google.com/rss";
  if (query) {
    endpoint += "/search";
    params.set("q", [query, category].filter(Boolean).join(" "));
  } else if (category && topicMap[category]) {
    endpoint += `/headlines/section/topic/${topicMap[category]}`;
  }

  const response = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Google News RSS is unavailable.");
  const feed = await rssParser.parseString(await response.text());
  return (feed.items || []).map((item) => ({
    title: item.title,
    category: category || "World",
    excerpt: item.contentSnippet || "Open the publisher's report for the full story.",
    author: "Google News",
    date: item.isoDate ? new Date(item.isoDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : item.pubDate || "Latest",
    url: item.link
  }));
}

app.get("/api/news", newsLimiter, async (req, res) => {
  const allowedCategories = ["India", "World", "Technology", "Sports", "Business", "Entertainment"];
  const requestedCategory = typeof req.query.category === "string" ? req.query.category : "";
  const category = allowedCategories.includes(requestedCategory) ? requestedCategory : "";
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  if (!GNEWS_API_KEY) {
    try {
      const articles = await getGoogleNewsArticles(category, query);
      res.set("Cache-Control", "public, max-age=120");
      return res.json({ source: "google-news-rss", articles });
    } catch (error) {
      return res.json({ source: "demo", articles: [] });
    }
  }

  const categoryMap = { India: "nation", World: "world", Technology: "technology", Sports: "sports", Business: "business", Entertainment: "entertainment" };
  const params = new URLSearchParams({ lang: "en", max: "10", apikey: GNEWS_API_KEY });
  let endpoint = "https://gnews.io/api/v4/top-headlines";
  if (query) {
    endpoint = "https://gnews.io/api/v4/search";
    params.set("q", query);
  } else if (category === "India") {
    params.set("country", "in");
    params.set("category", "nation");
  } else if (category && categoryMap[category]) {
    params.set("category", categoryMap[category]);
  }

  try {
    const response = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(response.status).json({ message: "The news provider could not return headlines." });
    const data = await response.json();
    const results = (data.articles || []).map((item) => ({
      title: item.title,
      category: category || "World",
      excerpt: item.description || item.content || "Open the original report for details.",
      author: item.source?.name || "News desk",
      date: item.publishedAt ? new Date(item.publishedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Latest",
      url: item.url,
      image: item.image || ""
    }));
    res.set("Cache-Control", "public, max-age=120");
    res.json({ source: "gnews", articles: results });
  } catch (error) {
    res.status(502).json({ message: "Live headlines are temporarily unavailable." });
  }
});

app.get("/api/articles", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.json(publishedArticles);
    const articles = await Article.find().sort({ createdAt: -1 });
    res.json(articles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/articles", publishLimiter, async (req, res) => {
  if (!ADMIN_API_KEY) return res.status(503).json({ message: "Admin publishing is disabled until ADMIN_API_KEY is configured." });
  const suppliedKey = Buffer.from(req.get("x-admin-key") || "");
  const expectedKey = Buffer.from(ADMIN_API_KEY);
  if (suppliedKey.length !== expectedKey.length || !crypto.timingSafeEqual(suppliedKey, expectedKey)) {
    return res.status(401).json({ message: "Admin key is invalid." });
  }

  try {
    const { title, category, excerpt, author, date, url } = req.body;
    const allowedCategories = ["India", "World", "Technology", "Sports", "Business", "Entertainment"];
    const image = req.body.image;
    const validUrl = !url || (typeof url === "string" && url.length <= 2048 && /^https?:\/\//i.test(url));
    const validImage = !image || (typeof image === "string" && image.length <= 2048 && /^https?:\/\//i.test(image));
    if (![title, category, excerpt, author].every((value) => typeof value === "string" && value.trim()) || !allowedCategories.includes(category) || title.length > 200 || excerpt.length > 5000 || author.length > 80 || !validUrl || !validImage) {
      return res.status(400).json({ message: "Title, category, summary, and author are required." });
    }
    const payload = { title: title.trim(), category, excerpt: excerpt.trim(), author: author.trim(), date: typeof date === "string" ? date.slice(0, 80) : new Date().toLocaleDateString(), ...(url ? { url } : {}), ...(image ? { image } : {}) };
    if (mongoose.connection.readyState !== 1) {
      const article = { ...payload, id: `${Date.now()}` };
      publishedArticles.unshift(article);
      return res.status(201).json(article);
    }
    const article = new Article(payload);
    await article.save();
    res.status(201).json(article);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ message: status < 500 ? "Invalid request." : "The server could not complete the request." });
});

async function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/newzwave";
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");
  } catch (error) {
    console.log("MongoDB not available, continuing in fallback mode:", error.message);
  }
}

startServer();
