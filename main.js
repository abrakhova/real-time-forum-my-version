let socket;
let currentUserID = null;
let currentChatUserId = null;
let chatHistory = {};
let currentPage = 0;
const messagesPerPage = 10;
let isLoadingMessages = false;
let allUsers = [];
let onlineUsers = [];

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("currentUserID");
  if (input) {
    currentUserID = input.value;
  }
  window.currentUserNickname = document.getElementById("currentUserNickname")?.value;
  checkAuth();
});

window.toggleView = function () {
  const login = document.getElementById("loginForm");
  const register = document.getElementById("registerForm");

  if (login && register) {
    if (login.style.display === "none") {
      login.style.display = "block";
      register.style.display = "none";
    } else {
      login.style.display = "none";
      register.style.display = "block";
    }
  }
};

async function register() {
  const formData = new URLSearchParams();
  formData.append("nickname", document.getElementById("reg-nickname").value);
  formData.append("email", document.getElementById("reg-email").value);
  formData.append("password", document.getElementById("reg-password").value);
  formData.append("first_name", document.getElementById("reg-first-name").value);
  formData.append("last_name", document.getElementById("reg-last-name").value);
  formData.append("gender", document.getElementById("reg-gender").value);
  formData.append("age", document.getElementById("reg-age").value);

  const res = await fetch("/api/register", {
    method: "POST",
    body: formData,
    credentials: "include"
  });

  if (res.ok) {
    alert("Registered! Now login.");
    toggleView();
  } else {
    const err = await res.text();
    alert("Registration failed: " + err);
  }
}

function updateNav(loggedIn) {
  const nav = document.getElementById("nav-actions");
  nav.innerHTML = "";

  console.log("Updating nav, loggedIn:", loggedIn);

  if (loggedIn) {
    nav.innerHTML = `
      <button class="new-post" onclick="openPostModal()">New Post</button>
      <a id="logout-btn" href="javascript:void(0);" class="pill-button" onclick="logout()">Log out</a>
    `;
  } else {
    nav.innerHTML = `
      <a href="/login" class="pill-button" onclick="showAuth(); return false;">Log in</a>
      <a href="/register" class="pill-button" onclick="showAuth(true); return false;">Register</a>
    `;
  }
}

function openPostModal() {
  const modal = document.getElementById("createPostModal");
  if (modal) {
    modal.style.display = "block";
  } else {
    console.error("Create post modal not found");
  }
}

function closePostModal() {
  const modal = document.getElementById("createPostModal");
  if (modal) {
    modal.style.display = "none";
    const titleInput = document.getElementById("post-title");
    const contentInput = document.getElementById("post-content");
    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.value = "";
  }
}

function openViewPostModal(postId, title, content, author) {
  const modal = document.getElementById("viewPostModal");
  if (!modal) {
    console.error("View post modal not found");
    return;
  }

  const titleElement = document.getElementById("view-post-title");
  const authorElement = document.getElementById("view-post-author");
  const contentElement = document.getElementById("view-post-content");
  const commentForm = document.getElementById("view-comment-form");

  if (!titleElement || !authorElement || !contentElement || !commentForm) {
    console.error("One or more modal elements not found");
    return;
  }

  titleElement.textContent = title;
  authorElement.textContent = `By: ${author || "Anonymous"}`;
  contentElement.textContent = content;
  commentForm.onsubmit = (e) => submitComment(e, postId);

  modal.style.display = "block";
  loadComments(postId);
}

function closeViewPostModal() {
  const modal = document.getElementById("viewPostModal");
  if (modal) {
    modal.style.display = "none";
    const commentsContainer = document.getElementById("view-post-comments");
    if (commentsContainer) commentsContainer.innerHTML = "";
  }
}

async function login() {
  const identifier = document.getElementById("login-identifier").value;
  const password = document.getElementById("login-password").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ identifier, password })
  });

  if (res.ok) {
    const user = await res.json();
    console.log("👤 Logged in user:", user);
    currentUserID = user.id;
    updateNav(true);
    connectWebSocket(user.id);
    showForum();
  } else {
    alert("Login failed");
  }
}

async function logout() {
  await fetch("/api/logout", { credentials: "include" });
  socket?.close();
  currentUserID = null;
  updateNav(false);
  showAuth();
}

function checkAuth() {
  fetch("/check-auth", { credentials: "include" })
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
      console.log("Welcome back,", user.nickname);
      currentUserID = user.id;
      connectWebSocket(user.id);
      updateNav(true);
      showForum();
      loadUserList();
    })
    .catch(() => {
      updateNav(false);
      showAuth();
    });
}

