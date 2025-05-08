package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"real-time-forum/chat"
	"real-time-forum/database"
	"real-time-forum/sessions"
)

func UserlistHandler(w http.ResponseWriter, r *http.Request) {

	log.Println("userlist handler called") // to test posts creation
	user, ok := sessions.GetUserFromSession(r)
	if !ok {
		log.Println("Unauthorized attempt to create post")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID := user.ID
	// userID := 1

	// 🔽 Fetch all users from DB
	rows, err := database.DB.Query(
		`SELECT 
    u.id,
    u.nickname
FROM 
    users u
LEFT JOIN 
    messages m ON (m.from_user = u.id AND m.to_user = ?) 
               OR (m.from_user = ? AND m.to_user = u.id)
WHERE 
    u.id != ?
GROUP BY 
    u.id
ORDER BY 
    MAX(m.created_at) DESC NULLS LAST, 
    LOWER(u.nickname) ASC;`, userID, userID, userID)

	if err != nil {
		log.Println("DB error fetching users:", err) // Add this
		return                                       // handle error properly in production
	}
	defer rows.Close()

	var all []chat.SafeUserRef
	for rows.Next() {
		var user chat.SafeUserRef
		if err := rows.Scan(&user.ID, &user.Nickname); err == nil {
			all = append(all, user)
		} else {
			log.Println("Error scanning row:", err)
		}
	}

	// 🔽 Wrap both online and all users into one JSON message
	type Payload struct {
		Users []chat.SafeUserRef `json:"Users"`
	}

	msg := Payload{
		Users: all,
	}

	encoded, err := json.Marshal(msg)
	if err != nil {
		log.Println("Error encoding JSON:", err)
		http.Error(w, "Failed to encode JSON", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(encoded)
}
