import { supabase } from './supabaseClient';

export interface PolicyRule {
    type: 'maxPerTransaction' | 'dailyLimit' | 'monthlyBudget' | 'vendorWhitelist' | 'categoryLimit';
    params: Record<string, unknown>;
}

export interface Policy {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    enabled: boolean;
    rules: PolicyRule[];
    created_at: string;
    updated_at: string;
}

export interface CreatePolicyInput {
    name: string;
    description?: string;
    rules: PolicyRule[];
}

export interface UpdatePolicyInput {
    name?: string;
    description?: string;
    enabled?: boolean;
    rules?: PolicyRule[];
}

/**
 * Fetch all policies for the current user
 */
export async function fetchPolicies(userId: string): Promise<Policy[]> {
    const { data, error } = await supabase
        .from('policies')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching policies:', error);
        throw new Error('Failed to fetch policies');
    }

    return (data || []).map(row => ({
        ...row,
        rules: Array.isArray(row.rules) ? row.rules : [],
    }));
}

/**
 * Get a single policy by ID
 */
export async function fetchPolicy(policyId: string): Promise<Policy | null> {
    const { data, error } = await supabase
        .from('policies')
        .select('*')
        .eq('id', policyId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        console.error('Error fetching policy:', error);
        throw new Error('Failed to fetch policy');
    }

    return data ? { ...data, rules: Array.isArray(data.rules) ? data.rules : [] } : null;
}

/**
 * Create a new policy
 */
export async function createPolicy(userId: string, input: CreatePolicyInput): Promise<Policy> {
    const { data, error } = await supabase
        .from('policies')
        .insert({
            user_id: userId,
            name: input.name,
            description: input.description || null,
            rules: input.rules,
            enabled: true,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating policy:', error);
        throw new Error('Failed to create policy');
    }

    return { ...data, rules: Array.isArray(data.rules) ? data.rules : [] };
}

/**
 * Update an existing policy
 */
export async function updatePolicy(policyId: string, updates: UpdatePolicyInput): Promise<Policy> {
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
    if (updates.rules !== undefined) updateData.rules = updates.rules;

    const { data, error } = await supabase
        .from('policies')
        .update(updateData)
        .eq('id', policyId)
        .select()
        .single();

    if (error) {
        console.error('Error updating policy:', error);
        throw new Error('Failed to update policy');
    }

    return { ...data, rules: Array.isArray(data.rules) ? data.rules : [] };
}

/**
 * Delete a policy
 */
export async function deletePolicy(policyId: string): Promise<void> {
    const { error } = await supabase
        .from('policies')
        .delete()
        .eq('id', policyId);

    if (error) {
        console.error('Error deleting policy:', error);
        throw new Error('Failed to delete policy');
    }
}

/**
 * Toggle policy enabled status
 */
export async function togglePolicy(policyId: string, enabled: boolean): Promise<Policy> {
    return updatePolicy(policyId, { enabled });
}
