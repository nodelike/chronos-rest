import { createPerson, getPersonById, getPeople, deletePerson, getPersonStorageItems } from "./person.service.js";
import { successResponse, errorResponse, NotFoundError, BadRequestError } from "../../lib/helpers.js";
import logger from "../../lib/logger.js";
import { getPresignedUrl, extractKeyFromUri } from "../../lib/s3Service.js";

/**
 * Create a new person
 */
export const createNewPerson = async (req, res, next) => {
    try {
        const { name, type } = req.body;

        if (!name) {
            throw new BadRequestError("Person name is required");
        }

        const person = await createPerson(name, type);

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

        // Generate presigned URL for profile picture
        if (person.profilePicture) {
            const profilePicKey = extractKeyFromUri(person.profilePicture.s3Url);
            if (profilePicKey) {
                person.profilePicture.s3Url = await getPresignedUrl(profilePicKey);
            }
        }

        return res.status(200).json(successResponse("Person retrieved successfully", { person }));
    } catch (error) {
        logger.error(`Error getting person details with presigned URLs:`, error);
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

        // Generate presigned URLs for profile pictures
        const processedPeople = await Promise.all(result.people.map(async (person) => {
            const processedPerson = { ...person };
            
            // Process profile picture if it exists
            if (processedPerson.profilePicture) {
                const profilePicKey = extractKeyFromUri(processedPerson.profilePicture.s3Url);
                if (profilePicKey) {
                    processedPerson.profilePicture.s3Url = await getPresignedUrl(profilePicKey);
                }
            }

            return processedPerson;
        }));

        result.people = processedPeople;

        return res.status(200).json(successResponse("People retrieved successfully", result));
    } catch (error) {
        logger.error("Error getting people with presigned URLs:", error);
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
 * Get all storage items for a person
 */
export const getPersonStorage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { page, limit, type } = req.query;
        const userId = req.user.id;

        const result = await getPersonStorageItems(id, userId, {
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
            type
        });

        // Generate presigned URLs for storage items
        const processedItems = await Promise.all(result.storageItems.map(async (item) => {
            const processedItem = { ...item };
            
            // Process main URI
            const fileKey = extractKeyFromUri(processedItem.uri);
            if (fileKey) {
                processedItem.uri = await getPresignedUrl(fileKey);
            }
            
            // Process thumbnail if it exists
            if (processedItem.thumbnail) {
                const thumbnailKey = extractKeyFromUri(processedItem.thumbnail);
                if (thumbnailKey) {
                    processedItem.thumbnail = await getPresignedUrl(thumbnailKey);
                }
            }

            return processedItem;
        }));

        result.storageItems = processedItems;

        return res.status(200).json(successResponse("Person storage items retrieved successfully", result));
    } catch (error) {
        logger.error(`Error getting person storage items with presigned URLs:`, error);
        next(error);
    }
};

export default {
    createNewPerson,
    getPersonDetails,
    getAllPeople,
    removePerson,
    getPersonStorage
}; 