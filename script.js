const supabaseUrl = 'https://fzuuamwomskmpnrijyss.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dXVhbXdvbXNrbXBucmlqeXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDY5NjgsImV4cCI6MjA5Mjg4Mjk2OH0.ehNme-VroeIsOwuNYWBOrvs_4pau7f-IJkcS-k_ir4c'; 
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const ROLES = ["匿名游侠", "匿名法师", "匿名牧师", "匿名圣武士", "匿名吟游诗人", "匿名盗贼", "匿名德鲁伊", "匿名术士", "匿名野蛮人", "匿名武僧", "__custom__"];
let currentBoard = 'quests';
let currentSort = 'latest';
let currentPage = 1;
const PAGE_SIZE = 10;

window.onload = async () => {
    renderRoles();
    initControls();
    await supabaseClient.auth.signInAnonymously();
    refreshPosts();
    updateRanking();
};

function initControls() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            currentBoard = btn.dataset.board;
            currentPage = 1;
            refreshPosts();
        };
    });
    document.getElementById("sort-select").onchange = (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        refreshPosts();
    };
    document.getElementById("prev-page-btn").onclick = () => { if(currentPage > 1) { currentPage--; refreshPosts(); } };
    document.getElementById("next-page-btn").onclick = () => { currentPage++; refreshPosts(); };
}

async function refreshPosts() {
    const start = (currentPage - 1) * PAGE_SIZE;
    let query = supabaseClient.from("posts").select("*, replies(*)", { count: 'exact' }).eq("board", currentBoard);
    if (currentSort === 'hot') query = query.order("likes", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data, count, error } = await query.range(start, start + PAGE_SIZE - 1);
    document.getElementById("page-info").textContent = `第 ${currentPage} 页`;
    renderPosts(data || []);
}

async function updateRanking() {
    const { data } = await supabaseClient.from("posts").select("title, likes").order("likes", { ascending: false }).limit(5);
    const list = document.getElementById("daily-ranking");
    list.innerHTML = (data || []).map(p => `<li>${p.title} (🔥 ${p.likes})</li>`).join("");
}

async function renderPosts(posts) {
    const container = document.getElementById("posts-container");
    const template = document.getElementById("post-template");
    container.innerHTML = posts.length ? "" : "<p class='status-text'>这里暂时还没有传闻...</p>";

    // 获取当前访问者的唯一 ID
    const { data: { user } } = await supabaseClient.auth.getUser();
    const currentUserId = user?.id;

    posts.forEach(post => {
        const clone = template.content.cloneNode(true);
        const article = clone.querySelector(".post");
        
        // 填充内容...
        article.querySelector(".post-title").textContent = post.title;
        article.querySelector(".post-time").textContent = `${post.alias} · ${new Date(post.created_at).toLocaleString()}`;
        article.querySelector(".post-content").textContent = post.content;
        article.querySelector(".count").textContent = post.likes || 0;

        // --- 核心逻辑：判断是否显示删除按钮 ---
        const deleteBtn = article.querySelector(".delete-btn");
        if (post.owner_id === currentUserId) {
            // 是我发的，绑定删除事件
            deleteBtn.onclick = async () => {
                if (!confirm("确定要焚毁这份情报吗？")) return;
                const { error } = await supabaseClient.from("posts").delete().eq("id", post.id);
                if (error) alert("焚毁失败！");
                else refreshPosts();
            };
        } else {
            // 不是我发的，直接把删除按钮藏起来（或者删掉）
            deleteBtn.remove(); 
        }

        // 处理点赞和回复...（保持之前的逻辑不变）
        article.querySelector(".like-btn").onclick = async () => {
            await supabaseClient.from("posts").update({ likes: (post.likes || 0) + 1 }).eq("id", post.id);
            refreshPosts();
        };

        // 渲染回复列表和回复框...
        // (此处省略部分重复代码，确保你的代码里包含 handleReply 和回复渲染即可)

        container.appendChild(clone);
    });
}

async function handleReply(postId, content) {
    if (!content.trim()) return;
    const dice = Math.floor(Math.random() * 20) + 1;
    let alias = document.getElementById("identity-select").value;
    if (alias === "__custom__") alias = document.getElementById("custom-identity").value || "匿名证人";
    
    // 获取当前用户 ID
    const userRes = await supabaseClient.auth.getUser();
    const owner_id = userRes.data.user?.id;

    await supabaseClient.from("replies").insert({ 
        post_id: postId, content, alias, dice_result: dice, owner_id: owner_id 
    });
    refreshPosts();
}

function renderRoles() {
    const sel = document.getElementById("identity-select");
    sel.innerHTML = ROLES.map(r => `<option value="${r}">${r==='__custom__'?'✨ 自定义...':r}</option>`).join("");
    sel.onchange = () => document.getElementById("custom-identity").classList.toggle("hidden", sel.value !== "__custom__");
}

function createDiceBadge(val) {
    const div = document.createElement("div");
    div.className = "dice-badge";
    if (val === 20) { div.classList.add("dice-badge-success"); div.textContent = "✨ 20"; }
    else if (val === 1) { div.classList.add("dice-badge-fail"); div.textContent = "☠ 1"; }
    else { div.textContent = `🎲 ${val}`; }
    return div;
}

document.getElementById("post-form").onsubmit = async (e) => {
    e.preventDefault();
    const board = document.getElementById("board-select").value;
    const title = document.getElementById("post-title").value;
    const content = document.getElementById("post-content").value;
    let alias = document.getElementById("identity-select").value;
    if (alias === "__custom__") alias = document.getElementById("custom-identity").value || "匿名旅人";
    const dice = Math.floor(Math.random() * 20) + 1;
    
    await supabaseClient.from("posts").insert({ 
        board, title, content, alias, dice_result: dice, 
        owner_id: (await supabaseClient.auth.getUser()).data.user.id 
    });
    location.reload();
};