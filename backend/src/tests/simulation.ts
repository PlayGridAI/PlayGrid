/**
 * Automated Simulation Script for PlayGrid COUP
 *
 * Connects 4 socket.io clients, creates a room, starts a COUP game,
 * and simulates random actions until a winner is found.
 *
 * Usage:
 *   1. Start backend & frontend:  npm run dev  (from root)
 *   2. Run simulation:  cd backend && npx ts-node --transpile-only src/tests/simulation.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { io, type Socket } from "socket.io-client";

const BACKEND_URL = "http://localhost:4000";
const NUM_PLAYERS = 4;
const MAX_TURNS = 200;
const ACTION_DELAY_MS = 300;

// Actions that claim a role and can be challenged
const CHALLENGEABLE_ACTIONS = ["TAX", "STEAL", "ASSASSINATE", "EXCHANGE"];

// ── Helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function randomItem(arr: any[]): any {
    return arr[Math.floor(Math.random() * arr.length)];
}

interface PlayerSession {
    name: string;
    playerId: string;
    socket: Socket;
    roomId: string;
}

// ── Socket helpers ──────────────────────────────────────────────────────

function connectSocket(name: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = io(BACKEND_URL, { transports: ["websocket"] });
        socket.on("connect", () => {
            console.log(`  [${name}] connected  socket=${socket.id}`);
            resolve(socket);
        });
        socket.on("connect_error", (err: Error) => reject(err));
        setTimeout(() => reject(new Error(`${name} connect timeout`)), 10000);
    });
}

function createRoom(socket: Socket, playerName: string): Promise<{ roomId: string; playerId: string }> {
    return new Promise((resolve, reject) => {
        // Register listener BEFORE emit — room:joined fires before ack
        socket.once("room:joined", ({ room, player }: any) => {
            resolve({ roomId: room.roomId, playerId: player.playerId });
        });
        socket.emit(
            "createRoom",
            { roomName: "SimRoom", isPrivate: false, playerName, maxPlayers: NUM_PLAYERS },
            (res: any) => {
                if (!res.success) {
                    reject(new Error(res.error || "createRoom failed"));
                }
            }
        );
        setTimeout(() => reject(new Error("createRoom timeout")), 10000);
    });
}

function joinRoom(socket: Socket, roomId: string, playerName: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Register listener BEFORE emit — room:joined fires before ack
        socket.once("room:joined", ({ player }: any) => {
            resolve(player.playerId);
        });
        socket.emit("joinRoom", { roomId, playerName }, (res: any) => {
            if (!res.success) reject(new Error(res.error || "joinRoom failed"));
        });
        setTimeout(() => reject(new Error("joinRoom timeout")), 10000);
    });
}

function startGame(socket: Socket, roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        socket.emit("game:start", { roomId, gameId: "coup" }, (res: any) => {
            if (res.success) resolve();
            else reject(new Error(res.error || "game:start failed"));
        });
        setTimeout(() => reject(new Error("startGame timeout")), 10000);
    });
}

function joinGame(socket: Socket, roomId: string): Promise<any> {
    return new Promise((resolve, reject) => {
        socket.once("game:state", (state: any) => resolve(state));
        socket.emit("game:join", { roomId, gameId: "coup" });
        setTimeout(() => reject(new Error("joinGame timeout")), 10000);
    });
}

function sendAction(socket: Socket, roomId: string, action: any): void {
    socket.emit("game:action", { roomId, gameId: "coup", action });
}

function sendLoseCard(socket: Socket, roomId: string, playerId: string, card: string): void {
    socket.emit("coup:loseCardChoice", {
        roomId,
        action: { type: "LOSE_CARD", playerId, payload: { card } },
    });
}

function sendExchangeCards(socket: Socket, roomId: string, playerId: string, selectedCards: string[]): void {
    socket.emit("coup:exchangeCardsChoice", {
        roomId,
        action: { type: "EXCHANGE_CARDS", playerId, payload: { selectedCards } },
    });
}

// ── Main simulation ─────────────────────────────────────────────────────

async function runSimulation() {
    console.log("═══════════════════════════════════════════════════════");
    console.log(" PlayGrid COUP — 4-Player Automated Simulation");
    console.log("═══════════════════════════════════════════════════════\n");

    // 1. Connect 4 sockets
    const names = ["Alice", "Bob", "Charlie", "Diana"];
    const sessions: PlayerSession[] = [];

    console.log("► Connecting players...");
    const sockets: Socket[] = [];
    for (const name of names) {
        sockets.push(await connectSocket(name));
    }

    // 2. Player 1 creates room
    console.log("\n► Creating room...");
    const { roomId, playerId: hostId } = await createRoom(sockets[0], names[0]);
    sessions.push({ name: names[0], playerId: hostId, socket: sockets[0], roomId });
    console.log(`  Room created: ${roomId}, host: ${names[0]} (${hostId})`);

    // 3. Players 2-4 join
    console.log("\n► Joining players...");
    for (let i = 1; i < NUM_PLAYERS; i++) {
        const pid = await joinRoom(sockets[i], roomId, names[i]);
        sessions.push({ name: names[i], playerId: pid, socket: sockets[i], roomId });
        console.log(`  ${names[i]} joined (${pid})`);
        await sleep(200);
    }

    // 4. Host starts game
    console.log("\n► Starting game...");
    const startedPromises = sessions.map(
        (s) => new Promise<void>((resolve) => s.socket.once("game:started", () => resolve()))
    );
    await startGame(sockets[0], roomId);
    await Promise.all(startedPromises);
    console.log("  Game started!\n");

    // 5. Each player joins the game to get initial state
    const states: any[] = [];
    for (const s of sessions) {
        const st = await joinGame(s.socket, roomId);
        states.push(st);
    }

    // Set up continuous state listeners
    for (let i = 0; i < sessions.length; i++) {
        sessions[i].socket.on("game:state", (state: any) => {
            states[i] = state;
        });
    }

    // Set up auto-responders for card-loss and exchange modals
    for (const s of sessions) {
        s.socket.on("coup:chooseCardToLose", (data: any) => {
            if (data.playerId === s.playerId && data.cards?.length > 0) {
                console.log(`  >> ${s.name} auto-loses card: ${data.cards[0]}`);
                sendLoseCard(s.socket, roomId, s.playerId, data.cards[0]);
            }
        });
        s.socket.on("coup:chooseExchangeCards", (data: any) => {
            if (data.playerId === s.playerId) {
                const kept = data.availableCards.slice(0, data.cardsToKeep);
                console.log(`  >> ${s.name} auto-keeps exchange: ${kept.join(", ")}`);
                sendExchangeCards(s.socket, roomId, s.playerId, kept);
            }
        });
    }

    // 6. Game loop
    console.log("═══════════════════════════════════════════════════════");
    console.log(" GAME LOOP");
    console.log("═══════════════════════════════════════════════════════\n");

    let turnCount = 0;

    while (turnCount < MAX_TURNS) {
        await sleep(ACTION_DELAY_MS);
        turnCount++;

        const refState = states[0];
        if (!refState || !refState.players) {
            console.log("  Waiting for state...");
            await sleep(500);
            continue;
        }

        // Check for winner
        if (refState.winner) {
            const winnerPlayer = refState.players.find((p: any) => p.playerId === refState.winner);
            console.log(`\n🏆 WINNER: ${winnerPlayer?.name || refState.winner} after ${turnCount} turns!\n`);
            break;
        }

        // Handle pending action responses
        if (refState.pendingAction) {
            const pending = refState.pendingAction;
            const alivePlayers = refState.players.filter((p: any) => p.isAlive);

            let eligibleResponders: string[];
            if (pending.blockedBy) {
                eligibleResponders = alivePlayers
                    .filter((p: any) => p.playerId !== pending.fromPlayerId && p.playerId !== pending.blockedBy)
                    .map((p: any) => p.playerId);
            } else {
                eligibleResponders = alivePlayers
                    .filter((p: any) => p.playerId !== pending.fromPlayerId)
                    .map((p: any) => p.playerId);
            }

            const responded = pending.respondedPlayers || [];
            const needToRespond = eligibleResponders.filter((id: string) => !responded.includes(id));

            if (needToRespond.length > 0) {
                for (const responderId of needToRespond) {
                    const session = sessions.find((s) => s.playerId === responderId);
                    if (!session) continue;

                    const roll = Math.random();

                    if (roll < 0.2 && CHALLENGEABLE_ACTIONS.includes(pending.type)) {
                        const targetId = pending.blockedBy || pending.fromPlayerId;
                        console.log(`  Turn ${turnCount}: ${session.name} CHALLENGES ${targetId}`);
                        sendAction(session.socket, roomId, {
                            type: "CHALLENGE",
                            playerId: responderId,
                            payload: { targetId },
                        });
                        await sleep(ACTION_DELAY_MS);
                        break;
                    } else if (roll < 0.3 && !pending.blockedBy) {
                        const canBlock =
                            pending.type === "FOREIGN_AID" ||
                            (pending.type === "ASSASSINATE" && pending.toPlayerId === responderId) ||
                            (pending.type === "STEAL" && pending.toPlayerId === responderId);

                        if (canBlock) {
                            console.log(`  Turn ${turnCount}: ${session.name} BLOCKS ${pending.type}`);
                            sendAction(session.socket, roomId, {
                                type: "BLOCK",
                                playerId: responderId,
                            });
                            await sleep(ACTION_DELAY_MS);
                            break;
                        }
                    }

                    console.log(`  Turn ${turnCount}: ${session.name} passes`);
                    sendAction(session.socket, roomId, {
                        type: "RESOLVE_ACTION",
                        playerId: responderId,
                    });
                    await sleep(ACTION_DELAY_MS / 2);
                }
                continue;
            }
            continue;
        }

        // Wait for auto-responders
        if (refState.pendingCardLoss || refState.exchangeCards) {
            await sleep(300);
            continue;
        }

        // Normal turn
        const currentTurnId = refState.currentTurnPlayerId;
        const currentSession = sessions.find((s) => s.playerId === currentTurnId);
        if (!currentSession) {
            console.log(`  Turn ${turnCount}: Cannot find session for ${currentTurnId}`);
            continue;
        }

        const me = refState.players.find((p: any) => p.playerId === currentTurnId);
        if (!me || !me.isAlive) continue;

        const opponents = refState.players.filter(
            (p: any) => p.isAlive && p.playerId !== currentTurnId
        );

        // Must coup at 10+ coins
        if (me.coins >= 10) {
            const target = randomItem(opponents);
            console.log(`  Turn ${turnCount}: ${currentSession.name} forced COUP → ${target.name}`);
            sendAction(currentSession.socket, roomId, {
                type: "COUP",
                playerId: currentTurnId,
                payload: { targetId: target.playerId },
            });
            continue;
        }

        // Choose random action
        const possibleActions: { type: string; payload?: any }[] = [
            { type: "INCOME" },
            { type: "FOREIGN_AID" },
            { type: "TAX" },
            { type: "EXCHANGE" },
        ];

        if (me.coins >= 7) {
            const t = randomItem(opponents);
            possibleActions.push({ type: "COUP", payload: { targetId: t.playerId } });
        }
        if (me.coins >= 3) {
            const t = randomItem(opponents);
            possibleActions.push({ type: "ASSASSINATE", payload: { targetId: t.playerId } });
        }
        if (opponents.length > 0) {
            const t = randomItem(opponents);
            possibleActions.push({ type: "STEAL", payload: { targetId: t.playerId } });
        }

        const chosen = randomItem(possibleActions);
        const targetName = chosen.payload?.targetId
            ? refState.players.find((p: any) => p.playerId === chosen.payload.targetId)?.name || ""
            : "";
        console.log(
            `  Turn ${turnCount}: ${currentSession.name} → ${chosen.type}${targetName ? ` on ${targetName}` : ""} (coins: ${me.coins})`
        );

        sendAction(currentSession.socket, roomId, {
            type: chosen.type,
            playerId: currentTurnId,
            payload: chosen.payload,
        });
    }

    // 7. Final state consistency check
    console.log("\n═══════════════════════════════════════════════════════");
    console.log(" STATE CONSISTENCY CHECK");
    console.log("═══════════════════════════════════════════════════════\n");

    await sleep(1000);

    let consistent = true;
    const refFinal = states[0];

    for (let i = 1; i < sessions.length; i++) {
        const other = states[i];
        if (!refFinal || !other) {
            console.log(`  ❌ Player ${i} has no state`);
            consistent = false;
            continue;
        }

        if (refFinal.currentTurnPlayerId !== other.currentTurnPlayerId) {
            console.log(`  ❌ Turn mismatch: P0=${refFinal.currentTurnPlayerId} vs P${i}=${other.currentTurnPlayerId}`);
            consistent = false;
        }
        if (refFinal.winner !== other.winner) {
            console.log(`  ❌ Winner mismatch: P0=${refFinal.winner} vs P${i}=${other.winner}`);
            consistent = false;
        }

        for (let j = 0; j < refFinal.players.length; j++) {
            const rp = refFinal.players[j];
            const op = other.players[j];
            if (rp.coins !== op.coins) {
                console.log(`  ❌ Coins mismatch for ${rp.name}: P0=${rp.coins} vs P${i}=${op.coins}`);
                consistent = false;
            }
            if (rp.isAlive !== op.isAlive) {
                console.log(`  ❌ Alive mismatch for ${rp.name}: P0=${rp.isAlive} vs P${i}=${op.isAlive}`);
                consistent = false;
            }
        }
    }

    if (consistent) {
        console.log("  ✅ All 4 sessions have consistent public state!\n");
    } else {
        console.log("  ❌ State inconsistencies detected!\n");
    }

    // Print final state summary
    console.log("Final State Summary:");
    if (refFinal) {
        for (const p of refFinal.players) {
            console.log(
                `  ${p.name}: coins=${p.coins}, alive=${p.isAlive}, cards=${p.influence?.length || 0}, revealed=${p.revealedCards?.join(",") || "none"}`
            );
        }
        console.log(`  Winner: ${refFinal.winner || "none"}`);
        console.log(`  Turn: ${refFinal.turnNumber}`);
    }

    // Cleanup
    console.log("\n► Cleaning up...");
    for (const s of sessions) {
        s.socket.disconnect();
    }
    console.log("  Done.\n");

    process.exit(consistent ? 0 : 1);
}

// ── Entry point ─────────────────────────────────────────────────────────
runSimulation().catch((err) => {
    console.error("Simulation failed:", err);
    process.exit(1);
});
