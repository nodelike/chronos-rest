import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";

export const createPerson = async (personData) => {
    try {
        const { name, aliases = [], profilePictureId } = personData;

        const person = await prisma.person.create({
            data: {
                name,
                aliases,
                profilePictureId
            }
        });

        return person;
    } catch (error) {
        logger.error("Error creating person:", error);
        throw error;
    }
};

/**
 * Get a person by ID
 */
export const getPersonById = async (id, includeDetections = false) => {
    try {
        const person = await prisma.person.findUnique({
            where: { id },
            include: {
                profilePicture: includeDetections,
                faceDetections: includeDetections ? {
                    include: {
                        storageItem: true
                    }
                } : false,
                socialProfiles: includeDetections
            }
        });
        
        return person;
    } catch (error) {
        logger.error(`Error getting person ${id}:`, error);
        return null;
    }
};

/**
 * Get all people, with optional filtering
 */
export const getPeople = async (options = {}) => {
    try {
        const { page = 1, limit = 20, name, includeDetections = false } = options;

        const skip = (page - 1) * limit;
        const where = {};

        if (name) {
            where.OR = [
                { name: { contains: name, mode: "insensitive" } },
                { aliases: { has: name } }
            ];
        }

        const totalCount = await prisma.person.count({ where });

        const people = await prisma.person.findMany({
            where,
            skip,
            take: limit,
            orderBy: { name: "asc" },
            include: {
                profilePicture: true,
                faceDetections: includeDetections ? {
                    include: {
                        storageItem: true
                    },
                    take: 5 // Limit to 5 most recent detections for efficiency
                } : false,
                socialProfiles: includeDetections
            }
        });

        return {
            people,
            metadata: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
            },
        };
    } catch (error) {
        logger.error("Error getting people:", error);
        throw error;
    }
};

/**
 * Delete a person and all related data
 */
export const deletePerson = async (id) => {
    try {
        // Delete all face detections for this person
        await prisma.faceDetection.deleteMany({
            where: { personId: id }
        });

        // Delete all social profiles for this person
        await prisma.socialProfile.deleteMany({
            where: { personId: id }
        });

        // Delete all relations where this person is involved
        await prisma.personRelation.deleteMany({
            where: {
                OR: [
                    { fromId: id },
                    { toId: id }
                ]
            }
        });

        // Delete the person
        await prisma.person.delete({
            where: { id }
        });

        return { success: true, message: "Person deleted successfully" };
    } catch (error) {
        logger.error(`Error deleting person ${id}:`, error);
        return { success: false, message: "Error deleting person" };
    }
};

/**
 * Add a face detection to a person
 */
export const addFaceDetection = async (detectionData) => {
    try {
        const { personId, storageItemId, confidence, boundingBox } = detectionData;

        // Check if the person exists
        const person = await prisma.person.findUnique({
            where: { id: personId }
        });

        if (!person) {
            throw new Error(`Person with ID ${personId} not found`);
        }

        // Check if the storage item exists
        const storageItem = await prisma.storageItem.findUnique({
            where: { id: storageItemId }
        });

        if (!storageItem) {
            throw new Error(`Storage item with ID ${storageItemId} not found`);
        }

        // Create the face detection
        const faceDetection = await prisma.faceDetection.create({
            data: {
                confidence,
                boundingBox,
                personId,
                storageItemId
            }
        });

        return faceDetection;
    } catch (error) {
        logger.error("Error adding face detection:", error);
        throw error;
    }
};

/**
 * Find or create a person with the given name
 */
export const findOrCreatePerson = async (name, aliases = []) => {
    try {
        // First, try to find an exact match by name
        let person = await prisma.person.findFirst({
            where: { name: { equals: name, mode: "insensitive" } }
        });

        // If not found, look for a person with the name in their aliases
        if (!person) {
            person = await prisma.person.findFirst({
                where: { aliases: { has: name } }
            });
        }

        // If still not found, create a new person
        if (!person) {
            person = await prisma.person.create({
                data: {
                    name,
                    aliases
                }
            });
        } else if (aliases && aliases.length > 0) {
            // If person exists and we have new aliases, add them if they're not already there
            const existingAliases = new Set(person.aliases || []);
            const newAliases = aliases.filter(alias => !existingAliases.has(alias));
            
            if (newAliases.length > 0) {
                person = await prisma.person.update({
                    where: { id: person.id },
                    data: {
                        aliases: {
                            push: newAliases
                        }
                    }
                });
            }
        }

        return person;
    } catch (error) {
        logger.error(`Error finding or creating person with name ${name}:`, error);
        throw error;
    }
};

export default {
    createPerson,
    getPersonById,
    getPeople,
    deletePerson,
    addFaceDetection,
    findOrCreatePerson
}; 