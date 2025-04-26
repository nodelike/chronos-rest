import { getStorageItemById } from "./storageItem.service.js";
import { createFace } from "../Person/Face/face.service.js";
import { createMediaMeta } from "./MediaMeta/mediaMeta.service.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";

export const processEnrichment = async (storageItemId, enrichmentData) => {
    try {
        const storageItem = await getStorageItemById(storageItemId);

        if (!storageItem) {
            return { success: false, message: "Storage item not found" };
        }

        const { mediaMeta, faces } = enrichmentData;
        let hasUpdates = false;

        if (mediaMeta && Array.isArray(mediaMeta) && mediaMeta.length > 0) {
            // Process media metadata in parallel
            await Promise.all(
                mediaMeta.map(async (meta) => {
                    if (!meta.type || !meta.payload) {
                        return;
                    }

                    if (typeof meta.payload === 'object') {
                        if (Array.isArray(meta.payload) && meta.payload.length === 0) {
                            return;
                        }
                        
                        if (!Array.isArray(meta.payload) && Object.keys(meta.payload).length === 0) {
                            return;
                        }
                    }
                    await createMediaMeta(meta, storageItemId);
                })
            );
            hasUpdates = true;
        }

        if (faces && Array.isArray(faces) && faces.length > 0) {
            await Promise.all(
                faces.map(async (face) => {
                    await createFace(face, storageItemId);
                })
            );
            hasUpdates = true;
        }

        if (hasUpdates) {
            await prisma.storageItem.update({
                where: { id: storageItemId },
                data: { processedAt: new Date() },
            });
        }

        return {
            success: true,
            message: hasUpdates ? "Enrichment data processed successfully" : "No updates were made",
        };
    } catch (error) {
        logger.error(`Error processing enrichment data for item ${storageItemId}:`, error);
        throw error;
    }
};
