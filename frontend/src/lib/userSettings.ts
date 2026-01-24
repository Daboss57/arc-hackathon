import { AI_SERVICE_URL } from '../api/aiService';

export interface UserSettings {
    user_id: string;
    display_name: string | null;
    monthly_budget: number | null;
    safe_mode: boolean | null;
    auto_budget: boolean | null;
    ui_scale: number | null;
    updated_at?: string | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
    user_id: '',
    display_name: null,
    monthly_budget: 20,
    safe_mode: true,
    auto_budget: false,
    ui_scale: 1,
    updated_at: null,
};

const STORAGE_PREFIX = 'autowealth-settings';

export function loadLocalSettings(userId: string): UserSettings | null {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}:${userId}`);
        if (!raw) return null;
        return JSON.parse(raw) as UserSettings;
    } catch {
        return null;
    }
}

export function saveLocalSettings(settings: UserSettings): void {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}:${settings.user_id}`, JSON.stringify(settings));
    } catch {
        // Ignore local storage failures
    }
}

export async function fetchUserSettings(userId: string): Promise<UserSettings | null> {
    const response = await fetch(`${AI_SERVICE_URL}/api/user-settings/${userId}`);
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || !data.user_id) return null;
    return data as UserSettings;
}

export async function upsertUserSettings(settings: UserSettings): Promise<UserSettings | null> {
    const response = await fetch(`${AI_SERVICE_URL}/api/user-settings/${settings.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return (data as UserSettings) || null;
}
