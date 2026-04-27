// --- 1. 直接在这里填入你的“通关暗号” ---
// 注意：URL 只要到 .co 结尾即可
const supabaseUrl = 'https://fzuuamwomskmpnrijyss.supabase.co'; 
// 这里填入你之前在 Supabase 复制的那一长串 Anon Key
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dXVhbXdvbXNrbXBucmlqeXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDY5NjgsImV4cCI6MjA5Mjg4Mjk2OH0.ehNme-VroeIsOwuNYWBOrvs_4pau7f-IJkcS-k_ir4c'; 

// --- 2. 核心变量配置 ---
const IDENTITY_KEY = "anonymous_forum_identity_v1";
const CUSTOM_IDENTITY_KEY = "anonymous_forum_custom_identity_v1";
const CUSTOM_ROLE_VALUE = "__custom__";
const PAGE_SIZE = 10;

// --- 3. 初始化连接器（这一步最重要，保证 supabaseClient 提前生成） ---
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// --- 4. 获取 DOM 元素（注意：删掉了原来的输入框和保存按钮变量） ---
const postForm = document.getElementById("post-form");
const postTitleInput = document.getElementById("post-title");
const postContentInput = document.getElementById("post-content");
const postsContainer = document.getElementById("posts-container");
const postTemplate = document.getElementById("post-template");
const identitySelect = document.getElementById("identity-select");
const customIdentityInput = document.getElementById("custom-identity");
const sortSelect = document.getElementById("sort-select");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");
const pageInfo = document.getElementById("page-info");
const rankingList = document.getElementById("daily-ranking");

// --- 5. 定义身份角色 ---
const ROLES = [
  "匿名游侠", "匿名法师", "匿名牧师", "匿名圣武士", "匿名野蛮人","匿名战士"
  "匿名吟游诗人", "匿名盗贼", "匿名德鲁伊", "匿名术士", "匿名邪术师","匿名武僧"
  CUSTOM_ROLE_VALUE
];


let supabaseClient = null;
let currentPage = 1;
let hasNextPage = false;
let renderedPosts = [];
let currentUserId = "";

bootstrap();

function bootstrap() {
  initIdentitySelect();
  bindEvents();
  initSupabaseForm();
  connectFromStorage();
}

function bindEvents() {
  postForm.addEventListener("submit", onCreatePost);
  searchInput.addEventListener("input", () => renderPosts());
  sortSelect.addEventListener("change", async () => { currentPage = 1; await refreshPosts(); });
  prevPageBtn.addEventListener("click", async () => { if (currentPage > 1) { currentPage -= 1; await refreshPosts(); } });
  nextPageBtn.addEventListener("click", async () => { if (hasNextPage) { currentPage += 1; await refreshPosts(); } });
  identitySelect.addEventListener("change", () => { localStorage.setItem(IDENTITY_KEY, identitySelect.value); updateCustomIdentityVisibility(); });
  customIdentityInput.addEventListener("input", () => { localStorage.setItem(CUSTOM_IDENTITY_KEY, customIdentityInput.value.trim()); });
  saveSupabaseBtn.addEventListener("click", onSaveSupabaseConfig);
}

function initIdentitySelect() {
  identitySelect.innerHTML = "";
  ROLES.forEach((role) => {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = role;
    identitySelect.appendChild(option);
  });
  const customOption = document.createElement("option");
  customOption.value = CUSTOM_ROLE_VALUE;
  customOption.textContent = "自定义身份";
  identitySelect.appendChild(customOption);

  const savedRole = localStorage.getItem(IDENTITY_KEY);
  identitySelect.value = (ROLES.includes(savedRole) || savedRole === CUSTOM_ROLE_VALUE) ? savedRole : ROLES[0];
  localStorage.setItem(IDENTITY_KEY, identitySelect.value);
  customIdentityInput.value = localStorage.getItem(CUSTOM_IDENTITY_KEY) || "";
  updateCustomIdentityVisibility();
}

function updateCustomIdentityVisibility() {
  customIdentityInput.classList.toggle("hidden", identitySelect.value !== CUSTOM_ROLE_VALUE);
}

function getCurrentIdentity() {
  if (identitySelect.value !== CUSTOM_ROLE_VALUE) return identitySelect.value || ROLES[0];
  return customIdentityInput.value.trim();
}

function initSupabaseForm() {
  supabaseUrlInput.value = localStorage.getItem(SUPABASE_URL_KEY) || "";
  supabaseAnonKeyInput.value = localStorage.getItem(SUPABASE_ANON_KEY) || "";
}

async function onSaveSupabaseConfig() {
  const url = supabaseUrlInput.value.trim();
  const key = supabaseAnonKeyInput.value.trim();
  if (!url || !key) return setStatus("请填写 Supabase URL 和 anon key", false);

  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_ANON_KEY, key);
  await connectSupabase(url, key);
}

