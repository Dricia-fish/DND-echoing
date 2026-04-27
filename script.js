const IDENTITY_KEY = "anonymous_forum_identity_v1";
const CUSTOM_IDENTITY_KEY = "anonymous_forum_custom_identity_v1";
const SUPABASE_URL_KEY = "dnd_forum_supabase_url";
const SUPABASE_ANON_KEY = "dnd_forum_supabase_anon_key";
const CUSTOM_ROLE_VALUE = "__custom__";

const PAGE_SIZE = 10;

const postForm = document.getElementById("post-form");
const postTitleInput = document.getElementById("post-title");
const postContentInput = document.getElementById("post-content");
const searchInput = document.getElementById("search-input");
const postsContainer = document.getElementById("posts-container");
const postTemplate = document.getElementById("post-template");
const identitySelect = document.getElementById("identity-select");
const customIdentityInput = document.getElementById("custom-identity");
const sortSelect = document.getElementById("sort-select");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");
const pageInfo = document.getElementById("page-info");
const rankingList = document.getElementById("daily-ranking");

const supabaseUrlInput = document.getElementById("supabase-url");
const supabaseAnonKeyInput = document.getElementById("supabase-anon-key");
const saveSupabaseBtn = document.getElementById("save-supabase-btn");
const connectionStatus = document.getElementById("connection-status");

const ROLES = [
  "匿名游侠",
  "匿名法师",
  "匿名牧师",
  "匿名圣武士",
  "匿名吟游诗人",
  "匿名德鲁伊",
  "匿名术士",
  "匿名野蛮人",
  "匿名武僧",
  "匿名盗贼"
];

let supabaseClient = null;
let currentPage = 1;
let hasNextPage = false;
let renderedPosts = [];
let currentUserId = "";
let realtimeChannel = null;

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
  sortSelect.addEventListener("change", async () => {
    currentPage = 1;
    await refreshPosts();
  });

  prevPageBtn.addEventListener("click", async () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    await refreshPosts();
  });

  nextPageBtn.addEventListener("click", async () => {
    if (!hasNextPage) return;
    currentPage += 1;
    await refreshPosts();
  });

  identitySelect.addEventListener("change", () => {
    localStorage.setItem(IDENTITY_KEY, identitySelect.value);
    updateCustomIdentityVisibility();
  });

  customIdentityInput.addEventListener("input", () => {
    localStorage.setItem(CUSTOM_IDENTITY_KEY, customIdentityInput.value.trim());
  });

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
  const validSavedRole = ROLES.includes(savedRole) || savedRole === CUSTOM_ROLE_VALUE;
  identitySelect.value = validSavedRole ? savedRole : ROLES[0];
  localStorage.setItem(IDENTITY_KEY, identitySelect.value);

  customIdentityInput.value = localStorage.getItem(CUSTOM_IDENTITY_KEY) || "";
  updateCustomIdentityVisibility();
}

function updateCustomIdentityVisibility() {
  const isCustom = identitySelect.value === CUSTOM_ROLE_VALUE;
  customIdentityInput.classList.toggle("hidden", !isCustom);
}

function getCurrentIdentity() {
  if (identitySelect.value !== CUSTOM_ROLE_VALUE) {
    return identitySelect.value || ROLES[0];
  }

  return customIdentityInput.value.trim();
}

function initSupabaseForm() {
  supabaseUrlInput.value = localStorage.getItem(SUPABASE_URL_KEY) || "";
  supabaseAnonKeyInput.value = localStorage.getItem(SUPABASE_ANON_KEY) || "";
}

async function onSaveSupabaseConfig() {
  const url = supabaseUrlInput.value.trim();
  const key = supabaseAnonKeyInput.value.trim();

  if (!url || !key) {
    setStatus("请填写 Supabase URL 和 anon key", false);
    return;
  }

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
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (sessionData.session?.user?.id) {
    currentUserId = sessionData.session.user.id;
    return;
  }

  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;

  currentUserId = data.user?.id || "";
}

async function connectSupabase(url, key) {
  try {
    supabaseClient = window.supabase.createClient(url, key);

    await ensureAnonymousUser();

    const { error } = await supabaseClient
      .from("posts")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    if (error) throw error;

    setStatus("云端连接成功（已匿名登录），共享帖子已启用", true);
    currentPage = 1;
    await refreshPosts();
    subscribeRealtime();
  } catch (error) {
    supabaseClient = null;
    currentUserId = "";
    setStatus(`连接失败：${error.message}`, false);
    renderEmpty("请检查 Supabase 配置、表结构与策略");
  }
}

function setStatus(text, ok) {
  connectionStatus.textContent = text;
  connectionStatus.classList.toggle("status-ok", ok);
  connectionStatus.classList.toggle("status-bad", !ok);
}