function showForum() {
  const forum = document.getElementById("forum");
  const auth = document.getElementById("auth");
  const categories = document.querySelector(".categories");
  const chatSidebar = document.querySelector(".chat-sidebar");
  const container = document.querySelector(".container");
  if (auth) auth.style.display = "none";
  if (forum) forum.style.display = "block";
  if (categories) categories.style.display = "block";
  if (chatSidebar) chatSidebar.style.display = "block";
  if (container) container.classList.remove("auth-only");
  loadPosts();
}

function showAuth(showRegister = false) {
  document.getElementById("auth").style.display = "block";
  document.getElementById("forum").style.display = "none";
  const categories = document.querySelector(".categories");
  const chatSidebar = document.querySelector(".chat-sidebar");
  const container = document.querySelector(".container");
  if (categories) categories.style.display = "none";
  if (chatSidebar) chatSidebar.style.display = "none";
  if (container) container.classList.add("auth-only");

  document.getElementById("loginForm").style.display = showRegister ? "none" : "block";
  document.getElementById("registerForm").style.display = showRegister ? "block" : "none";
}

async function createPost() {
  console.log("createPost() called");
  const titleInput = document.getElementById("post-title");
  const contentInput = document.getElementById("post-content");
  const category = document.getElementById('post-category').value;

  if (!titleInput || !contentInput) {
    console.error("Post form elements not found");
    return;
  }

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const res = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ title, content, category })
  });

  if (res.ok) {
    alert("Post created!");
    closePostModal();
    loadPosts();
  } else {
    alert("Failed to create post");
  }
}

/* async function loadPosts() {
  const res = await fetch("/api/posts", { credentials: "include" });
  if (!res.ok) {
    alert("Failed to load posts");
    return;
  }

  const posts = await res.json();
  const postContainer = document.getElementById("postContainer");
  postContainer.innerHTML = "";

  if (Array.isArray(posts)) {
    posts.forEach(renderPost);
  } else {
    console.error("Expected posts to be an array, got:", posts);
  }
} */

async function loadPosts(category = '') {
  // Construct the URL with optional category query parameter
  const url = category ? `/api/posts?category=${encodeURIComponent(category)}` : '/api/posts';

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    alert("Failed to load posts");
    return;
  }

  const posts = await res.json();
  const postContainer = document.getElementById("postContainer");
  postContainer.innerHTML = "";

  if (Array.isArray(posts)) {
    posts.forEach(renderPost);
  } else {
    console.error("Expected posts to be an array, got:", posts);
  }
}

function renderPost(post) {
  const postContainer = document.getElementById("postContainer");
  if (!postContainer) return;

  const postDiv = document.createElement("div");
  postDiv.classList.add("post-card");
  postDiv.id = `post-${post.id}`;
  postDiv.onclick = () => openViewPostModal(post.id, post.title, post.content, post.author);

  const postHeader = document.createElement("div");
  postHeader.classList.add("post-header");

  const avatar = document.createElement("div");
  avatar.classList.add("post-avatar");
  avatar.innerHTML = '<i class="fas fa-user"></i>';

  const meta = document.createElement("div");
  meta.classList.add("post-meta");

  const author = document.createElement("div");
  author.classList.add("post-author");
  author.textContent = post.author || "Anonymous";

  const cat = document.createElement("div");
  cat.classList.add("post-category");
  cat.textContent = post.category || "General";

  const contentDiv = document.createElement("div");
  contentDiv.classList.add("post-content");

  const title = document.createElement("h3");
  title.textContent = post.title;

  const content = document.createElement("p");
  content.textContent = post.content;

  meta.appendChild(author);
  postHeader.appendChild(avatar);
  postHeader.appendChild(meta);
  contentDiv.appendChild(title);
  contentDiv.appendChild(content);
  contentDiv.appendChild(cat);
  postDiv.appendChild(postHeader);
  postDiv.appendChild(contentDiv);
  postContainer.appendChild(postDiv);
}

