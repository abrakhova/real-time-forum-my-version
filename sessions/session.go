package sessions

import (
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

	// Save in-memory session
	sessionsMutex.Lock()
	sessions[sessionID] = user
	sessionsMutex.Unlock()
}

func GetUserFromSession(r *http.Request) (*models.User, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil, false
	}

	sessionsMutex.RLock()
	user, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		return nil, false
	}

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

	// Also remove from session map if exists
	// You could enhance this by checking if the cookie existed
}

func IsAuthenticated(r *http.Request) bool {
	_, ok := GetUserFromSession(r)
	return ok
}
