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
	FromUser   string    `json:"from_user_nickname"` // <-- ADD THIS!
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

		var chatMsg Message
		if err := json.Unmarshal(msg, &chatMsg); err != nil {
			continue
		}

		// Set the timestamp for the message
		chatMsg.FromUserID = c.ID
		chatMsg.FromUser = c.Nickname
		chatMsg.CreatedAt = time.Now() // Set the current time as the timestamp

		// Save to DB
		database.SaveMessage(chatMsg.FromUserID, chatMsg.ToUserID, chatMsg.Content)

		// Wrap the message into an envelope for sending
		envelope := struct {
			Type    string  `json:"type"`
			Payload Message `json:"payload"`
		}{
			Type:    "newMessage",
			Payload: chatMsg, // Include the full message with the timestamp
		}

		encoded, err := json.Marshal(envelope)
		if err != nil {
			continue
		}

		// Send the message to the intended recipient and the sender
		clientsMu.Lock()
		if receiver, ok := clients[chatMsg.ToUserID]; ok {
			receiver.Send <- encoded
		}
		if sender, ok := clients[chatMsg.FromUserID]; ok {
			sender.Send <- encoded
		}
		clientsMu.Unlock()
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

	// 🔽 Fetch all users from DB
	rows, err := database.DB.Query("SELECT id, nickname FROM users")
	if err != nil {
		return // handle error properly in production
	}
	defer rows.Close()

	var all []SafeUserRef
	for rows.Next() {
		var user SafeUserRef
		if err := rows.Scan(&user.ID, &user.Nickname); err == nil {
			all = append(all, user)
		}
	}

	// 🔽 Wrap both online and all users into one JSON message
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

	// 🔽 Send it to all connected clients
	for _, client := range clients {
		go func(c *Client) {
			c.Send <- data
		}(client)
	}
}
