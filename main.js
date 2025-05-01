//let chatTo = null;
let currentUserID=null;
let currentPage = 0;
const messagesPerPage = 10;
let isLoadingMessages = false;

document.addEventListener("DOMContentLoaded", () => {
  // Set global variables from hidden input fields
  const input = document.getElementById("currentUserID");
  if (input) {
    currentUserID = input.value;
  }
  window.currentUserNickname = document.getElementById("currentUserNickname")?.value;
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

let socket;
//let currentUserID = null;
let chatTo = null;
let currentChatUserId = null;
let chatHistory = {}; // ✅ Stores messages by userId

function connectWebSocket(userID) {
  socket = new WebSocket("ws://" + window.location.host + "/ws?user=" + userID);

  socket.onopen = function() {
    console.log("WebSocket connection established!"); // Log connection status
  };

  socket.onmessage = function (event) {
    console.log("📡 Raw WebSocket event:", event.data); // Add this line
  
    const data = JSON.parse(event.data);
  
    if (data.type === "online_users") {
      updateOnlineUsers(data.users);
    } else if (data.type === "newMessage") {
      // Append the incoming message to the chat if relevant
      if (
        currentChatUserId && (
          data.payload.from_user === currentChatUserId ||
          data.payload.to_user === currentChatUserId
        )
      ) {
        renderMessages([data.payload], true); // true = append
      }
    } else if (data.from) {
      // Optional: legacy message handling fallback
      handleIncomingMessage(data);
    }
  };

  socket.onclose = function () {
    console.log("WebSocket connection closed"); // Log when connection closes
    document.getElementById("chat").style.display = "none";
  };
}

let onlineUsers = [];

function updateOnlineUsers(users) {
  onlineUsers = users; // ✅ Save the list globally for later reference

  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";

  // Create an unordered list element
  const userList = document.createElement("ul");

  users.forEach((user) => {
    if (user.id !== currentUserID) {
      // Create a list item
      const listItem = document.createElement("li");

      // Create a button
      const btn = document.createElement("button");
      btn.className = "pill-button";
      btn.textContent = user.nickname;
      btn.id = `chat-user-${user.id}`;
      btn.onclick = () => {
        openChatWith(user.id, user.nickname);
        clearNotification(user.id);
      }; // Properly close the onclick function

      // Append the button to the list item
      listItem.appendChild(btn);

      // Append the list item to the unordered list
      userList.appendChild(listItem);
    }
  });

  // Append the user list to the container
  container.appendChild(userList);
}

function handleIncomingMessage(data) {
  console.log("📥 Received message data:", data);

  // ✅ Ignore own message when it echoes back
  if (data.from == currentUserID) {
    console.log("🚫 Ignoring self-sent message.");
    return;
  }

  const message = {
    SenderID: data.from,
    ReceiverID: data.to,
    Content: data.content,
    Timestamp: data.timestamp, // ✅ Use timestamp sent from backend
    SenderNickname: getNicknameById(data.from)
  };

  if (!chatHistory[data.from]) {
    console.log("🗃️ Creating new history for user:", data.from);
    chatHistory[data.from] = [];
  }
  chatHistory[data.from].push(message);
  console.log("💾 Message stored. Chat history with user", data.from, "now has", chatHistory[data.from].length, "messages.");

  console.log("📌 Currently chatting with user ID:", chatTo);
  console.log("📨 Incoming message is from user ID:", data.from);

  if (chatTo !== data.from) {
    console.log("✨ Not currently chatting with this user. Highlighting their name.");
    highlightUserInSidebar(data.from);
    return;
  }

  console.log("📝 Appending message to open chat:", message);
  appendChatMessage(message);
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

function sendMessage(to, content) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const timestamp = new Date().toISOString(); // Current timestamp when sending a message
    const message = {
      SenderID: currentUserID,
      ReceiverID: to,
      Content: content,
      timestamp: timestamp // Add timestamp to the message object
    };

    socket.send(JSON.stringify({ to, content, timestamp }));

    // ✅ Save to chat history
    if (!chatHistory[to]) {
      chatHistory[to] = [];
    }
    chatHistory[to].push(message);

    appendChatMessage(message);
  } else {
    console.log("WebSocket state:", socket.readyState); // Log socket state
    alert("WebSocket not connected");
  }
}

function openChatWith(userId, nickname) {
  chatTo = userId;
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

async function loadMoreMessages(userId) {
  isLoadingMessages = true;

  const chatBox = document.getElementById("chat-box");
  const previousScrollHeight = chatBox.scrollHeight;

  const res = await fetch(`/api/messages?with=${userId}&page=${currentPage}&limit=${messagesPerPage}`, {
    credentials: "include"
  });

  if (!res.ok) {
    console.warn("Failed to fetch chat history");
    isLoadingMessages = false;
    return;
  }

  const messages = await res.json();
  if (messages.length === 0) {
    isLoadingMessages = false;
    return; // No more messages to load
  }

  messages.forEach(msg => {
    const message = {
      SenderID: msg.sender_id,
      ReceiverID: msg.receiver_id,
      Content: msg.content,
      Timestamp: new Date(msg.timestamp).toLocaleString(),
      SenderNickname: getNicknameById(msg.sender_id) || "Unknown"
    };
    appendChatMessage(message); 
  });

  currentPage++; // Prepare for next batch
  isLoadingMessages = false;

  // Maintain scroll position
  chatBox.scrollTop = chatBox.scrollHeight - previousScrollHeight;
}

function loadMessagesPage(userId, page, append) {
  const offset = page * 10;
  return fetch(`/api/messages?from=${currentUserID}&to=${userId}&offset=${offset}`)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    })
    .then((messages) => {
      renderMessages(messages, append);
    })
    .catch((err) => {
      console.error("Failed to load messages:", err);
    });
}

