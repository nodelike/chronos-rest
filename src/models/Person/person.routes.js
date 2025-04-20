import express from "express";
import { createNewPerson, getPersonDetails, getAllPeople, removePerson, addPersonFaceDetection, findOrCreatePersonByName, processFaceDetectionFromMicroservice } from "./person.controller.js";
import { authenticate } from "../../lib/middleware/authenticate.js";

const router = express.Router();

// All routes require authentication except the microservice integration endpoint
router.use(authenticate);

// Person CRUD operations
router.post("/", createNewPerson);
router.get("/", getAllPeople);
router.get("/:id", getPersonDetails);
router.delete("/:id", removePerson);

// Face detection operations
router.post("/face-detection", addPersonFaceDetection);

// Utility operations
router.post("/find-or-create", findOrCreatePersonByName);

// Create a separate router for the microservice endpoint without authentication
const msRouter = express.Router();
msRouter.post("/microservice/process-face-detection", processFaceDetectionFromMicroservice);

// Export both routers
export { msRouter };
export default router; 