package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"real-time-forum/database"
	"real-time-forum/models"
	"real-time-forum/sessions"
)

func CreatePostHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("CreatePostHandler called") // to test posts creation
	user, ok := sessions.GetUserFromSession(r)
	if !ok {
		log.Println("Unauthorized attempt to create post")
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
		log.Println("DB error creating post:", err) // Add this
		http.Error(w, "Failed to create post", http.StatusInternalServerError)
		return
	}

	id, _ := result.LastInsertId()
	post.ID = int(id)

	json.NewEncoder(w).Encode(post)
}

func GetPostsHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("GetPostsHandler called")
	w.Header().Set("Content-Type", "application/json") // Add this

	// Always initialize the slice to avoid returning null
	posts := []models.PostResponse{}

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

	for rows.Next() {
		var p models.PostResponse
		err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.CreatedAt, &p.Author)
		if err != nil {
			http.Error(w, "Failed to scan post", http.StatusInternalServerError)
			log.Println("Error scanning post:", err)
			continue // Skip bad row, but continue sending others
		}
		posts = append(posts, p)
	}

	// Now it's always either [] or [items], never null
	json.NewEncoder(w).Encode(posts)
}
