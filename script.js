const STORAGE_KEY = "anonymous_forum_posts_v1";

const postForm = document.getElementById("post-form");
const postTitleInput = document.getElementById("post-title");
const postContentInput = document.getElementById("post-content");
const searchInput = document.getElementById("search-input");
const postsContainer = document.getElementById("posts-container");
const postTemplate = document.getElementById("post-template");

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

let posts = loadPosts();
renderPosts();

postForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = postTitleInput.value.trim();
  const content = postContentInput.value.trim();

  if (!title || !content) {
    return;
  }

  const diceResult = rollD20();
  const contentWithDice = `${content}\n\n🎲 本次检定（d20）：${diceResult}`;

  posts.unshift({
    id: createId(),
    title,
    content: contentWithDice,
    likes: 0,
    createdAt: new Date().toISOString(),
    replies: [],
    diceResult
  });

  savePosts();
  postForm.reset();
  renderPosts();
});

searchInput.addEventListener("input", () => {
  renderPosts(searchInput.value.trim().toLowerCase());
});

function renderPosts(keyword = "") {
  postsContainer.innerHTML = "";

  const filtered = posts.filter((post) => {
    if (!keyword) {
      return true;
    }

    return (
      post.title.toLowerCase().includes(keyword) ||
      post.content.toLowerCase().includes(keyword)
    );
  });

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = keyword ? "酒馆暂无匹配情报" : "告示板空空如也，快投递第一张卷轴吧";
    postsContainer.appendChild(empty);
    return;
  }

  filtered.forEach((post) => {
    const node = postTemplate.content.firstElementChild.cloneNode(true);

    node.querySelector(".post-title").textContent = post.title;
    node.querySelector(".post-time").textContent = `${getRoleAlias(post.id, post.createdAt)} · ${formatTime(post.createdAt)}`;
    node.querySelector(".post-content").textContent = post.content;

    const diceResult = getDiceResult(post);
    if (diceResult !== null) {
      const badge = createDiceBadge(diceResult);
      node.querySelector(".post-content").insertAdjacentElement("beforebegin", badge);

      if (diceResult === 20) {
        node.classList.add("post-crit-success");
      } else if (diceResult === 1) {
        node.classList.add("post-crit-fail");
      }
    }

    const likeBtn = node.querySelector(".like-btn");
    likeBtn.textContent = `🔥 ${post.likes}`;
    likeBtn.addEventListener("click", () => {
      post.likes += 1;
      savePosts();
      renderPosts(searchInput.value.trim().toLowerCase());
    });

    const deleteBtn = node.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", () => {
      posts = posts.filter((item) => item.id !== post.id);
      savePosts();
      renderPosts(searchInput.value.trim().toLowerCase());
    });

    const replyBox = node.querySelector(".reply-box");
    const toggleReplyBtn = node.querySelector(".toggle-reply-btn");
    toggleReplyBtn.addEventListener("click", () => {
      replyBox.classList.toggle("hidden");
    });

    const replyInput = node.querySelector(".reply-input");
    node.querySelector(".submit-reply-btn").addEventListener("click", () => {
      const text = replyInput.value.trim();
      if (!text) {
        return;
      }

      post.replies.push({
        id: createId(),
        text,
        createdAt: new Date().toISOString()
      });

      savePosts();
      renderPosts(searchInput.value.trim().toLowerCase());
    });

    const replyList = node.querySelector(".reply-list");
    post.replies.forEach((reply) => {
      const item = document.createElement("li");

      const meta = document.createElement("span");
      meta.className = "reply-meta";
      meta.textContent = `${getRoleAlias(reply.id, reply.createdAt)} · ${formatTime(reply.createdAt)}`;

      const content = document.createElement("div");
      content.textContent = reply.text;

      item.appendChild(meta);
      item.appendChild(content);
      replyList.appendChild(item);
    });

    postsContainer.appendChild(node);
  });
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
  if (!matched) {
    return null;
  }

  const value = Number(matched[1]);
  if (value < 1 || value > 20) {
    return null;
  }
  return value;
}

function getRoleAlias(entityId, createdAt) {
  const dayKey = (createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const seed = `${entityId}_${dayKey}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ROLES[hash % ROLES.length];
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function savePosts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function createId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatTime(isoTime) {
  const date = new Date(isoTime);
  return Number.isNaN(date.getTime()) ? "未知时间" : date.toLocaleString("zh-CN", { hour12: false });
}
