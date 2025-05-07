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
  
    const post_date = document.createElement("div");
    post_date.classList.add("post-date");
    post_date.textContent = new Date(post.created_at).toLocaleString();
  
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
    contentDiv.appendChild(post_date);
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