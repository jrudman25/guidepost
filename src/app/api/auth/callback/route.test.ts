import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExchange = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { exchangeCodeForSession: mockExchange },
    }),
}));

import { GET } from "./route";

function req(query: string) {
    return new Request(`http://localhost/api/auth/callback${query}`);
}

describe("auth callback redirect", () => {
    beforeEach(() => {
        mockExchange.mockResolvedValue({ data: {}, error: null });
    });

    it("redirects to the same-origin path in next", async () => {
        const res = await GET(req("?code=abc&next=/inbox"));
        expect(res.headers.get("location")).toBe("http://localhost/inbox");
    });

    it("falls back to / when next is missing", async () => {
        const res = await GET(req("?code=abc"));
        expect(res.headers.get("location")).toBe("http://localhost/");
    });

    it("rejects next=@evil.com userinfo redirect", async () => {
        const res = await GET(req("?code=abc&next=@evil.com"));
        expect(res.headers.get("location")).toBe("http://localhost/");
    });

    it("rejects protocol-relative next", async () => {
        const res = await GET(req("?code=abc&next=//evil.com"));
        expect(res.headers.get("location")).toBe("http://localhost/");
    });

    it("rejects backslash-normalized next", async () => {
        const res = await GET(req("?code=abc&next=/\\evil.com"));
        expect(res.headers.get("location")).toBe("http://localhost/");
    });

    it("redirects to /login on exchange failure", async () => {
        mockExchange.mockResolvedValue({ data: {}, error: { message: "expired" } });
        const res = await GET(req("?code=abc&next=/inbox"));
        expect(res.headers.get("location")).toBe(
            "http://localhost/login?error=auth_failed"
        );
    });
});
