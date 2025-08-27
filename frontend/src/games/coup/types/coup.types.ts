// src/games/coup/types/coup.types.ts

// Action log entry for the game
export interface ActionLogEntry {
    id: string;
    timestamp: number;
    playerName: string;
    action: string;
    target?: string;
    outcome: string;
    turnNumber: number;
}

export interface CoupPlayer {
    playerId: string;
    name: string;
    coins: number;
    isAlive: boolean;
    // optional shapes that server might send:
    influence?: string[]; // server may provide this
    revealedCards?: string[]; // server may provide this
    // client-friendly optional field:
    cardsRemaining?: number;
    socketId?: string;
}

export interface PendingAction {
    type: string;
    fromPlayerId: string;
    toPlayerId?: string;
    blocked?: boolean;
    blockedBy?: string;
    blockingCard?: string;
    challengeResolved?: boolean;
    successful?: boolean;
    respondedPlayers?: string[];
}

export interface CoupGameState {
    players: CoupPlayer[];
    currentTurnPlayerId: string;
    turnNumber?: number;
    actionLogs?: ActionLogEntry[];
    pendingAction?: PendingAction;
    winner?: string;
}

export interface CoinAnimation {
    id: string;
    amount: number;
}

export interface GameAction {
    type: string;
    payload?: any;
    playerId: string;
}

export interface CurrentPlayer {
    playerId: string;
    name: string;
}

// Action types as a union type and object for better type safety
export type ActionType =
    | 'INCOME'
    | 'FOREIGN_AID'
    | 'TAX'
    | 'COUP'
    | 'ASSASSINATE'
    | 'STEAL'
    | 'EXCHANGE'
    | 'BLOCK'
    | 'CHALLENGE'
    | 'RESOLVE_ACTION';

export const ActionType = {
    INCOME: 'INCOME' as ActionType,
    FOREIGN_AID: 'FOREIGN_AID' as ActionType,
    TAX: 'TAX' as ActionType,
    COUP: 'COUP' as ActionType,
    ASSASSINATE: 'ASSASSINATE' as ActionType,
    STEAL: 'STEAL' as ActionType,
    EXCHANGE: 'EXCHANGE' as ActionType,
    BLOCK: 'BLOCK' as ActionType,
    CHALLENGE: 'CHALLENGE' as ActionType,
    RESOLVE_ACTION: 'RESOLVE_ACTION' as ActionType
};

// Action cost mapping
export const ACTION_COSTS: Record<string, number> = {
    [ActionType.COUP]: 7,
    [ActionType.ASSASSINATE]: 3,
    [ActionType.INCOME]: 0,
    [ActionType.FOREIGN_AID]: 0,
    [ActionType.TAX]: 0,
    [ActionType.STEAL]: 0,
    [ActionType.EXCHANGE]: 0
};

// Actions that require a target
export const ACTIONS_REQUIRING_TARGET = [
    ActionType.COUP,
    ActionType.ASSASSINATE,
    ActionType.STEAL
];

// Action payload interface
export interface ActionPayload {
    targetId?: string;
    role?: string;
}