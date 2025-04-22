import prisma from "../../../lib/prisma.js";
import logger from "../../../lib/logger.js";

export const createMediaMeta = async (mediaMeta, storageItemId) => {
    const { type, payload } = mediaMeta;

    try {
        const mediaMeta = await prisma.mediaMeta.create({
            data: {
                type,
                payload,
                itemId: storageItemId,
            },
        });
    
        return { success: true, message: "Media meta created successfully", data: mediaMeta };
    } catch (error) {
        logger.error(`Error creating media meta:`, error);
        throw error;
    }
};