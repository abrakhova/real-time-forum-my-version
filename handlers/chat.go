package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"real-time-forum/chat"
	"real-time-forum/database"
	"strconv"
)

func ChatWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Println("🔌 Incoming request to /ws/chat with:", r.URL.RawQuery)
	chat.HandleWebSocket(w, r)
}

func GetChatHistory(w http.ResponseWriter, r *http.Request) {
	fromIDStr := r.URL.Query().Get("from")
	toIDStr := r.URL.Query().Get("to")
	offsetStr := r.URL.Query().Get("offset")

	fromID, err := strconv.Atoi(fromIDStr)
	if err != nil {
		http.Error(w, "Invalid from ID", http.StatusBadRequest)
		return
	}

	toID, err := strconv.Atoi(toIDStr)
	if err != nil {
		http.Error(w, "Invalid to ID", http.StatusBadRequest)
		return
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil {
		http.Error(w, "Invalid offset", http.StatusBadRequest)
		return
	}

	messages, err := database.GetMessagesBetweenUsers(fromID, toID, offset, 10)
	if err != nil {
		http.Error(w, "Error fetching messages", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func GetMessagesHandler(w http.ResponseWriter, r *http.Request) {
	fromID := r.URL.Query().Get("from")
	toID := r.URL.Query().Get("to")

	if fromID == "" || toID == "" {
		http.Error(w, "Missing parameters", http.StatusBadRequest)
		return
	}

	offsetStr := r.URL.Query().Get("offset")
	offset, err := strconv.Atoi(offsetStr)
	if err != nil {
		http.Error(w, "Invalid offset", http.StatusBadRequest)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	query := `
	SELECT m.from_user, m.to_user, m.content, m.created_at, u.nickname
	FROM messages m
	JOIN users u ON m.from_user = u.id
	WHERE (m.from_user = ? AND m.to_user = ?) OR (m.from_user = ? AND m.to_user = ?)
	ORDER BY m.created_at DESC
	LIMIT ? OFFSET ?
	`

	rows, err := database.DB.Query(query, fromID, toID, toID, fromID, limit, offset)
	if err != nil {
		http.Error(w, "Failed to get messages", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []chat.Message
	for rows.Next() {
		var m chat.Message
		if err := rows.Scan(&m.FromUserID, &m.ToUserID, &m.Content, &m.CreatedAt, &m.FromUser); err == nil {
			messages = append(messages, m)
		}
	}

	// Reverse the messages so the oldest is first
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}
