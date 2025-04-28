import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { createProfilePicture } from "./ProfilePicture/profilePicture.service.js";

export const createPerson = async (name, gender, age, type = "PERSON", profileS3Key, profileS3Url) => {
    try {
        const person = await prisma.person.create({
            data: {
                name,
                gender,
                age,
                type,
                
            }
        });
        await createProfilePicture(person.id, profileS3Key, profileS3Url);
        return person;
    } catch (error) {
        logger.error("Error creating person:", error);
        throw error;
    }
};

/**
 * Get a person by ID
 */
export const getPersonById = async (id, userId, includeDetections = false) => {
    try {
        if (!userId) {
            throw new Error("userId is required to get a person");
        }

        const person = await prisma.person.findFirst({
            where: { 
                id,
                storageItems: {
                    some: {
                        userId
                    }
                }
            },
            include: {
                profilePicture: includeDetections,
                face: includeDetections ? {
                    include: {
                        storageItem: true
                    }
                } : false,
                socialProfiles: includeDetections,
                storageItems: includeDetections ? {
                    where: {
                        userId
                    },
                    include: {
                        storageItem: true
                    }
                } : false
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
export const getPeople = async (userId, options = {}) => {
    try {
        const { page = 1, limit = 20, name, includeDetections = false } = options;

        if (!userId) {
            throw new Error("userId is required to get people");
        }

        const skip = (page - 1) * limit;
        const where = {
            storageItems: {
                some: {
                    userId
                }
            }
        };

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
                socialProfiles: includeDetections,
                storageItems: includeDetections ? {
                    where: {
                        userId
                    },
                    include: {
                        storageItem: true
                    },
                    take: 5 // Limit to 5 most recent items for efficiency
                } : false
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
export const deletePerson = async (id, userId) => {
    try {
        if (!userId) {
            throw new Error("userId is required to delete a person");
        }

        // Verify this person belongs to the user
        const person = await prisma.person.findFirst({
            where: {
                id,
                storageItems: {
                    some: {
                        userId
                    }
                }
            }
        });

        if (!person) {
            throw new Error(`Person with ID ${id} not found or doesn't belong to this user`);
        }

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

        // Delete person-storage item associations for this user
        await prisma.personStorageItem.deleteMany({
            where: { 
                personId: id,
                userId 
            }
        });

        // Check if this person has associations with other users
        const otherUserAssociations = await prisma.personStorageItem.findFirst({
            where: {
                personId: id,
                NOT: {
                    userId
                }
            }
        });

        // Only delete the person if they're not associated with other users
        if (!otherUserAssociations) {
            // Delete the person
            await prisma.person.delete({
                where: { id }
            });
            return { success: true, message: "Person deleted successfully" };
        }
        
        return { success: true, message: "Person associations removed for this user" };
    } catch (error) {
        logger.error(`Error deleting person ${id}:`, error);
        throw error;
    }
};

export const findOrCreatePerson = async (personId, name, gender, age, type, profileS3Key, profileS3Url, userId) => {
    try {
        if (!userId) {
            throw new Error("userId is required to find or create a person");
        }
        
        if (!personId) {
            const person = await createPerson(name, gender, age, type, profileS3Key, profileS3Url);
            return person;
        }
        return await getPersonById(personId, userId);
    } catch (error) {
        logger.error(`Error finding or creating person with name ${name}:`, error);
        throw error;
    }
};

/**
 * Add storage items to a person
 */
export const addStorageItemsToPerson = async (personId, storageItemIds, userId) => {
    try {
        if (!Array.isArray(storageItemIds)) {
            storageItemIds = [storageItemIds];
        }

        if (!userId) {
            throw new Error("userId is required to add storage items to a person");
        }
        
        // Create entries in the join table for each storage item
        const createPromises = storageItemIds.map(itemId => 
            prisma.personStorageItem.upsert({
                where: {
                    personId_storageItemId: {
                        personId,
                        storageItemId: itemId
                    }
                },
                update: {},
                create: {
                    personId,
                    storageItemId: itemId,
                    userId
                }
            })
        );
        
        await Promise.all(createPromises);
        
        return { success: true, message: "Storage items added to person successfully" };
    } catch (error) {
        logger.error(`Error adding storage items to person ${personId}:`, error);
        throw error;
    }
};

/**
 * Remove storage items from a person
 */
export const removeStorageItemsFromPerson = async (personId, storageItemIds, userId) => {
    try {
        if (!Array.isArray(storageItemIds)) {
            storageItemIds = [storageItemIds];
        }

        if (!userId) {
            throw new Error("userId is required to remove storage items from a person");
        }
        
        // Delete entries from the join table
        await prisma.personStorageItem.deleteMany({
            where: {
                personId,
                userId,
                storageItemId: {
                    in: storageItemIds
                }
            }
        });
        
        return { success: true, message: "Storage items removed from person successfully" };
    } catch (error) {
        logger.error(`Error removing storage items from person ${personId}:`, error);
        throw error;
    }
};

/**
 * Get all storage items for a person
 */
export const getPersonStorageItems = async (personId, userId, options = {}) => {
    try {
        const { page = 1, limit = 20, type } = options;

        if (!userId) {
            throw new Error("userId is required to get person's storage items");
        }

        const skip = (page - 1) * limit;
        const where = { 
            people: {
                some: {
                    personId,
                    userId
                }
            } 
        };

        if (type) {
            where.type = type;
        }

        const totalCount = await prisma.storageItem.count({ where });

        const storageItems = await prisma.storageItem.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" }
        });

        return {
            storageItems,
            metadata: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
            },
        };
    } catch (error) {
        logger.error(`Error getting storage items for person ${personId}:`, error);
        throw error;
    }
};

export default {
    createPerson,
    getPersonById,
    getPeople,
    deletePerson,
    findOrCreatePerson,
    addStorageItemsToPerson,
    removeStorageItemsFromPerson,
    getPersonStorageItems
}; 