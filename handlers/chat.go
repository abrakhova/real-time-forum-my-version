package handlers

import (
	"log"
	"net/http"
	"real-time-forum/chat"
	"real-time-forum/database" // ⬅️ Make sure to import this
)

func ChatWebSocket(w http.ResponseWriter, r *http.Request) {
	// Optional: check if user is authenticated
	// user, ok := sessions.GetUserFromSession(r)
	// if !ok {
	// 	http.Error(w, "Unauthorized", http.StatusUnauthorized)
	// 	return
	// }

	chat.HandleWebSocket(w, r)
}

func SaveMessage(fromUserID, toUserID, content string) {
	stmt := `INSERT INTO messages (from_user, to_user, content) VALUES (?, ?, ?)`
	_, err := database.DB.Exec(stmt, fromUserID, toUserID, content) // ✅ Use database.DB
	if err != nil {
		log.Println("Failed to save message:", err)
	}
}
