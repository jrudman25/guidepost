import { describe, it, expect } from "vitest";
import {
    allocateQueryBudget,
    dayIndex,
    type BudgetResume,
} from "./query-budget";

function makeResume(id: string, userId: string, queryCount: number): BudgetResume {
    return { id, user_id: userId, queryCount };
}

describe("allocateQueryBudget", () => {
    it("caps a single resume at its query count", () => {
        const result = allocateQueryBudget(
            [makeResume("r1", "u1", 4)],
            8
        );
        expect(result.get("r1")).toBe(4);
    });

    it("splits the budget evenly across two users", () => {
        const result = allocateQueryBudget(
            [makeResume("r1", "u1", 4), makeResume("r2", "u2", 4)],
            8
        );
        expect(result.get("r1")).toBe(4);
        expect(result.get("r2")).toBe(4);
    });

    it("round-robins a user's calls across their resumes", () => {
        const result = allocateQueryBudget(
            [
                makeResume("a1", "userA", 4),
                makeResume("a2", "userA", 4),
                makeResume("b1", "userB", 4),
            ],
            8
        );
        expect(result.get("a1")).toBe(2);
        expect(result.get("a2")).toBe(2);
        expect(result.get("b1")).toBe(4);
    });

    it("lets unused capacity flow to other users", () => {
        const result = allocateQueryBudget(
            [makeResume("a1", "userA", 1), makeResume("b1", "userB", 4)],
            8
        );
        expect(result.get("a1")).toBe(1);
        expect(result.get("b1")).toBe(4);
    });

    it("rotates which users are served first, and includes every resume id", () => {
        const resumes = [
            makeResume("a1", "userA", 4),
            makeResume("b1", "userB", 4),
            makeResume("c1", "userC", 4),
        ];

        const first = allocateQueryBudget(resumes, 2, 0);
        const rotated = allocateQueryBudget(resumes, 2, 1);

        expect([...first.values()].reduce((a, b) => a + b, 0)).toBe(2);
        expect([...rotated.values()].reduce((a, b) => a + b, 0)).toBe(2);
        expect(first).not.toEqual(rotated);

        for (const allocation of [first, rotated]) {
            expect(allocation.size).toBe(3);
            for (const resume of resumes) {
                expect(allocation.has(resume.id)).toBe(true);
            }
        }
    });

    it("spends leftover budget on extra pages, capped at one per page-1 query", () => {
        // Page-1 allocation of 4 queries leaves each eligible for 1 more page
        const single = allocateQueryBudget(
            [makeResume("r1", "u1", 4)],
            4
        );
        expect(single.get("r1")).toBe(4);

        const twoUsers = allocateQueryBudget(
            [makeResume("r1", "u1", 4), makeResume("r2", "u2", 4)],
            0
        );
        expect(twoUsers.get("r1")).toBe(0);
        expect(twoUsers.get("r2")).toBe(0);
    });
});

describe("dayIndex", () => {
    it("returns whole days since the epoch", () => {
        expect(dayIndex(new Date(0))).toBe(0);
        expect(dayIndex(new Date(Date.UTC(2025, 0, 1)))).toBe(20089);
    });
});
