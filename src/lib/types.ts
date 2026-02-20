// Shared TypeScript type definitions for Guidepost

export interface Resume {
    id: string;
    file_path: string;
    file_name: string;
    uploaded_at: string;
    parsed_data: ParsedResumeData | null;
    is_active: boolean;
}

export interface ParsedResumeData {
    summary: string;
    job_titles: string[];
    skills: string[];
    years_of_experience: number;
    education: string[];
    certifications: string[];
    industries: string[];
}

export interface SearchFilter {
    id: string;
    resume_id: string;
    keywords: string[];
    location: string | null;
    remote_preference: "remote" | "hybrid" | "onsite" | "any";
    target_seniority: "entry" | "mid" | "senior" | "any";
    min_salary: number | null;
    max_listing_age_days: number;
    excluded_companies: string[];
}

export interface JobListing {
    id: string;
    resume_id: string | null;
    title: string;
    company: string;
    location: string | null;
    description: string | null;
    url: string | null;
    source: string | null;
    posted_at: string | null;
    discovered_at: string;
    match_score: number | null;
    match_reasoning: string | null;
    status: "new" | "saved" | "dismissed" | "applied";
    salary_info: string | null;
    is_remote: boolean;
}

export interface Application {
    id: string;
    job_listing_id: string | null;
    job_title: string;
    company: string;
    applied_at: string;
    applied_via: string | null;
    status: ApplicationStatus;
    status_updated_at: string;
    notes: string | null;
    url: string | null;
}

export type ApplicationStatus =
    | "applied"
    | "screening"
    | "interview"
    | "offer"
    | "rejected"
    | "ghosted";

export interface StatusHistoryEntry {
    id: string;
    application_id: string;
    from_status: string | null;
    to_status: string;
    changed_at: string;
}

// Stats types
export interface DashboardStats {
    applicationsThisWeek: number;
    applicationsThisMonth: number;
    responseRate: number;
    avgDaysToHearBack: number;
    statusBreakdown: Record<ApplicationStatus, number>;
    weeklyApplications: { week: string; count: number }[];
    topSkillsFromListings: { skill: string; count: number }[];
    resumeSkills: string[];
}
