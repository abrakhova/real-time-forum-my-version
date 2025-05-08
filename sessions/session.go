package sessions

import (
	"log"
	"net/http"
	"real-time-forum/models"
	"sync"
	"time"

	"github.com/google/uuid"
)

var (
	sessions      = make(map[string]models.User)
	sessionsMutex sync.RWMutex
)

const sessionCookieName = "session_id"

func SetSession(w http.ResponseWriter, user models.User) {
	sessionID := uuid.NewString()

	// Set the cookie
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(24 * time.Hour),
	})

	log.Println("Setting session for user:", user.ID, "with session ID:", sessionID)
	// Save in-memory session
	sessionsMutex.Lock()
	sessions[sessionID] = user
	sessionsMutex.Unlock()
}

func GetUserFromSession(r *http.Request) (*models.User, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		log.Println("[Session] No session cookie found")
		return nil, false
	}

	log.Println("[Session] Found session cookie:", cookie.Value)

	sessionsMutex.RLock()
	user, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		log.Println("[Session] Session ID not found in memory:", cookie.Value)
		return nil, false
	}

	log.Printf("[Session] Session found for user ID: %d (nickname: %s)\n", user.ID, user.Nickname)
	return &user, true
}
func ClearSession(w http.ResponseWriter) {
	// Clear cookie on the client
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

}

func IsAuthenticated(r *http.Request) bool {
	_, ok := GetUserFromSession(r)
	return ok
}
