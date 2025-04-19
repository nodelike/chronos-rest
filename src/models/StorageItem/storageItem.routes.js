import express from "express";
import { uploadStorageItem, getStorageItem, getAllStorageItems, removeStorageItem } from "./storageItem.controller.js";
import { authenticate } from "../../lib/middleware/authenticate.js";
import { uploadSingle } from "../../lib/middleware/upload.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.post("/file", uploadSingle("file"), uploadStorageItem);
router.get("/", getAllStorageItems);
router.get("/:id", getStorageItem);
router.delete("/:id", removeStorageItem);

export default router;
