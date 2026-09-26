import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({
        auth: { getUser: mockGetUser },
    }),
}));

import { proxy } from "./proxy";

function req(path: string, method = "GET") {
    return new NextRequest(`http://localhost${path}`, { method });
}

describe("proxy auth gating", () => {
    it("returns 401 JSON for unauthenticated /api requests", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await proxy(req("/api/jobs"));
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("redirects unauthenticated page requests to /login", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await proxy(req("/inbox"));
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost/login");
    });

    it("lets unauthenticated /login and /api/auth requests through", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        expect((await proxy(req("/login"))).status).toBe(200);
        expect((await proxy(req("/api/auth/callback"))).status).toBe(200);
    });

    it("blocks non-GET /api requests for the demo account", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { email: "demo@guidepostai.app" } },
        });
        const res = await proxy(req("/api/applications", "POST"));
        expect(res.status).toBe(403);
    });

    it("allows demo GET /api requests and regular user writes", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: { email: "demo@guidepostai.app" } },
        });
        expect((await proxy(req("/api/jobs"))).status).toBe(200);

        mockGetUser.mockResolvedValue({
            data: { user: { email: "someone@example.com" } },
        });
        expect((await proxy(req("/api/applications", "POST"))).status).toBe(200);
    });
});
