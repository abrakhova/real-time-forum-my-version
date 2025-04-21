document.addEventListener("DOMContentLoaded", () => {
  checkAuth(); // Check session on page load
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
    currentUserID = user.id; // Set currentUserID
    connectWebSocket(user.id);
    showForum();
  } else {
    alert("Login failed");
  }
}

async function logout() {
  await fetch("/api/logout", { credentials: "include" });
  socket?.close();
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
      currentUserID = user.id; // Set currentUserID
      connectWebSocket(user.id);
      showForum();
    })
    .catch(() => {
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

function showAuth() {
  const auth = document.getElementById("auth");
  const forum = document.getElementById("forum");
  if (auth) auth.style.display = "block";
  if (forum) forum.style.display = "none";
}

async function createPost() {
  console.log("createPost() called");
  const titleInput = document.getElementById("post-title");
  const contentInput = document.getElementById("post-content");

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const res = await fetch("/api/create-post", {
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

let socket;
let currentUserID = null;
let chatTo = null;

function connectWebSocket(userID) {
  socket = new WebSocket("ws://" + window.location.host + "/ws?user=" + userID);

  socket.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.type === "online_users") {
      updateOnlineUsers(data.users);
    } else if (data.from) {
      showIncomingMessage(data);
    }
  };

  socket.onclose = function () {
    console.log("WebSocket connection closed");
    document.getElementById("chat").style.display = "none";
  };
}

function updateOnlineUsers(users) {
  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";

  users.forEach((user) => {
    if (user.id !== currentUserID) {
      const btn = document.createElement("button");
      btn.className = "pill-button";
      btn.textContent = "Chat with " + user.nickname;
      btn.onclick = () => startChat(user.id, user.nickname);
      container.appendChild(btn);
    }
  });
}

function showIncomingMessage(data) {
  if (chatTo !== data.from) {
    const open = confirm("📨 New message received. Open chat?");
    if (open) {
      startChat(data.from, "Friend"); // Optional: resolve nickname by ID
    }
  }
  appendChatMessage("Them", data.content);
}

function sendMessage(to, content) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ to, content }));
  } else {
    alert("WebSocket not connected");
  }
}

function startChat(userId, nickname) {
  chatTo = userId;
  document.getElementById("chatWith").textContent = nickname;
  document.getElementById("chatMessages").innerHTML = "";
  document.getElementById("chat").style.display = "block";
}

function handleSendMessage() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message || !chatTo) return;

  sendMessage(chatTo, message);
  appendChatMessage("You", message);
  input.value = "";
}

function appendChatMessage(sender, text) {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}