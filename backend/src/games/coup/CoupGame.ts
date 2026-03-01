// src/games/coup/CoupGame.ts
import { IGame, GameAction, GameState } from "../IGame";
import { Player } from "../../rooms";
import { stat } from "fs";

// Characters in Coup
export type CoupCard = "Duke" | "Assassin" | "Captain" | "Ambassador" | "Contessa";

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

export interface PendingAction {
    type: string;
    fromPlayerId: string;
    toPlayerId?: string;
    blockedBy?: string;
    respondedPlayers?: string[]; // Players who have responded to challenge/block
    blockingCard?: CoupCard; // Specific card used for blocking
}

// Player-specific state
interface CoupPlayer extends Player {
    coins: number;
    influence: CoupCard[];      // hidden cards
    revealedCards: CoupCard[];  // revealed/lost cards
    isAlive: boolean;
}

// Coup-specific game state
export interface CoupGameState extends GameState {
    players: CoupPlayer[];
    deck: CoupCard[];
    currentTurnPlayerId: string;
    turnNumber: number;
    actionLogs: ActionLogEntry[];
    pendingAction?: PendingAction;
    exchangeCards?: {
        playerId: string;
        cards: CoupCard[];
        toKeep: number;
    };
    pendingCardLoss?: {
        playerId: string;
        amount?: number;
    };
    winner?: string;
}

export class CoupGame implements IGame {
    gameId = "coup";
    onEvent: ((roomId: string | string[], event: any, payload: any) => void) | undefined;
    // Per-player event emitter (for private state like exchange cards)
    onPlayerEvent: ((socketId: string, event: string, payload: any) => void) | undefined;

    // Game constants
    private static readonly STARTING_COINS = 2;
    private static readonly CARDS_PER_PLAYER = 2;
    private static readonly CARDS_PER_TYPE = 3;
    private static readonly COUP_COST = 7;
    private static readonly ASSASSINATE_COST = 3;
    private static readonly FORCED_COUP_THRESHOLD = 10;
    private static readonly INCOME_AMOUNT = 1;
    private static readonly FOREIGN_AID_AMOUNT = 2;
    private static readonly TAX_AMOUNT = 3;
    private static readonly STEAL_AMOUNT = 2;

    // Create full deck (3 of each card)
    private createDeck(): CoupCard[] {
        const cards: CoupCard[] = [];
        const cardTypes: CoupCard[] = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"];
        for (const type of cardTypes) {
            for (let i = 0; i < CoupGame.CARDS_PER_TYPE; i++) {
                cards.push(type);
            }
        }
        return this.shuffle(cards);
    }

    private shuffle<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private getPlayerName(state: CoupGameState, playerId: string): string {
        const player = state.players.find(p => p.playerId === playerId);
        return player?.name || "Unknown Player";
    }

    private addActionLog(roomId: string, state: CoupGameState, playerName: string, action: string, target?: string, outcome: string = ""): void {
        const logEntry: ActionLogEntry = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            playerName,
            action,
            target,
            outcome,
            turnNumber: state.turnNumber
        };

        state.actionLogs.push(logEntry);