async function loadComments(postId) {
  const res = await fetch(`/api/comments?post_id=${postId}`, { credentials: "include" });
  if (!res.ok) {
    console.error("Failed to fetch comments for post", postId);
    return;
  }

  const comments = await res.json();
  console.log("Comments for post", postId, ":", comments);

  const commentsContainer = document.getElementById("view-post-comments");
  if (!commentsContainer) {
    console.error("Comments container not found");
    return;
  }

  commentsContainer.innerHTML = "";

  if (Array.isArray(comments)) {
    comments.forEach(comment => {
      const commentDiv = document.createElement("div");
      commentDiv.classList.add("comment");

      const metaDiv = document.createElement("div");
      metaDiv.classList.add("comment-meta");

      const authorDiv = document.createElement("div");
      authorDiv.classList.add("comment-author");
      authorDiv.textContent = comment.nickname || "Anonymous";

      const timeDiv = document.createElement("div");
      timeDiv.classList.add("comment-time");
      timeDiv.textContent = new Date(comment.created_at).toLocaleString();

      metaDiv.appendChild(authorDiv);
      metaDiv.appendChild(timeDiv);

      const contentDiv = document.createElement("div");
      contentDiv.classList.add("comment-content");
      contentDiv.textContent = comment.content;

      commentDiv.appendChild(metaDiv);
      commentDiv.appendChild(contentDiv);
      commentsContainer.appendChild(commentDiv);
    });
  } else {
    console.warn("Invalid comments array:", comments);
  }
}

async function submitComment(event, postId) {
  event.preventDefault();
  const input = document.getElementById("view-comment-input");
  if (!input) {
    console.error("Comment input not found");
    return;
  }

  const content = input.value.trim();
  if (!content) return;

  const res = await fetch("/api/comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ post_id: postId, content })
  });

  if (res.ok) {
    input.value = "";
    loadComments(postId);
  } else {
    alert("Failed to submit comment");
  }
}

async function loadUserList() {
  try {
    const res = await fetch("/api/userlist", { credentials: "include" });
    console.log("Response status from /api/userlist:", res.status);
    if (!res.ok) {
      console.error("Failed to load user list, status:", res.status);
      return;
    }
    const data = await res.json();
    //console.log("User list data:", data);
    allUsers = Array.isArray(data) ? data : data.Users || [];
    //console.log("All users:", allUsers);
  } catch (error) {
    console.error("Error loading user list:", error);
  }
}

async function getNicknameById(userId) {
  if (!allUsers.length) {
    await loadUserList();
  }
  const user = allUsers.find(u => u.id === userId);
  return user ? user.nickname : "Unknown";
}

// --- WebSocket & Chat ---

function connectWebSocket(userID) {
  socket = new WebSocket("ws://" + window.location.host + "/ws?user=" + userID);

  socket.onopen = function () {
    console.log("WebSocket connection established!");
  };

  socket.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.type === "online_users") {
      updateOnlineUsers(data.onlineUsers);
    } else if (data.type === "newMessage") {
      if (
        currentChatUserId && (
          data.payload.from_user === currentChatUserId ||
          data.payload.to_user === currentChatUserId
        )
      ) {
        if (!chatHistory[currentChatUserId]) {
          chatHistory[currentChatUserId] = [];
        }
        chatHistory[currentChatUserId].push(data.payload);
        console.log("Calling renderMessages() from connectWebSocket()");
        renderMessages([data.payload], false);
      } else {
        highlightUserInSidebar(data.payload.from_user);
      }
    }
  };

  socket.onclose = function () {
    console.log("WebSocket connection closed");
    document.getElementById("chatModal").style.display = "none";
  };
}

