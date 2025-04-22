import { processEnrichment } from "./enrichment.service.js";
import { getUniqueFaces } from "../Face/face.service.js";
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

export const getUniqueFacesHandler = async (req, res, next) => {
    try {
        const face = await getUniqueFaces();
        return res.status(200).json(successResponse("Face detections retrieved successfully", face));
    } catch (error) {
        logger.error("Error getting face detections for comparison:", error);
        next(error);
    }
};
