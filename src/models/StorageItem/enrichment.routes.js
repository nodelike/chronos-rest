import express from "express";
import { enrichmentAuth } from "../../lib/middleware/authenticate.js";
import { processEnrichmentHandler, getProfilePicturesHandler } from "./enrichment.controller.js";

const router = express.Router();

router.use(enrichmentAuth);

router.get("/unique-faces/:userId", getProfilePicturesHandler);
router.put("/:id", processEnrichmentHandler);

export default router;
