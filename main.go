package main

import (
	"log"
	"net/http"
	"real-time-forum/database"
	"real-time-forum/handlers"
)

func main() {
	database.InitDB("forum.db")

	mux := http.NewServeMux()

	// Serve index.html
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})

	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))

	// Serve JS files
	fs := http.FileServer(http.Dir("."))
	mux.Handle("/main.js", fs)

	// API routes
	mux.HandleFunc("/api/register", handlers.RegisterUser)
	mux.HandleFunc("/api/login", handlers.LoginHandler)
	mux.HandleFunc("/api/logout", handlers.LogoutHandler)
	mux.HandleFunc("/check-auth", handlers.ProtectedHandler)
	mux.HandleFunc("/api/comment", handlers.CreateCommentHandler)
	mux.HandleFunc("/api/comments", handlers.GetCommentsHandler)
	mux.HandleFunc("/api/posts", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			handlers.CreatePostHandler(w, r)
		} else if r.Method == http.MethodGet {
			handlers.GetPostsHandler(w, r)
		} else {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/ws", handlers.ChatWebSocket)
	mux.HandleFunc("/api/messages", handlers.GetMessagesHandler)
	log.Println("Starting server on http://localhost:8080/")
	err := http.ListenAndServe(":8080", mux)
	if err != nil {
		log.Fatal(err)
	}
}
