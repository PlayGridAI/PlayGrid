import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { setGlobalSocket } from "../services/socket";

const SOCKET_URL = "http://localhost:4000";

// Global socket instance to prevent multiple connections
let globalSocket: Socket | null = null;

export const useSocket = (onEvents?: (socket: Socket) => void) => {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        // Use global socket instance to prevent multiple connections
        if (!globalSocket) {
            const socketInstance = io(SOCKET_URL, {
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 500,
                timeout: 20000,
                forceNew: false
            });

            // Add connection event listeners
            socketInstance.on("connect", () => {
                console.log("Socket connected:", socketInstance.id);

                // On EVERY connection (fresh or reconnect), check if we need to rejoin a room
                const storedRoomId = localStorage.getItem("roomId");
                const storedPlayerRaw = localStorage.getItem("currentPlayer");
                if (storedRoomId && storedPlayerRaw) {
                    try {
                        const storedPlayer = JSON.parse(storedPlayerRaw);
                        if (storedPlayer?.playerId) {
                            console.log("Auto-reconnecting to room on connect", {
                                roomId: storedRoomId,
                                playerId: storedPlayer.playerId
                            });
                            socketInstance.emit("reconnectToRoom", {
                                roomId: storedRoomId,
                                playerId: storedPlayer.playerId,
                                playerName: storedPlayer.name || "Guest"
                            }, (response: any) => {
                                if (response?.success) {
                                    console.log("Auto-reconnect successful", { hasActiveGame: response.hasActiveGame });
                                } else {
                                    console.error("Auto-reconnect failed", response?.error);
                                }
                            });
                        }
                    } catch (e) {
                        console.error("Failed to parse stored player for auto-reconnect", e);
                    }
                }
            });

            socketInstance.on("disconnect", (reason) => {
                console.log("Socket disconnected:", reason);
            });

            socketInstance.on("connect_error", (error) => {
                console.error("Socket connection error:", error);
            });

            socketInstance.on("reconnect", (attemptNumber) => {
                console.log("Socket reconnected after", attemptNumber, "attempts");
                // connect event already handles room rejoin
            });

            globalSocket = socketInstance;
            setGlobalSocket(socketInstance);
        }

        setSocket(globalSocket);

        // Register events whenever onEvents changes
        if (globalSocket && onEvents) {
            onEvents(globalSocket);
        }

        // Do NOT disconnect on beforeunload — let the server-side
        // disconnect timeout handle cleanup. Destroying the socket here
        // prevents reconnection on page refresh.

        // Cleanup function
        return () => {
            // no-op — we keep globalSocket alive across re-renders
        };
    }, [onEvents]); // Include onEvents in deps to re-register when it changes

    return socket;
};
