const supabaseUrl = 'https://fzuuamwomskmpnrijyss.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6dXVhbXdvbXNrbXBucmlqeXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDY5NjgsImV4cCI6MjA5Mjg4Mjk2OH0.ehNme-VroeIsOwuNYWBOrvs_4pau7f-IJkcS-k_ir4c'; 
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentBoard = 'quests';
let currentSort = 'latest';

window.onload = async () => {
    initIdentity();
    await supabaseClient.auth.signInAnonymously();
    initControls();
    refreshPosts();
};

function initControls() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            currentBoard = btn.dataset.board;
            refreshPosts();
        };
    });
    document.getElementById("sort-select").onchange = (e) => { currentSort = e.target.value; refreshPosts(); };
}

async function refreshPosts() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    let query = supabaseClient.from("posts").select("*, replies(*)").eq("board", currentBoard);
    
    if (currentSort === 'hot') query = query.order("likes", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data } = await query;
    renderPosts(data || [], user?.id);
    updateRanking();
}

function renderPosts(posts, userId) {
    const container = document.getElementById("posts-container");
    const template = document.getElementById("post-template");
    container.innerHTML = posts.length ? "" : "<p class='status-text'>此板块暂无情报</p>";

    posts.forEach(post => {
        const clone = template.content.cloneNode(true);
        const article = clone.querySelector(".post");
        
        article.querySelector(".post-title").textContent = post.title;
        article.querySelector(".post-time").textContent = `${post.alias} · ${new Date(post.created_at).toLocaleString()}`;
        article.querySelector(".post-content").textContent = post.content;
        article.querySelector(".count").textContent = post.likes || 0;

        if (post.dice_result) article.querySelector(".post-top").appendChild(createDiceBadge(post.dice_result));

        // 帖子删除按钮逻辑：仅作者可见
        const delBtn = article.querySelector(".delete-btn");
        if (post.owner_id === userId) {
            delBtn.onclick = async () => {
                if(confirm("确定焚毁？")) { await supabaseClient.from("posts").delete().eq("id", post.id); refreshPosts(); }
            };
        } else { delBtn.remove(); }

        // 回复渲染
        const replyList = article.querySelector(".replies-container");
        const replyBox = article.querySelector(".reply-box");
        const replyInput = article.querySelector(".reply-input");

        (post.replies || []).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).forEach(reply => {
            const rDiv = document.createElement("div");
            rDiv.className = "reply-item";
            rDiv.style = "background:rgba(0,0,0,0.1); padding:8px; margin-top:5px; border-radius:4px; font-size:14px; position:relative;";
            
            const diceHtml = reply.dice_result ? `<span class="dice-badge">🎲 ${reply.dice_result}</span>` : '';
            const delHtml = reply.owner_id === userId ? `<button class="del-reply" style="color:red; float:right; border:none; background:none; cursor:pointer;">撤回</button>` : '';
            
            rDiv.innerHTML = `<div><strong>${reply.alias}</strong> ${diceHtml} ${delHtml}</div><div style="margin-top:4px;">${reply.content}</div>`;
            
            // 撤回逻辑
            const delR = rDiv.querySelector(".del-reply");
            if(delR) delR.onclick = async () => { await supabaseClient.from("replies").delete().eq("id", reply.id); refreshPosts(); };

            // 点击评论自动@
            rDiv.onclick = (e) => {
                if(e.target.className !== 'del-reply') {
                    replyBox.classList.remove("hidden");
                    replyInput.value = `@${reply.alias} `;
                    replyInput.focus();
                }
            };
            replyList.appendChild(rDiv);
        });

        article.querySelector(".toggle-reply-btn").onclick = () => replyBox.classList.toggle("hidden");
        article.querySelector(".submit-reply-btn").onclick = () => handleReply(post.id, replyInput.value);
        article.querySelector(".like-btn").onclick = async () => {
            await supabaseClient.from("posts").update({ likes: (post.likes || 0) + 1 }).eq("id", post.id);
            refreshPosts();
        };

        container.appendChild(clone);
    });
}

async function handleReply(postId, content) {
    if (!content.trim()) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    let alias = document.getElementById("identity-select").value;
    if (alias === "__custom__") alias = document.getElementById("custom-identity").value || "匿名者";
    const dice = Math.floor(Math.random()*20)+1;

    await supabaseClient.from("replies").insert({ post_id: postId, content, alias, owner_id: user?.id, dice_result: dice });
    refreshPosts();
}

function initIdentity() {
    const roles = ["匿名游侠", "匿名法师", "匿名牧师", "匿名德鲁伊", "匿名吟游诗人","匿名邪术师","匿名圣武士","匿名战士","匿名武僧","匿名野蛮人","匿名游荡者","匿名术士","匿名奇械师","__custom__"];
    const sel = document.getElementById("identity-select");
    sel.innerHTML = roles.map(r => `<option value="${r}">${r==='__custom__'?'✨ 自定义...':r}</option>`).join("");
    sel.onchange = () => document.getElementById("custom-identity").classList.toggle("hidden", sel.value !== "__custom__");
}

function createDiceBadge(val) {
    const s = document.createElement("span");
    s.className = "dice-badge " + (val===20?'dice-badge-success':(val===1?'dice-badge-fail':''));
    s.textContent = `🎲 d20=${val}`;
    return s;
}

document.getElementById("post-form").onsubmit = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabaseClient.auth.getUser();
    let alias = document.getElementById("identity-select").value;
    if (alias === "__custom__") alias = document.getElementById("custom-identity").value || "匿名者";

    await supabaseClient.from("posts").insert({ 
        title: document.getElementById("post-title").value,
        content: document.getElementById("post-content").value,
        alias, board: currentBoard, owner_id: user?.id,
        dice_result: Math.floor(Math.random()*20)+1 
    });
    location.reload();
};

async function updateRanking() {
    const { data } = await supabaseClient.from("posts").select("title, likes").order("likes", { ascending: false }).limit(5);
    document.getElementById("daily-ranking").innerHTML = (data || []).map(p => `<li>${p.title} (🔥 ${p.likes})</li>`).join("");
}