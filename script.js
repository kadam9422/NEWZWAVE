const categories = ["India", "World", "Technology", "Sports", "Business", "Entertainment"];
const fallbackArticles = [
  { title: "India expands investment in clean energy corridors", category: "India", excerpt: "New transmission projects aim to bring renewable power to more homes and businesses.", author: "Newz Wave Desk", date: "Today", url: "https://www.example.com/india-clean-energy" },
  { title: "Global climate talks focus on practical city action", category: "World", excerpt: "Leaders are sharing plans for heat resilience, public transport, and cleaner urban air.", author: "Newz Wave Desk", date: "Today", url: "https://www.example.com/cities-climate" },
  { title: "Smaller AI models bring new tools to everyday devices", category: "Technology", excerpt: "On-device systems are making translation and assistance faster while using less data.", author: "Newz Wave Desk", date: "2h ago", url: "https://www.example.com/on-device-ai" },
  { title: "Young athletes reshape the season's title race", category: "Sports", excerpt: "A new generation is changing the pace and tactics of top-level competition.", author: "Newz Wave Desk", date: "3h ago", url: "https://www.example.com/title-race" },
  { title: "Markets weigh a fresh wave of infrastructure spending", category: "Business", excerpt: "Investors are watching how public projects could affect jobs and long-term growth.", author: "Newz Wave Desk", date: "4h ago", url: "https://www.example.com/infrastructure-markets" },
  { title: "Independent cinema finds new audiences online", category: "Entertainment", excerpt: "Regional filmmakers are reaching viewers through festivals and digital releases.", author: "Newz Wave Desk", date: "5h ago", url: "https://www.example.com/independent-cinema" }
];

const readStore = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const saveStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const articleKey = (article) => article.url || `${article.title}|${article.author || ""}`;
let articles = [...fallbackArticles];
let liveArticles = [...fallbackArticles];
let publishedArticles = [];
let selectedCategory = new URLSearchParams(location.search).get("category") || "All";
let searchTerm = new URLSearchParams(location.search).get("q") || "";

function ensureShell() {
  const nav = document.querySelector(".nav-links");
  if (nav) {
    nav.innerHTML = '<a href="index.html">Latest</a><a href="categiores.html">Categories</a><a href="bookmark.html">Bookmarks</a><a href="bookmark.html?view=favourites">Favourites</a><a href="user%20profile.html">Profile</a><a href="admin%20dashboard.html">Admin</a>';
    const utilities = document.createElement("div");
    utilities.className = "nav-tools";
    utilities.innerHTML = '<button class="icon-button" id="themeToggle" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">◐</button><button class="icon-button" id="notifyToggle" type="button" aria-label="Enable notifications" title="Enable notifications">♧</button><span id="accountLabel" class="account-label"></span>';
    nav.after(utilities);
  }

  document.getElementById("themeToggle")?.addEventListener("click", () => {
    const dark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("nw-theme", dark ? "dark" : "light");
  });
  if (localStorage.getItem("nw-theme") === "dark") document.body.classList.add("dark-mode");
  document.getElementById("notifyToggle")?.addEventListener("click", async () => {
    if (!("Notification" in window)) return alert("Notifications are not supported in this browser.");
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      localStorage.setItem("nw-alerts", "on");
      new Notification("Newz Wave", { body: "Breaking news alerts are enabled." });
    }
  });
  refreshAccountLabel();
}

async function refreshAccountLabel() {
  const label = document.getElementById("accountLabel");
  if (!label) return;
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await response.json();
    label.innerHTML = data.user
      ? `Hi, ${escapeHtml(data.user.name)} <button id="logoutButton" class="text-button" type="button">Log out</button>`
      : '<a href="login.html">Log in</a>';
    document.getElementById("logoutButton")?.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      location.href = "index.html";
    });
  } catch {
    label.innerHTML = '<a href="login.html">Log in</a>';
  }
}

function renderSearch() {
  const heading = document.querySelector(".section-heading");
  if (!heading || document.getElementById("newsSearch")) return;
  const form = document.createElement("form");
  form.className = "search-form";
  form.innerHTML = `<input id="newsSearch" type="search" placeholder="Search headlines..." aria-label="Search news" value="${escapeHtml(searchTerm)}"><button class="submit-btn" type="submit">Search</button>`;
  heading.append(form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    searchTerm = document.getElementById("newsSearch").value.trim();
    loadArticles();
  });
}