        // Emit real-time log update
        if (this.onEvent) {
            this.onEvent(roomId, "coup:actionLog", {
                logEntry,
                allLogs: state.actionLogs
            });
        }
    }

    private addTurnEndLog(roomId: string, state: CoupGameState): void {
        const logEntry: ActionLogEntry = {
            id: `turn-end-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            playerName: "",
            action: "TURN_END",
            outcome: `--- End of Turn ${state.turnNumber} ---`,
            turnNumber: state.turnNumber
        };

        state.actionLogs.push(logEntry);

        // Emit real-time log update
        if (this.onEvent) {
            this.onEvent(roomId, "coup:actionLog", {
                logEntry,
                allLogs: state.actionLogs
            });
        }
    }

    initGame(roomId: string, players: Player[]): CoupGameState {
        let deck = this.createDeck();
        const coupPlayers: CoupPlayer[] = players.map((p) => {
            const influence = [deck.pop()!, deck.pop()!]; // deal cards per player
            return {
                ...p,
                coins: CoupGame.STARTING_COINS,
                influence,
                revealedCards: [],
                isAlive: true,
            };
        });

        return {
            players: coupPlayers,
            deck,
            currentTurnPlayerId: coupPlayers[0].playerId,
            turnNumber: 1,
            actionLogs: [],
        };
    }
    validateAction(action: GameAction, state: CoupGameState): boolean {
        const player = state.players.find(p => p.playerId === action.playerId);
        if (!player || !player.isAlive) return false;
        // If a challenge/block is pending, only those related actions are allowed
        if (state.pendingAction && !["BLOCK", "CHALLENGE", "RESOLVE_ACTION", "EXCHANGE_CARDS", "EXCHANGE", "CHOOSE_BLOCK_CARD", "LOSE_CARD", "SURRENDER"].includes(action.type)) {
            return false;
        }

        // Must coup if at forced coup threshold
        if (player.coins >= CoupGame.FORCED_COUP_THRESHOLD && action.type !== "COUP" && action.type !== "SURRENDER") {
            return false;
        }

        switch (action.type) {
            case "INCOME":
            case "TAX":
            case "FOREIGN_AID":
            case "EXCHANGE":
            case "LOSE_CARD":
            case "EXCHANGE_CARDS":
            case "CHOOSE_BLOCK_CARD":
            case "SURRENDER":
                return true;

            case "COUP":
                return player.coins >= CoupGame.COUP_COST && this.isValidTarget(action.payload?.targetId, state, player.playerId);

            case "ASSASSINATE":
                return player.coins >= CoupGame.ASSASSINATE_COST && this.isValidTarget(action.payload?.targetId, state, player.playerId);

            case "STEAL":
                return this.isValidTarget(action.payload?.targetId, state, player.playerId);

            case "BLOCK":
                // Can only block if there's a pending action that can be blocked
                if (!state.pendingAction) return false;
                const canBlock = this.canActionBeBlocked(state.pendingAction.type);
                if (!canBlock) return false;

                // For ASSASSINATE and STEAL, only the target can block
                if (state.pendingAction.type === "ASSASSINATE" || state.pendingAction.type === "STEAL") {
                    return state.pendingAction.toPlayerId === action.playerId;
                }

                // For other blockable actions (FOREIGN_AID), any other player can block
                return state.pendingAction.fromPlayerId !== action.playerId;

            case "CHALLENGE":
                // Can only challenge if there's a pending action/block that can be challenged
                // and the player hasn't already responded
                if (!state.pendingAction) return false;
                const respondedPlayers = state.pendingAction.respondedPlayers || [];
                if (respondedPlayers.includes(action.playerId)) return false;

                // Can challenge either the original action or a block
                const canChallengeAction = this.canActionBeChallenged(state.pendingAction.type);
                const canChallengeBlock = state.pendingAction.blockedBy && state.pendingAction.blockingCard;

                if (!canChallengeAction && !canChallengeBlock) return false;

                // Can't challenge yourself
                const targetId = action.payload?.targetId;
                return targetId !== action.playerId && targetId &&
                    (targetId === state.pendingAction.fromPlayerId || targetId === state.pendingAction.blockedBy);

            case "RESOLVE_ACTION":
                // Can only resolve if there's a pending action and player hasn't responded
                if (!state.pendingAction) return false;
                const alreadyResponded = (state.pendingAction.respondedPlayers || []).includes(action.playerId);
                if (alreadyResponded) return false;

                return true;

            default:
                return false;
        }
    }

    private isValidTarget(targetId: string, state: CoupGameState, selfId: string): boolean {
        const target = state.players.find(p => p.playerId === targetId);
        return !!target && target.isAlive && target.playerId !== selfId;
    }


    handleAction(roomId: string, action: GameAction, state: CoupGameState): CoupGameState {
        const player = state.players.find(p => p.playerId === action.playerId);
        if (!player || !player.isAlive) return state;

        switch (action.type) {
            case "INCOME":
                player.coins += CoupGame.INCOME_AMOUNT;
                this.addActionLog(roomId, state, player.name, "Income", undefined, `gained ${CoupGame.INCOME_AMOUNT} coin.`);
                break;

            case "FOREIGN_AID":
                // Can be blocked by Duke
                state.pendingAction = {
                    type: "FOREIGN_AID",
                    fromPlayerId: player.playerId,
                    respondedPlayers: []
                };
                this.addActionLog(roomId, state, player.name, "Foreign Aid", undefined, "attempted to gain 2 coins from Foreign Aid.");
                break;

            case "TAX":
                // Claim Duke → subject to challenge
                state.pendingAction = {
                    type: "TAX",
                    fromPlayerId: player.playerId,
                    respondedPlayers: []
                };
                this.addActionLog(roomId, state, player.name, "Tax", undefined, "claimed Duke and attempted to gain 3 coins.");
                break;

            case "COUP":
                if (player.coins < CoupGame.COUP_COST) return state;
                player.coins -= CoupGame.COUP_COST;
                const coupTarget = this.getPlayerName(state, action.payload.targetId);
                this.addActionLog(roomId, state, player.name, "Coup", coupTarget, `paid 7 coins to coup ${coupTarget}.`);
                this.loseInfluence(roomId, state, action.payload.targetId);
                // Force turn advance for Coup since it's not blockable/challengeable
                if (!state.pendingCardLoss) {
                    this.advanceTurn(state);
                }
                break;

            case "ASSASSINATE":
                if (player.coins < CoupGame.ASSASSINATE_COST) return state;
                player.coins -= CoupGame.ASSASSINATE_COST;
                const assassinateTarget = this.getPlayerName(state, action.payload.targetId);
                state.pendingAction = {
                    type: "ASSASSINATE",
                    fromPlayerId: player.playerId,
                    toPlayerId: action.payload.targetId,
                    respondedPlayers: []
                };
                // NOTE: pendingCardLoss is NOT set here. Target only loses a card
                // when the action resolves (after challenge/block window closes).
                this.addActionLog(roomId, state, player.name, "Assassinate", assassinateTarget, `claimed Assassin and paid 3 coins to assassinate ${assassinateTarget}.`);
                break;

            case "STEAL":
                const stealTarget = this.getPlayerName(state, action.payload.targetId);
                state.pendingAction = {
                    type: "STEAL",
                    fromPlayerId: player.playerId,
                    toPlayerId: action.payload.targetId,
                    respondedPlayers: []
                };
                this.addActionLog(roomId, state, player.name, "Steal", stealTarget, `claimed Captain and attempted to steal from ${stealTarget}.`);
                break;

            case "EXCHANGE":
                state.pendingAction = {
                    type: "EXCHANGE",
                    fromPlayerId: player.playerId,
                    respondedPlayers: []
                };
                this.addActionLog(roomId, state, player.name, "Exchange", undefined, "claimed Ambassador and attempted to exchange cards.");
                break;

            case "SURRENDER":
                this.addActionLog(roomId, state, player.name, "Surrender", undefined, "forfeited the game.");
                player.revealedCards.push(...player.influence);
                player.influence = [];
                player.isAlive = false;

                if (state.pendingCardLoss?.playerId === player.playerId) {
                    state.pendingCardLoss = undefined;
                }
                if (state.exchangeCards?.playerId === player.playerId) {
                    // Return cards to deck
                    state.deck.push(...state.exchangeCards.cards);
                    state.deck = this.shuffle(state.deck);
                    state.exchangeCards = undefined;
                }

                this.checkWinner(state);

                // Cancel any pending action involving them
                if (state.pendingAction?.fromPlayerId === player.playerId ||
                    state.pendingAction?.toPlayerId === player.playerId ||
                    state.pendingAction?.blockedBy === player.playerId) {
                    state.pendingAction = undefined;
                    if (!state.pendingCardLoss && !state.winner) {
                        this.advanceTurn(state);
                    }
                } else if (state.currentTurnPlayerId === player.playerId && !state.winner) {
                    // They quit on their current turn
                    this.advanceTurn(state);
                } else if (state.pendingAction && !state.winner) {
                    // They quit during someone else's turn, see if everyone has now responded
                    if (this.allPlayersHaveResponded(state)) {
                        this.resolvePendingAction(roomId, state);
                    }
                }
                break;

            case "BLOCK":
                if (state.pendingAction && state.pendingAction.type) {
                    const actionType = state.pendingAction.type;
                    const blockableCards = this.getBlockableCards(actionType);

                    if (blockableCards.length === 0) {
                        console.warn(`Action ${actionType} cannot be blocked`);
                        return state;
                    }

                    // Auto-resolve Contessa block for Assassinate
                    if (actionType === "ASSASSINATE" && blockableCards.includes("Contessa")) {
                        const target = state.players.find(p => p.playerId === state.pendingAction?.toPlayerId);
                        if (target && target.influence.includes("Contessa")) {
                            state.pendingAction = {
                                ...state.pendingAction,
                                blockedBy: action.playerId,
                                blockingCard: "Contessa",
                                respondedPlayers: []
                            };

                            this.addActionLog(roomId, state, player.name, "Block", undefined, "blocked with Contessa.");

                            // Notify all players about the automatic block
                            if (this.onEvent) {
                                this.onEvent(roomId, "coup:blockAction", {
                                    action: actionType,
                                    blockedBy: action.playerId,
                                    blockingCard: "Contessa",
                                    automatic: true
                                });

                                // Emit pendingAction event for challenge panel
                                this.onEvent(roomId, "game:pendingAction", {
                                    type: "BLOCK_PENDING_CHALLENGE",
                                    action: actionType,
                                    blockedBy: action.playerId,
                                    blockingCard: "Contessa",
                                    originalAction: state.pendingAction
                                });
                            }
                            break;
                        }
                    }

                    // For STEAL, player must choose between Ambassador and Captain
                    if (actionType === "STEAL" && blockableCards.length > 1) {
                        if (this.onEvent) {
                            this.onEvent(roomId, "coup:chooseBlockCard", {
                                playerId: action.playerId,
                                availableCards: blockableCards,
                                actionToBlock: actionType
                            });
                        }
                        // Don't set block yet, wait for card choice
                        return state;
                    }

                    // For single-card blocks (FOREIGN_AID with Duke)
                    state.pendingAction = {
                        ...state.pendingAction,
                        blockedBy: action.playerId,
                        blockingCard: blockableCards[0],
                        respondedPlayers: []
                    };

                    this.addActionLog(roomId, state, player.name, "Block", undefined, `blocked with ${blockableCards[0]}.`);

                    // Notify all players about the block
                    if (this.onEvent) {
                        this.onEvent(roomId, "coup:blockAction", {
                            action: actionType,
                            blockedBy: action.playerId,
                            blockingCard: blockableCards[0]
                        });

                        // Emit pendingAction event for challenge panel
                        this.onEvent(roomId, "game:pendingAction", {
                            type: "BLOCK_PENDING_CHALLENGE",
                            action: actionType,
                            blockedBy: action.playerId,
                            blockingCard: blockableCards[0],
                            originalAction: state.pendingAction
                        });
                    }
                }
                break;

            case "CHOOSE_BLOCK_CARD":
                if (state.pendingAction && action.payload.blockingCard) {
                    state.pendingAction = {
                        ...state.pendingAction,
                        blockedBy: action.playerId,
                        blockingCard: action.payload.blockingCard,
                        respondedPlayers: []
                    };

                    this.addActionLog(roomId, state, player.name, "Block", undefined, `blocked with ${action.payload.blockingCard}.`);

                    // Notify all players about the block
                    if (this.onEvent) {
                        this.onEvent(roomId, "coup:blockAction", {
                            action: state.pendingAction.type,
                            blockedBy: action.playerId,
                            blockingCard: action.payload.blockingCard
                        });

                        // Emit pendingAction event for challenge panel
                        this.onEvent(roomId, "game:pendingAction", {
                            type: "BLOCK_PENDING_CHALLENGE",
                            action: state.pendingAction.type,
                            blockedBy: action.playerId,
                            blockingCard: action.payload.blockingCard,
                            originalAction: state.pendingAction
                        });
                    }
                }
                break;

            case "CHALLENGE":
                this.resolveChallenge(roomId, state, action);
                break;

            case "RESOLVE_ACTION":
                // If we're waiting for a card loss, the action is already resolving or fully resolved.
                // Ignore any late "Pass" responses to prevent double-resolving.
                if (state.pendingCardLoss) {
                    break;
                }

                // Track that this player has resolved (not challenging/blocking)
                if (state.pendingAction) {
                    const respondedPlayers = state.pendingAction.respondedPlayers || [];
                    if (!respondedPlayers.includes(action.playerId)) {
                        state.pendingAction.respondedPlayers = [...respondedPlayers, action.playerId];
                    }

                    // Check if all eligible players have responded
                    if (this.allPlayersHaveResponded(state)) {
                        this.resolvePendingAction(roomId, state);
                    }
                } else {
                    // No pending action, just resolve
                    this.resolvePendingAction(roomId, state);
                }
                break;
            case "LOSE_CARD":
                this.loseCard(roomId, state, action.playerId, action.payload.card);
                break;
            case "EXCHANGE_CARDS":
                this.handleExchangeCards(roomId, state, action.playerId, action.payload.selectedCards);
                break;
        }

        // Only INCOME resolves immediately and advances turn here.
        // All other primary actions create a pendingAction and advance turn
        // when the action fully resolves (via resolvePendingAction/loseCard/handleExchangeCards).
        // COUP advances turn in its own handler above (or after loseCard).
        if (action.type === "INCOME") {
            this.advanceTurn(state);
        }

        return state;
    }

    private resolveChallenge(roomId: string, state: CoupGameState, action: GameAction) {
        const claimedPlayer = state.players.find(p => p.playerId === action.payload.targetId);
        const claimedPlayerId = action.payload.targetId;
        const challenger = state.players.find(p => p.playerId === action.playerId);
        if (!claimedPlayer || !challenger || !state.pendingAction) return;

        let requiredCard: CoupCard;
        let isBlockChallenge = false;

        // Determine if this is a challenge to a block or to the original action
        if (state.pendingAction.blockedBy === claimedPlayerId && state.pendingAction.blockingCard) {
            // Challenging the block
            requiredCard = state.pendingAction.blockingCard;
            isBlockChallenge = true;
        } else if (state.pendingAction.fromPlayerId === claimedPlayerId) {
            // Challenging the original action
            const card = this.getRequiredCardForAction(state.pendingAction.type);
            if (!card) {
                console.warn(`Cannot challenge action ${state.pendingAction.type} — no role claim`);
                return;
            }
            requiredCard = card;
            isBlockChallenge = false;
        } else {
            console.warn("Invalid challenge target");
            return;
        }

        if (claimedPlayer.influence.includes(requiredCard)) {
            // Challenge failed - challenger loses influence
            this.addActionLog(roomId, state, challenger.name, "Challenge", claimedPlayer.name, `but failed. ${challenger.name} lost a card.`);
            this.loseInfluence(roomId, state, challenger.playerId);

            // Replace revealed card for the claimed player — remove only ONE instance
            const cardIdx = claimedPlayer.influence.indexOf(requiredCard);
            if (cardIdx !== -1) {
                claimedPlayer.influence.splice(cardIdx, 1);
            }
            state.deck.push(requiredCard);
            state.deck = this.shuffle(state.deck);
            claimedPlayer.influence.push(state.deck.pop()!);

            if (isBlockChallenge) {
                // Block challenge failed, block succeeds - action is blocked
                state.pendingAction = undefined;
                // If the challenger must manually pick a card to lose, we wait. Otherwise advance now.
                if (!state.pendingCardLoss) {
                    this.advanceTurn(state);
                }
            } else {
                // Action challenge failed, action continues — resolvePendingAction reads state.pendingAction
                // If challenger must pick a card, we should theoretically wait? 
                // Wait, if an action challenge fails, the action should resolve FIRST, so the challenger can lose their card afterwards, OR they lose it first?
                // The rules say they lose their card, then the action happens. So we continue. 
                // But if they have to pick a card, pendingCardLoss is set. If we resolvePendingAction now, it might overwrite pendingCardLoss or advanceTurn prematurely.
                // Actually, `resolvePendingAction` doesn't overwrite `pendingCardLoss` unless it triggers another loss (like Assassinate).
                this.resolvePendingAction(roomId, state);
            }
        } else {
            // Challenge succeeded - claimed player loses influence
            this.addActionLog(roomId, state, challenger.name, "Challenge", claimedPlayer.name, `successfully. ${claimedPlayer.name} lost a card.`);

            // Special case: If this was a Contessa block challenge for Assassinate, player loses both cards
            const isContessaBlockChallenge = isBlockChallenge &&
                state.pendingAction.blockingCard === "Contessa" &&
                state.pendingAction.type === "ASSASSINATE";

            if (isContessaBlockChallenge) {
                // Player loses one card for the failed challenge
                this.loseInfluence(roomId, state, claimedPlayerId);

                // Check if player is still alive after losing first card
                if (claimedPlayer.isAlive && claimedPlayer.influence.length > 0) {
                    // Player loses second card from the Assassinate action
                    this.addActionLog(roomId, state, claimedPlayer.name, "Assassinate", undefined, "was assassinated (failed Contessa block).");
                    this.loseInfluence(roomId, state, claimedPlayerId);
                }

                // Clear the pending action since both effects are resolved
                state.pendingAction = undefined;
                // Only advance if no pending card loss
                if (!state.pendingCardLoss) {
                    this.advanceTurn(state);
                }
            } else {
                this.loseInfluence(roomId, state, claimedPlayerId);

                if (isBlockChallenge) {
                    // Block challenge succeeded, block fails - resolve original action immediately!
                    state.pendingAction.blockedBy = undefined;
                    state.pendingAction.blockingCard = undefined;
                    this.resolvePendingAction(roomId, state);
                } else {
                    // Action challenge succeeded, action is canceled
                    state.pendingAction = undefined;
                    console.log("Action challenge succeeded, action is canceled.");
                    // Advance turn — the action is fully resolved (canceled) - ONLY if no pending card loss
                    if (!state.pendingCardLoss) {
                        this.advanceTurn(state);
                    }
                }
            }
        }
    }

    private getRequiredCardForAction(actionType: string): CoupCard | null {
        switch (actionType) {
            case "TAX": return "Duke";
            case "ASSASSINATE": return "Assassin";
            case "STEAL": return "Captain";
            case "EXCHANGE": return "Ambassador";
            default: return null; // Actions like FOREIGN_AID, INCOME, COUP have no role claim
        }
    }

    private getBlockableCards(actionType: string): CoupCard[] {
        switch (actionType) {
            case "FOREIGN_AID": return ["Duke"];
            case "ASSASSINATE": return ["Contessa"];
            case "STEAL": return ["Ambassador", "Captain"];
            default: return [];
        }
    }

    private canActionBeBlocked(actionType: string): boolean {
        return this.getBlockableCards(actionType).length > 0;
    }

    private canActionBeChallenged(actionType: string): boolean {
        try {
            this.getRequiredCardForAction(actionType);
            return true;
        } catch {
            return false;
        }
    }

    private getEligibleRespondersForAction(state: CoupGameState, actionPlayerId: string): string[] {
        // All alive players except the one performing the action can respond
        return state.players
            .filter(p => p.isAlive && p.playerId !== actionPlayerId)
            .map(p => p.playerId);
    }

    private getEligibleRespondersForBlock(state: CoupGameState, actionPlayerId: string, blockPlayerId: string): string[] {
        // All alive players except the original actor and the blocker can challenge the block
        return state.players
            .filter(p => p.isAlive && p.playerId !== actionPlayerId && p.playerId !== blockPlayerId)
            .map(p => p.playerId);
    }

    private allPlayersHaveResponded(state: CoupGameState): boolean {
        if (!state.pendingAction) return true;

        let eligiblePlayers: string[];

        if (state.pendingAction.blockedBy) {
            // This is a block - check if all can challenge the block
            eligiblePlayers = this.getEligibleRespondersForBlock(
                state,
                state.pendingAction.fromPlayerId,
                state.pendingAction.blockedBy
            );
        } else {
            // This is the original action - check if all can challenge/block
            eligiblePlayers = this.getEligibleRespondersForAction(state, state.pendingAction.fromPlayerId);
        }

        const respondedPlayers = state.pendingAction.respondedPlayers || [];
        return eligiblePlayers.every(playerId => respondedPlayers.includes(playerId));
    }
    private resolvePendingAction(roomId: string, state: CoupGameState) {
        console.log("Resolving pending action:", JSON.stringify(state.pendingAction));
        const action = state.pendingAction;
        if (!action) return;
        if (action.blockedBy) {
            console.log("Action is blocked by:", action.blockedBy);
            const blockedByName = this.getPlayerName(state, action.blockedBy);
            const fromName = this.getPlayerName(state, action.fromPlayerId);
            this.addActionLog(roomId, state, blockedByName, "Block", fromName, `blocked ${fromName} with ${action.blockingCard}.`);
            state.pendingAction = undefined;
            if (!state.pendingCardLoss) {
                this.advanceTurn(state);
            }
            return;
        }
        const from = state.players.find(p => p.playerId === action.fromPlayerId);
        const to = action.toPlayerId ? state.players.find(p => p.playerId === action.toPlayerId) : undefined;
        if (!from || (action.toPlayerId && !to)) return;

        switch (action.type) {
            case "FOREIGN_AID":
                from.coins += CoupGame.FOREIGN_AID_AMOUNT;
                this.addActionLog(roomId, state, from.name, "Foreign Aid", undefined, `gained ${CoupGame.FOREIGN_AID_AMOUNT} coins.`);
                state.pendingAction = undefined;
                break;
            case "TAX":
                from.coins += CoupGame.TAX_AMOUNT;
                this.addActionLog(roomId, state, from.name, "Tax", undefined, `gained ${CoupGame.TAX_AMOUNT} coins from Tax.`);
                state.pendingAction = undefined;
                break;
            case "ASSASSINATE":
                this.addActionLog(roomId, state, from.name, "Assassinate", to!.name, `successfully assassinated ${to!.name}.`);
                state.pendingAction = undefined;
                // loseInfluence may set pendingCardLoss if target has >1 card
                this.loseInfluence(roomId, state, to!.playerId);
                break;
            case "STEAL":
                const stolen = Math.min(CoupGame.STEAL_AMOUNT, to!.coins);
                to!.coins -= stolen;
                from.coins += stolen;
                this.addActionLog(roomId, state, from.name, "Steal", to!.name, `stole ${stolen} coins from ${to!.name}.`);
                state.pendingAction = undefined;
                break;
            case "EXCHANGE":
                const currentInfluenceCount = from.influence.length;
                const cardsToDraw = 2; // Draw 2 cards regardless
                const drawn: CoupCard[] = [];
                for (let i = 0; i < cardsToDraw && state.deck.length > 0; i++) {
                    drawn.push(state.deck.pop()!);
                }
                const combined: CoupCard[] = [...drawn, ...from.influence];

                // Store the combined cards temporarily
                state.exchangeCards = { playerId: from.playerId, cards: combined, toKeep: currentInfluenceCount };

                if (this.onPlayerEvent) {
                    // Send exchange cards privately to the specific player only
                    this.onPlayerEvent(from.playerId, "coup:chooseExchangeCards", {
                        playerId: from.playerId,
                        availableCards: combined,
                        cardsToKeep: currentInfluenceCount
                    });
                    return; // wait for client response (turn advances in handleExchangeCards)
                } else if (this.onEvent) {
                    // Fallback: broadcast (less secure)
                    this.onEvent(roomId, "coup:chooseExchangeCards", {
                        playerId: from.playerId,
                        availableCards: combined,
                        cardsToKeep: currentInfluenceCount
                    });
                    return; // wait for client response
                } else {
                    // In test mode: auto-pick first cards
                    from.influence = combined.slice(0, currentInfluenceCount);
                    state.deck.push(...combined.slice(currentInfluenceCount));
                    state.deck = this.shuffle(state.deck);
                    this.addActionLog(roomId, state, from.name, "Exchange", undefined, "exchanged cards with the deck.");
                }
                state.pendingAction = undefined;
                break;
        }

        if (!state.pendingCardLoss) {
            this.advanceTurn(state);
        }
    }



    private loseInfluence(roomId: string, state: CoupGameState, targetId: string) {
        const target = state.players.find((p) => p.playerId === targetId);
        if (!target || !target.isAlive) return;

        // If we're already waiting for this player to drop a card, just queue another loss
        if (state.pendingCardLoss && state.pendingCardLoss.playerId === targetId) {
            state.pendingCardLoss.amount = (state.pendingCardLoss.amount || 1) + 1;
            return;
        }

        if (target.influence.length === 1) {
            // auto-lose last card
            const lostCard = target.influence.pop()!;
            target.revealedCards.push(lostCard);
        } else if (target.influence.length > 1) {
            if (this.onEvent) {
                // In game mode: ask client which card to lose
                state.pendingCardLoss = { playerId: targetId, amount: 1 };
                this.onEvent(roomId, "coup:chooseCardToLose", {
                    playerId: targetId,
                    cards: target.influence,
                });
                return; // wait for client response
            } else {
                // In test mode: auto-lose first card
                const lostCard = target.influence.shift()!;
                target.revealedCards.push(lostCard);
            }
        }

        if (target.influence.length === 0) {
            target.isAlive = false;
            this.checkWinner(state);
        }
    }

    public loseCard(roomId: string, state: CoupGameState, playerId: string, chosenCard: CoupCard) {
        console.log(`Player ${playerId} chose to lose card: ${chosenCard}`);
        const player = state.players.find((p) => p.playerId === playerId);
        if (!player) return;

        if (!player.influence.includes(chosenCard)) {
            console.warn("Invalid card choice", chosenCard);
            return;
        }

        // remove chosen card (only one instance)
        const cardIndex = player.influence.indexOf(chosenCard);
        if (cardIndex > -1) {
            player.influence.splice(cardIndex, 1);
        }
        player.revealedCards.push(chosenCard);

        if (player.influence.length === 0) {
            player.isAlive = false;
            this.checkWinner(state);
        }

        // Handle multiple pending card losses (e.g., failed challenge + assassinated)
        if (state.pendingCardLoss && state.pendingCardLoss.playerId === playerId) {
            if (state.pendingCardLoss.amount && state.pendingCardLoss.amount > 1) {
                const remainingToLose = state.pendingCardLoss.amount - 1;
                state.pendingCardLoss = undefined; // Clear so loseInfluence works fresh

                // re-apply remaining card losses
                for (let i = 0; i < remainingToLose; i++) {
                    this.loseInfluence(roomId, state, playerId);
                }

                // If loseInfluence asked the user again, pendingCardLoss is set and we shouldn't advance yet.
                // If it auto-lost their last card(s), pendingCardLoss is undefined and we should advance.
                if (!state.pendingCardLoss && !state.pendingAction) {
                    this.advanceTurn(state);
                }
                return;
            }
        }

        // Clear pending card loss if we only had 1
        state.pendingCardLoss = undefined;
        // Only advance turn if there's no remaining pending action
        if (!state.pendingAction) {
            this.advanceTurn(state);
        }
    }

    public handleExchangeCards(roomId: string, state: CoupGameState, playerId: string, selectedCards: CoupCard[]) {
        console.log(`Player ${playerId} chose exchange cards:`, selectedCards);
        const exchangeData = state.exchangeCards;
        if (!exchangeData || exchangeData.playerId !== playerId) {
            console.warn("Invalid exchange card choice - no pending exchange");
            return;
        }

        const player = state.players.find((p) => p.playerId === playerId);
        if (!player) return;

        // Validate selection
        if (selectedCards.length !== exchangeData.toKeep) {
            console.warn(`Invalid exchange selection: expected ${exchangeData.toKeep} cards, got ${selectedCards.length}`);
            return;
        }

        // Validate all selected cards are in available cards
        for (const card of selectedCards) {
            if (!exchangeData.cards.includes(card)) {
                console.warn("Invalid card selected:", card);
                return;
            }
        }

        // Update player's influence with selected cards
        player.influence = [...selectedCards];

        // Return unselected cards to deck
        const unselectedCards = exchangeData.cards.filter(card => {
            const cardCount = selectedCards.filter(selected => selected === card).length;
            const availableCount = exchangeData.cards.filter(available => available === card).length;
            return cardCount < availableCount;
        });

        state.deck.push(...unselectedCards);
        state.deck = this.shuffle(state.deck);

        // Add log for completed exchange
        this.addActionLog(roomId, state, player.name, "Exchange", undefined, "exchanged cards with the deck.");

        // Clear exchange state and pending action, then advance turn
        state.exchangeCards = undefined;
        state.pendingAction = undefined;
        this.advanceTurn(state);
    }

    private advanceTurn(state: CoupGameState) {
        const allPlayers = state.players;
        const aliveCount = allPlayers.filter(p => p.isAlive).length;
        if (aliveCount <= 1) return; // Game over, no need to advance

        let currentIndex = allPlayers.findIndex(p => p.playerId === state.currentTurnPlayerId);
        let nextIndex = (currentIndex + 1) % allPlayers.length;

        // Keep advancing until we find an alive player
        while (!allPlayers[nextIndex].isAlive) {
            nextIndex = (nextIndex + 1) % allPlayers.length;
        }

        state.currentTurnPlayerId = allPlayers[nextIndex].playerId;

        // Increment turn number when we cycle back to the first player (or past it)
        // Also log the end of the round.
        if (nextIndex <= currentIndex) {
            this.addTurnEndLog("", state);
            state.turnNumber++;
        }
    }

    private checkWinner(state: CoupGameState) {
        console.log("Checking for winner...", state);
        const alivePlayers = state.players.filter(p => p.isAlive);
        if (alivePlayers.length === 1) {
            state.winner = alivePlayers[0].playerId;
        }
    }
}
