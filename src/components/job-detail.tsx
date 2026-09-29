"use client";

import Link from "next/link";
import type { JobListing } from "@/lib/types";
import { parseLocalDate, toLocalDateString } from "@/lib/date-utils";
import { displaySource, formatPostedAt, getScoreColor } from "@/lib/job-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ExternalLink,
    Bookmark,
    X as XIcon,
    CheckCircle,
    MapPin,
    Wifi,
    DollarSign,
    Clock,
    Inbox,
    Globe,
} from "lucide-react";
import { cn, safeHttpUrl } from "@/lib/utils";

export function JobDetail({
    job,
    onStatusChange,
}: {
    job: JobListing;
    onStatusChange: (id: string, status: JobListing["status"]) => void;
}) {
    return (
        <>
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-xl font-bold">{job.title}</h2>
                    <p className="mt-1 text-muted-foreground">
                        {job.company}
                    </p>
                    {job.discovered_at && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Found on {parseLocalDate(toLocalDateString(job.discovered_at)).toLocaleDateString()} at{" "}
                            {parseLocalDate(job.discovered_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </p>
                    )}
                </div>
                <Badge
                    variant="outline"
                    className={cn(
                        "text-lg font-bold",
                        getScoreColor(job.match_score)
                    )}
                >
                    {job.match_score != null ? `${job.match_score}%` : "\u2014"}
                </Badge>
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap gap-2">
                {job.location && (
                    <Badge variant="secondary">
                        <MapPin className="mr-1 h-3 w-3" />
                        {job.location}
                    </Badge>
                )}
                {job.is_remote && (
                    <Badge variant="secondary">
                        <Wifi className="mr-1 h-3 w-3" />
                        Remote
                    </Badge>
                )}
                {job.salary_info && (
                    <Badge variant="secondary">
                        <DollarSign className="mr-1 h-3 w-3" />
                        {job.salary_info}
                    </Badge>
                )}
                {formatPostedAt(job.posted_at) && (
                    <Badge variant="secondary">
                        <Clock className="mr-1 h-3 w-3" />
                        {formatPostedAt(job.posted_at)}
                    </Badge>
                )}
                {displaySource(job.source) && (
                    <Badge variant="secondary">
                        <Globe className="mr-1 h-3 w-3" />
                        via {displaySource(job.source)}
                    </Badge>
                )}
            </div>

            {/* Match reasoning */}
            {job.match_reasoning && (
                <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                        Match Analysis
                    </p>
                    <p className="mt-1 text-sm">{job.match_reasoning}</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
                {job.status !== "saved" && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusChange(job.id, "saved")}
                    >
                        <Bookmark className="mr-1 h-4 w-4" />
                        Save
                    </Button>
                )}
                {job.status !== "applied" && (
                    <Button
                        size="sm"
                        onClick={() => onStatusChange(job.id, "applied")}
                    >
                        <CheckCircle className="mr-1 h-4 w-4" />
                        Mark Applied
                    </Button>
                )}
                {job.status !== "dismissed" ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onStatusChange(job.id, "dismissed")}
                    >
                        <XIcon className="mr-1 h-4 w-4" />
                        Dismiss
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onStatusChange(job.id, "new")}
                    >
                        <Inbox className="mr-1 h-4 w-4" />
                        Back to Inbox
                    </Button>
                )}
                {safeHttpUrl(job.url) && (
                    <Button variant="outline" size="sm" asChild>
                        <Link href={safeHttpUrl(job.url)!} target="_blank">
                            <ExternalLink className="mr-1 h-4 w-4" />
                            View Posting
                        </Link>
                    </Button>
                )}
            </div>

            {/* Description */}
            {job.description && (
                <div className="max-h-96 overflow-y-auto rounded-lg bg-muted/50 p-4">
                    <p className="text-xs font-medium uppercase text-muted-foreground mb-2">
                        Job Description
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {job.description}
                    </p>
                </div>
            )}
        </>
    );
}
