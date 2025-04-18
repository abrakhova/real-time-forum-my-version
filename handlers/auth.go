package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"real-time-forum/database"
	"real-time-forum/models"
	"real-time-forum/sessions"
	"strconv"

	"golang.org/x/crypto/bcrypt"
)

func RegisterUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseForm(); err != nil {
		http.Error(w, "Invalid form", http.StatusBadRequest)
		return
	}

	user := models.User{
		Nickname:  r.FormValue("nickname"),
		Age:       parseInt(r.FormValue("age")),
		Gender:    r.FormValue("gender"),
		FirstName: r.FormValue("first_name"),
		LastName:  r.FormValue("last_name"),
		Email:     r.FormValue("email"),
		Password:  r.FormValue("password"),
	}

	// Validate required fields
	if user.Nickname == "" || user.Email == "" || user.Password == "" || user.FirstName == "" || user.LastName == "" || user.Gender == "" || user.Age <= 0 {
		http.Error(w, "All fields are required", http.StatusBadRequest)
		return
	}

	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Error hashing password", http.StatusInternalServerError)
		return
	}
	user.Password = string(hashedPwd)

	stmt := `
	INSERT INTO users (nickname, email, password, age, gender, first_name, last_name)
	VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	_, err = database.DB.Exec(stmt, user.Nickname, user.Email, user.Password, user.Age, user.Gender, user.FirstName, user.LastName)
	if err != nil {
		http.Error(w, "Failed to register user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "User registered successfully"})
}

func parseInt(s string) int {
	i, _ := strconv.Atoi(s)
	return i
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var creds struct {
		Identifier string `json:"identifier"` // nickname or email
		Password   string `json:"password"`
	}
	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	var user models.User
	row := database.DB.QueryRow(`
		SELECT id, nickname, email, password FROM users
		WHERE nickname = ? OR email = ?
	`, creds.Identifier, creds.Identifier)

	err = row.Scan(&user.ID, &user.Nickname, &user.Email, &user.Password)
	if err == sql.ErrNoRows {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(creds.Password))
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	sessions.SetSession(w, user)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "logged_in"})
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	sessions.ClearSession(w)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "logged_out"})
}

func ProtectedHandler(w http.ResponseWriter, r *http.Request) {
	user, ok := sessions.GetUserFromSession(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"message":  "Welcome, " + user.Nickname,
		"nickname": user.Nickname,
		"email":    user.Email,
	})
}
