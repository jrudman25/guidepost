import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

/**
 * Build an array of page numbers to display, with -1 as ellipsis markers.
 * Shows first page, last page, and a window around the current page.
 */
function getPageNumbers(current: number, total: number): number[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: number[] = [];
    const window = new Set<number>();

    // Always include first and last
    window.add(1);
    window.add(total);

    // Window around current page
    for (let i = current - 1; i <= current + 1; i++) {
        if (i >= 1 && i <= total) window.add(i);
    }

    const sorted = Array.from(window).sort((a, b) => a - b);

    for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
            pages.push(-1); // ellipsis
        }
        pages.push(sorted[i]);
    }

    return pages;
}

export function PaginationControls({
    currentPage,
    totalPages,
    onPageChange,
}: PaginationControlsProps) {
    if (totalPages <= 1) return null;

    const pageNumbers = getPageNumbers(currentPage, totalPages);

    return (
        <div className="flex items-center justify-center gap-1 py-4">
            {/* First page */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(1)}
                disabled={currentPage <= 1}
            >
                <ChevronsLeft className="h-4 w-4" />
            </Button>
            {/* Previous page */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page numbers */}
            {pageNumbers.map((pageNum, idx) =>
                pageNum === -1 ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-sm text-muted-foreground">
                        …
                    </span>
                ) : (
                    <Button
                        key={pageNum}
                        variant={pageNum === currentPage ? "default" : "ghost"}
                        size="icon"
                        className="h-8 w-8 text-sm"
                        onClick={() => onPageChange(pageNum)}
                    >
                        {pageNum}
                    </Button>
                )
            )}

            {/* Next page */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
            {/* Last page */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage >= totalPages}
            >
                <ChevronsRight className="h-4 w-4" />
            </Button>
        </div>
    );
}
