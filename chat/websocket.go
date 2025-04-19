package chat

import (
	"encoding/json"
	"net/http"
	"sync"

	"real-time-forum/database"

	"github.com/gorilla/websocket"
)

type Client struct {
	ID   string
	Conn *websocket.Conn
	Send chan []byte
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

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "WebSocket upgrade failed", http.StatusInternalServerError)
		return
	}

	client := &Client{
		ID:   userID,
		Conn: conn,
		Send: make(chan []byte),
	}

	clientsMu.Lock()
	clients[userID] = client
	clientsMu.Unlock()

	go readPump(client)
	go writePump(client)
}

func readPump(c *Client) {
	defer func() {
		clientsMu.Lock()
		delete(clients, c.ID)
		clientsMu.Unlock()
		c.Conn.Close()
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
	for msg := range c.Send {
		err := c.Conn.WriteMessage(websocket.TextMessage, msg)
		if err != nil {
			break
		}
	}
}
