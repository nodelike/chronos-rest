import { createPerson, getPersonById, getPeople, deletePerson, addFaceDetection, findOrCreatePerson } from "./person.service.js";
import { successResponse, errorResponse, NotFoundError, BadRequestError } from "../../lib/helpers.js";
import logger from "../../lib/logger.js";
import prisma from "../../lib/prisma.js";

/**
 * Create a new person
 */
export const createNewPerson = async (req, res, next) => {
    try {
        const { name, aliases, profilePictureId } = req.body;

        if (!name) {
            throw new BadRequestError("Person name is required");
        }

        const person = await createPerson({
            name,
            aliases: aliases || [],
            profilePictureId
        });

        return res.status(201).json(successResponse("Person created successfully", { person }, 201));
    } catch (error) {
        logger.error("Error creating person:", error);
        next(error);
    }
};

/**
 * Get a person by ID
 */
export const getPersonDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const includeDetections = req.query.includeDetections === 'true';

        const person = await getPersonById(id, includeDetections);

        if (!person) {
            throw new NotFoundError(`Person with ID ${id} not found`);
        }

        return res.status(200).json(successResponse("Person retrieved successfully", { person }));
    } catch (error) {
        next(error);
    }
};

/**
 * Get all people with optional filtering
 */
export const getAllPeople = async (req, res, next) => {
    try {
        const { page, limit, name, includeDetections } = req.query;

        const result = await getPeople({
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
            name,
            includeDetections: includeDetections === 'true'
        });

        return res.status(200).json(successResponse("People retrieved successfully", result));
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a person
 */
export const removePerson = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await deletePerson(id);

        if (!result.success) {
            return res.status(400).json(errorResponse(result.message, 400));
        }

        return res.status(200).json(successResponse("Person deleted successfully"));
    } catch (error) {
        next(error);
    }
};

/**
 * Add a face detection to a person
 */
export const addPersonFaceDetection = async (req, res, next) => {
    try {
        const { personId, storageItemId, confidence, boundingBox } = req.body;

        if (!personId || !storageItemId) {
            throw new BadRequestError("Person ID and Storage Item ID are required");
        }

        if (!confidence) {
            throw new BadRequestError("Confidence score is required");
        }

        const faceDetection = await addFaceDetection({
            personId,
            storageItemId,
            confidence: parseFloat(confidence),
            boundingBox: boundingBox || null
        });

        return res.status(201).json(successResponse("Face detection added successfully", { faceDetection }, 201));
    } catch (error) {
        logger.error("Error adding face detection:", error);
        next(error);
    }
};

/**
 * Find or create a person
 */
export const findOrCreatePersonByName = async (req, res, next) => {
    try {
        const { name, aliases } = req.body;

        if (!name) {
            throw new BadRequestError("Person name is required");
        }

        const person = await findOrCreatePerson(name, aliases);

        return res.status(200).json(successResponse("Person found or created successfully", { person }));
    } catch (error) {
        logger.error("Error finding or creating person:", error);
        next(error);
    }
};

/**
 * Handle face detection from microservice
 * This endpoint is designed to be called by the face recognition microservice
 */
export const processFaceDetectionFromMicroservice = async (req, res, next) => {
    try {
        const { storageItemId, detections, apiKey } = req.body;

        // Verify API key (you would implement proper validation in production)
        if (!apiKey || apiKey !== process.env.MICROSERVICE_API_KEY) {
            return res.status(401).json(errorResponse("Invalid API key", 401));
        }

        if (!storageItemId) {
            throw new BadRequestError("Storage Item ID is required");
        }

        if (!detections || !Array.isArray(detections) || detections.length === 0) {
            throw new BadRequestError("Face detections array is required");
        }

        // Process each detection
        const results = [];
        for (const detection of detections) {
            const { name, confidence, boundingBox, aliases } = detection;
            
            if (!name || confidence === undefined) {
                logger.warn("Skipping invalid detection:", detection);
                continue;
            }

            // Find or create the person
            const person = await findOrCreatePerson(name, aliases || []);
            
            // Add the face detection
            const faceDetection = await addFaceDetection({
                personId: person.id,
                storageItemId,
                confidence: parseFloat(confidence),
                boundingBox: boundingBox || null
            });
            
            results.push({
                person,
                faceDetection
            });
        }

        // Update processedAt timestamp for the storage item
        await prisma.storageItem.update({
            where: { id: storageItemId },
            data: { processedAt: new Date() }
        });

        return res.status(200).json(successResponse("Face detections processed successfully", { 
            storageItemId,
            detectionCount: results.length,
            results
        }));
    } catch (error) {
        logger.error("Error processing face detections from microservice:", error);
        next(error);
    }
};

export default {
    createNewPerson,
    getPersonDetails,
    getAllPeople,
    removePerson,
    addPersonFaceDetection,
    findOrCreatePersonByName,
    processFaceDetectionFromMicroservice
}; 