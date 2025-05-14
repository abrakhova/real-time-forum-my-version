// --- WebSocket & Chat ---
let typingTimeout = null;

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
          renderMessages(chatHistory[currentChatUserId], true);
        } 
        highlightUserInSidebar(data.payload.from_user);
      } else if (data.type === "typing") {
        const typingIndicator = document.getElementById("typing-indicator");
        const typingText = document.getElementById("typing-text");
        if (typingIndicator && typingText && data.from_user === currentChatUserId) {
          (async () => {
            try {
              const nickname = await getNicknameById(data.from_user);
              typingText.textContent = `${nickname} is typing`;
              typingIndicator.style.display = data.isTyping ? "flex" : "none";
            } catch (err) {
              console.error("Failed to get nickname:", err);
            }
          })();
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
      const users = await res.json();
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
  
    allUsers.forEach((user) => {
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
  
        const isOnline = onlineUsers.some(u => u.id === user.id);
  
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

    const typingIndicator = document.getElementById("typing-indicator");
    if (typingIndicator) {
      typingIndicator.style.display = "none";
    }
}

async function loadMessagesPage(userId, page, append) {
    let offset = page * messagesPerPage;

    try {
      const res = await fetch(`/api/messages?from=${currentUserID}&to=${userId}&offset=${offset}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const messages = await res.json();
  
      if (messages) {
        if (append) {
          chatHistory[userId] = [...messages, ...chatHistory[userId]];
        } else {
          chatHistory[userId] = messages;
        }
  
        chatHistory[userId].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        console.log("rendering", messages.length, "messages from loadMessagesPage()");
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
      type: "newMessage",
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
    stopTyping();
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
    stopTyping();
}

function handleTyping() {
    if (!currentChatUserId || !socket || socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify({
      type: "typing",
      to_user: currentChatUserId,
      isTyping: true
    }));

    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    typingTimeout = setTimeout(() => {
      socket.send(JSON.stringify({
        type: "typing",
        to_user: currentChatUserId,
        isTyping: false
      }));
    }, 1000);
}

function stopTyping() {
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    if (currentChatUserId && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "typing",
        to_user: currentChatUserId,
        isTyping: false
      }));
    }
}

document.getElementById("chatInput").addEventListener("input", handleTyping);
document.getElementById("chatInput").addEventListener("blur", stopTyping);