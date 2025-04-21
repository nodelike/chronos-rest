import express from "express";
import { uploadStorageItem, getStorageItem, getAllStorageItems, removeStorageItem, createNonFileItem } from "./storageItem.controller.js";
import { authenticate, enrichmentAuth } from "../../lib/middleware/authenticate.js";
import { uploadSingle } from "../../lib/middleware/upload.js";
import { updateStorageItemEnrichment } from "./storageItem.controller.js";

const router = express.Router();

router.put("/enrichment/:id", enrichmentAuth, updateStorageItemEnrichment);

// All routes require authentication
router.use(authenticate);

router.post("/file", uploadSingle("file"), uploadStorageItem);
router.post("/item", createNonFileItem);

router.get("/", getAllStorageItems);
router.get("/:id", getStorageItem);


router.delete("/:id", removeStorageItem);

export default router;