function renderCategories() {
  const container = document.getElementById("categoryPills");
  if (!container) return;
  const choices = ["All", ...categories];
  container.innerHTML = choices.map((category) => `<button class="chip ${category === selectedCategory ? "active" : ""}" data-category="${category}">${category}</button>`).join("");
  container.querySelectorAll(".chip").forEach((button) => button.addEventListener("click", () => {
    selectedCategory = button.dataset.category;
    renderCategories();
    loadArticles();
  }));
}

function renderArticles(target = document.getElementById("newsGrid"), options = {}) {
  if (!target) return;
  const { savedOnly = false, favouriteOnly = false } = options;
  const saved = readStore("nw-bookmarks", []);
  const favourites = readStore("nw-favourites", []);
  const filtered = articles.filter((article) => {
    const key = articleKey(article);
    const categoryMatch = selectedCategory === "All" || article.category === selectedCategory;
    const searchMatch = !searchTerm || `${article.title} ${article.excerpt} ${article.category}`.toLowerCase().includes(searchTerm.toLowerCase());
    return categoryMatch && searchMatch && (!savedOnly || saved.includes(key)) && (!favouriteOnly || favourites.includes(key));
  });
  if (!filtered.length) {
    target.innerHTML = '<p class="empty-state">No stories match this view yet. Try another category or search.</p>';
    return;
  }
  target.innerHTML = filtered.map((article) => {
    const key = articleKey(article);
    const encoded = encodeURIComponent(key);
    const image = article.image ? `<img class="story-image" src="${escapeHtml(article.image)}" alt="" loading="lazy">` : "";
    return `<article class="card">${image}<p class="eyebrow">${escapeHtml(article.category || "News")}</p><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.excerpt || "Open the source for the full report.")}</p><div class="card-meta"><span>${escapeHtml(article.author || "News desk")}</span><span>${escapeHtml(article.date || "Latest")}</span></div><div class="card-actions"><button class="bookmark-btn" data-action="bookmark" data-key="${encoded}" type="button">${saved.includes(key) ? "Saved" : "Bookmark"}</button><button class="favourite-btn ${favourites.includes(key) ? "selected" : ""}" data-action="favourite" data-key="${encoded}" type="button" aria-label="Toggle favourite" title="Toggle favourite">${favourites.includes(key) ? "♥" : "♡"}</button><a class="link-btn" href="news%20detail.html?story=${encoded}">Read story</a></div></article>`;
  }).join("");
  target.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const storageKey = button.dataset.action === "bookmark" ? "nw-bookmarks" : "nw-favourites";
    const values = readStore(storageKey, []);
    const key = decodeURIComponent(button.dataset.key);
    saveStore(storageKey, values.includes(key) ? values.filter((item) => item !== key) : [...values, key]);
    renderArticles(target, options);
  }));
}

async function loadArticles() {
  const params = new URLSearchParams();
  if (selectedCategory !== "All") params.set("category", selectedCategory);
  if (searchTerm) params.set("q", searchTerm);
  let sourceStatus = "Live updates · Google News";
  try {
    const response = await fetch(`/api/news?${params}`);
    if (response.ok) {
      const data = await response.json();
      if (data.source === "gnews") sourceStatus = "Live updates · GNews";
      if (data.source === "demo") sourceStatus = "Demo headlines · news provider unavailable";
      if (Array.isArray(data.articles) && data.articles.length) liveArticles = data.articles;
    } else sourceStatus = "Live feed unavailable · showing sample headlines";
  } catch { sourceStatus = "Demo headlines · news server unavailable"; }
  try {
    const response = await fetch("/api/articles");
    if (response.ok) {
      const published = await response.json();
      if (Array.isArray(published)) publishedArticles = published;
    }
  } catch { /* The static preview can still render the built-in headlines. */ }
  articles = [...publishedArticles, ...liveArticles];
  const status = document.getElementById("newsSourceStatus");
  if (status) status.textContent = sourceStatus;
  renderCategories();
  renderArticles();
}

function showAuthMessage(form, message) {
  const status = form.closest(".form-card")?.querySelector("#authMessage");
  if (status) status.textContent = message;
}

async function submitAuth(form, endpoint, payload) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Authentication failed.");
    location.href = "user%20profile.html";
  } catch (error) {
    showAuthMessage(form, error instanceof SyntaxError ? "Account service unavailable. Open the site through the Newz Wave app server." : error.message || "Authentication failed.");
  }
}

