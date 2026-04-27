/**
 * DND小队匿名论坛 - 核心逻辑脚本
 * 功能：云端同步、匿名身份、d20掷骰、实时更新
 */

// --- 1. 配置你的 Supabase 暗号 ---
const supabaseUrl = 'https://fzuuamwomskmpnrijyss.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dXVhbXdvbXNrbXBucmlqeXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDY5NjgsImV4cCI6MjA5Mjg4Mjk2OH0.ehNme-VroeIsOwuNYWBOrvs_4pau7f-IJkcS-k_ir4c'; 

// --- 2. 核心变量配置 ---
const IDENTITY_KEY = "anonymous_forum_identity_v1";
const CUSTOM_IDENTITY_KEY = "anonymous_forum_custom_identity_v1";
const CUSTOM_ROLE_VALUE = "__custom__";
const PAGE_SIZE = 10;

// --- 3. 初始化连接器 ---
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// --- 4. 获取 DOM 元素 ---
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
  "匿名游侠", "匿名法师", "匿名牧师", "匿名圣武士", 
  "匿名吟游诗人", "匿名盗贼", "匿名德鲁伊", "匿名术士", 
  "匿名野蛮人", "匿名武僧", "匿名游荡者", CUSTOM_ROLE_VALUE
];

let currentPage = 1;

// --- 6. 核心逻辑：初始化与渲染 ---

/** 初始化入口 */
async function init() {
  console.log("🎲 DND论坛正在启动...");
  
  // 1. 先把身份下拉框画出来（解决你现在无法选择的问题）
  renderRoles();
  
  // 2. 开启实时同步（别人发帖你也能看到）
  initRealtime();
  
  try {
    // 3. 尝试匿名登录
    await signInAnonymously();
    console.log("✅ 云端连接成功！");
    
    // 4. 加载第一页帖子
    refreshPosts();
  } catch (err) {
    console.error("❌ 初始化连接失败:", err);
  }
}

/** 渲染身份下拉框 */
function renderRoles() {
  if (!identitySelect) return;
  
  identitySelect.innerHTML = "";
  ROLES.forEach(role => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role === CUSTOM_ROLE_VALUE ? "✨ 自定义身份..." : role;
    identitySelect.appendChild(opt);
  });

  // 读取本地存储的上次身份
  const saved = localStorage.getItem(IDENTITY_KEY);
  if (saved && ROLES.includes(saved)) {
    identitySelect.value = saved;
    if (saved === CUSTOM_ROLE_VALUE) {
      customIdentityInput.classList.remove("hidden");
      customIdentityInput.value = localStorage.getItem(CUSTOM_IDENTITY_KEY) || "";
    }
  }
}

/** 匿名登录 */
async function signInAnonymously() {
  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;
  return data;
}

/** 刷新帖子列表 */
async function refreshPosts() {
  const sortType = sortSelect.value;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  let query = supabaseClient
    .from("posts")
    .select("*, replies(*)", { count: "exact" });

  if (sortType === "latest") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("likes", { ascending: false });
  }

  const { data, count, error } = await query.range(start, end);

  if (error) {
    console.error("获取帖子失败:", error);
    return;
  }

  renderPosts(data);
  updatePager(count);
  refreshRanking();
}

