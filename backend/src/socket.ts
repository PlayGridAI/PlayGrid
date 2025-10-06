import { Server, Socket } from "socket.io";
import {
    createRoom,
    addPlayerToRoom,
    getPublicRoomsSummary,
    getFullRoomData,
    getRoom,
    getAllRooms,
    markPlayerDisconnected,
    removePlayerById
} from "./rooms";
import { GameManager } from "./games/GameManager";
import { CoupGame } from "./games/coup/CoupGame";
import { GameAction } from "./games/IGame";

// Improved type definitions
interface CreateRoomPayload {
    roomName: string;
    isPrivate?: boolean;
    password?: string;
    playerName: string;
    maxPlayers?: number;
}

interface JoinRoomPayload {
    roomId: string;
    playerName: string;
    playerId?: string;
    password?: string;
}

interface ChatPayload {
    roomId: string;
    playerId: string;
    message: string;
    senderName?: string;
}

interface GameActionPayload {
    roomId: string;
    gameId: string;
    action: GameAction;
}

interface SocketAck<T = any> {
    (response: T): void;
}

// Utility functions
function safeAck<T>(ack: SocketAck<T> | undefined, payload: T): void {
    if (typeof ack === "function") {
        ack(payload);
    }
}

function emitError(socket: Socket, message: string, errorType = "error"): void {
    socket.emit("errorMessage", { type: errorType, message });
}

function emitRoomUpdate(io: Server): void {
    // Debounce room updates to prevent spam
    if (emitRoomUpdate.timeoutId) {
        clearTimeout(emitRoomUpdate.timeoutId);
    }
    emitRoomUpdate.timeoutId = setTimeout(() => {
        io.emit("rooms:update", getPublicRoomsSummary());
    }, 100);
}
emitRoomUpdate.timeoutId = null as NodeJS.Timeout | null;

// Simplified state sanitization without expensive caching
function sanitizeStateForPlayer(state: any, playerId: string): any {
    const sanitized = {
        ...state,
        players: state.players.map((p: any) => {
            if (p.playerId === playerId) return p;
            return {
                ...p,
                // Only sanitize influence if it exists (Coup-specific)
                ...(p.influence && {
                    influence: p.influence.map(() => "UNKNOWN") // Hide all other players' cards
                })
            };
        })
    };

    return sanitized;
}

function sanitizeStateForAll(state: any): any {
    return {
        ...state,
        players: state.players.map((p: any) => ({
            ...p,
            // Only sanitize influence if it exists (Coup-specific)
            ...(p.influence && {
                influence: p.influence.map(() => "UNKNOWN") // Hide all players' cards for public view
            })
        }))
    };
}

