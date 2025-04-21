package chat

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"

	"real-time-forum/database"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID       string
	Nickname string
	Conn     *websocket.Conn
	Send     chan []byte
}

type OnlineUsersMessage struct {
	Type  string        `json:"type"` // "online_users"
	Users []SafeUserRef `json:"users"`
}

type SafeUserRef struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
}

type Message struct {
	FromUserID string `json:"from"`
	ToUserID   string `json:"to"`
	Content    string `json:"content"`
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	clients   = make(map[string]*Client)
	clientsMu sync.Mutex
)

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user")
	if userID == "" {
		http.Error(w, "User ID required", http.StatusBadRequest)
		return
	}

	var nickname string
	err := database.DB.QueryRow("SELECT nickname FROM users WHERE id = ?", userID).Scan(&nickname)
	if err == sql.ErrNoRows {
		http.Error(w, "User not found", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "WebSocket upgrade failed", http.StatusInternalServerError)
		return
	}

	client := &Client{
		ID:       userID,
		Nickname: nickname,
		Conn:     conn,
		Send:     make(chan []byte),
	}

	clientsMu.Lock()
	clients[userID] = client
	clientsMu.Unlock()

	// Broadcast to others that a new user is online
	broadcastOnlineUsers()

	go readPump(client)
	go writePump(client)
}

func readPump(c *Client) {
	defer func() {
		clientsMu.Lock()
		delete(clients, c.ID)
		clientsMu.Unlock()

		c.Conn.Close()

		// Broadcast updated list after user leaves
		broadcastOnlineUsers()
	}()

	for {
		_, msg, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var chatMsg Message
		if err := json.Unmarshal(msg, &chatMsg); err != nil {
			continue
		}

		database.SaveMessage(chatMsg.FromUserID, chatMsg.ToUserID, chatMsg.Content)

		clientsMu.Lock()
		receiver, ok := clients[chatMsg.ToUserID]
		clientsMu.Unlock()

		if ok {
			encoded, _ := json.Marshal(chatMsg)
			receiver.Send <- encoded
		}
	}
}

func writePump(c *Client) {
	defer func() {
		c.Conn.Close()
	}()

	for msg := range c.Send {
		err := c.Conn.WriteMessage(websocket.TextMessage, msg)
		if err != nil {
			break
		}
	}
}

func broadcastOnlineUsers() {
	clientsMu.Lock()
	defer clientsMu.Unlock()

	var online []SafeUserRef
	for _, client := range clients {
		online = append(online, SafeUserRef{
			ID:       client.ID,
			Nickname: client.Nickname,
		})
	}

	msg := OnlineUsersMessage{
		Type:  "online_users",
		Users: online,
	}

	data, _ := json.Marshal(msg)
	for _, client := range clients {
		// Send in a goroutine to avoid blocking others
		go func(c *Client) {
			c.Send <- data
		}(client)
	}
}
