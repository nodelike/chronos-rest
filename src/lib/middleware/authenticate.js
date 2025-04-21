import { verifyToken } from "../auth.js";
import { errorResponse } from "../helpers.js";

export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json(errorResponse("Authentication required", 401));
    }
    
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return res.status(401).json(errorResponse("Invalid token format", 401));
    }
    
    const token = parts[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json(errorResponse("Invalid or expired token", 401));
    }

    req.user = decoded;
    next();
};

export const enrichmentAuth = (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.ENRICHMENT_SERVICE_API_KEY) {
        return res.status(401).json(errorResponse("Unauthorized: Invalid API key", 401));
    }
    next();
};
