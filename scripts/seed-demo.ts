import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
    console.log("Starting demo seed process...");

    // Login to demo account
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: "demo@guidepostai.app",
        password: "demo123"
    });

    if (authErr || !authData.user) {
        console.error("Failed to login to demo account:", authErr);
        return;
    }

    const userId = authData.user.id;
    console.log("Logged in as Demo User:", userId);

    console.log("Cleaning up existing demo data...");
    await supabase.from("applications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("job_listings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("search_filters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("resumes").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    console.log("Inserting mock resume...");
    const { data: resumeData, error: resumeErr } = await supabase.from("resumes").insert({
        file_name: "demo_swe_resume.pdf",
        file_path: "demo/demo_swe_resume.pdf",
        is_active: true,
        parsed_data: {
            summary: "Experienced software engineer with a strong background in frontend and backend development.",
            job_titles: ["Software Engineer", "Frontend Developer", "Full Stack Engineer"],
            skills: ["React", "TypeScript", "Next.js", "Node.js", "PostgreSQL", "Tailwind CSS"],
            years_of_experience: 4,
            education: ["BS Computer Science"],
            certifications: ["AWS Certified Developer"],
            industries: ["Technology", "SaaS", "E-commerce"]
        },
        user_id: userId
    }).select().single();

    if (resumeErr || !resumeData) {
        console.error("Failed to insert resume", resumeErr);
        return;
    }

    console.log("Inserting search filters...");
    await supabase.from("search_filters").insert({
        resume_id: resumeData.id,
        user_id: userId,
        keywords: ["engineer", "developer", "remote"],
        location: "San Francisco, CA",
        remote_preference: "any",
        target_seniority: "mid",
        min_salary: 120000,
        max_listing_age_days: 14,
        excluded_companies: ["SpamCorp"]
    });

    const now = new Date();

    console.log("Inserting job listings...");
    const jobsToInsert = [
        ...Array.from({ length: 15 }).map((_, i) => ({
            resume_id: resumeData.id,
            user_id: userId,
            title: `Senior Frontend Engineer ${i + 1}`,
            company: ["Vercel", "Acme Corp", "TechNova", "Innovate LLC"][Math.floor(Math.random() * 4)],
            location: ["Remote", "San Francisco, CA", "New York, NY"][Math.floor(Math.random() * 3)],
            description: "Join our core product team to build the future of our web application. You will be responsible for architecting scalable frontend solutions using React and TypeScript. Minimum 5 years of experience required. Strong knowledge of modern CSS and accessibility standards is a must.",
            url: `https://example.com/jobs/demo_${Date.now()}_${i}`,
            source: ["LinkedIn", "Indeed", "Company Site"][Math.floor(Math.random() * 3)],
            discovered_at: new Date(now.getTime() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
            match_score: Math.floor(Math.random() * 30 + 70), // 70-100
            match_reasoning: "Excellent overlap with React and Next.js skills. Candidate's experience perfectly aligns with the core requirements.",
            status: "new",
            salary_info: ["$150k - $200k", "$130k - $160k", null][Math.floor(Math.random() * 3)],
            is_remote: Math.random() > 0.5
        }))
    ];

    const { data: jobs, error: jobsErr } = await supabase.from("job_listings").insert(jobsToInsert).select();

    if (jobsErr || !jobs) {
        console.error("Failed to insert jobs", jobsErr);
    }

    console.log("Inserting applications...");
    // Generate 45 mock applications to fill out charts
    const apps = [];

    for (let i = 0; i < 45; i++) {
        // Random date in the last 60 days
        const appliedDate = new Date(now.getTime() - Math.floor(Math.random() * 60 * 24 * 60 * 60 * 1000));

        // Pick a status. Favor "applied", "rejected" and "ghosted" for realism
        const r = Math.random();
        let status = "applied";
        if (r > 0.4) status = "rejected";
        if (r > 0.7) status = "ghosted";
        if (r > 0.85) status = "screening";
        if (r > 0.93) status = "interview";
        if (r > 0.98) status = "offer";

        let heardBackDate = null;
        if (status !== "applied" && status !== "ghosted") {
            const daysAfter = Math.floor(Math.random() * 14) + 1; // 1-14 days after applying
            heardBackDate = new Date(appliedDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
            if (heardBackDate > now) heardBackDate = now;
        }

        apps.push({
            user_id: userId,
            job_title: `Software Engineer ${i + 1}`,
            company: ["TechNova", "Stripe", "Netflix", "Google", "Vercel", "Startup Inc"][Math.floor(Math.random() * 6)],
            applied_at: appliedDate.toISOString().split("T")[0],
            status: status,
            status_updated_at: (heardBackDate || appliedDate).toISOString(),
            applied_via: ["LinkedIn", "Company Site", "Wellfound", "Referral"][Math.floor(Math.random() * 4)],
            heard_back_at: heardBackDate ? heardBackDate.toISOString().split("T")[0] : null
        });
    }

    const { error: appErr } = await supabase.from("applications").insert(apps);
    if (appErr) {
        console.error("Failed to insert applications", appErr);
    }

    console.log("Demo account seeded successfully!");
}

seed();
