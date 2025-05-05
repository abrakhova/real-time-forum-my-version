let socket;
let currentUserID = null;
let currentChatUserId = null;
let chatHistory = {};
let currentPage = 0;
const messagesPerPage = 10;
let isLoadingMessages = false;
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

  if (loggedIn) {
    nav.innerHTML = `
      <button class="new-post" id="new-post" onclick="scrollToNewPost()">New Post</button>
      <a href="/profile-page" class="pill-button">Profile</a>
      <a href="/about" class="pill-button">About</a>
      <a id="logout-btn" href="javascript:void(0);" class="pill-button" onclick="logout()">Log out</a>
    `;
  } else {
    nav.innerHTML = `
      <a href="/login" class="pill-button" onclick="showAuth(); return false;">Log in</a>
      <a href="/register" class="pill-button" onclick="showAuth(true); return false;">Register</a>
      <a href="/about" class="pill-button">About</a>
    `;
  }
}

function scrollToNewPost() {
  document.getElementById("postForm")?.scrollIntoView({ behavior: "smooth" });
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
    })
    .catch(() => {
      updateNav(false);
      showAuth();
    });
}

function showForum() {
  const forum = document.getElementById("forum");
  const auth = document.getElementById("auth");
  if (auth) auth.style.display = "none";
  if (forum) forum.style.display = "block";
  loadPosts();
}

function showAuth(showRegister = false) {
  document.getElementById("auth").style.display = "block";
  document.getElementById("forum").style.display = "none";

  document.getElementById("loginForm").style.display = showRegister ? "none" : "block";
  document.getElementById("registerForm").style.display = showRegister ? "block" : "none";
}

async function createPost() {
  console.log("createPost() called");
  const titleInput = document.getElementById("post-title");
  const contentInput = document.getElementById("post-content");

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const res = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ title, content })
  });

  if (res.ok) {
    alert("Post created!");
    titleInput.value = "";
    contentInput.value = "";
    loadPosts();
  } else {
    alert("Failed to create post");
  }
}

async function loadPosts() {
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
}

function renderPost(post) {
  const postContainer = document.getElementById("postContainer");

  const postDiv = document.createElement("div");
  postDiv.classList.add("post");
  postDiv.id = `post-${post.id}`;

  const title = document.createElement("h3");
  title.textContent = post.title;

  const content = document.createElement("p");
  content.textContent = post.content;

  const author = document.createElement("p");
  author.classList.add("author");
  author.textContent = `By: ${post.nickname || "Anonymous"}`;

  const commentForm = document.createElement("form");
  commentForm.onsubmit = (e) => submitComment(e, post.id);

  const commentInput = document.createElement("input");
  commentInput.type = "text";
  commentInput.placeholder = "Add a comment...";
  commentInput.id = `comment-input-${post.id}`;

  const commentBtn = document.createElement("button");
  commentBtn.type = "submit";
  commentBtn.textContent = "Comment";

  commentForm.appendChild(commentInput);
  commentForm.appendChild(commentBtn);

  const commentsDiv = document.createElement("div");
  commentsDiv.id = `comments-${post.id}`;

  postDiv.appendChild(title);
  postDiv.appendChild(author);
  postDiv.appendChild(content);
  postDiv.appendChild(commentForm);
  postDiv.appendChild(commentsDiv);

  postContainer.appendChild(postDiv);
  loadComments(post.id);
}

async function loadComments(postId) {
  const res = await fetch(`/api/comments?post_id=${postId}`, { credentials: "include" });
  if (!res.ok) return;

  const comments = await res.json();
  const commentsContainer = document.getElementById(`comments-${postId}`);
  commentsContainer.innerHTML = "";

  if (Array.isArray(comments)) {
    comments.forEach(comment => {
      const p = document.createElement("p");
      p.textContent = comment.content;
      commentsContainer.appendChild(p);
    });
  } else {
    console.warn("Invalid comments array:", comments);
  }
}

async function submitComment(event, postId) {
  event.preventDefault();
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;

  const res = await fetch("/api/comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ postId, content })
  });

  if (res.ok) {
    input.value = "";
    loadComments(postId);
  } else {
    alert("Failed to submit comment");
  }
}

// --- WebSocket & Chat ---

function connectWebSocket(userID) {
  socket = new WebSocket("ws://" + window.location.host + "/ws?user=" + userID);

  socket.onopen = function() {
    console.log("WebSocket connection established!");
  };

  socket.onmessage = function(event) {
    const data = JSON.parse(event.data);

    if (data.type === "online_users") {
      updateOnlineUsers(data.users);
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
        renderMessages([data.payload], true);
      } else {
        highlightUserInSidebar(data.payload.from_user);
      }
    }
  };

  socket.onclose = function() {
    console.log("WebSocket connection closed");
    document.getElementById("chatModal").style.display = "none";
  };
}

function updateOnlineUsers(users) {
  onlineUsers = users;

  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";

  const userList = document.createElement("ul");

  users.forEach((user) => {
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
    if (append) {
      chatHistory[userId] = [...messages, ...chatHistory[userId]];
    } else {
      chatHistory[userId] = messages;
    }

    chatHistory[userId].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    renderMessages(chatHistory[userId], append);
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
  chatHistory[currentChatUserId].push(newMessage);
  chatHistory[currentChatUserId].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  renderMessages([newMessage], true);
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
    const oldScrollHeight = chatBox.scrollHeight;
    elements.forEach((el) => chatBox.appendChild(el));
    if (chatBox.scrollTop + chatBox.clientHeight >= oldScrollHeight - 50) {
      scrollChatToBottom();
    }
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

function getNicknameById(userId) {
  const user = onlineUsers.find(u => u.id === userId);
  return user ? user.nickname : "Unknown";
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