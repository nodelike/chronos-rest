import {
    createStorageItem,
    getStorageItemById,
    getStorageItems,
    deleteStorageItem,
    createNonFileStorageItem,
    updateEnrichmentData,
} from "./storageItem.service.js";
import { successResponse, errorResponse, NotFoundError, BadRequestError } from "../../lib/helpers.js";
import logger from "../../lib/logger.js";

export const uploadStorageItem = async (req, res, next) => {
    try {
        if (!req.file) {
            throw new BadRequestError("No file uploaded. Use the /storage/item endpoint for non-file items.");
        }

        const userId = req.user.id;

        const storageItem = await createStorageItem(req.file.buffer, req.file, userId);

        return res.status(201).json(successResponse("Storage item created successfully", { storageItem }, 201));
    } catch (error) {
        logger.error("Error uploading storage item:", error);
        next(error);
    }
};

export const getStorageItem = async (req, res, next) => {
    try {
        const { id } = req.params;

        const storageItem = await getStorageItemById(id);

        if (!storageItem) {
            throw new NotFoundError(`Storage item with ID ${id} not found`);
        }

        if (storageItem.userId !== req.user.id) {
            return res.status(403).json(errorResponse("You don't have permission to access this storage item", 403));
        }

        return res.status(200).json(successResponse("Storage item retrieved successfully", { storageItem }));
    } catch (error) {
        next(error);
    }
};

export const getAllStorageItems = async (req, res, next) => {
    try {
        const { page, limit, type, source, startDate, endDate, keyword } = req.query;

        const userId = req.user.id;

        const result = await getStorageItems({
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
            type,
            userId,
            source,
            startDate,
            endDate,
            keyword,
        });

        return res.status(200).json(successResponse("Storage items retrieved successfully", result));
    } catch (error) {
        next(error);
    }
};

export const removeStorageItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await deleteStorageItem(id, userId);

        if (!result.success) {
            if (result.message === "Storage item not found") {
                throw new NotFoundError(`Storage item with ID ${id} not found`);
            }
            return res.status(403).json(errorResponse(result.message, 403));
        }

        return res.status(200).json(successResponse("Storage item deleted successfully"));
    } catch (error) {
        next(error);
    }
};

export const createNonFileItem = async (req, res, next) => {
    try {
        const { type, title, content, url, metadata } = req.body;

        if (!type) {
            throw new BadRequestError("Item type is required");
        }

        const validTypes = ["EVENT", "NOTE", "LOCATION", "LINK", "SOCIAL_MEDIA"];
        if (!validTypes.includes(type)) {
            throw new BadRequestError(`Invalid item type. Must be one of: ${validTypes.join(", ")}`);
        }

        switch (type) {
            case "EVENT":
                if (!title || !content) {
                    throw new BadRequestError("Title and content are required for EVENT items");
                }
                break;
            case "NOTE":
                if (!content) {
                    throw new BadRequestError("Content is required for NOTE items");
                }
                break;
            case "LOCATION":
                if (!metadata || !metadata.lat || !metadata.lng) {
                    throw new BadRequestError("Location metadata (lat, lng) is required for LOCATION items");
                }
                break;
            case "LINK":
                if (!url) {
                    throw new BadRequestError("URL is required for LINK items");
                }
                break;
            case "SOCIAL_MEDIA":
                if (!url || !metadata || !metadata.platform) {
                    throw new BadRequestError("URL and platform are required for SOCIAL_MEDIA items");
                }
                break;
        }

        const userId = req.user.id;

        const itemData = {
            type,
            title,
            content,
            url,
            metadata: metadata || {},
            userId,
        };

        const storageItem = await createNonFileStorageItem(itemData);

        return res.status(201).json(successResponse("Storage item created successfully", { storageItem }, 201));
    } catch (error) {
        logger.error("Error creating non-file storage item:", error);
        next(error);
    }
};

export const updateStorageItemEnrichment = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Log what we received so we can debug
        logger.info(`Received enrichment data for item ${id}`);
        
        // Just pass everything from the request to the service
        const result = await updateEnrichmentData(id, req.body);

        if (!result.success) {
            return res.status(400).json(errorResponse(result.message, 400));
        }

        return res
            .status(200)
            .json(
                successResponse("Storage item enrichment updated successfully", {
                    item: result.item,
                })
            );
    } catch (error) {
        logger.error(`Error updating enrichment data for item ${req.params.id}:`, error);
        next(error);
    }
};

export default {
    uploadStorageItem,
    getStorageItem,
    getAllStorageItems,
    removeStorageItem,
    createNonFileItem,
    updateStorageItemEnrichment,
};
