export function formatRelativeTime(date: Date, lang: string = "en"): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (lang === "sw") {
        if (diffInSeconds < 5) return "sasa hivi";
        if (diffInSeconds < 60) return `sekunde ${diffInSeconds} zilizopita`;

        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `dakika ${diffInMinutes} zilizopita`;

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `saa ${diffInHours} zilizopita`;

        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 30) return `siku ${diffInDays} zilizopita`;

        const diffInMonths = Math.floor(diffInDays / 30);
        if (diffInMonths < 12) return `miezi ${diffInMonths} iliyopita`;

        const diffInYears = Math.floor(diffInMonths / 12);
        return `miaka ${diffInYears} iliyopita`;
    }

    // Basic English relative time if lang is not sw
    if (diffInSeconds < 5) return "just now";
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths}mo ago`;
    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears}y ago`;
}
