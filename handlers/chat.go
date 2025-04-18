package handlers

import (
	"net/http"
	"real-time-forum/chat"
)

func ChatWebSocket(w http.ResponseWriter, r *http.Request) {
	/*user, ok := sessions.GetUserFromSession(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}*/

	chat.HandleWebSocket(w, r)
}
