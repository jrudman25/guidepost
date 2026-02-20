"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { SearchFilter } from "@/lib/types";

export default function FiltersPage() {
    const params = useParams();
    const router = useRouter();
    const resumeId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [keywordInput, setKeywordInput] = useState("");
    const [excludeInput, setExcludeInput] = useState("");

    const [filters, setFilters] = useState<Partial<SearchFilter>>({
        keywords: [],
        location: "",
        remote_preference: "any",
        target_seniority: "any",
        min_salary: null,
        max_listing_age_days: 7,
        excluded_companies: [],
    });

    useEffect(() => {
        async function fetchFilters() {
            try {
                const response = await fetch(`/api/resumes/${resumeId}/filters`);
                const data = await response.json();
                if (data.filters) {
                    setFilters(data.filters);
                }
            } catch (error) {
                console.error("Failed to fetch filters:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchFilters();
    }, [resumeId]);

    function addKeyword() {
        const kw = keywordInput.trim();
        if (kw && !filters.keywords?.includes(kw)) {
            setFilters((prev) => ({
                ...prev,
                keywords: [...(prev.keywords || []), kw],
            }));
            setKeywordInput("");
        }
    }

    function removeKeyword(keyword: string) {
        setFilters((prev) => ({
            ...prev,
            keywords: (prev.keywords || []).filter((k) => k !== keyword),
        }));
    }

    function addExcludedCompany() {
        const company = excludeInput.trim();
        if (company && !filters.excluded_companies?.includes(company)) {
            setFilters((prev) => ({
                ...prev,
                excluded_companies: [...(prev.excluded_companies || []), company],
            }));
            setExcludeInput("");
        }
    }

    function removeExcludedCompany(company: string) {
        setFilters((prev) => ({
            ...prev,
            excluded_companies: (prev.excluded_companies || []).filter(
                (c) => c !== company
            ),
        }));
    }

    async function handleSave() {
        setSaving(true);
        try {
            const response = await fetch(`/api/resumes/${resumeId}/filters`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(filters),
            });

            if (!response.ok) throw new Error("Failed to save");
            toast.success("Filters saved!");
        } catch {
            toast.error("Failed to save filters");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Search Filters</h1>
                    <p className="mt-1 text-muted-foreground">
                        Customize how we search for jobs matching this resume.
                    </p>
                </div>
            </div>

            <div className="max-w-2xl space-y-6 rounded-xl border border-border bg-card p-6">
                {/* Keywords */}
                <div className="space-y-2">
                    <Label>Additional Keywords</Label>
                    <p className="text-xs text-muted-foreground">
                        Extra search terms added to every query
                    </p>
                    <div className="flex gap-2">
                        <Input
                            placeholder="e.g. React, startup, fintech"
                            value={keywordInput}
                            onChange={(e) => setKeywordInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                        />
                        <Button variant="outline" size="icon" onClick={addKeyword}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {filters.keywords?.map((kw) => (
                            <Badge key={kw} variant="secondary" className="gap-1">
                                {kw}
                                <button onClick={() => removeKeyword(kw)}>
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Location */}
                <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                        id="location"
                        placeholder="e.g. San Francisco, CA or United States"
                        value={filters.location || ""}
                        onChange={(e) =>
                            setFilters((prev) => ({ ...prev, location: e.target.value }))
                        }
                    />
                </div>

                {/* Remote Preference */}
                <div className="space-y-2">
                    <Label>Remote Preference</Label>
                    <Select
                        value={filters.remote_preference || "any"}
                        onValueChange={(v) =>
                            setFilters((prev) => ({
                                ...prev,
                                remote_preference: v as SearchFilter["remote_preference"],
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">Any</SelectItem>
                            <SelectItem value="remote">Remote Only</SelectItem>
                            <SelectItem value="hybrid">Hybrid</SelectItem>
                            <SelectItem value="onsite">On-site</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Target Seniority */}
                <div className="space-y-2">
                    <Label>Target Seniority</Label>
                    <p className="text-xs text-muted-foreground">
                        Filter searches by experience level
                    </p>
                    <Select
                        value={filters.target_seniority || "any"}
                        onValueChange={(v) =>
                            setFilters((prev) => ({
                                ...prev,
                                target_seniority: v as SearchFilter["target_seniority"],
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">Any Level</SelectItem>
                            <SelectItem value="entry">Entry Level / Junior</SelectItem>
                            <SelectItem value="mid">Mid Level</SelectItem>
                            <SelectItem value="senior">Senior</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {/* Min Salary */}
                <div className="space-y-2">
                    <Label htmlFor="salary">Minimum Salary (USD/year)</Label>
                    <Input
                        id="salary"
                        type="number"
                        placeholder="e.g. 80000"
                        value={filters.min_salary || ""}
                        onChange={(e) =>
                            setFilters((prev) => ({
                                ...prev,
                                min_salary: e.target.value ? parseInt(e.target.value) : null,
                            }))
                        }
                    />
                </div>

                {/* Max Listing Age */}
                <div className="space-y-2">
                    <Label>Max Listing Age</Label>
                    <Select
                        value={String(filters.max_listing_age_days || 7)}
                        onValueChange={(v) =>
                            setFilters((prev) => ({
                                ...prev,
                                max_listing_age_days: parseInt(v),
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">Today only</SelectItem>
                            <SelectItem value="3">Last 3 days</SelectItem>
                            <SelectItem value="7">Last week</SelectItem>
                            <SelectItem value="14">Last 2 weeks</SelectItem>
                            <SelectItem value="30">Last month</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Excluded Companies */}
                <div className="space-y-2">
                    <Label>Excluded Companies</Label>
                    <p className="text-xs text-muted-foreground">
                        Skip job listings from these companies
                    </p>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Company name"
                            value={excludeInput}
                            onChange={(e) => setExcludeInput(e.target.value)}
                            onKeyDown={(e) =>
                                e.key === "Enter" && (e.preventDefault(), addExcludedCompany())
                            }
                        />
                        <Button variant="outline" size="icon" onClick={addExcludedCompany}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {filters.excluded_companies?.map((company) => (
                            <Badge key={company} variant="destructive" className="gap-1">
                                {company}
                                <button onClick={() => removeExcludedCompany(company)}>
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                </div>

                {/* Save */}
                <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Filters
                </Button>
            </div>
        </div>
    );
}

