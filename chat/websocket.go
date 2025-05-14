package chat

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"real-time-forum/database"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID       int
	Nickname string
	Conn     *websocket.Conn
	Send     chan []byte
}

type OnlineUsersMessage struct {
	Type  string        `json:"type"` // "online_users"
	Users []SafeUserRef `json:"users"`
}

type SafeUserRef struct {
	ID       int    `json:"id"`
	Nickname string `json:"nickname"`
}

type Message struct {
	FromUserID int       `json:"from_user"`
	ToUserID   int       `json:"to_user"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
	FromUser   string    `json:"from_user_nickname"`
}

type TypingMessage struct {
	Type       string `json:"type"` // "typing"
	FromUser   string `json:"from_user_nickname"`
	ToUserID   int    `json:"to_user"`
	IsTyping   bool   `json:"isTyping"`
	FromUserID int    `json:"from_user"`
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	clients   = make(map[int]*Client)
	clientsMu sync.Mutex
)

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("user")
	if userIDStr == "" {
		http.Error(w, "User ID required", http.StatusBadRequest)
		return
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var nickname string
	err = database.DB.QueryRow("SELECT nickname FROM users WHERE id = ?", userID).Scan(&nickname)
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
		broadcastOnlineUsers()
	}()

	for {
		_, msg, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var incoming map[string]interface{}
		if err := json.Unmarshal(msg, &incoming); err != nil {
			continue
		}

		switch incoming["type"] {
		case "newMessage":
			var chatMsg Message
			if err := json.Unmarshal(msg, &chatMsg); err != nil {
				continue
			}
			chatMsg.FromUserID = c.ID
			chatMsg.FromUser = c.Nickname
			chatMsg.CreatedAt = time.Now()

			database.SaveMessage(chatMsg.FromUserID, chatMsg.ToUserID, chatMsg.Content)
			broadcastOnlineUsers()

			time.Sleep(50 * time.Millisecond)

			envelope := struct {
				Type    string  `json:"type"`
				Payload Message `json:"payload"`
			}{
				Type:    "newMessage",
				Payload: chatMsg,
			}

			encoded, err := json.Marshal(envelope)
			if err != nil {
				continue
			}

			clientsMu.Lock()
			if receiver, ok := clients[chatMsg.ToUserID]; ok {
				receiver.Send <- encoded
			}
			if sender, ok := clients[chatMsg.FromUserID]; ok {
				sender.Send <- encoded
			}
			clientsMu.Unlock()

		case "typing":
			var typingMsg TypingMessage
			if err := json.Unmarshal(msg, &typingMsg); err != nil {
				continue
			}
			typingMsg.FromUserID = c.ID
			typingMsg.FromUser = c.Nickname

			encoded, err := json.Marshal(typingMsg)
			if err != nil {
				continue
			}

			clientsMu.Lock()
			if receiver, ok := clients[typingMsg.ToUserID]; ok {
				receiver.Send <- encoded
			}
			clientsMu.Unlock()
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

	rows, err := database.DB.Query("SELECT id, nickname FROM users")
	if err != nil {
		return
	}
	defer rows.Close()

	var all []SafeUserRef
	for rows.Next() {
		var user SafeUserRef
		if err := rows.Scan(&user.ID, &user.Nickname); err == nil {
			all = append(all, user)
		}
	}

	type Payload struct {
		Type        string        `json:"type"`
		OnlineUsers []SafeUserRef `json:"onlineUsers"`
		AllUsers    []SafeUserRef `json:"allUsers"`
	}

	msg := Payload{
		Type:        "online_users",
		OnlineUsers: online,
		AllUsers:    all,
	}

	data, _ := json.Marshal(msg)

	for _, client := range clients {
		go func(c *Client) {
			c.Send <- data
		}(client)
	}
}
