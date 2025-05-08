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

	stmt := `INSERT INTO posts (user_id, title, content, category) VALUES (?, ?, ?, ?)`
	result, err := database.DB.Exec(stmt, post.UserID, post.Title, post.Content, post.Category)
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
	w.Header().Set("Content-Type", "application/json")

	// Initialize the posts slice
	posts := []models.PostResponse{}

	// Get the category query parameter
	category := r.URL.Query().Get("category")
	query := `
        SELECT posts.id, posts.title, posts.content, posts.created_at, posts.category, users.nickname
        FROM posts
        INNER JOIN users ON posts.user_id = users.id
    `
	var args []interface{}

	// Modify query based on category filter
	if category != "" {
		query += ` WHERE posts.category = $1`
		args = append(args, category)
	}
	query += ` ORDER BY posts.created_at DESC`

	// Execute the query
	rows, err := database.DB.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to fetch posts", http.StatusInternalServerError)
		log.Println("Error querying posts:", err)
		return
	}
	defer rows.Close()

	// Scan the results
	for rows.Next() {
		var p models.PostResponse
		err := rows.Scan(&p.ID, &p.Title, &p.Content, &p.CreatedAt, &p.Category, &p.Author)
		if err != nil {
			log.Println("Error scanning post:", err)
			continue // Skip bad row, continue with others
		}
		posts = append(posts, p)
	}

	// Check for errors from iterating over rows
	if err := rows.Err(); err != nil {
		http.Error(w, "Error processing posts", http.StatusInternalServerError)
		log.Println("Error iterating rows:", err)
		return
	}

	// Encode and send the response
	json.NewEncoder(w).Encode(posts)
}
