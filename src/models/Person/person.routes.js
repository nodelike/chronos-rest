import express from "express";
import { createNewPerson, getPersonDetails, getAllPeople, removePerson, getPersonStorage } from "./person.controller.js";
import { authenticate } from "../../lib/middleware/authenticate.js";

const router = express.Router();

// All routes require authentication except the microservice integration endpoint
router.use(authenticate);

router.get("/", getAllPeople);
router.get("/:id", getPersonDetails);
router.get("/:id/storage", getPersonStorage);

router.post("/", createNewPerson);
router.delete("/:id", removePerson);


export default router; 