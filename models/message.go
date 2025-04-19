package models

import "time"

type Message struct {
	ID        int       `json:"id"`
	FromUser  int       `json:"from_user"`
	ToUser    int       `json:"to_user"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}
