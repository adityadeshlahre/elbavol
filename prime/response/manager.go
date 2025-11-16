package response

import (
	"log"
	"sync"
)

type ResponseManager struct {
	mu        sync.RWMutex
	responses map[string][]chan string
}

func NewResponseManager() *ResponseManager {
	return &ResponseManager{
		responses: make(map[string][]chan string),
	}
}

func (rm *ResponseManager) SetChannel(projectId string, ch chan string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.responses[projectId] = append(rm.responses[projectId], ch)
	log.Printf("Set response channel for project %s", projectId)
}

func (rm *ResponseManager) GetAndDelete(projectId string) (chan string, bool) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	chs, ok := rm.responses[projectId]
	if !ok || len(chs) == 0 {
		return nil, false
	}
	ch := chs[0]
	rm.responses[projectId] = chs[1:]
	if len(rm.responses[projectId]) == 0 {
		delete(rm.responses, projectId)
	}
	return ch, true
}

func (rm *ResponseManager) CleanupChannel(projectId string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if chs, ok := rm.responses[projectId]; ok && len(chs) > 0 {
		close(chs[0])
		rm.responses[projectId] = chs[1:]
		if len(rm.responses[projectId]) == 0 {
			delete(rm.responses, projectId)
		}
		log.Printf("Cleaned up channel for project %s", projectId)
	}
}

func (rm *ResponseManager) GetActiveChannelsCount() int {
	rm.mu.RLock()
	defer rm.mu.RUnlock()
	count := 0
	for _, chs := range rm.responses {
		count += len(chs)
	}
	return count
}
