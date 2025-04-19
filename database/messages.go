package database

import "log"

func SaveMessage(fromUserID, toUserID, content string) {
	stmt := `INSERT INTO messages (from_user, to_user, content) VALUES (?, ?, ?)`
	_, err := DB.Exec(stmt, fromUserID, toUserID, content)
	if err != nil {
		log.Println("Failed to save message:", err)
	}
}
