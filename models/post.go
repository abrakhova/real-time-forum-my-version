package models

type Post struct {
	ID      int    `json:"id"`
	UserID  int    `json:"-"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

type PostResponse struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Author    string `json:"author"`
	CreatedAt string `json:"created_at"`
}
