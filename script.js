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
    let query = supabaseClient.from("posts").select("*, replies(*)").eq("board", currentBoard);
    if (currentSort === 'hot') query = query.order("likes", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data } = await query;
    renderPosts(data || []);
    updateRanking();
}

function renderPosts(posts) {
    const container = document.getElementById("posts-container");
    const template = document.getElementById("post-template");
    container.innerHTML = posts.length ? "" : "<p style='text-align:center; opacity:0.5;'>暂无情报</p>";

    posts.forEach(post => {
        const clone = template.content.cloneNode(true);
        const el = clone.querySelector(".post");
        
        el.querySelector(".post-title").textContent = post.title;
        el.querySelector(".post-time").textContent = `${post.alias} · ${new Date(post.created_at).toLocaleString()}`;
        el.querySelector(".post-content").textContent = post.content;
        el.querySelector(".count").textContent = post.likes || 0;

        // --- 全员删除逻辑 ---
        const delBtn = el.querySelector(".delete-btn");
        delBtn.onclick = async () => {
            if(confirm("确定焚毁这份告示吗？")) {
                const { error } = await supabaseClient.from("posts").delete().eq("id", post.id);
                if(error) alert("删除失败：" + error.message);
                refreshPosts();
            }
        };

        // 回复渲染
        const replyList = el.querySelector(".replies-container");
        const replyBox = el.querySelector(".reply-box");
        const replyInput = el.querySelector(".reply-input");

        (post.replies || []).forEach(reply => {
            const rDiv = document.createElement("div");
            rDiv.className = "reply-item";
            rDiv.innerHTML = `<strong>${reply.alias}</strong>: ${reply.content} <button class="del-reply" style="color:red; float:right; background:none; border:none; cursor:pointer;">撤回</button>`;
            
            rDiv.querySelector(".del-reply").onclick = async () => { 
                await supabaseClient.from("replies").delete().eq("id", reply.id); 
                refreshPosts(); 
            };
            replyList.appendChild(rDiv);
        });

        el.querySelector(".toggle-reply-btn").onclick = () => replyBox.classList.toggle("hidden");
        el.querySelector(".submit-reply-btn").onclick = () => handleReply(post.id, replyInput.value);
        el.querySelector(".like-btn").onclick = async () => {
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
    await supabaseClient.from("replies").insert({ post_id: postId, content, alias, owner_id: user?.id });
    refreshPosts();
}

function initIdentity() {
    const roles = ["匿名游侠", "匿名法师", "匿名战士", "匿名牧师", "__custom__"];
    const sel = document.getElementById("identity-select");
    sel.innerHTML = roles.map(r => `<option value="${r}">${r==='__custom__'?'✨ 自定义...':r}</option>`).join("");
    sel.onchange = () => document.getElementById("custom-identity").classList.toggle("hidden", sel.value !== "__custom__");
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