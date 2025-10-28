package handlers


func CreateProjectHandler(projectId string) {
	// create projectId.txt file for storing conversation history
	// send message to brocker via pubsub to create a pod for this projectId

}

func GetProjectByIdHandler(projectId string) {
	// read projectId.txt file and return conversation history
}

func DeleteProjectHandler(projectId string) {
	// delete projectId.txt file
	// send message to brocker via pubsub to delete all pods related to this projectId (github repo deletion case)

}

func ReceivePromptAndSendToProjectNodePubSubHandler(projectId string, prompt string) {
	// this will receive prompt from backend and send to project node via pubsub

}

func SendLLMResponseFromProjectNodeToBackendPubSubHandler(projectId string, response string) {
	// this will receive llm response from project node via pubsub and send to backend via pubsub to do server-sent events

}