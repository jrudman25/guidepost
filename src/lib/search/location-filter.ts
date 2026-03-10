import type { SerpApiJob } from "./serpapi";

/**
 * Keywords that indicate a job is remote, checked against title and description.
 * Used as a fallback when SerpAPI doesn't set work_from_home.
 */
const REMOTE_KEYWORDS = [
    "remote",
    "work from home",
    "work-from-home",
    "wfh",
    "anywhere",
    "distributed",
    "fully remote",
    "100% remote",
    "remote-first",
];

/**
 * US state abbreviations to full names for flexible matching.
 */
const US_STATES: Record<string, string> = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
    CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
    WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

/**
 * Check if a job appears to be remote based on SerpAPI metadata,
 * title, or description keywords.
 */
export function detectRemote(job: SerpApiJob): boolean {
    // Trust SerpAPI flag first
    if (job.detected_extensions?.work_from_home) {
        return true;
    }

    // Scan title and description for remote keywords
    const text = `${job.title} ${job.description || ""}`.toLowerCase();
    return REMOTE_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Check whether a job's location is compatible with the user's location filter.
 *
 * Rules:
 * - If the job is remote (SerpAPI flag or keyword detection), always passes
 * - If the user has no location filter, always passes
 * - If the user's remote_preference is "remote", always passes
 * - Otherwise, check if the job location shares a state or city with the user filter
 */
export function isLocationCompatible(
    job: SerpApiJob,
    userLocation: string | null,
    remotePreference: string
): boolean {
    // No user location set — accept everything
    if (!userLocation) return true;

    // User only wants remote — location doesn't matter (remote filter handles it)
    if (remotePreference === "remote") return true;

    // Remote jobs always pass
    if (detectRemote(job)) return true;

    // Non-remote job — check if location matches
    const jobLoc = (job.location || "").toLowerCase();
    if (!jobLoc) return true; // No location info — give benefit of the doubt

    const userLoc = userLocation.toLowerCase();

    // Extract city and state from user location (e.g., "Seattle, WA" -> ["seattle", "wa"])
    const userParts = userLoc.split(",").map((p) => p.trim()).filter(Boolean);
    const userCity = userParts[0] || "";
    const userStateAbbr = userParts[1] || "";
    const userStateFull = US_STATES[userStateAbbr.toUpperCase()]?.toLowerCase() || "";

    // Check if job location contains the user's city or state
    if (userCity && jobLoc.includes(userCity)) return true;
    if (userStateAbbr && jobLoc.includes(userStateAbbr)) return true;
    if (userStateFull && jobLoc.includes(userStateFull)) return true;

    // Check the reverse: does the user location contain a part of the job location?
    const jobParts = jobLoc.split(",").map((p) => p.trim()).filter(Boolean);
    const jobStateAbbr = jobParts[1] || jobParts[0] || "";
    const jobStateFull = US_STATES[jobStateAbbr.toUpperCase()]?.toLowerCase() || "";

    if (jobStateFull && userStateFull && jobStateFull === userStateFull) return true;

    return false;
}
