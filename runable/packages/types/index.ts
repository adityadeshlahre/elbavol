// Topics
export const TOPICS = {
    PROJECT: "PROJECT_TOPIC",
    BROKER: "BROKER_TOPIC",
    POD: "POD_TOPIC",
} as const;

// Group IDs
export const GROUP_IDS = {
    PROJECT: "PROJECT_GROUP_ID",
    BROKER: "BROKER_GROUP_ID",
    POD: "POD_GROUP_ID",
} as const;

// Type exports for better TypeScript support
export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
export type GroupId = (typeof GROUP_IDS)[keyof typeof GROUP_IDS];
