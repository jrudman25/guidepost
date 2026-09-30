/**
 * SerpAPI budget: max 8 calls per search run, up to 2 pages per query
 * (250/mo free tier). Leftover budget after page-1 allocations is spent on
 * page 2 of the queries that produced the most new candidates.
 */
export const MAX_SERPAPI_CALLS_PER_RUN = 8;
export const MAX_PAGES_PER_QUERY = 2;

export interface BudgetResume {
    id: string;
    user_id: string;
    queryCount: number;
}

/**
 * Days since the Unix epoch. Used as the daily rotation seed so the same
 * ordering is applied consistently within a run.
 */
export function dayIndex(date: Date = new Date()): number {
    return Math.floor(date.getTime() / 86_400_000);
}

/**
 * Split a run's SerpAPI call budget fairly across resumes.
 *
 * Resumes are grouped by user (input order preserved) and the user list is
 * rotated by `rotation` so a different user goes first each day. Users then
 * take turns assigning one query to their next resume with remaining
 * capacity, cycling through their resumes. Unused capacity from users with
 * few queries flows to the others. Every input resume id is present in the
 * returned map (0 if it got nothing).
 */
export function allocateQueryBudget(
    resumes: BudgetResume[],
    totalCalls: number,
    rotation = 0
): Map<string, number> {
    const allocated = new Map<string, number>(resumes.map((r) => [r.id, 0]));

    // Group resumes by user_id, preserving input order
    const users = new Map<string, BudgetResume[]>();
    for (const resume of resumes) {
        const group = users.get(resume.user_id);
        if (group) {
            group.push(resume);
        } else {
            users.set(resume.user_id, [resume]);
        }
    }

    const userList = [...users.values()];
    if (userList.length > 1) {
        const offset = ((rotation % userList.length) + userList.length) % userList.length;
        userList.push(...userList.splice(0, offset));
    }

    // Per-user cursor so a user's consecutive turns rotate across their resumes
    const cursors = new Map<string, number>([...users.keys()].map((k) => [k, 0]));

    let remaining = totalCalls;
    while (remaining > 0) {
        let allocatedThisPass = false;

        for (const userResumes of userList) {
            if (remaining <= 0) break;

            const userId = userResumes[0].user_id;
            const cursor = cursors.get(userId)!;
            for (let i = 0; i < userResumes.length; i++) {
                const index = (cursor + i) % userResumes.length;
                const resume = userResumes[index];
                const current = allocated.get(resume.id)!;
                if (current < resume.queryCount) {
                    allocated.set(resume.id, current + 1);
                    cursors.set(userId, (index + 1) % userResumes.length);
                    remaining--;
                    allocatedThisPass = true;
                    break;
                }
            }
        }

        if (!allocatedThisPass) break;
    }

    return allocated;
}