function handleSendMessage() {
  const messageInput = document.getElementById("chatInput");
  const messageContent = messageInput.value.trim();

  if (!messageContent) return;

  const newMessage = {
    from_user: currentUserID,
    from_user_nickname: currentUserNickname, // Ensure this is globally available
    to_user: currentChatUserId,
    content: messageContent,
    created_at: new Date().toISOString(),
  };

  // Send the message through WebSocket
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(newMessage));
  }

  // Render it locally immediately (optimistic UI)
  renderMessages([newMessage], true); // append = true

  messageInput.value = '';
  messageInput.focus();
}

function appendChatMessage(message, prepend = false) {
  const chatMessages = document.getElementById("chatMessages");

  const isCurrentChat =
    (message.SenderID === currentChatUserId && message.ReceiverID === currentUserID) ||
    (message.SenderID === currentUserID && message.ReceiverID === currentChatUserId);

  if (!isCurrentChat) {
    return;
  }

  const isFromCurrentUser = message.SenderID === currentUserID;

  const messageEl = document.createElement("div");
  messageEl.className = isFromCurrentUser ? "chat-msg self" : "chat-msg other";

  const senderLabel = document.createElement("span");
  senderLabel.className = isFromCurrentUser ? "me" : "other-user";

  let timestamp = new Date(message.timestamp);
  if (isNaN(timestamp)) timestamp = new Date();

  const formattedTimestamp = timestamp.toLocaleString();
  const nickname = getNicknameById(message.SenderID) || "User";
  senderLabel.textContent = isFromCurrentUser
    ? `Me: ${formattedTimestamp}`
    : `${nickname}: ${formattedTimestamp}`;

  const contentSpan = document.createElement("span");
  contentSpan.textContent = message.Content;

  messageEl.appendChild(senderLabel);
  messageEl.appendChild(contentSpan);

  if (prepend) {
    chatMessages.insertBefore(messageEl, chatMessages.firstChild);
  } else {
    chatMessages.appendChild(messageEl);
    scrollChatToBottom();
  }
}

