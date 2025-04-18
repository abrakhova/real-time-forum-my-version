document.addEventListener("DOMContentLoaded", () => {
  checkAuth(); // Check session on page load
});

window.toggleView = function () {
  const login = document.getElementById("loginForm");
  const register = document.getElementById("registerForm");

  if (login.style.display === "none") {
    login.style.display = "block";
    register.style.display = "none";
  } else {
    login.style.display = "none";
    register.style.display = "block";
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
    body: formData
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
    body: JSON.stringify({ identifier, password })
  });

  if (res.ok) {
    const user = await res.json();
    connectWebSocket(user.id);
    showForum();
  } else {
    alert("Login failed");
  }
}

async function logout() {
  await fetch("/api/logout");
  socket?.close();
  showAuth();
}

function checkAuth() {
  fetch("/check-auth")
    .then(res => {
      if (!res.ok) throw new Error("Not logged in");
      return res.json();
    })
    .then(user => {
      console.log("Welcome back,", user.nickname);
      connectWebSocket(user.id);
      showForum();
    })
    .catch(() => {
      showAuth();
    });
}

function showForum() {
  //document.getElementById("auth").style.display = "none";
  document.getElementById("forum").style.display = "block";
  loadPosts();
}

function showAuth() {
  document.getElementById("auth").style.display = "block";
  document.getElementById("forum").style.display = "none";
}

async function createPost() {
  const titleInput = document.getElementById("post-title");
  const contentInput = document.getElementById("post-content");

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const res = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch("/api/posts");
  if (!res.ok) {
    alert("Failed to load posts");
    return;
  }

  const posts = await res.json();
  const postContainer = document.getElementById("postContainer");
  postContainer.innerHTML = "";

  posts.forEach(renderPost);
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
  const res = await fetch(`/api/comments?post_id=${postId}`);
  if (!res.ok) return;

  const comments = await res.json();
  const commentsContainer = document.getElementById(`comments-${postId}`);
  commentsContainer.innerHTML = "";

  comments.forEach(comment => {
    const p = document.createElement("p");
    p.textContent = comment.content;
    commentsContainer.appendChild(p);
  });
}

async function submitComment(event, postId) {
  event.preventDefault();
  const input = document.getElementById(`comment-input-${postId}`);
  const content = input.value.trim();
  if (!content) return;

  const res = await fetch("/api/comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: postId, content })
  });

  if (res.ok) {
    input.value = "";
    loadComments(postId);
  } else {
    alert("Failed to submit comment");
  }
}

// --- WebSocket ---

let socket;

function connectWebSocket(userID) {
  if (!userID) return;

  socket = new WebSocket(`ws://${window.location.host}/ws?user=${userID}`);

  socket.onopen = () => {
    console.log("WebSocket connected.");
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    alert(`Message from ${msg.from}: ${msg.content}`);
  };

  socket.onclose = () => {
    console.log("WebSocket closed. Reconnecting in 1s...");
    setTimeout(() => connectWebSocket(userID), 1000);
  };

  socket.onerror = (e) => {
    console.error("WebSocket error:", e);
  };
}

function sendMessage(to, content) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ to, content }));
  } else {
    alert("WebSocket not connected");
  }
}

let chatTo = null;

// Replace with your real logged-in user ID from server
const userID = "test-user"; // Change later to your real user identifier

connectWebSocket(); // Call this on auth success

function connectWebSocket() {
  socket = new WebSocket(`ws://${window.location.host}/ws?user=${userID}`);

  socket.onopen = () => {
    console.log("WebSocket connected");
    socket.send("Hello from frontend!");
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    // Show message in chat window if it's a direct message
    if (msg.from && msg.content) {
      appendChatMessage(msg.from, msg.content);
    }
  };

  socket.onclose = () => {
    console.log("WebSocket closed. Reconnecting in 1s...");
    setTimeout(connectWebSocket, 1000);
  };
}

function sendMessage(to, content) {
  socket.send(JSON.stringify({ to, content }));
}

function startChat(userId, nickname) {
  chatTo = userId;
  document.getElementById("chatWith").textContent = nickname;
  document.getElementById("chatMessages").innerHTML = ""; // Clear old messages
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