async function connectFromStorage() {
  const url = localStorage.getItem(SUPABASE_URL_KEY) || "";
  const key = localStorage.getItem(SUPABASE_ANON_KEY) || "";
  if (!url || !key) {
    setStatus("尚未连接云端（请先填写 Supabase 配置）", false);
    renderEmpty("连接 Supabase 后可查看共享帖子");
    return;
  }
  await connectSupabase(url, key);
}

async function ensureAnonymousUser() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user?.id) {
    currentUserId = data.session.user.id;
    return;
  }
  const { data: login, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;
  currentUserId = login.user?.id || "";
}

async function connectSupabase(url, key) {
  try {
    supabaseClient = window.supabase.createClient(url, key);
    await ensureAnonymousUser();

    const { error } = await supabaseClient.from("posts").select("id", { head: true }).limit(1);
    if (error) throw error;

    setStatus("云端连接成功，已启用共享帖子", true);
    currentPage = 1;
    await refreshPosts();
  } catch (error) {
    supabaseClient = null;
    currentUserId = "";
    setStatus(`连接失败：${error.message}`, false);
    renderEmpty("请检查 Supabase 配置、表结构和策略");
  }
}

async function onCreatePost(event) {
  event.preventDefault();
  if (!supabaseClient || !currentUserId) return alert("请先连接 Supabase");

  const title = postTitleInput.value.trim();
  const content = postContentInput.value.trim();
  const alias = getCurrentIdentity();
  if (!title || !content) return;
  if (!alias) return alert("请先输入有效的自定义身份名");

  const diceResult = rollD20();
  const contentWithDice = `${content}\n\n🎲 本次检定（d20）：${diceResult}`;

  const { error } = await supabaseClient.from("posts").insert({
    title,
    content: contentWithDice,
    alias,
    dice_result: diceResult,
    owner_id: currentUserId
  });

  if (error) return alert(`发帖失败：${error.message}`);

  postForm.reset();
  identitySelect.value = localStorage.getItem(IDENTITY_KEY) || ROLES[0];
  customIdentityInput.value = localStorage.getItem(CUSTOM_IDENTITY_KEY) || "";
  updateCustomIdentityVisibility();
  await refreshPosts();
}

async function refreshPosts() {
  if (!supabaseClient) return;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;
  const sortMode = sortSelect.value;

  let query = supabaseClient
    .from("posts")
    .select("id,title,content,alias,likes,dice_result,created_at,owner_id", { count: "exact" })
    .range(from, to)
    .order("created_at", { ascending: false });

  if (sortMode === "hot") {
    query = supabaseClient
      .from("posts")
      .select("id,title,content,alias,likes,dice_result,created_at,owner_id", { count: "exact" })
      .range(from, to)
      .order("likes", { ascending: false })
      .order("created_at", { ascending: false });
  }

  const { data: posts, error, count } = await query;
  if (error) return alert(`读取帖子失败：${error.message}`);

  const postIds = (posts || []).map((p) => p.id);
  let replies = [];
  if (postIds.length) {
    const { data: replyData, error: replyError } = await supabaseClient
      .from("replies")
      .select("id,post_id,content,alias,created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });
    if (replyError) return alert(`读取回复失败：${replyError.message}`);
    replies = replyData || [];
  }

  const replyMap = {};
  postIds.forEach((id) => { replyMap[id] = []; });
  replies.forEach((r) => {
    if (replyMap[r.post_id]) replyMap[r.post_id].push({ id: r.id, text: r.content, alias: r.alias, createdAt: r.created_at });
  });

  renderedPosts = (posts || []).map((p) => ({
    id: p.id, title: p.title, content: p.content, alias: p.alias, likes: p.likes || 0,
    diceResult: p.dice_result, createdAt: p.created_at, ownerId: p.owner_id, replies: replyMap[p.id] || []
  }));

  const total = count || 0;
  hasNextPage = currentPage * PAGE_SIZE < total;
  pageInfo.textContent = `第 ${currentPage} 页`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = !hasNextPage;

  renderPosts();
  await renderDailyRanking();
}

function renderPosts() {
  postsContainer.innerHTML = "";
  const keyword = searchInput.value.trim().toLowerCase();
  const filtered = renderedPosts.filter((p) => !keyword || p.title.toLowerCase().includes(keyword) || p.content.toLowerCase().includes(keyword));

  if (!filtered.length) return renderEmpty("酒馆暂无匹配情报");

  filtered.forEach((post) => {
    const node = postTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".post-title").textContent = post.title;
    node.querySelector(".post-time").textContent = `${resolveAlias(post)} · ${formatTime(post.createdAt)}`;
    node.querySelector(".post-content").textContent = post.content;

    const diceResult = getDiceResult(post);
    if (diceResult !== null) {
      const badge = createDiceBadge(diceResult);
      node.querySelector(".post-content").insertAdjacentElement("beforebegin", badge);
      if (diceResult === 20) node.classList.add("post-crit-success");
      else if (diceResult === 1) node.classList.add("post-crit-fail");
    }

    const likeBtn = node.querySelector(".like-btn");
    likeBtn.textContent = `🔥 ${post.likes}`;
    likeBtn.addEventListener("click", async () => {
      const { error } = await supabaseClient.from("posts").update({ likes: post.likes + 1 }).eq("id", post.id);
      if (error) return alert(`点赞失败：${error.message}`);
      await refreshPosts();
    });

    const deleteBtn = node.querySelector(".delete-btn");
    const canDelete = post.ownerId && currentUserId && post.ownerId === currentUserId;
    deleteBtn.classList.toggle("hidden", !canDelete);
    deleteBtn.addEventListener("click", async () => {
      if (!canDelete) return alert("你只能删除自己发布的帖子");
      const { error } = await supabaseClient.from("posts").delete().eq("id", post.id).eq("owner_id", currentUserId);
      if (error) return alert(`删除失败：${error.message}`);
      await refreshPosts();
    });

    const replyBox = node.querySelector(".reply-box");
    node.querySelector(".toggle-reply-btn").addEventListener("click", () => replyBox.classList.toggle("hidden"));

    const replyInput = node.querySelector(".reply-input");
    node.querySelector(".submit-reply-btn").addEventListener("click", async () => {
      const text = replyInput.value.trim();
      const alias = getCurrentIdentity();
      if (!text) return;
      if (!alias) return alert("请先输入有效的自定义身份名");

      const { error } = await supabaseClient.from("replies").insert({ post_id: post.id, content: text, alias });
      if (error) return alert(`回复失败：${error.message}`);
      await refreshPosts();
    });

    const replyList = node.querySelector(".reply-list");
    post.replies.forEach((reply) => {
      const item = document.createElement("li");
      const meta = document.createElement("span");
      meta.className = "reply-meta";
      meta.textContent = `${resolveAlias(reply)} · ${formatTime(reply.createdAt)}`;
      const content = document.createElement("div");
      content.textContent = reply.text;
      item.appendChild(meta);
      item.appendChild(content);
      replyList.appendChild(item);
    });

    postsContainer.appendChild(node);
  });
}

