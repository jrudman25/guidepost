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
    await supabase.from("applications").delete().eq("user_id", userId);
    await supabase.from("job_listings").delete().eq("user_id", userId);
    await supabase.from("search_filters").delete().eq("user_id", userId);
    await supabase.from("resumes").delete().eq("user_id", userId);

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
    const demoJobs = [
        {
            title: "Senior Frontend Engineer",
            company: "Vercel",
            location: "Remote (United States)",
            source: "Company Site",
            match_score: 94,
            salary_info: "$165k - $210k",
            is_remote: true
        },
        {
            title: "Full Stack Engineer",
            company: "Stripe",
            location: "San Francisco, CA",
            source: "LinkedIn",
            match_score: 88,
            salary_info: "$155k - $195k",
            is_remote: false
        },
        {
            title: "React Platform Engineer",
            company: "Linear",
            location: "Remote (North America)",
            source: "Company Site",
            match_score: 86,
            salary_info: "$150k - $190k",
            is_remote: true
        },
        {
            title: "Product Engineer",
            company: "Notion",
            location: "New York, NY",
            source: "Indeed",
            match_score: 82,
            salary_info: "$145k - $180k",
            is_remote: false
        },
        {
            title: "Frontend Developer",
            company: "Figma",
            location: "Remote",
            source: "LinkedIn",
            match_score: 80,
            salary_info: "$140k - $175k",
            is_remote: true
        },
        {
            title: "Software Engineer, Web",
            company: "Datadog",
            location: "Boston, MA",
            source: "Company Site",
            match_score: 76,
            salary_info: "$135k - $170k",
            is_remote: false
        },
        {
            title: "Next.js Engineer",
            company: "HashiCorp",
            location: "Remote (US)",
            source: "Company Site",
            match_score: 74,
            salary_info: "$130k - $165k",
            is_remote: true
        },
        {
            title: "UI Engineer",
            company: "Asana",
            location: "San Francisco, CA",
            source: "LinkedIn",
            match_score: 71,
            salary_info: "$125k - $160k",
            is_remote: false
        },
        {
            title: "Backend Product Engineer",
            company: "Retool",
            location: "Remote (Canada or US)",
            source: "Indeed",
            match_score: 67,
            salary_info: "$130k - $175k",
            is_remote: true
        },
        {
            title: "Internal Tools Engineer",
            company: "Ramp",
            location: "New York, NY",
            source: "Company Site",
            match_score: 63,
            salary_info: "$120k - $155k",
            is_remote: false
        },
        {
            title: "JavaScript Developer",
            company: "Webflow",
            location: "Remote",
            source: "LinkedIn",
            match_score: 58,
            salary_info: "$115k - $150k",
            is_remote: true
        },
        {
            title: "Frontend Support Engineer",
            company: "TechNova",
            location: "Austin, TX",
            source: "Indeed",
            match_score: 52,
            salary_info: "$100k - $130k",
            is_remote: false
        }
    ];
    const jobsToInsert = demoJobs.map((job, i) => ({
            resume_id: resumeData.id,
            user_id: userId,
            title: job.title,
            company: job.company,
            location: job.location,
            description: "Join a product-focused engineering team building modern web applications with React, TypeScript, Next.js, Node.js, and PostgreSQL. The role values accessibility, maintainable UI systems, API design, and clear ownership across the product lifecycle.",
            url: `https://example.com/jobs/demo-${i + 1}`,
            source: job.source,
            posted_at: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
            discovered_at: new Date(now.getTime() - i * 6 * 60 * 60 * 1000).toISOString(),
            match_score: job.match_score,
            match_reasoning: "Strong match for React, TypeScript, Next.js, and full-stack product engineering experience. The score reflects overlap with the demo resume's skills, seniority, and preferred role types.",
            status: "new",
            salary_info: job.salary_info,
            is_remote: job.is_remote
    }));

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

        // Determine furthest_stage for realistic data
        let furthestStage = "applied";
        if (status === "screening") furthestStage = "screening";
        else if (status === "interview") furthestStage = "interview";
        else if (status === "offer") furthestStage = "offer";
        else if (status === "rejected" || status === "ghosted") {
            // Randomize how far they got before rejection
            const fr = Math.random();
            if (fr > 0.7) furthestStage = "interview";
            else if (fr > 0.4) furthestStage = "screening";
            // else stays "applied"
        }

        apps.push({
            user_id: userId,
            job_title: `Software Engineer ${i + 1}`,
            company: ["TechNova", "Stripe", "Netflix", "Google", "Vercel", "Startup Inc"][Math.floor(Math.random() * 6)],
            applied_at: appliedDate.toISOString().split("T")[0],
            status: status,
            status_updated_at: (heardBackDate || appliedDate).toISOString(),
            applied_via: ["LinkedIn", "Company Site", "Wellfound", "Referral"][Math.floor(Math.random() * 4)],
            heard_back_at: heardBackDate ? heardBackDate.toISOString().split("T")[0] : null,
            furthest_stage: furthestStage
        });
    }

    const { error: appErr } = await supabase.from("applications").insert(apps);
    if (appErr) {
        console.error("Failed to insert applications", appErr);
    }

    console.log("Demo account seeded successfully!");
}

seed();
