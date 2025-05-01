package database

import (
	"log"
	"real-time-forum/models"
)

// SaveMessage inserts a new message into the database.
func SaveMessage(fromUserID, toUserID int, content string) {
	stmt := `
		INSERT INTO messages (from_user, to_user, content)
		VALUES (?, ?, ?)
	`

	_, err := DB.Exec(stmt, fromUserID, toUserID, content)
	if err != nil {
		log.Printf("❌ Failed to save message from %d to %d: %v", fromUserID, toUserID, err)
	}
}

// GetMessagesBetweenUsers retrieves chat messages between two users with pagination.
func GetMessagesBetweenUsers(fromUserID, toUserID, offset, limit int) ([]models.Message, error) {
	query := `
		SELECT id, from_user, to_user, content, timestamp
		FROM messages
		WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
		ORDER BY timestamp ASC
		LIMIT ? OFFSET ?
	`

	rows, err := DB.Query(query, fromUserID, toUserID, toUserID, fromUserID, limit, offset)
	if err != nil {
		log.Printf("❌ Failed to query messages between %d and %d: %v", fromUserID, toUserID, err)
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		if err := rows.Scan(&msg.ID, &msg.FromUser, &msg.ToUser, &msg.Content, &msg.CreatedAt); err != nil {
			log.Println("❌ Failed to scan message row:", err)
			return nil, err
		}
		messages = append(messages, msg)
	}

	return messages, nil
}
