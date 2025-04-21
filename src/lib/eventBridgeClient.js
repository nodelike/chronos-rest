import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import logger from "./logger.js";
import "dotenv/config";

const REGION = process.env.AWS_REGION;
const EVENT_BUS_NAME = process.env.AWS_EVENT_BUS_NAME;
const EVENT_SOURCE = "com.chronos.enricher";
const EVENT_DETAIL_TYPE = "EnrichmentRequested";

// Create an EventBridge client
const eventBridgeClient = new EventBridgeClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

/**
 * Publish an enrichment request to EventBridge
 * @param {string} itemId - The storage item ID
 * @param {string} mediaType - The media type (image, video, audio, document)
 * @param {string} s3Bucket - The S3 bucket name
 * @param {string} s3Key - The S3 key of the file
 * @param {Object} metadata - Optional initial metadata
 * @returns {boolean} - Whether the publish was successful
 */
export const publishEnrichmentEvent = async (itemId, mediaType, s3Bucket, s3Key, metadata = {}) => {
    try {
        const detail = {
            itemId,
            mediaType,
            s3Bucket,
            s3Key,
            metadata
        };

        const params = {
            Entries: [
                {
                    EventBusName: EVENT_BUS_NAME,
                    Source: EVENT_SOURCE,
                    DetailType: EVENT_DETAIL_TYPE,
                    Detail: JSON.stringify(detail),
                }
            ]
        };

        const command = new PutEventsCommand(params);
        const response = await eventBridgeClient.send(command);

        if (response.FailedEntryCount === 0) {
            logger.info(`Published enrichment event for item ${itemId} of type ${mediaType}`);
            return true;
        } else {
            logger.warn(`Failed to publish enrichment event for item ${itemId}`, response.Entries);
            return false;
        }
    } catch (error) {
        logger.error('Error publishing enrichment event:', error);
        return false;
    }
};

export default {
    publishEnrichmentEvent
}; 