import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedResumeData } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const RESUME_PARSE_PROMPT = `You are a resume parser. Analyze the following resume text and extract structured information.

Return a JSON object with EXACTLY these fields:
{
  "summary": "A 2-3 sentence professional summary of the candidate",
  "job_titles": ["Array of realistic job titles the person should search for"],
  "skills": ["Array of technical and soft skills mentioned"],
  "years_of_experience": <number - total years of professional experience, estimate if not explicit>,
  "education": ["Array of degrees/certifications, e.g. 'B.S. Computer Science, MIT'"],
  "certifications": ["Array of professional certifications"],
  "industries": ["Array of industries the person has worked in"]
}

Rules:
- Return ONLY valid JSON, no markdown formatting or code blocks
- If a field cannot be determined, use an empty array [] or 0 for numbers
- For skills, include both specific technologies AND general competencies
- For job_titles, ONLY include titles that would realistically appear in a job posting on LinkedIn or Indeed. Include the person's most recent professional title and 2-3 related titles they'd likely search for. Do NOT include academic roles (e.g. "Teaching Assistant"), club positions (e.g. "Student Developer", "Club President"), or volunteer titles.
- Be thorough but accurate — only include what's actually in the resume

Resume text:
`;

export async function parseResume(text: string): Promise<ParsedResumeData> {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(RESUME_PARSE_PROMPT + text);
    const response = result.response.text();

    // Strip any markdown code block formatting if present
    const cleaned = response
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

    try {
        const parsed = JSON.parse(cleaned) as ParsedResumeData;
        return parsed;
    } catch {
        throw new Error(
            "Failed to parse Gemini response as JSON. Raw response: " +
            response.substring(0, 200)
        );
    }
}
