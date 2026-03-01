/**
 * In-memory room manager for Phase 1.
 *
 * - Stores rooms in a Map
 * - Keeps disconnected players for a short grace period so refresh/reconnect works
 */

import { generateId } from "./utils/idGenerator";
import { ROOM_DISCONNECT_GRACE_MS, DEFAULT_MAX_PLAYERS } from "./config";

export type Player = {
    playerId: string;    // stable id for a player across reconnects
    socketId?: string;   // latest socket id (undefined when disconnected)
    name: string;
    isHost: boolean;
    lastSeen: number;
    disconnectedTimer?: NodeJS.Timeout | null;
};

export type Room = {
    roomId: string;
    name: string;
    isPrivate: boolean;
    password?: string | null;
    players: Player[];
    maxPlayers: number;
    createdAt: number;
    game?: Game;
};

export type Game = {
    id: string;
    instance: any;
    state: any;
};

const rooms = new Map<string, Room>();

export function createRoom(name: string, isPrivate = false, password?: string | null, maxPlayers = DEFAULT_MAX_PLAYERS) {
    const roomId = generateId();
    const room: Room = {
        roomId,
        name,
        isPrivate,
        password: password ?? null,
        players: [],
        maxPlayers,
        createdAt: Date.now(),
        game: undefined
    };
    rooms.set(roomId, room);
    return room;
}

export function getRoom(roomId: string) {
    return rooms.get(roomId) ?? null;
}

export function getAllRooms() {
    return Array.from(rooms.values());
}

export function getPublicRoomsSummary() {
    const arr = Array.from(rooms.values())
        .map(r => ({
            roomId: r.roomId,
            name: r.name,
            isPrivate: r.isPrivate,
            playerCount: r.players.length,
            players: r.players,
            maxPlayers: r.maxPlayers,
            createdAt: r.createdAt
        }));
    return arr;
}

/**
 * Add player to room. If playerId already exists (reconnect), updates socketId & clears disconnect timer.
 * Returns player object.
 */
export function addPlayerToRoom(roomId: string, socketId: string, name: string, playerId?: string, isHost = false) {
    const room = rooms.get(roomId);
    if (!room) return null;
    // if playerId provided, try find existing player
    let player: Player | undefined;
    if (playerId) {
        player = room.players.find(p => p.playerId === playerId);
    }
    if (player) {
        // reconnecting player
        player.socketId = socketId;
        player.name = name; // update in case changed
        player.lastSeen = Date.now();
        if (player.disconnectedTimer) {
            clearTimeout(player.disconnectedTimer);
            player.disconnectedTimer = null;
        }
        return player;
    }

    if (room.players.length >= room.maxPlayers) return null;

    const newPlayer: Player = {
        playerId: generateId(),
        socketId,
        name,
        isHost,
        lastSeen: Date.now(),
        disconnectedTimer: null
    };
    room.players.push(newPlayer);
    return newPlayer;
}

export function markPlayerDisconnected(roomId: string, socketId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    const p = room.players.find(pl => pl.socketId === socketId);
    if (!p) return;
    p.socketId = undefined;
    p.lastSeen = Date.now();

    // set a timer to remove player after grace period
    p.disconnectedTimer = setTimeout(() => {
        removePlayerById(roomId, p.playerId);
    }, ROOM_DISCONNECT_GRACE_MS);
}

export function removePlayerById(roomId: string, playerId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    const idx = room.players.findIndex(p => p.playerId === playerId);
    if (idx >= 0) {
        const [removed] = room.players.splice(idx, 1);
        if (removed.disconnectedTimer) {
            clearTimeout(removed.disconnectedTimer);
        }
    }
    if (room.players.length === 0) {
        rooms.delete(roomId);
    } else {
        // ensure there is a host
        if (!room.players.some(p => p.isHost)) {
            room.players[0].isHost = true;
        }
    }
}

export function removePlayerBySocket(roomId: string, socketId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    const p = room.players.find(pl => pl.socketId === socketId);
    if (!p) return;
    // treat as graceful disconnect: mark disconnected (so reconnect possible)
    markPlayerDisconnected(roomId, socketId);
}

export function getRoomPublicView(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return null;
    return {
        roomId: room.roomId,
        name: room.name,
        isPrivate: room.isPrivate,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers
    };
}

export function getFullRoomData(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return null;
    // only return sanitized player info
    return {
        roomId: room.roomId,
        name: room.name,
        isPrivate: room.isPrivate,
        players: room.players.map(p => ({
            playerId: p.playerId,
            name: p.name,
            isHost: p.isHost,
            connected: !!p.socketId
        })),
        maxPlayers: room.maxPlayers
    };
}