/** 将帖子渲染到页面 */
function renderPosts(posts) {
  postsContainer.innerHTML = "";
  if (!posts || posts.length === 0) {
    postsContainer.innerHTML = '<p class="status-text">营火旁暂时还没有传闻...</p>';
    return;
  }

  posts.forEach(post => {
    const clone = postTemplate.content.cloneNode(true);
    const article = clone.querySelector(".post");
    
    article.querySelector(".post-title").textContent = post.title;
    article.querySelector(".post-time").textContent = `${resolveAlias(post)} · ${formatTime(post.created_at)}`;
    article.querySelector(".post-content").textContent = post.content;
    
    // 渲染骰子徽章
    const diceValue = getDiceResult(post);
    if (diceValue) {
      article.querySelector(".post-top").appendChild(createDiceBadge(diceValue));
    }

    // 点赞按钮
    const likeBtn = article.querySelector(".like-btn");
    likeBtn.textContent = `🔥 ${post.likes || 0}`;
    likeBtn.onclick = () => handleLike(post.id, post.likes);

    // 删除按钮（仅作者可见/可用逻辑通常在后端RLS，前端通过uid简单判断）
    const deleteBtn = article.querySelector(".delete-btn");
    deleteBtn.onclick = () => handleDelete(post.id);

    // 回复框逻辑
    const replyBox = article.querySelector(".reply-box");
    const toggleBtn = article.querySelector(".toggle-reply-btn");
    toggleBtn.onclick = () => replyBox.classList.toggle("hidden");

    const submitReplyBtn = article.querySelector(".submit-reply-btn");
    const replyInput = article.querySelector(".reply-input");
    submitReplyBtn.onclick = () => handleReply(post.id, replyInput.value);

    // 渲染已有回复
    if (post.replies && post.replies.length > 0) {
      const list = document.createElement("ul");
      list.className = "reply-list";
      post.replies.forEach(r => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${resolveAlias(r)}:</strong> ${r.content}`;
        list.appendChild(li);
      });
      article.appendChild(list);
    }

    postsContainer.appendChild(clone);
  });
}

// --- 7. 交互处理函数 ---

/** 发帖 */
postForm.onsubmit = async (e) => {
  e.preventDefault();
  
  const title = postTitleInput.value.trim();
  let content = postContentInput.value.trim();
  let alias = identitySelect.value;
  
  if (alias === CUSTOM_ROLE_VALUE) {
    alias = customIdentityInput.value.trim() || "神秘旅人";
  }

  // 掷骰子
  const dice = rollD20();
  content += `\n\n（d20掷骰）：${dice}`;

  const { data: { user } } = await supabaseClient.auth.getUser();

  const { error } = await supabaseClient.from("posts").insert({
    title,
    content,
    alias,
    dice_result: dice,
    owner_id: user.id
  });

  if (error) {
    alert("告示贴上墙失败：" + error.message);
  } else {
    postTitleInput.value = "";
    postContentInput.value = "";
    refreshPosts();
  }
};

/** 点赞 */
async function handleLike(id, currentLikes) {
  await supabaseClient
    .from("posts")
    .update({ likes: (currentLikes || 0) + 1 })
    .eq("id", id);
  refreshPosts();
}

/** 删除 */
async function handleDelete(id) {
  if (!confirm("确定要焚毁这张告示吗？")) return;
  const { error } = await supabaseClient.from("posts").delete().eq("id", id);
  if (error) alert("你没有权限焚毁他人的告示！");
  refreshPosts();
}

/** 回复 */
async function handleReply(postId, content) {
  if (!content.trim()) return;
  let alias = identitySelect.value;
  if (alias === CUSTOM_ROLE_VALUE) alias = customIdentityInput.value.trim() || "匿名证人";

  await supabaseClient.from("replies").insert({
    post_id: postId,
    content,
    alias
  });
  refreshPosts();
}

// --- 8. 辅助功能 ---

/** 身份选择变动 */
identitySelect.onchange = () => {
  const val = identitySelect.value;
  localStorage.setItem(IDENTITY_KEY, val);
  if (val === CUSTOM_ROLE_VALUE) {
    customIdentityInput.classList.remove("hidden");
  } else {
    customIdentityInput.classList.add("hidden");
  }
};

customIdentityInput.oninput = () => {
  localStorage.setItem(CUSTOM_IDENTITY_KEY, customIdentityInput.value);
};

/** 分页更新 */
function updatePager(totalCount) {
  const maxPage = Math.ceil(totalCount / PAGE_SIZE) || 1;
  pageInfo.textContent = `第 ${currentPage} / ${maxPage} 页`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= maxPage;
}

prevPageBtn.onclick = () => { if (currentPage > 1) { currentPage--; refreshPosts(); } };
nextPageBtn.onclick = () => { currentPage++; refreshPosts(); };
sortSelect.onchange = () => { currentPage = 1; refreshPosts(); };

/** 实时监听 */
function initRealtime() {
  supabaseClient
    .channel("dnd-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => refreshPosts())
    .on("postgres_changes", { event: "*", schema: "public", table: "replies" }, () => refreshPosts())
    .subscribe();
}