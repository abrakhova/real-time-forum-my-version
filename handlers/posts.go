package handlers

import (
	"encoding/json"
	"net/http"
	"real-time-forum/database"
	"real-time-forum/models"
	"real-time-forum/sessions"
)

func CreatePostHandler(w http.ResponseWriter, r *http.Request) {
	user, ok := sessions.GetUserFromSession(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var post models.Post
	if err := json.NewDecoder(r.Body).Decode(&post); err != nil {
		http.Error(w, "Invalid post data", http.StatusBadRequest)
		return
	}

	post.UserID = user.ID

	stmt := `INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)`
	result, err := database.DB.Exec(stmt, post.UserID, post.Title, post.Content)
	if err != nil {
		http.Error(w, "Failed to create post", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	post.ID = int(id)

	json.NewEncoder(w).Encode(post)
}

func GetPostsHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT posts.id, posts.title, posts.content, posts.created_at, users.nickname
		FROM posts
		INNER JOIN users ON posts.user_id = users.id
		ORDER BY posts.created_at DESC
	`)
	if err != nil {
		http.Error(w, "Failed to fetch posts", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var posts []models.PostResponse
	for rows.Next() {
		var p models.PostResponse
		err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.CreatedAt, &p.Author)
		if err != nil {
			http.Error(w, "Failed to scan post", http.StatusInternalServerError)
			return
		}
		posts = append(posts, p)
	}

	json.NewEncoder(w).Encode(posts)
}