async function renderDailyRanking() {
  rankingList.innerHTML = "";
  if (!supabaseClient) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const { data: todayPosts, error } = await supabaseClient
    .from("posts")
    .select("id,title,likes,created_at")
    .gte("created_at", dayStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    rankingList.innerHTML = '<li class="empty">读取热榜失败</li>';
    return;
  }

  if (!todayPosts?.length) {
    rankingList.innerHTML = '<li class="empty">今天还没有悬赏记录</li>';
    return;
  }

  const postIds = todayPosts.map((p) => p.id);
  const { data: todayReplies } = await supabaseClient
    .from("replies")
    .select("post_id")
    .in("post_id", postIds)
    .gte("created_at", dayStart.toISOString());

  const replyCount = {};
  postIds.forEach((id) => { replyCount[id] = 0; });
  (todayReplies || []).forEach((r) => { replyCount[r.post_id] = (replyCount[r.post_id] || 0) + 1; });

  todayPosts
    .map((p) => ({ ...p, score: (p.likes || 0) * 3 + (replyCount[p.id] || 0) * 2 + 1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.title}（热度 ${item.score}）`;
      rankingList.appendChild(li);
    });
}

function setStatus(text, ok) {
  connectionStatus.textContent = text;
  connectionStatus.classList.toggle("status-ok", ok);
  connectionStatus.classList.toggle("status-bad", !ok);
}

function resolveAlias(entity) {
  return (entity.alias || "").trim() || "匿名冒险者";
}

function createDiceBadge(diceResult) {
  const badge = document.createElement("div");
  badge.className = "dice-badge";
  if (diceResult === 20) {
    badge.classList.add("dice-badge-success");
    badge.textContent = `✨ 大成功！d20=${diceResult}`;
  } else if (diceResult === 1) {
    badge.classList.add("dice-badge-fail");
    badge.textContent = `☠ 大失败！d20=${diceResult}`;
  } else {
    badge.textContent = `🎲 d20=${diceResult}`;
  }
  return badge;
}

function getDiceResult(post) {
  if (Number.isInteger(post.diceResult)) return post.diceResult;
  const matched = post.content && post.content.match(/d20）：(\d{1,2})/);
  if (!matched) return null;
  const value = Number(matched[1]);
  return value >= 1 && value <= 20 ? value : null;
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function formatTime(isoTime) {
  const date = new Date(isoTime);
  return Number.isNaN(date.getTime()) ? "未知时间" : date.toLocaleString("zh-CN", { hour12: false });
}

function renderEmpty(message) {
  postsContainer.innerHTML = `<p class="empty">${message}</p>`;
}
async function init() {
  renderRoles();        // 渲染身份下拉框
  initRealtime();       // 开启实时同步
  await signInAnonymously(); // 匿名登录云端
  refreshPosts();       // 获取并展示云端帖子
}

// 启动！
init();