function initializeAuth() {
  const registerForm = document.getElementById("registerForm");
  registerForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    submitAuth(form, "/api/auth/register", {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value
    });
  });
  const loginForm = document.getElementById("loginForm");
  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    submitAuth(form, "/api/auth/login", {
      email: form.email.value.trim(),
      password: form.password.value
    });
  });
}

async function initializeProfile() {
  const container = document.getElementById("profileContent");
  if (!container) return;
  let user = null;
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    user = (await response.json()).user;
  } catch { /* A static-only host has no account API. */ }
  if (!user) {
    container.innerHTML = '<h2>Reader profile</h2><p>Log in through the Newz Wave app server to see your account.</p><a class="link-btn" href="login.html">Log in</a>';
    return;
  }
  container.innerHTML = `<p class="eyebrow">Reader account</p><h1>${escapeHtml(user.name)}</h1><p>${escapeHtml(user.email)}</p><div class="profile-stats"><div><strong>${readStore("nw-bookmarks", []).length}</strong><span>Bookmarks</span></div><div><strong>${readStore("nw-favourites", []).length}</strong><span>Favourites</span></div></div><label class="preference-row"><input id="breakingAlerts" type="checkbox" ${localStorage.getItem("nw-alerts") === "on" ? "checked" : ""}> Breaking news notifications</label>`;
  document.getElementById("breakingAlerts")?.addEventListener("change", (event) => localStorage.setItem("nw-alerts", event.target.checked ? "on" : "off"));
}

function initializeDetail() {
  const target = document.getElementById("storyDetail");
  if (!target) return;
  const key = new URLSearchParams(location.search).get("story");
  const article = articles.find((item) => articleKey(item) === key);
  if (!article) return;
  target.innerHTML = `<p class="eyebrow">${escapeHtml(article.category)}</p><h1>${escapeHtml(article.title)}</h1><p class="card-meta">${escapeHtml(article.author || "News desk")} · ${escapeHtml(article.date || "Latest")}</p>${article.image ? `<img class="detail-image" src="${escapeHtml(article.image)}" alt="">` : ""}<p>${escapeHtml(article.excerpt || "")}</p>${article.url ? `<a class="link-btn" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Continue to source</a>` : ""}`;
}

async function checkForBreakingNews() {
  if (localStorage.getItem("nw-alerts") !== "on" || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const response = await fetch("/api/news");
    if (!response.ok) return;
    const data = await response.json();
    const newest = data.articles?.[0];
    if (!newest) return;
    const key = articleKey(newest);
    const previous = localStorage.getItem("nw-last-headline");
    localStorage.setItem("nw-last-headline", key);
    if (previous && previous !== key) new Notification("Newz Wave: breaking update", { body: newest.title });
  } catch { /* Notifications resume automatically when the news service is reachable. */ }
}

async function submitArticle(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { title: form.title.value.trim(), category: form.category.value, excerpt: form.excerpt.value.trim(), author: form.author.value.trim(), date: new Date().toLocaleDateString() };
  try {
    const response = await fetch("/api/articles", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": form.adminKey.value }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.message || "Could not publish article.");
    }
    form.reset();
    alert("Article published.");
    await loadArticles();
  } catch (error) { alert(error.message); }
}

ensureShell();
renderSearch();
initializeAuth();
initializeProfile();
const adminForm = document.getElementById("adminArticleForm");
adminForm?.addEventListener("submit", submitArticle);
const feedPresent = document.getElementById("categoryPills") || document.getElementById("newsGrid");
const detailPresent = document.getElementById("storyDetail");
if (feedPresent || detailPresent) loadArticles().then(initializeDetail);
const savedView = document.getElementById("savedStories");
if (savedView) {
  const favouriteView = new URLSearchParams(location.search).get("view") === "favourites";
  document.getElementById("savedHeading").textContent = favouriteView ? "Favourite stories" : "Bookmarked stories";
  document.getElementById("savedEyebrow").textContent = favouriteView ? "Your favourites" : "Your reading list";
  loadArticles().then(() => renderArticles(savedView, { savedOnly: !favouriteView, favouriteOnly: favouriteView }));
}
if ("Notification" in window) {
  checkForBreakingNews();
  window.setInterval(checkForBreakingNews, 300000);
}