export function initSocket(io: Server) {
    const gameManager = new GameManager(io);
    const coup = new CoupGame();
    gameManager.registerGame(coup);
    coup.onEvent = (roomId: string | string[], event: any, payload: any) => {
        io.to(roomId).emit(event, payload);
        
        // For certain events, also emit state updates
        if (event === "coup:cardRevealed") {
            const updatedState = gameManager.getGameState(roomId as string);
            if (updatedState && updatedState.players) {
                // Emit sanitized state to each player individually
                updatedState.players.forEach((p: any) => {
                    const targetSocket = p.socketId || p.playerId;
                    if (targetSocket) {
                        io.to(targetSocket).emit(
                            "game:state",
                            sanitizeStateForPlayer(updatedState, p.playerId)
                        );
                    }
                });
            }
            // Emit general state update to room
            io.to(roomId).emit("game:stateUpdate", sanitizeStateForAll(updatedState));
        }
    };

    // Track connected sockets for cleanup
    const connectedSockets = new Set<string>();

    io.on("connection", (socket: Socket) => {
        console.log("Socket connected:", socket.id);
        connectedSockets.add(socket.id);


        // Send initial rooms data
        socket.emit("rooms:update", getPublicRoomsSummary());

        socket.on("getRooms", (ack: SocketAck) => {
            safeAck(ack, getAllRooms());
        });

        socket.on("createRoom", async (payload: CreateRoomPayload, ack?: SocketAck) => {
            try {
                const { roomName, isPrivate = false, password, playerName, maxPlayers } = payload;

                const room = createRoom(roomName, isPrivate, password ?? null, maxPlayers);
                const player = addPlayerToRoom(room.roomId, socket.id, playerName, undefined, true);

                socket.join(room.roomId);
                const full = getFullRoomData(room.roomId);

                // Emit updates
                emitRoomUpdate(io);
                socket.emit("room:joined", { room: full, player });

                // Send player list to room
                io.to(room.roomId).emit("players:update", {
                    roomId: room.roomId,
                    players: full?.players ?? []
                });

                safeAck(ack, { success: true, roomId: room.roomId });
            } catch (err) {
                console.error("createRoom error:", err);
                emitError(socket, "Failed to create room");
                safeAck(ack, { success: false, error: "Failed to create room" });
            }
        });

        socket.on("joinRoom", async (payload: JoinRoomPayload, ack?: SocketAck) => {
            try {
                const { roomId, playerName, playerId, password } = payload;
                const room = getRoom(roomId);

                if (!room) {
                    emitError(socket, "Room not found");
                    return safeAck(ack, { success: false, error: "Room_not_found" });
                }

                if (room.isPrivate && room.password && room.password !== password) {
                    emitError(socket, "Invalid Password");
                    return safeAck(ack, { success: false, error: "Invalid_password" });
                }

                console.log(`Backend: Adding player to room`, { roomId, socketId: socket.id, playerName, playerId });
                const player = addPlayerToRoom(roomId, socket.id, playerName, playerId, false);
                if (!player) {
                    emitError(socket, "Room is full or could not join");
                    return safeAck(ack, { success: false, error: "Room_full_or_could_not_join" });
                }
                console.log(`Backend: Player added successfully`, { playerId: player.playerId, socketId: player.socketId });

                // Clean up socket rooms
                for (const r of socket.rooms) {
                    if (r !== socket.id && r !== roomId) {
                        socket.leave(r);
                    }
                }

                socket.join(roomId);
                const full = getFullRoomData(roomId);

                console.log(`Player ${playerName} joined room ${roomId} with socket ${socket.id}`);
                console.log(`Room ${roomId} now has ${full?.players?.length || 0} players`);

                // Emit updates
                emitRoomUpdate(io);
                socket.emit("room:joined", { room: full, player });

                // Send player list to room with delay to ensure socket is joined
                setTimeout(() => {
                    io.to(roomId).emit("players:update", {
                        roomId,
                        players: full?.players ?? []
                    });
                }, 100);

                safeAck(ack, { success: true });
            } catch (err) {
                console.error("joinRoom error:", err);
                emitError(socket, "Failed to join room");
                safeAck(ack, { success: false, error: "Failed to join room" });
            }
        });

        socket.on("getCurrentPlayers", (payload: { roomId: string }, ack?: SocketAck) => {
            try {
                const { roomId } = payload;
                const room = getRoom(roomId);
                safeAck(ack, room?.players || []);
            } catch (err) {
                console.error("getCurrentPlayers error:", err);
                emitError(socket, "Failed to get current players");
                safeAck(ack, []);
            }
        });

        socket.on("leaveRoom", (payload: { roomId: string; playerId?: string }, ack?: SocketAck) => {
            try {
                const { roomId, playerId } = payload;

                if (playerId) {
                    removePlayerById(roomId, playerId);
                } else {
                    markPlayerDisconnected(roomId, socket.id);
                }

                socket.leave(roomId);
                emitRoomUpdate(io);

                const full = getFullRoomData(roomId);
                io.to(roomId).emit("players:update", {
                    roomId,
                    players: full?.players ?? []
                });

                safeAck(ack, { success: true });
            } catch (err) {
                console.error("leaveRoom error:", err);
                emitError(socket, "Failed to leave room");
                safeAck(ack, { success: false, error: "Failed to leave room" });
            }
        });

        socket.on("sendMessage", (payload: ChatPayload, ack?: SocketAck) => {
            try {
                const { roomId, playerId, message, senderName } = payload;
                const msg = {
                    senderName: senderName ?? "anon",
                    playerId,
                    message,
                    timestamp: Date.now()
                };

                io.to(roomId).emit("chat:message", msg);
                safeAck(ack, { success: true });
            } catch (err) {
                console.error("sendMessage error:", err);
                emitError(socket, "Failed to send message");
                safeAck(ack, { success: false, error: "Failed to send message" });
            }
        });

        socket.on("reconnectToRoom", (payload: { roomId: string; playerId: string; playerName?: string }, ack?: SocketAck) => {
            try {
                const { roomId, playerId, playerName } = payload;
                console.log(`Backend: Player attempting to reconnect`, { roomId, playerId, playerName, socketId: socket.id });

                const room = getRoom(roomId);
                if (!room) {
                    return safeAck(ack, { success: false, error: "Room not found" });
                }

                // Check if player already exists in the room
                const existingPlayer = room.players.find(p => p.playerId === playerId);
                let player;

                if (existingPlayer) {
                    console.log(`Backend: Player already exists, updating socket ID`, {
                        oldSocketId: existingPlayer.socketId,
                        newSocketId: socket.id
                    });
                    // Update the existing player's socket ID
                    existingPlayer.socketId = socket.id;
                    existingPlayer.lastSeen = Date.now();
                    if (existingPlayer.disconnectedTimer) {
                        clearTimeout(existingPlayer.disconnectedTimer);
                        existingPlayer.disconnectedTimer = null;
                    }
                    player = existingPlayer;
                } else {
                    // Player doesn't exist, add them
                    player = addPlayerToRoom(roomId, socket.id, playerName ?? "reconnected", playerId, false);
                    if (!player) {
                        return safeAck(ack, { success: false, error: "Could not reconnect" });
                    }
                }

                socket.join(roomId);
                const full = getFullRoomData(roomId);

                console.log(`Backend: Player successfully reconnected`, { playerId: player.playerId, socketId: player.socketId });

                emitRoomUpdate(io);
                io.to(roomId).emit("players:update", {
                    roomId,
                    players: full?.players ?? []
                });
                socket.emit("room:joined", { room: full, player });

                // If there's an active game, send current game state
                if (room.game) {
                    console.log(`Backend: Sending game state to reconnected player`, { gameId: room.game.id, playerId: player.playerId });
                    const gameState = gameManager.getGameState(roomId);
                    if (gameState) {
                        socket.emit("game:state", sanitizeStateForPlayer(gameState, player.playerId));
                        socket.emit("game:rejoined", { gameId: room.game.id, roomId });

                        // Notify other players about the reconnection
                        io.to(roomId).emit("player:reconnected", {
                            roomId,
                            playerId: player.playerId,
                            playerName: player.name,
                            message: `${player.name} has reconnected to the game.`
                        });
                    }
                }

                safeAck(ack, { success: true, hasActiveGame: !!room.game });
            } catch (err) {
                console.error("reconnectToRoom error:", err);
                emitError(socket, "Reconnect failed");
                safeAck(ack, { success: false, error: "Reconnect failed" });
            }
        });

        socket.on("game:select", ({ roomId, gameId }, ack?: SocketAck) => {
            try {
                const room = getRoom(roomId);
                if (!room) {
                    socket.emit("game:error", { error: "Room not found" });
                    safeAck(ack, { success: false, error: "Room not found" });
                    return;
                }

                // Check if the player is the host
                const player = room.players.find(p => p.socketId === socket.id);
                if (!player || !player.isHost) {
                    socket.emit("game:error", { error: "Only host can select games" });
                    safeAck(ack, { success: false, error: "Only host can select games" });
                    return;
                }

                // Broadcast game selection to all players in the room
                io.to(roomId).emit("game:selected", { gameId, hostName: player.name });
                safeAck(ack, { success: true, gameId, roomId });
            } catch (err) {
                console.error("game:select error:", err);
                socket.emit("game:error", { error: "Failed to select game" });
                safeAck(ack, { success: false, error: "Failed to select game" });
            }
        });

        socket.on("game:start", async ({ roomId, gameId }, ack?: SocketAck) => {
            try {
                const room = getRoom(roomId);
                if (!room) {
                    socket.emit("game:error", { error: "Room not found" });
                    safeAck(ack, { success: false, error: "Room not found" });
                    return;
                }

                gameManager.startGame(roomId, gameId, room.players);
                room.game = {
                    id: gameId,
                    instance: gameManager.getGameInstance(roomId),
                    state: gameManager.getGameState(roomId)
                };

                console.log(`Game ${gameId} started in room ${roomId}`);
                console.log(`Room players:`, room.players.map(p => ({ name: p.name, socketId: p.socketId })));
                console.log(`Emitting game:started to room ${roomId} with data:`, room.game);

                // Debug: Check which sockets are actually in the room
                const roomSockets = await io.in(roomId).fetchSockets();
                console.log(`Sockets in room ${roomId}:`, roomSockets.map(s => s.id));

                io.to(roomId).emit("game:started", room.game);
                safeAck(ack, { success: true, gameId, roomId });
            } catch (err) {
                console.error("game:start error:", err);
                socket.emit("game:error", { error: "Failed to start game" });
                safeAck(ack, { success: false, error: "Failed to start game" });
            }
        });

        socket.on("game:join", ({ roomId, gameId }) => {
            try {
                const room = getRoom(roomId);
                if (!room || !room.game || room.game.id !== gameId) {
                    socket.emit("game:error", { error: "Game not found or not started" });
                    return;
                }

                const gameState = gameManager.getGameState(roomId);
                if (gameState) {
                    // Find the player by socket ID
                    const player = room.players.find(p => p.socketId === socket.id);
                    if (player) {
                        // Send current game state to the joining player
                        socket.emit("game:state", sanitizeStateForPlayer(gameState, player.playerId));
                    } else {
                        // If player not found, send unsanitized state
                        socket.emit("game:state", gameState);
                    }
                }
            } catch (err) {
                console.error("game:join error:", err);
                socket.emit("game:error", { error: "Failed to join game" });
            }
        });

        socket.on("game:action", (payload: GameActionPayload) => {
            try {
                const { roomId, action } = payload;
                const room = getRoom(roomId);

                if (!room) {
                    socket.emit("game:error", { error: "Room not found" });
                    return;
                }

                gameManager.handleAction(roomId, action);
                const updatedState = gameManager.getGameState(roomId);

                if (updatedState && updatedState.players) {
                    // Emit sanitized state to each player individually
                    updatedState.players.forEach((p: any) => {
                        const targetSocket = p.socketId || p.playerId;
                        if (targetSocket) {
                            io.to(targetSocket).emit(
                                "game:state",
                                sanitizeStateForPlayer(updatedState, p.playerId)
                            );
                        }
                    });
                }

                // Emit general state update to room
                io.to(roomId).emit("game:stateUpdate", sanitizeStateForAll(updatedState));
            } catch (err) {
                console.error("game:action error:", err);
                socket.emit("game:error", { error: "Failed to handle game action" });
            }
        });

        socket.on("game:cleanup", (roomId: string) => {
            try {
                gameManager.cleanupGame(roomId);
            } catch (err) {
                console.error("game:cleanup error:", err);
                socket.emit("game:error", { error: "Failed to cleanup game" });
            }
        });


        socket.on("coup:loseCardChoice", (payload: GameActionPayload, ack?: SocketAck) => {
            try {
                const { roomId, action } = payload;
                gameManager.handleAction(roomId, action);
                const updatedState = gameManager.getGameState(roomId);

                if (updatedState && updatedState.players) {
                    // Emit sanitized state to each player individually
                    updatedState.players.forEach((p: any) => {
                        const targetSocket = p.socketId || p.playerId;
                        if (targetSocket) {
                            io.to(targetSocket).emit(
                                "game:state",
                                sanitizeStateForPlayer(updatedState, p.playerId)
                            );
                        }
                    });
                }
                io.to(roomId).emit("game:stateUpdate", sanitizeStateForAll(updatedState));
                safeAck(ack, { success: true });
            } catch (err) {
                console.error("coup:loseCardChoice error:", err);
                emitError(socket, "Failed to process lose card choice");
                safeAck(ack, { success: false, error: "Failed to process lose card choice" });
            }
        });

        socket.on("coup:exchangeCardsChoice", (payload: GameActionPayload, ack?: SocketAck) => {
            try {
                const { roomId, action } = payload;
                gameManager.handleAction(roomId, action);
                const updatedState = gameManager.getGameState(roomId);

                if (updatedState && updatedState.players) {
                    // Emit sanitized state to each player individually
                    updatedState.players.forEach((p: any) => {
                        const targetSocket = p.socketId || p.playerId;
                        if (targetSocket) {
                            io.to(targetSocket).emit(
                                "game:state",
                                sanitizeStateForPlayer(updatedState, p.playerId)
                            );
                        }
                    });
                }
                io.to(roomId).emit("game:stateUpdate", sanitizeStateForAll(updatedState));
                safeAck(ack, { success: true });
            } catch (err) {
                console.error("coup:exchangeCardsChoice error:", err);
                emitError(socket, "Failed to process exchange cards choice");
                safeAck(ack, { success: false, error: "Failed to process exchange cards choice" });
            }
        });

        socket.on("coup:blockCardChoice", (payload: GameActionPayload, ack?: SocketAck) => {
            try {
                const { roomId, action } = payload;
                gameManager.handleAction(roomId, action);
                const updatedState = gameManager.getGameState(roomId);

                if (updatedState && updatedState.players) {
                    // Emit sanitized state to each player individually
                    updatedState.players.forEach((p: any) => {
                        const targetSocket = p.socketId || p.playerId;
                        if (targetSocket) {
                            io.to(targetSocket).emit(
                                "game:state",
                                sanitizeStateForPlayer(updatedState, p.playerId)
                            );
                        }
                    });
                }
                io.to(roomId).emit("game:stateUpdate", sanitizeStateForAll(updatedState));
                safeAck(ack, { success: true });
            } catch (err) {
                console.error("coup:blockCardChoice error:", err);
                emitError(socket, "Failed to process block card choice");
                safeAck(ack, { success: false, error: "Failed to process block card choice" });
            }
        });

        socket.on("disconnect", (reason) => {
            console.log("Socket disconnected:", socket.id, reason);
            connectedSockets.delete(socket.id);

            const roomsJoined = Array.from(socket.rooms).filter(r => r !== socket.id);
            roomsJoined.forEach(roomId => {
                try {
                    console.log(`Backend: Handling disconnect for room ${roomId}, socket ${socket.id}`);
                    markPlayerDisconnected(roomId, socket.id);
                    const full = getFullRoomData(roomId);

                    // Notify other players about the disconnection
                    io.to(roomId).emit("players:update", {
                        roomId,
                        players: full?.players ?? []
                    });

                    // If there's an active game, notify players about the disconnection
                    const room = getRoom(roomId);
                    if (room?.game) {
                        console.log(`Backend: Player disconnected during active game in room ${roomId}`);
                        io.to(roomId).emit("player:disconnected", {
                            roomId,
                            socketId: socket.id,
                            message: "A player has disconnected. They can rejoin the game."
                        });
                    }

                    emitRoomUpdate(io);
                } catch (err) {
                    console.error("Error handling disconnect for room", roomId, err);
                }
            });
        });
    });

    // Cleanup inactive games periodically
    setInterval(() => {
        // This would need to be implemented in GameManager
        // gameManager.cleanupInactiveGames();
    }, 5 * 60 * 1000); // Every 5 minutes
}
