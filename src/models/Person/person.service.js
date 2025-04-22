import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";

export const createPerson = async (name, type = "PERSON") => {
    try {
        const person = await prisma.person.create({
            data: {
                name,
                type
            }
        });

        return person;
    } catch (error) {
        logger.error("Error creating person:", error);
        return { success: false, message: "Error creating person" };
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
        return { success: false, message: "Error getting person:" + error.message };
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
        return { success: false, message: "Error getting people:" + error.message };
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
        return { success: false, message: "Error deleting person" };
    }
};

export const findOrCreatePerson = async (personId, name, type, faceId = null) => {
    try {
        let person = await getPersonById(personId);

        if (!person) {
            person = await createPerson(name, type);
            
            if (faceId) {
                person = await prisma.person.update({
                    where: { id: person.id },
                    data: { profilePictureId: faceId },
                    include: {
                        profilePicture: true,
                        face: false,
                        socialProfiles: false
                    }
                });
            }
        }

        return person;
    } catch (error) {
        logger.error(`Error finding or creating person with name ${name}:`, error);
        return { success: false, message: "Error finding or creating person:" + error.message };
    }
};

export default {
    createPerson,
    getPersonById,
    getPeople,
    deletePerson,
    findOrCreatePerson
}; 