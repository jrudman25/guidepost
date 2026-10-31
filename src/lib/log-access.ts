/**
 * Pipeline logs are written into one shared service-role-only bucket, so they
 * must remain restricted to an explicitly configured administrator.
 */
export function canViewPipelineLogs(email: string | null | undefined): boolean {
    const adminEmail = process.env.LOGS_ADMIN_EMAIL?.trim().toLowerCase();
    return Boolean(adminEmail && email?.trim().toLowerCase() === adminEmail);
}
