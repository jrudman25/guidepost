import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Google Generative AI module before importing gemini
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.fn();

vi.mock("@google/generative-ai", () => {
    return {
        GoogleGenerativeAI: class {
            getGenerativeModel() {
                return { generateContent: mockGenerateContent };
            }
        },
    };
});

import { parseResume } from "./resume-parser";

// ---------------------------------------------------------------------------
// parseResume
// ---------------------------------------------------------------------------

describe("parseResume", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("parses a valid JSON response from Gemini", async () => {
        const mockData = {
            summary: "Full-stack developer with 5 years experience",
            job_titles: ["Software Engineer", "Full-Stack Developer"],
            skills: ["TypeScript", "React", "Node.js"],
            years_of_experience: 5,
            education: ["B.S. Computer Science, MIT"],
            certifications: ["AWS Certified"],
            industries: ["Technology", "Finance"],
        };

        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(mockData) },
        });

        const result = await parseResume("Sample resume text here...");
        expect(result).toEqual(mockData);
    });

    it("strips markdown code blocks from response", async () => {
        const mockData = {
            summary: "Developer",
            job_titles: ["Engineer"],
            skills: ["JS"],
            years_of_experience: 3,
            education: [],
            certifications: [],
            industries: [],
        };

        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => "```json\n" + JSON.stringify(mockData) + "\n```",
            },
        });

        const result = await parseResume("Resume text");
        expect(result).toEqual(mockData);
    });

    it("throws on non-JSON Gemini response", async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => "I cannot parse this resume." },
        });

        await expect(parseResume("Bad resume")).rejects.toThrow(
            "Failed to parse Gemini response as JSON"
        );
    });

    it("throws on Gemini API failure", async () => {
        mockGenerateContent.mockRejectedValue(new Error("API error"));

        await expect(parseResume("Resume")).rejects.toThrow("API error");
    });

    it("passes the resume text to the prompt", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({
                        summary: "Test",
                        job_titles: [],
                        skills: [],
                        years_of_experience: 0,
                        education: [],
                        certifications: [],
                        industries: [],
                    }),
            },
        });

        await parseResume("Unique resume content XYZ123");

        const promptArg = mockGenerateContent.mock.calls[0][0] as string;
        expect(promptArg).toContain("Unique resume content XYZ123");
    });
});
