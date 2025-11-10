package response

import (
	"log"
	"sync"
)

type ResponseManager struct {
	mu        sync.RWMutex
	responses map[string]chan string
}

func NewResponseManager() *ResponseManager {
	return &ResponseManager{
		responses: make(map[string]chan string),
	}
}

func (rm *ResponseManager) SetChannel(projectId string, ch chan string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.responses[projectId] = ch
	log.Printf("Set response channel for project %s", projectId)
}

func (rm *ResponseManager) GetAndDelete(projectId string) (chan string, bool) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	ch, ok := rm.responses[projectId]
	if ok {
		delete(rm.responses, projectId)
	}
	return ch, ok
}

func (rm *ResponseManager) CleanupChannel(projectId string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if ch, ok := rm.responses[projectId]; ok {
		close(ch)
		delete(rm.responses, projectId)
		log.Printf("Cleaned up channel for project %s", projectId)
	}
}

func (rm *ResponseManager) GetActiveChannelsCount() int {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	return len(rm.responses)
}
