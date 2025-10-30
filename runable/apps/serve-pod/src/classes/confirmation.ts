import { TOPIC } from "@elbavol/constants"
import { consumer, producer } from ".."


export const produceProjectCreated = async (projectId: string): Promise<boolean> => {

    // await consumer.subscribe(
    //     // consume from control pod group to get confirmation of project initialization
    // )


    await producer.send({
        topic: TOPIC.PROJECT_CREATED,
        messages: [
            { key: projectId, value: JSON.stringify({ projectId }) }
        ]
    })

    return true
}