import express from "express";
import { uploadStorageItem, getStorageItem, getAllStorageItems, removeStorageItem, createNonFileItem } from "./storageItem.controller.js";
import { authenticate } from "../../lib/middleware/authenticate.js";
import { uploadSingle } from "../../lib/middleware/upload.js";

const router = express.Router();

// All routes below require standard user authentication
router.use(authenticate);

router.post("/file", uploadSingle("file"), uploadStorageItem);
router.post("/item", createNonFileItem);

router.get("/", getAllStorageItems);
router.get("/:id", getStorageItem);

router.delete("/:id", removeStorageItem);

export default router;
