import express from "express";
import { enrichmentAuth } from "../../lib/middleware/authenticate.js";
import { processEnrichmentHandler, getUniqueFacesHandler } from "./enrichment.controller.js";

const router = express.Router();

router.use(enrichmentAuth);

router.get("/unique-faces", getUniqueFacesHandler);
router.put("/:id", processEnrichmentHandler);

export default router;
