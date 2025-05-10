import { processEnrichment } from "./enrichment.service.js";
import { getProfilePictures } from "../Person/ProfilePicture/profilePicture.service.js";
import { errorResponse, successResponse } from "../../lib/helpers.js";
import logger from "../../lib/logger.js";

export const processEnrichmentHandler = async (req, res, next) => {
    try {
        const { id: storageItemId } = req.params;
        let data = req.body.data;
        const result = await processEnrichment(storageItemId, data);

        if (!result.success) {
            return res.status(400).json(errorResponse(result.message, 400));
        }

        return res.status(200).json(successResponse(result.message, result.results));
    } catch (error) {
        logger.error(`Error processing enrichment data for item ${req.params.id}:`, error);
        next(error);
    }
};

export const getProfilePicturesHandler = async (req, res, next) => {
    try {
        const userId = req.user.id;

        if (!userId) {
            return res.status(400).json(errorResponse("User ID is required", 400));
        }

        const profilePictures = await getProfilePictures(userId);
        return res.status(200).json(successResponse("Profile pictures retrieved successfully", profilePictures));
    } catch (error) {
        logger.error("Error getting profile pictures:", error);
        next(error);
    }
};