async function onCreatePost(event) {
  event.preventDefault();

  if (!supabaseClient || !currentUserId) {
    alert("请先连接 Supabase");
    return;
  }

  const title = postTitleInput.value.trim();
  const content = postContentInput.value.trim();
  const alias = getCurrentIdentity();

  if (!title || !content) return;
  if (!alias) {
    alert("请先输入有效的自定义身份名");
    return;
  }

  const diceResult = rollD20();
  const contentWithDice = `${content}\n\n🎲 本次检定（d20）：${diceResult}`;

  const { error } = await supabaseClient.from("posts").insert({
    title,
    content: contentWithDice,
    alias,
    dice_result: diceResult,
    owner_id: currentUserId
  });

  if (error) {
    alert(`发帖失败：${error.message}`);
    return;
  }

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
  if (error) {
    alert(`读取帖子失败：${error.message}`);
    return;
  }

  const postIds = (posts || []).map((p) => p.id);
  let replies = [];

  if (postIds.length > 0) {
    const { data: replyData, error: replyError } = await supabaseClient
      .from("replies")
      .select("id,post_id,content,alias,created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (replyError) {
      alert(`读取回复失败：${replyError.message}`);
      return;
    }

    replies = replyData || [];
  }

  const replyMap = {};
  postIds.forEach((id) => {
    replyMap[id] = [];
  });

  replies.forEach((reply) => {
    if (replyMap[reply.post_id]) {
      replyMap[reply.post_id].push({
        id: reply.id,
        text: reply.content,
        alias: reply.alias,
        createdAt: reply.created_at
      });
    }
  });

  renderedPosts = (posts || []).map((post) => ({
    id: post.id,
    title: post.title,
    content: post.content,
    alias: post.alias,
    likes: post.likes || 0,
    diceResult: post.dice_result,
    createdAt: post.created_at,
    ownerId: post.owner_id,
    replies: replyMap[post.id] || []
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

  const filtered = renderedPosts.filter((post) => {
    if (!keyword) return true;
    return post.title.toLowerCase().includes(keyword) || post.content.toLowerCase().includes(keyword);
  });

  if (filtered.length === 0) {
    renderEmpty("酒馆暂无匹配情报");
    return;
  }

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
      if (diceResult === 1) node.classList.add("post-crit-fail");
    }

    const likeBtn = node.querySelector(".like-btn");
    likeBtn.textContent = `🔥 ${post.likes}`;
    likeBtn.addEventListener("click", async () => {
      if (!supabaseClient) return;
      const { error } = await supabaseClient
        .from("posts")
        .update({ likes: (post.likes || 0) + 1 })
        .eq("id", post.id);
      if (error) {
        alert(`点赞失败：${error.message}`);
        return;
      }
      await refreshPosts();
    });

    const deleteBtn = node.querySelector(".delete-btn");
    const canDelete = post.ownerId && currentUserId && post.ownerId === currentUserId;
    deleteBtn.classList.toggle("hidden", !canDelete);

    deleteBtn.addEventListener("click", async () => {
      if (!supabaseClient) return;
      if (!canDelete) {
        alert("你只能删除自己发布的帖子");
        return;
      }

      const { error } = await supabaseClient
        .from("posts")
        .delete()
        .eq("id", post.id)
        .eq("owner_id", currentUserId);

      if (error) {
        alert(`删除失败：${error.message}`);
        return;
      }
      await refreshPosts();
    });

    const replyBox = node.querySelector(".reply-box");
    const toggleReplyBtn = node.querySelector(".toggle-reply-btn");
    toggleReplyBtn.addEventListener("click", () => {
      replyBox.classList.toggle("hidden");
    });

    const replyInput = node.querySelector(".reply-input");
    node.querySelector(".submit-reply-btn").addEventListener("click", async () => {
      if (!supabaseClient) return;
      const text = replyInput.value.trim();
      const alias = getCurrentIdentity();

      if (!text) return;
      if (!alias) {
        alert("请先输入有效的自定义身份名");
        return;
      }

      const { error } = await supabaseClient.from("replies").insert({
        post_id: post.id,
        content: text,
        alias
      });

      if (error) {
        alert(`回复失败：${error.message}`);
        return;
      }

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

  if (!todayPosts || todayPosts.length === 0) {
    rankingList.innerHTML = '<li class="empty">今天还没有悬赏记录</li>';
    return;
  }

  const postIds = todayPosts.map((post) => post.id);
  const { data: todayReplies } = await supabaseClient
    .from("replies")
    .select("id,post_id,created_at")
    .in("post_id", postIds)
    .gte("created_at", dayStart.toISOString());

  const replyCountMap = {};
  postIds.forEach((id) => {
    replyCountMap[id] = 0;
  });

  (todayReplies || []).forEach((reply) => {
    replyCountMap[reply.post_id] = (replyCountMap[reply.post_id] || 0) + 1;
  });

  const ranking = todayPosts
    .map((post) => ({
      ...post,
      score: (post.likes || 0) * 3 + (replyCountMap[post.id] || 0) * 2 + 1
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  ranking.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.title}（热度 ${item.score}）`;
    rankingList.appendChild(li);
  });
}

function subscribeRealtime() {
  if (!supabaseClient) return;
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel("dnd-forum-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
      refreshPosts();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "replies" }, () => {
      refreshPosts();
    })
    .subscribe();
}

function resolveAlias(entity) {
  const alias = (entity.alias || "").trim();
  return alias || "匿名冒险者";
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
  if (Number.isInteger(post.diceResult)) {
    return post.diceResult;
  }

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
