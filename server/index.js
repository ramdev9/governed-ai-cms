require("dotenv").config();
const express = require("express");
const cors = require("cors");

const generateRoute = require("./routes/generate");
const agenticRoute = require("./routes/agenticRoute");
const { ready } = require("./services/logger");

const app = express();

app.use(cors());
app.use(express.json());

const path = require("path");
app.use(express.static(path.join(__dirname, "../client")));

app.use("/api", agenticRoute);
app.use("/api/generate", generateRoute);

const PORT = process.env.PORT || 5000;

ready
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Database init failed:", error.message);
        process.exit(1);
    });