async function fetchUsers() {
  try {
    const res = await fetch(`http://${window.location.host}/api/userlist`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch user list");
    console.log("Response from /api/userlist:", res);

    const users = await res.json();
    //console.log("temp:", users.Users);
    return users.Users;
  } catch (err) {
    console.error("Error fetching user list:", err);
    return [];
  }
}

async function updateOnlineUsers(onlineUsers) {
  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";

  const userList = document.createElement("ul");

  allUsers = await fetchUsers();

  //console.log("All users length:", allUsers.length);
  allUsers.forEach((user) => {
    //console.log("User:", user);
    if (user.id !== currentUserID) {
      const listItem = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "pill-button";
      btn.textContent = user.nickname;
      btn.id = `chat-user-${user.id}`;
      btn.onclick = () => {
        openChatWith(user.id, user.nickname);
        clearNotification(user.id);
      };

      // Check if the user is online
      const isOnline = onlineUsers.some(u => u.id === user.id);

      // Create green dot if online
      if (isOnline) {
        const dot = document.createElement("span");
        dot.className = "online-dot";
        btn.prepend(dot);
      }

      listItem.appendChild(btn);
      userList.appendChild(listItem);
    }
  });

  container.appendChild(userList);
}

function openChatWith(userId, nickname) {
  currentChatUserId = userId;
  currentPage = 0;

  const chatTitle = document.getElementById("chatWith");
  const chatBox = document.getElementById("chatMessages");
  const chatModal = document.getElementById("chatModal");

  if (!chatModal || !chatTitle || !chatBox) {
    console.error("Chat modal or elements not found!");
    return;
  }

  chatTitle.textContent = nickname;
  chatModal.style.display = "block";
  chatBox.innerHTML = "";

  isLoadingMessages = true;
  console.log("Calling loadMessagesPage() normally from openChatWith()");
  loadMessagesPage(userId, currentPage, false).finally(() => {
    scrollChatToBottom();
    isLoadingMessages = false;
  });

  clearNotification(userId);

  chatBox.onscroll = debounce(() => {
    if (chatBox.scrollTop === 0 && !isLoadingMessages) {
      isLoadingMessages = true;
      document.getElementById("loadingOlder").style.display = "block";

      currentPage++;
      console.log("Scroll event triggering loadMessagesPage()");
      loadMessagesPage(userId, currentPage, true).finally(() => {
        isLoadingMessages = false;
        document.getElementById("loadingOlder").style.display = "none";
      });
    }
  }, 300);
}

async function loadMessagesPage(userId, page, append) {
  const offset = page * messagesPerPage;
  try {
    const res = await fetch(`/api/messages?from=${currentUserID}&to=${userId}&offset=${offset}`, {
      credentials: "include"
    });
    if (!res.ok) throw new Error("Failed to fetch messages");
    const messages = await res.json();

    if (!chatHistory[userId]) {
      chatHistory[userId] = [];
    }

    if (messages) {
      if (append) {
        chatHistory[userId] = [...messages, ...chatHistory[userId]];
      } else {
        chatHistory[userId] = messages;
      }

      chatHistory[userId].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      console.log("rendering messages from loadMessagesPage()");
      renderMessages(chatHistory[userId], append);
    }
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

function handleSendMessage() {
  const messageInput = document.getElementById("chatInput");
  const messageContent = messageInput.value.trim();

  if (!messageContent || !currentChatUserId) return;

  const newMessage = {
    from_user: currentUserID,
    from_user_nickname: window.currentUserNickname,
    to_user: currentChatUserId,
    content: messageContent,
    created_at: new Date().toISOString(),
  };

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(newMessage));
  }

  if (!chatHistory[currentChatUserId]) {
    chatHistory[currentChatUserId] = [];
  }

  messageInput.value = "";
  messageInput.focus();
}

function renderMessages(messages, append = false) {
  const chatBox = document.getElementById("chatMessages");
  if (!chatBox) return;

  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const elements = messages.map((msg) => {
    const div = document.createElement("div");
    div.className = msg.from_user === currentUserID ? "chat-message sent" : "chat-message received";

    const timestamp = new Date(msg.created_at).toLocaleString();
    const sender = document.createElement("div");
    sender.className = "chat-meta";
    sender.innerHTML = `<strong>${msg.from_user_nickname || "Unknown"}</strong> • <span style="color: gray; font-size: 0.75em;">${timestamp}</span>`;

    const content = document.createElement("div");
    content.className = "chat-text";
    content.textContent = msg.content;

    div.appendChild(sender);
    div.appendChild(content);
    return div;
  });

  if (append) {
    console.log("is this always 0?", chatBox.scrollTop);
    const offset = chatBox.scrollHeight - chatBox.scrollTop;
    chatBox.innerHTML = "";
    elements.forEach((el) => chatBox.appendChild(el));
    chatBox.scrollTop = chatBox.scrollHeight - offset;
  } else {
    chatBox.innerHTML = "";
    elements.forEach((el) => chatBox.appendChild(el));
    scrollChatToBottom();
  }
}

function scrollChatToBottom() {
  const chatMessages = document.getElementById("chatMessages");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

function highlightUserInSidebar(userId) {
  const userBtn = document.getElementById(`chat-user-${userId}`);
  if (userBtn) {
    userBtn.classList.add("highlight");
  }
}

function clearNotification(userId) {
  const userBtn = document.getElementById(`chat-user-${userId}`);
  if (userBtn) {
    userBtn.classList.remove("highlight");
  }
}

function closeChatModal() {
  document.getElementById("chatModal").style.display = "none";
}