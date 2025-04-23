import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { createProfilePicture } from "./ProfilePicture/profilePicture.service.js";

export const createPerson = async (name, type = "PERSON", profileS3Key) => {
    try {
        const person = await prisma.person.create({
            data: {
                name,
                type
            }
        });
        await createProfilePicture(person.id, profileS3Key);
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
                face: includeDetections ? {
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
        throw error;
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
                face: includeDetections ? {
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
        await prisma.face.deleteMany({
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
        throw error;
    }
};

export const findOrCreatePerson = async (personId, name, type, profileS3Key) => {
    try {
        if (!personId) {
            const person = await createPerson(name, type, profileS3Key);
            return person;
        }
        return await getPersonById(personId);
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
    findOrCreatePerson
}; 