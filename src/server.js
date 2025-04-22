import app from "./app.js";
import logger from "./lib/logger.js";
import "dotenv/config";

const PORT = process.env.PORT;

// Start the server
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
