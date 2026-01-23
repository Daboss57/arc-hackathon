export function parseAmount(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const numeric = Number.parseFloat(String(value).trim());
    if (!Number.isFinite(numeric)) return null;
    return numeric;
}

export function isPositiveAmount(value: unknown): boolean {
    const numeric = parseAmount(value);
    return numeric !== null && numeric > 0;
}
