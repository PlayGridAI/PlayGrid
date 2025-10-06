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
    };
    winner?: string;
}

export class CoupGame implements IGame {
    gameId = "coup";
    onEvent: ((roomId: string | string[], event: any, payload: any) => void) | undefined;

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
        if (state.pendingAction && !["BLOCK", "CHALLENGE", "RESOLVE_ACTION", "EXCHANGE_CARDS", "EXCHANGE", "CHOOSE_BLOCK_CARD", "LOSE_CARD"].includes(action.type)) {
            return false;
        }

        // Must coup if at forced coup threshold
        if (player.coins >= CoupGame.FORCED_COUP_THRESHOLD && action.type !== "COUP") {
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
                return true;

            case "COUP":
                return player.coins >= CoupGame.COUP_COST && this.isValidTarget(action.payload?.targetId, state, player.playerId);

            case "ASSASSINATE":
                return player.coins >= CoupGame.ASSASSINATE_COST && this.isValidTarget(action.payload?.targetId, state, player.playerId);

            case "STEAL":
                return this.isValidTarget(action.payload?.targetId, state, player.playerId);

            case "BLOCK":
                // Can only block if there's a pending action that can be blocked
                // and the player is eligible (target for Assassinate, anyone for STEAL/FOREIGN_AID)
                if (!state.pendingAction) return false;
                const canBlock = this.canActionBeBlocked(state.pendingAction.type);
                if (!canBlock) return false;

                // For ASSASSINATE, only the target can block
                if (state.pendingAction.type === "ASSASSINATE") {
                    return state.pendingAction.toPlayerId === action.playerId;
                }

                // For other blockable actions, any other player can block
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
                player.coins -= CoupGame.ASSASSINATE_COST;
                const assassinateTarget = this.getPlayerName(state, action.payload.targetId);
                state.pendingAction = {
                    type: "ASSASSINATE",
                    fromPlayerId: player.playerId,
                    toPlayerId: action.payload.targetId,
                    respondedPlayers: []
                };
                state.pendingCardLoss = {
                    playerId: action.payload.targetId
                };
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

        // Only advance turn for primary actions, not for response actions or card loss
        // Also don't advance if there's a pending card loss waiting for player choice
        if (!["CHALLENGE", "BLOCK", "RESOLVE_ACTION", "LOSE_CARD", "EXCHANGE_CARDS", "CHOOSE_BLOCK_CARD"].includes(action.type) &&
            !state.pendingCardLoss) {
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
            requiredCard = this.getRequiredCardForAction(state.pendingAction.type);
            isBlockChallenge = false;
        } else {
            console.warn("Invalid challenge target");
            return;
        }

        if (claimedPlayer.influence.includes(requiredCard)) {
            // Challenge failed - challenger loses influence
            this.addActionLog(roomId, state, challenger.name, "Challenge", claimedPlayer.name, `challenged ${claimedPlayer.name} but failed. ${challenger.name} lost a card.`);
            this.loseInfluence(roomId, state, challenger.playerId);

            // Replace revealed card for the claimed player
            claimedPlayer.influence = claimedPlayer.influence.filter(c => c !== requiredCard);
            state.deck.push(requiredCard);
            state.deck = this.shuffle(state.deck);
            claimedPlayer.influence.push(state.deck.pop()!);

            if (isBlockChallenge) {
                // Block challenge failed, block succeeds - action is blocked
                state.pendingAction = undefined;
            } else {
                // Action challenge failed, continue with action
                state.pendingAction = undefined;
                this.resolvePendingAction(roomId, state);
            }
        } else {
            // Challenge succeeded - claimed player loses influence
            this.addActionLog(roomId, state, challenger.name, "Challenge", claimedPlayer.name, `challenged ${claimedPlayer.name} successfully. ${claimedPlayer.name} lost a card.`);

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
            } else {
                this.loseInfluence(roomId, state, claimedPlayerId);

                if (isBlockChallenge) {
                    // Block challenge succeeded, block fails - continue with original action
                    state.pendingAction.blockedBy = undefined;
                    state.pendingAction.blockingCard = undefined;
                    state.pendingAction.respondedPlayers = [challenger.playerId];
                    console.log("Updated pendingAction after successful block challenge:", state.pendingAction);
                    if (this.allPlayersHaveResponded(state)) {
                        this.resolvePendingAction(roomId, state);
                    }
                    // Don't resolve yet, let other players respond to the original action
                } else {
                    // Action challenge succeeded, action is canceled
                    state.pendingAction = undefined;
                    console.log("Action challenge succeeded, action is canceled.");
                    this.handleAction(roomId, action, state);
                }
            }
        }
    }

    private getRequiredCardForAction(actionType: string): CoupCard {
        switch (actionType) {
            case "TAX": return "Duke";
            case "ASSASSINATE": return "Assassin";
            case "STEAL": return "Captain";
            case "EXCHANGE": return "Ambassador";
            default: throw new Error(`No card requirement for ${actionType}`);
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
            this.addActionLog(roomId, state, action.blockedBy, "Block", action.fromPlayerId, `blocked ${action.fromPlayerId} with ${action.blockingCard}.`);
            state.pendingAction = undefined;
            state.pendingCardLoss = undefined;
            this.advanceTurn(state);
            return;
        }
        const from = state.players.find(p => p.playerId === action.fromPlayerId);
        const to = action.toPlayerId ? state.players.find(p => p.playerId === action.toPlayerId) : undefined;
        if (!from || (action.toPlayerId && !to)) return;

        switch (action.type) {
            case "FOREIGN_AID":
                from.coins += CoupGame.FOREIGN_AID_AMOUNT;
                this.addActionLog(roomId, state, from.name, "Foreign Aid", undefined, `gained ${CoupGame.FOREIGN_AID_AMOUNT} coins.`);
                break;
            case "TAX":
                from.coins += CoupGame.TAX_AMOUNT;
                this.addActionLog(roomId, state, from.name, "Tax", undefined, `gained ${CoupGame.TAX_AMOUNT} coins from Tax.`);
                break;
            case "ASSASSINATE":
                this.addActionLog(roomId, state, from.name, "Assassinate", to!.name, `successfully assassinated ${to!.name}.`);
                this.loseInfluence(roomId, state, to!.playerId);
                break;
            case "STEAL":
                const stolen = Math.min(CoupGame.STEAL_AMOUNT, to!.coins);
                to!.coins -= stolen;
                from.coins += stolen;
                this.addActionLog(roomId, state, from.name, "Steal", to!.name, `stole ${stolen} coins from ${to!.name}.`);
                break;
            case "EXCHANGE":
                const currentInfluenceCount = from.influence.length;
                const cardsToDraw = currentInfluenceCount === 1 ? 2 : 2; // Draw 2 cards regardless
                const drawn: CoupCard[] = [];
                for (let i = 0; i < cardsToDraw && state.deck.length > 0; i++) {
                    drawn.push(state.deck.pop()!);
                }
                const combined: CoupCard[] = [...drawn, ...from.influence];

                if (this.onEvent) {
                    // In game mode: ask client which cards to keep
                    this.onEvent(roomId, "coup:chooseExchangeCards", {
                        playerId: from.playerId,
                        availableCards: combined,
                        cardsToKeep: currentInfluenceCount
                    });
                    // Store the combined cards temporarily in a new state field
                    state.exchangeCards = { playerId: from.playerId, cards: combined, toKeep: currentInfluenceCount };
                    return; // wait for client response
                } else {
                    // In test mode: auto-pick first cards
                    from.influence = combined.slice(0, currentInfluenceCount);
                    state.deck.push(...combined.slice(currentInfluenceCount));
                    state.deck = this.shuffle(state.deck);
                    this.addActionLog(roomId, state, from.name, "Exchange", undefined, "exchanged cards with the deck.");
                }
                break;
        }
        state.pendingAction = undefined;
        state.pendingCardLoss = undefined;
    }



    private loseInfluence(roomId: string, state: CoupGameState, targetId: string) {
        const target = state.players.find((p) => p.playerId === targetId);
        if (!target || !target.isAlive) return;

        if (target.influence.length === 1) {
            // auto-lose last card
            const lostCard = target.influence.pop()!;
            target.revealedCards.push(lostCard);
            // Add action log for revealed card
            this.addActionLog(roomId, state, target.name, "Card Revealed", undefined, `lost their last card: ${lostCard}.`);
            
            // Emit state update for automatic card loss
            if (this.onEvent) {
                this.onEvent(roomId, "coup:cardRevealed", {
                    playerId: targetId,
                    playerName: target.name,
                    revealedCard: lostCard
                });
            }
        } else if (target.influence.length > 1) {
            if (this.onEvent) {
                // In game mode: ask client which card to lose
                this.onEvent(roomId, "coup:chooseCardToLose", {
                    playerId: targetId,
                    cards: target.influence,
                });
                // Set a flag to indicate we're waiting for card loss
                state.pendingCardLoss = { playerId: targetId };
                return; // wait for client response
            } else {
                // In test mode: auto-lose first card
                const lostCard = target.influence.shift()!;
                target.revealedCards.push(lostCard);
                // Add action log for revealed card
                this.addActionLog(roomId, state, target.name, "Card Revealed", undefined, `lost a card: ${lostCard}.`);
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

        // Add action log for revealed card
        this.addActionLog(roomId, state, player.name, "Card Revealed", undefined, `chose to lose a card: ${chosenCard}.`);

        if (player.influence.length === 0) {
            player.isAlive = false;
            this.checkWinner(state);
        }

        // Clear pending card loss and advance turn
        state.pendingCardLoss = undefined;
        this.advanceTurn(state);
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

        // Clear exchange state and pending action
        state.exchangeCards = undefined;
        state.pendingAction = undefined;
    }

    private advanceTurn(state: CoupGameState) {
        // Add turn end indicator before advancing
        this.addTurnEndLog("", state);

        const alivePlayers = state.players.filter(p => p.isAlive);
        const currentIndex = alivePlayers.findIndex(p => p.playerId === state.currentTurnPlayerId);
        const nextIndex = (currentIndex + 1) % alivePlayers.length;
        state.currentTurnPlayerId = alivePlayers[nextIndex].playerId;

        // Increment turn number when we cycle back to the first player
        if (nextIndex === 0 && alivePlayers.length > 1) {
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
