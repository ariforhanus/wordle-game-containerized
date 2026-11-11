import { describe, expect, it } from "vitest";
import { evaluateGuess, toUpperCase, createGame, submitGuess } from "@wordle/engine";
describe("game engine", () => {
 it("does not award extra matches for duplicate letters", () => {
  expect(evaluateGuess("ALLEE", "APPLE").statuses).toEqual(["correct", "present", "absent", "absent", "correct"]);
 });
 it("uses Turkish casing", () => { expect(toUpperCase("incir", "tr")).toBe("İNCİR"); });
 it("invalid words do not consume a turn", () => {
  const state = { ...createGame("APPLE", "", "en"), currentGuess: "ZZZZZ" };
  const result = submitGuess(state, new Set(["APPLE"]));
  expect(result.error).toBe("invalid_word"); expect(result.state.guesses).toHaveLength(0);
 });
});
