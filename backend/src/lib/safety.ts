import { getSafetyState, setSafetyState } from './dataStore.js';

export function isPaymentsPaused(): boolean {
    return getSafetyState().paymentsPaused;
}

export function setPaymentsPaused(paused: boolean): void {
    const state = getSafetyState();
    if (state.paymentsPaused === paused) return;
    setSafetyState({ ...state, paymentsPaused: paused });
}

export function isSafeModeEnabled(userId: string): boolean {
    return getSafetyState().safeModeByUser[userId] ?? false;
}

export function setSafeModeForUser(userId: string, enabled: boolean): void {
    const state = getSafetyState();
    const safeModeByUser = { ...state.safeModeByUser, [userId]: enabled };
    const approvedSpendByUser = { ...state.approvedSpendByUser };
    if (enabled) {
        approvedSpendByUser[userId] = false;
    }
    setSafetyState({
        ...state,
        safeModeByUser,
        approvedSpendByUser,
    });
}

export function hasUserApprovedOnce(userId: string): boolean {
    return getSafetyState().approvedSpendByUser[userId] ?? false;
}

export function markUserApprovedOnce(userId: string): void {
    const state = getSafetyState();
    setSafetyState({
        ...state,
        approvedSpendByUser: { ...state.approvedSpendByUser, [userId]: true },
    });
}

export function resetUserApproval(userId: string): void {
    const state = getSafetyState();
    setSafetyState({
        ...state,
        approvedSpendByUser: { ...state.approvedSpendByUser, [userId]: false },
    });
}

export function isAutoBudgetEnabled(userId: string): boolean {
    return getSafetyState().autoBudgetByUser[userId] ?? false;
}

export function setAutoBudgetEnabled(userId: string, enabled: boolean): void {
    const state = getSafetyState();
    setSafetyState({
        ...state,
        autoBudgetByUser: { ...state.autoBudgetByUser, [userId]: enabled },
    });
}

export function getSafetySnapshot(userId?: string): {
    paymentsPaused: boolean;
    safeMode: boolean;
    approvalRequired: boolean;
    autoBudget: boolean;
} {
    const state = getSafetyState();
    if (!userId) {
        return {
            paymentsPaused: state.paymentsPaused,
            safeMode: false,
            approvalRequired: false,
            autoBudget: false,
        };
    }

    const safeMode = isSafeModeEnabled(userId);
    const approvalRequired = safeMode && !hasUserApprovedOnce(userId);
    const autoBudget = isAutoBudgetEnabled(userId);

    return {
        paymentsPaused: state.paymentsPaused,
        safeMode,
        approvalRequired,
        autoBudget,
    };
}
