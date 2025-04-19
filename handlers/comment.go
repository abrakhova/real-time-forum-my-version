package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"real-time-forum/database"
	"real-time-forum/models"
	"real-time-forum/sessions"
)

func CreateCommentHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	log.Println("Session cookie value:", cookie.Value)
	user, ok := sessions.GetUserFromSession(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var comment models.Comment
	if err := json.NewDecoder(r.Body).Decode(&comment); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	stmt := `INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)`
	_, err = database.DB.Exec(stmt, comment.PostID, user.ID, comment.Content)
	if err != nil {
		http.Error(w, "Failed to insert comment", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "comment added"})
}

func GetCommentsHandler(w http.ResponseWriter, r *http.Request) {
	postID := r.URL.Query().Get("post_id")
	if postID == "" {
		http.Error(w, "Missing post_id", http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, post_id, user_id, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC
	`, postID)
	if err != nil {
		http.Error(w, "Failed to query comments", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	comments := make([]models.Comment, 0) // ✅ always non-nil
	for rows.Next() {
		var c models.Comment
		if err := rows.Scan(&c.ID, &c.PostID, &c.UserID, &c.Content, &c.CreatedAt); err != nil {
			continue
		}
		comments = append(comments, c)
	}

	json.NewEncoder(w).Encode(comments)
}
