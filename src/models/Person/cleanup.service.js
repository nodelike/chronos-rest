import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";

/**
 * Simple function to clean up orphaned people
 */
export const cleanupOrphanedPeople = async () => {
    try {
        // Find and delete people with no storage items in a single DB operation
        const result = await prisma.$executeRaw`
      DELETE FROM "people"
      WHERE id NOT IN (
        SELECT DISTINCT "personId" FROM "person_storage_items"
      )`;

        return { success: true, count: result };
    } catch (error) {
        logger.error("Error cleaning up orphaned people:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Clean up orphaned people after removing storage items
 *
 * This function should be called after storage items are removed from people
 */
export const cleanupAfterStorageItemRemoval = async (personIds, userId) => {
    try {
        if (!userId) {
            throw new Error("userId is required for cleanup");
        }

        if (!personIds || !Array.isArray(personIds) || personIds.length === 0) {
            return { success: true, message: "No people to check for cleanup" };
        }

        // Find people who no longer have any associations with storage items
        const orphanedPeople = await prisma.person.findMany({
            where: {
                id: {
                    in: personIds,
                },
                storageItems: {
                    none: {}, // No storage items associated
                },
            },
            select: {
                id: true,
                name: true,
            },
        });

        if (orphanedPeople.length === 0) {
            return {
                success: true,
                message: "No orphaned people found after removal",
                deleted: [],
            };
        }

        const peopleIds = orphanedPeople.map((person) => person.id);

        // Delete the orphaned people
        await prisma.person.deleteMany({
            where: {
                id: {
                    in: peopleIds,
                },
                storageItems: {
                    none: {}, // Double check they still have no storage items
                },
            },
        });

        logger.info(`Deleted ${peopleIds.length} orphaned people after storage item removal`);

        return {
            success: true,
            message: `Deleted ${peopleIds.length} orphaned people after removal`,
            deleted: orphanedPeople,
        };
    } catch (error) {
        logger.error(`Error cleaning up orphaned people after storage item removal:`, error);
        throw error;
    }
};
