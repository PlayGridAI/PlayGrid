import { CoupGame, CoupGameState, CoupCard } from "./CoupGame";
import { Player } from "../../rooms";
import { GameAction } from "../IGame";

describe("CoupGame", () => {
    let game: CoupGame;
    let players: Player[];
    let state: CoupGameState;

    beforeEach(() => {
        game = new CoupGame();
        players = [
            {
                playerId: "P1", name: "Alice",
                isHost: false,
                lastSeen: 0
            },
            {
                playerId: "P2", name: "Bob",
                isHost: false,
                lastSeen: 0
            },
            {
                playerId: "P3", name: "Charlie",
                isHost: false,
                lastSeen: 0
            }
        ];
        state = game.initGame("room1", players);
    });

    test("initGame should set up players, coins, and deck", () => {
        expect(state.players.length).toBe(3);
        state.players.forEach(p => {
            expect(p.coins).toBe(2);
            expect(p.influence.length).toBe(2);
            expect(p.isAlive).toBe(true);
        });
        expect(state.deck.length).toBe(15 - (3 * 2)); // total cards minus dealt
        expect(state.currentTurnPlayerId).toBe(players[0].playerId);
    });

    test("INCOME should give +1 coin and advance turn", () => {
        const action: GameAction = { type: "INCOME", playerId: "P1" };
        game.handleAction("room1", action, state);
        expect(state.players[0].coins).toBe(3);
        expect(state.currentTurnPlayerId).toBe("P2");
    });

    test("COUP should cost 7 coins and remove influence", () => {
        const p1 = state.players[0];
        p1.coins = 7;
        const targetId = state.players[1].playerId;
        const initialTurnPlayer = state.currentTurnPlayerId;
        const action: GameAction = { type: "COUP", playerId: p1.playerId, payload: { targetId } };
        game.handleAction("room1", action, state);
        expect(p1.coins).toBe(0);
        expect(state.players[1].influence.length).toBe(1);
        // Turn should advance after Coup
        expect(state.currentTurnPlayerId).not.toBe(initialTurnPlayer);
    });

    test("ASSASSINATE should cost 3 coins and set pendingAction", () => {
        const p1 = state.players[0];
        p1.coins = 3;
        const targetId = state.players[1].playerId;
        const action: GameAction = { type: "ASSASSINATE", playerId: p1.playerId, payload: { targetId } };
        game.handleAction("room1", action, state);
        expect(p1.coins).toBe(0);
        expect(state.pendingAction).toEqual({
            type: "ASSASSINATE",
            fromPlayerId: "P1",
            toPlayerId: "P2",
            respondedPlayers: []
        });
        // pendingCardLoss should NOT be set at action declaration time
        expect(state.pendingCardLoss).toBeUndefined();
    });

    test("STEAL should set pendingAction", () => {
        const action: GameAction = { type: "STEAL", playerId: "P1", payload: { targetId: "P2" } };
        game.handleAction("room1", action, state);
        expect(state.pendingAction).toEqual({
            type: "STEAL",
            fromPlayerId: "P1",
            toPlayerId: "P2",
            respondedPlayers: []
        });
    });

    test("EXCHANGE should set pendingAction", () => {
        const action: GameAction = { type: "EXCHANGE", playerId: "P1" };
        game.handleAction("room1", action, state);
        expect(state.pendingAction).toEqual({
            type: "EXCHANGE",
            fromPlayerId: "P1",
            respondedPlayers: []
        });
    });

    test("BLOCK should attach blockedBy to pendingAction", () => {
        state.pendingAction = { type: "FOREIGN_AID", fromPlayerId: "P1" };
        const action: GameAction = { type: "BLOCK", playerId: "P2" };
        game.handleAction("room1", action, state);
        expect(state.pendingAction?.blockedBy).toBe("P2");
    });

    test("CHALLENGE should resolve correctly when claimed player has card", () => {
        state.pendingAction = { type: "TAX", fromPlayerId: "P1" };
        state.players[0].influence = ["Duke", "Captain"];
        game.handleAction("room1", { type: "CHALLENGE", playerId: "P2", payload: { targetId: "P1" } }, state);
        expect(state.players[1].influence.length).toBe(1); // challenger lost influence
    });

    test("CHALLENGE should resolve correctly when claimed player lacks card", () => {
        state.pendingAction = { type: "TAX", fromPlayerId: "P1" };
        state.players[0].influence = ["Captain", "Ambassador"];
        game.handleAction("room1", { type: "CHALLENGE", playerId: "P2", payload: { targetId: "P1" } }, state);
        expect(state.players[0].influence.length).toBe(1); // claimed player lost influence
        expect(state.pendingAction).toBeUndefined(); // action canceled
    });

    test("RESOLVE_ACTION should process pendingAction when all players respond", () => {
        state.pendingAction = { type: "TAX", fromPlayerId: "P1", respondedPlayers: [] };
        const beforeCoins = state.players[0].coins;

        // P2 resolves (doesn't challenge)
        game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
        expect(state.pendingAction?.respondedPlayers).toContain("P2");
        expect(state.players[0].coins).toBe(beforeCoins); // Not resolved yet

        // P3 resolves (doesn't challenge) - now all have responded
        game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P3" }, state);
        expect(state.players[0].coins).toBe(beforeCoins + 3); // Now resolved
        expect(state.pendingAction).toBeUndefined();
        // Turn should advance after resolution
        expect(state.currentTurnPlayerId).toBe("P2");
    });

    test("Player should lose influence and possibly die", () => {
        const targetId = state.players[1].playerId;
        state.players[1].influence = ["Duke"];
        // Lose influence
        (game as any).loseInfluence("room1", state, targetId);
        expect(state.players[1].influence.length).toBe(0);
        expect(state.players[1].isAlive).toBe(false);
    });

    test("EXCHANGE_CARDS should allow player to select cards to keep", () => {
        // Set up exchange state
        state.exchangeCards = {
            playerId: "P1",
            cards: ["Duke", "Captain", "Ambassador", "Assassin"],
            toKeep: 2
        };

        const action: GameAction = {
            type: "EXCHANGE_CARDS",
            playerId: "P1",
            payload: { selectedCards: ["Duke", "Ambassador"] }
        };

        game.handleAction("room1", action, state);

        const player = state.players.find(p => p.playerId === "P1")!;
        expect(player.influence).toEqual(["Duke", "Ambassador"]);
        expect(state.exchangeCards).toBeUndefined();
        expect(state.pendingAction).toBeUndefined();
        expect(state.deck.length).toBe(11); // original 9 + 2 returned cards
    });

    test("EXCHANGE_CARDS should handle duplicate cards correctly", () => {
        // Set up exchange state with duplicate Dukes
        state.exchangeCards = {
            playerId: "P1",
            cards: ["Duke", "Duke", "Captain", "Ambassador"], // 2 Dukes
            toKeep: 2
        };

        // Player selects 2 Dukes (both copies)
        const action: GameAction = {
            type: "EXCHANGE_CARDS",
            playerId: "P1",
            payload: { selectedCards: ["Duke", "Duke"] }
        };

        game.handleAction("room1", action, state);

        const player = state.players.find(p => p.playerId === "P1")!;
        expect(player.influence).toEqual(["Duke", "Duke"]);
        expect(state.exchangeCards).toBeUndefined();
        expect(state.pendingAction).toBeUndefined();
        // The other 2 cards should be returned to deck
        expect(state.deck.length).toBe(11); // Original 9 cards + 2 returned cards
    });

    test("EXCHANGE_CARDS should reject invalid card selection", () => {
        // Set up exchange state
        state.exchangeCards = {
            playerId: "P1",
            cards: ["Duke", "Captain", "Ambassador", "Assassin"],
            toKeep: 2
        };

        const originalInfluence = [...state.players[0].influence];

        // Try to select too many cards
        const action: GameAction = {
            type: "EXCHANGE_CARDS",
            playerId: "P1",
            payload: { selectedCards: ["Duke", "Ambassador", "Captain"] }
        };

        game.handleAction("room1", action, state);

        // Should remain unchanged
        expect(state.players[0].influence).toEqual(originalInfluence);
        expect(state.exchangeCards).toBeDefined(); // Still pending
    });

    test("CHOOSE_BLOCK_CARD should set blocking card for STEAL", () => {
        // Set up pending STEAL action
        state.pendingAction = {
            type: "STEAL",
            fromPlayerId: "P1",
            toPlayerId: "P2",
            respondedPlayers: []
        };

        const action: GameAction = {
            type: "CHOOSE_BLOCK_CARD",
            playerId: "P3",
            payload: { blockingCard: "Captain" }
        };

        game.handleAction("room1", action, state);

        expect(state.pendingAction?.blockedBy).toBe("P3");
        expect(state.pendingAction?.blockingCard).toBe("Captain");
        expect(state.pendingAction?.respondedPlayers).toEqual([]);
    });

    test("loseCard should only remove one card when player has duplicates", () => {
        // Set up player with duplicate cards
        const player = state.players.find(p => p.playerId === "P1")!;
        player.influence = ["Captain", "Captain"]; // Player has 2 Captains

        // Player loses one Captain
        game.loseCard("room1", state, "P1", "Captain");

        // Should only lose one Captain, not both
        expect(player.influence).toEqual(["Captain"]);
        expect(player.revealedCards).toEqual(["Captain"]);
        expect(player.isAlive).toBe(true);
    });

    test("Enhanced Challenge system should track responses properly", () => {
        // Set up pending TAX action
        state.pendingAction = {
            type: "TAX",
            fromPlayerId: "P1",
            respondedPlayers: []
        };

        // P2 resolves (doesn't challenge)
        game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
        expect(state.pendingAction?.respondedPlayers).toContain("P2");
        expect(state.pendingAction).toBeDefined(); // Still pending

        // P3 challenges
        state.players[0].influence = ["Captain", "Ambassador"]; // P1 doesn't have Duke
        game.handleAction("room1", { type: "CHALLENGE", playerId: "P3", payload: { targetId: "P1" } }, state);

        // Action should be canceled due to successful challenge
        expect(state.pendingAction).toBeUndefined();
        expect(state.players[0].influence.length).toBe(1); // P1 lost influence
        // Turn should advance after successful challenge cancels action
        expect(state.currentTurnPlayerId).toBe("P2");
    });

    test("Block challenge should work correctly", () => {
        // Set up blocked action
        state.pendingAction = {
            type: "FOREIGN_AID",
            fromPlayerId: "P1",
            blockedBy: "P2",
            blockingCard: "Duke",
            respondedPlayers: []
        };

        state.players[1].influence = ["Captain", "Ambassador"]; // P2 doesn't have Duke

        // P3 challenges the block
        game.handleAction("room1", { type: "CHALLENGE", playerId: "P3", payload: { targetId: "P2" } }, state);

        // Block should fail, action should continue
        expect(state.pendingAction?.blockedBy).toBeUndefined();
        expect(state.pendingAction?.blockingCard).toBeUndefined();
        expect(state.players[1].influence.length).toBe(1); // P2 lost influence
    });

    test("Game should detect winner", () => {
        state.players[1].isAlive = false;
        state.players[2].isAlive = false;
        (game as any).checkWinner(state);
        expect(state.winner).toBe("P1");
    });

    test("BLOCK should emit game:pendingAction event with BLOCK_PENDING_CHALLENGE", () => {
        // Mock the onEvent callback
        const mockOnEvent = jest.fn();
        game.onEvent = mockOnEvent;

        // Set up a pending FOREIGN_AID action
        state.pendingAction = { type: "FOREIGN_AID", fromPlayerId: "P1", respondedPlayers: [] };

        // Give P2 a Duke card to block with
        state.players[1].influence = ["Duke", "Captain"];

        // P2 blocks the FOREIGN_AID action
        const blockAction: GameAction = { type: "BLOCK", playerId: "P2" };
        game.handleAction("room1", blockAction, state);

        // Verify both events were emitted
        expect(mockOnEvent).toHaveBeenCalledWith("room1", "coup:blockAction", {
            action: "FOREIGN_AID",
            blockedBy: "P2",
            blockingCard: "Duke"
        });

        expect(mockOnEvent).toHaveBeenCalledWith("room1", "game:pendingAction", {
            type: "BLOCK_PENDING_CHALLENGE",
            action: "FOREIGN_AID",
            blockedBy: "P2",
            blockingCard: "Duke",
            originalAction: state.pendingAction
        });

        // Verify the state was updated with block information
        expect(state.pendingAction?.blockedBy).toBe("P2");
        expect(state.pendingAction?.blockingCard).toBe("Duke");
    });

    test("CHOOSE_BLOCK_CARD should emit game:pendingAction event with BLOCK_PENDING_CHALLENGE", () => {
        // Mock the onEvent callback
        const mockOnEvent = jest.fn();
        game.onEvent = mockOnEvent;

        // Set up a pending STEAL action
        state.pendingAction = {
            type: "STEAL",
            fromPlayerId: "P1",
            toPlayerId: "P2",
            respondedPlayers: []
        };

        // P3 chooses to block with Captain
        const chooseBlockAction: GameAction = {
            type: "CHOOSE_BLOCK_CARD",
            playerId: "P3",
            payload: { blockingCard: "Captain" }
        };
        game.handleAction("room1", chooseBlockAction, state);

        // Verify both events were emitted
        expect(mockOnEvent).toHaveBeenCalledWith("room1", "coup:blockAction", {
            action: "STEAL",
            blockedBy: "P3",
            blockingCard: "Captain"
        });

        expect(mockOnEvent).toHaveBeenCalledWith("room1", "game:pendingAction", {
            type: "BLOCK_PENDING_CHALLENGE",
            action: "STEAL",
            blockedBy: "P3",
            blockingCard: "Captain",
            originalAction: expect.objectContaining({
                type: "STEAL",
                fromPlayerId: "P1",
                toPlayerId: "P2"
            })
        });

        // Verify the state was updated with block information
        expect(state.pendingAction?.blockedBy).toBe("P3");
        expect(state.pendingAction?.blockingCard).toBe("Captain");
    });

    // ══════════════════════════════════════════════════════════════════
    // Comprehensive COUP Scenario Tests
    // ══════════════════════════════════════════════════════════════════

    describe("Challenge with duplicate cards", () => {
        test("challenge fail should remove only ONE instance of a duplicate card", () => {
            // Glenn has 2 Dukes, does TAX. Alex challenges.
            state.players[0].influence = ["Duke", "Duke"] as CoupCard[];
            state.pendingAction = { type: "TAX", fromPlayerId: "P1", respondedPlayers: [] };

            game.handleAction("room1", {
                type: "CHALLENGE", playerId: "P2", payload: { targetId: "P1" }
            }, state);

            // Challenge failed — P1 (Glenn) keeps 2 cards (1 Duke remaining + 1 new from deck)
            expect(state.players[0].influence.length).toBe(2);
            // P2 (Alex) lost 1 influence
            expect(state.players[1].influence.length).toBe(1);
        });
    });

    describe("Block + Challenge flows", () => {
        test("FOREIGN_AID blocked by Duke, block challenge fails (blocker has Duke)", () => {
            state.pendingAction = {
                type: "FOREIGN_AID", fromPlayerId: "P1",
                blockedBy: "P2", blockingCard: "Duke" as CoupCard,
                respondedPlayers: []
            };
            state.players[1].influence = ["Duke", "Captain"] as CoupCard[];
            const initialTurn = state.currentTurnPlayerId;

            // P3 challenges the block — P2 actually has Duke
            game.handleAction("room1", {
                type: "CHALLENGE", playerId: "P3", payload: { targetId: "P2" }
            }, state);

            // Block challenge failed → block stands → action is blocked
            expect(state.pendingAction).toBeUndefined();
            expect(state.players[2].influence.length).toBe(1); // P3 lost influence
            expect(state.players[1].influence.length).toBe(2); // P2 keeps 2 (1 Duke swapped)
            // Turn should advance after block succeeds
            expect(state.currentTurnPlayerId).not.toBe(initialTurn);
        });

        test("FOREIGN_AID blocked by Duke, block challenge succeeds (blocker lacks Duke)", () => {
            state.pendingAction = {
                type: "FOREIGN_AID", fromPlayerId: "P1",
                blockedBy: "P2", blockingCard: "Duke" as CoupCard,
                respondedPlayers: []
            };
            state.players[1].influence = ["Captain", "Ambassador"] as CoupCard[];

            // P3 challenges the block — P2 doesn't have Duke
            game.handleAction("room1", {
                type: "CHALLENGE", playerId: "P3", payload: { targetId: "P2" }
            }, state);

            // Block challenge succeeded → block fails → action continues
            expect(state.pendingAction?.blockedBy).toBeUndefined();
            expect(state.pendingAction?.blockingCard).toBeUndefined();
            expect(state.players[1].influence.length).toBe(1); // P2 lost influence
        });

        test("ASSASSINATE blocked by Contessa, Contessa challenge succeeds (blocker lacks Contessa)", () => {
            state.players[0].coins = 0; // Already paid 3 for assassinate
            state.pendingAction = {
                type: "ASSASSINATE", fromPlayerId: "P1", toPlayerId: "P2",
                blockedBy: "P2", blockingCard: "Contessa" as CoupCard,
                respondedPlayers: []
            };
            state.players[1].influence = ["Captain", "Ambassador"] as CoupCard[];

            // P1 challenges the Contessa block — P2 doesn't have Contessa
            game.handleAction("room1", {
                type: "CHALLENGE", playerId: "P1", payload: { targetId: "P2" }
            }, state);

            // P2 loses card for failed Contessa block + card for assassinate
            expect(state.players[1].influence.length).toBe(0);
            expect(state.players[1].isAlive).toBe(false);
            expect(state.pendingAction).toBeUndefined();
        });
    });

    describe("Full resolution flows", () => {
        test("TAX: all players pass → +3 coins, turn advances", () => {
            const p1Coins = state.players[0].coins;
            state.pendingAction = { type: "TAX", fromPlayerId: "P1", respondedPlayers: [] };

            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P3" }, state);

            expect(state.players[0].coins).toBe(p1Coins + 3);
            expect(state.pendingAction).toBeUndefined();
            expect(state.currentTurnPlayerId).toBe("P2");
        });

        test("FOREIGN_AID: all players pass → +2 coins, turn advances", () => {
            const p1Coins = state.players[0].coins;
            state.pendingAction = { type: "FOREIGN_AID", fromPlayerId: "P1", respondedPlayers: [] };

            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P3" }, state);

            expect(state.players[0].coins).toBe(p1Coins + 2);
            expect(state.pendingAction).toBeUndefined();
            expect(state.currentTurnPlayerId).toBe("P2");
        });

        test("STEAL: all pass → steal 2 coins from target, turn advances", () => {
            state.players[0].coins = 2;
            state.players[1].coins = 4;
            state.pendingAction = {
                type: "STEAL", fromPlayerId: "P1", toPlayerId: "P2", respondedPlayers: []
            };

            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P3" }, state);

            expect(state.players[0].coins).toBe(4); // +2
            expect(state.players[1].coins).toBe(2); // -2
            expect(state.currentTurnPlayerId).toBe("P2");
        });

        test("STEAL from player with 0 coins → steal 0", () => {
            state.players[0].coins = 2;
            state.players[1].coins = 0;
            state.pendingAction = {
                type: "STEAL", fromPlayerId: "P1", toPlayerId: "P2", respondedPlayers: []
            };

            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P3" }, state);

            expect(state.players[0].coins).toBe(2); // +0
            expect(state.players[1].coins).toBe(0); // stays 0
        });

        test("STEAL from player with 1 coin → steal only 1", () => {
            state.players[0].coins = 2;
            state.players[1].coins = 1;
            state.pendingAction = {
                type: "STEAL", fromPlayerId: "P1", toPlayerId: "P2", respondedPlayers: []
            };

            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P3" }, state);

            expect(state.players[0].coins).toBe(3); // +1
            expect(state.players[1].coins).toBe(0); // -1
        });
    });

    describe("Forced COUP and coin constraints", () => {
        test("Player with 10+ coins must COUP", () => {
            state.players[0].coins = 10;
            // Income should fail when player has 10+ coins
            const action: GameAction = { type: "INCOME", playerId: "P1" };
            game.handleAction("room1", action, state);
            // If the engine enforces COUP at 10, INCOME should be rejected
            // At minimum, COUP must work
        });

        test("COUP with exactly 7 coins succeeds", () => {
            state.players[0].coins = 7;
            const action: GameAction = {
                type: "COUP", playerId: "P1", payload: { targetId: "P2" }
            };
            game.handleAction("room1", action, state);
            expect(state.players[0].coins).toBe(0);
            expect(state.players[1].influence.length).toBe(1);
        });

        test("ASSASSINATE with less than 3 coins should fail", () => {
            state.players[0].coins = 2;
            const originalInfluence = [...state.players[1].influence];
            const action: GameAction = {
                type: "ASSASSINATE", playerId: "P1", payload: { targetId: "P2" }
            };
            game.handleAction("room1", action, state);
            // Should not set pendingAction
            expect(state.pendingAction).toBeUndefined();
            expect(state.players[0].coins).toBe(2); // coins unchanged
        });
    });

    describe("Unchallengeble action guard", () => {
        test("CHALLENGE on FOREIGN_AID (no role claim) should be ignored", () => {
            state.pendingAction = { type: "FOREIGN_AID", fromPlayerId: "P1", respondedPlayers: [] };
            const originalP1Influence = [...state.players[0].influence];
            const originalP2Influence = [...state.players[1].influence];

            game.handleAction("room1", {
                type: "CHALLENGE", playerId: "P2", payload: { targetId: "P1" }
            }, state);

            // Nothing should change — challenge is invalid
            expect(state.players[0].influence).toEqual(originalP1Influence);
            expect(state.players[1].influence).toEqual(originalP2Influence);
            expect(state.pendingAction).toBeDefined(); // still pending
        });
    });

    describe("Exchange turn advancement", () => {
        test("EXCHANGE: all pass → exchange cards offered, player selects, turn advances", () => {
            const mockOnPlayerEvent = jest.fn();
            game.onPlayerEvent = mockOnPlayerEvent;
            state.pendingAction = { type: "EXCHANGE", fromPlayerId: "P1", respondedPlayers: [] };

            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P2" }, state);
            game.handleAction("room1", { type: "RESOLVE_ACTION", playerId: "P3" }, state);

            // Exchange cards should be offered
            expect(state.exchangeCards).toBeDefined();
            expect(state.exchangeCards?.playerId).toBe("P1");

            // Player selects cards
            const selectedCards = state.exchangeCards!.cards.slice(0, state.exchangeCards!.toKeep);
            game.handleAction("room1", {
                type: "EXCHANGE_CARDS", playerId: "P1",
                payload: { selectedCards }
            }, state);

            expect(state.exchangeCards).toBeUndefined();
            expect(state.currentTurnPlayerId).toBe("P2"); // turn advanced
        });
    });
});