function prependChatMessage(msg) {
  const chatBox = document.getElementById("chat-box");

  const p = document.createElement("p");
  p.textContent = `${msg.SenderNickname}: ${msg.Content}`;
  p.className = msg.SenderID === currentUserID ? "chat-message me" : "chat-message them";

  chatBox.prepend(p);
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

function scrollChatToBottom() {
  const chatMessages = document.getElementById("chatMessages");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function openChatModal(username) {
  document.getElementById("chatWith").textContent = username;
  document.getElementById("chatModal").style.display = "flex";
}

function closeChatModal() {
  document.getElementById("chatModal").style.display = "none";
}

function renderOnlineUsers(users) {
  const container = document.getElementById("onlineUsers");
  container.innerHTML = "";
  users.forEach(user => {
    const userDiv = document.createElement("div");
    userDiv.textContent = user.nickname;
    userDiv.onclick = () => openChatModal(user.nickname);
    container.appendChild(userDiv);
  });
}

let messageOffset = 0;
let isLoading = false;
let selectedUserId = null;

async function loadMessages(userId, offset = 0) {
  isLoading = true;
  const res = await fetch(`/messages?from=${currentUserId}&to=${userId}&offset=${offset}`);
  const messages = await res.json();

  const container = document.querySelector("#message-container");

  // Reverse the order of messages so that oldest comes first
  messages.reverse().forEach(msg => {
    const msgEl = document.createElement("div");
    msgEl.textContent = `${msg.from === currentUserId ? "You" : "Them"}: ${msg.content}`;
    container.prepend(msgEl); // Prepend for loading history (oldest first)
  });

  if (messages.length > 0) {
    messageOffset += 10; // Increase offset for the next batch of messages
  }
  isLoading = false;
}

document.querySelectorAll(".user-list-item").forEach(item => {
  item.addEventListener("click", () => {
    selectedUserId = item.dataset.userid;
    messageOffset = 0;
    document.querySelector("#message-container").innerHTML = ""; // Clear previous messages
    loadMessages(selectedUserId);
  });
});

// Throttled scroll handler for loading more messages when scrolling up
let lastCall = 0;
document.querySelector("#message-container").addEventListener("scroll", () => {
  const container = document.querySelector("#message-container");
  if (container.scrollTop < 50 && !isLoading) {
    const now = Date.now();
    if (now - lastCall > 500) { // throttle 500ms
      loadMessages(selectedUserId, messageOffset);
      lastCall = now;
    }
  }
});

async function fetchChatHistory(userId, page = 0) {
  isLoadingMessages = true;
  try {
    const res = await fetch(`/api/messages?with=${userId}&page=${page}&limit=${messagesPerPage}`, {
      credentials: "include"
    });

    if (res.ok) {
      const messages = await res.json();
      const isInitialLoad = page === 0;

      if (!chatHistory[userId]) chatHistory[userId] = [];

      if (isInitialLoad) {
        chatHistory[userId] = messages;
      } else {
        chatHistory[userId] = [...messages, ...chatHistory[userId]];
      }

      renderMessages(chatHistory[userId], !isInitialLoad);

      if (isInitialLoad) scrollToBottom();
    } else {
      console.error("Failed to load messages:", await res.text());
    }
  } catch (err) {
    console.error("Error loading messages:", err);
  } finally {
    isLoadingMessages = false;
  }
}

function renderMessages(messages, append = false) {
  const chatBox = document.getElementById("chatMessages");
  if (!chatBox) return;

  const elements = messages.map((msg) => {
    const div = document.createElement("div");
    div.className = msg.from_user === currentUserID ? "chat-message sent" : "chat-message received";

    const timestamp = new Date(msg.created_at).toLocaleString();
    const sender = document.createElement("div");
    sender.className = "chat-meta";
    sender.innerHTML = `<strong>${msg.from_user_nickname}</strong> • <span style="color: gray; font-size: 0.75em;">${timestamp}</span>`;

    const content = document.createElement("div");
    content.className = "chat-text";
    content.textContent = msg.content;

    div.appendChild(sender);
    div.appendChild(content);

    return div;
  });

  if (append) {
    const oldScrollHeight = chatBox.scrollHeight;
    elements.forEach((el) => chatBox.insertBefore(el, chatBox.firstChild));
    const newScrollHeight = chatBox.scrollHeight;
    chatBox.scrollTop += newScrollHeight - oldScrollHeight; // preserve scroll position
  } else {
    chatBox.innerHTML = "";
    elements.forEach((el) => chatBox.appendChild(el));
  }
}

function scrollToBottom() {
  const chatBox = document.getElementById("chatMessages");
  chatBox.scrollTop = chatBox.scrollHeight;
}