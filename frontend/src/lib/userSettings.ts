import { supabase } from './supabaseClient';

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
    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        return null;
    }
    return data as UserSettings | null;
}

export async function upsertUserSettings(settings: UserSettings): Promise<UserSettings | null> {
    const payload = {
        ...settings,
        updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .single();

    if (error) {
        return null;
    }
    return data as UserSettings;
}
