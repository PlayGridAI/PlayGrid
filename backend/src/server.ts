import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { initSocket } from "./socket";
import { SERVER_PORT } from "./config";

const app = express();

app.use(cors({
    origin: "*"
}));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173", // tighten in prod
        methods: ["GET", "POST"]
    }
});

initSocket(io);

httpServer.listen(SERVER_PORT, () => {
    console.log(`PlayGrid backend running on port ${SERVER_PORT}`);
});
