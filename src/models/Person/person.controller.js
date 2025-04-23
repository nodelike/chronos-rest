import { createPerson, getPersonById, getPeople, deletePerson } from "./person.service.js";
import { successResponse, errorResponse, NotFoundError, BadRequestError } from "../../lib/helpers.js";
import logger from "../../lib/logger.js";

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

export default {
    createNewPerson,
    getPersonDetails,
    getAllPeople,
    removePerson,
}; 