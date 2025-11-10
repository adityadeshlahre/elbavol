package prompt

import "strings"

func GetPromptFromBackendMessage(message string) string {
	parts := strings.SplitN(message, "|", 2)
	if len(parts) != 2 {
		return ""
	}
	return parts[1]
}

func ParsePromptResponseMessage(message string) (string, string) { // this may need fix further
	sepIndex := strings.Index(message, "|")
	if sepIndex == -1 {
		return "", ""
	}
	header := strings.TrimSpace(message[:sepIndex])
	payload := strings.TrimSpace(message[sepIndex+1:])
	return header, payload
}
