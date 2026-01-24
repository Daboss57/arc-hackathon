import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface LoginPageProps {
    onDemoLogin?: () => void;
    onBackToLanding?: () => void;
}

export function LoginPage({ onDemoLogin, onBackToLanding }: LoginPageProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [suggestSignup, setSuggestSignup] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);

    useEffect(() => {
        if (!cooldownUntil) {
            setCooldownSeconds(0);
            return;
        }
        const update = () => {
            const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
            setCooldownSeconds(remaining);
            if (remaining === 0) {
                setCooldownUntil(null);
            }
        };
        update();
        const id = window.setInterval(update, 500);
        return () => window.clearInterval(id);
    }, [cooldownUntil]);

    const handleAuth = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setStatus(null);
        setSuggestSignup(false);

        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }
        if (mode === 'signup' && cooldownUntil && Date.now() < cooldownUntil) {
            setError(`Please wait ${cooldownSeconds || 60}s before trying again.`);
            return;
        }

        setIsSubmitting(true);
        if (mode === 'signin') {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError) {
                const message = signInError.message.toLowerCase();
                if (message.includes('invalid login credentials')) {
                    setError('No account found or incorrect password.');
                    setSuggestSignup(true);
                } else if (message.includes('email not confirmed')) {
                    setError('Please confirm your email before signing in.');
                } else {
                    setError(signInError.message);
                }
                setIsSubmitting(false);
                return;
            }
            setStatus('Signed in successfully.');
            setIsSubmitting(false);
            return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
        });
        if (signUpError) {
            const message = signUpError.message.toLowerCase();
            if (message.includes('rate limit')) {
                setError('Email rate limit exceeded. Please wait about a minute and try again.');
                setCooldownUntil(Date.now() + 60_000);
            } else if (message.includes('user already registered')) {
                setError('An account with this email already exists. Please sign in instead.');
                setSuggestSignup(false);
                setMode('signin');
            } else {
                setError(signUpError.message);
            }
            setIsSubmitting(false);
            return;
        }
        setStatus('Account created. Please check your email to confirm, then sign in.');
        setMode('signin');
        setIsSubmitting(false);
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                {onBackToLanding && (
                    <button className="auth-back-btn" onClick={onBackToLanding}>
                        ← Back
                    </button>
                )}
                <div className="auth-header">
                    <h1>{mode === 'signin' ? 'Welcome back' : 'Create account'}</h1>
                    <p>{mode === 'signin' ? 'Sign in to your ARC account' : 'Get started with ARC'}</p>
                </div>

                <form onSubmit={handleAuth} className="auth-form">
                    <label>
                        Email
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                        />
                    </label>
                    <label>
                        Password
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                    </label>

                    {error && <div className="panel-error">{error}</div>}
                    {status && <div className="panel-success">{status}</div>}

                    <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={isSubmitting || (mode === 'signup' && cooldownSeconds > 0)}
                    >
                        {mode === 'signin' ? 'Sign in' : 'Create account'}
                    </button>
                    {cooldownSeconds > 0 && (
                        <div className="auth-hint">You can try again in {cooldownSeconds}s.</div>
                    )}
                </form>

                <div className="auth-footer">
                    <button
                        className="link-btn"
                        onClick={() => {
                            setMode(mode === 'signin' ? 'signup' : 'signin');
                            setError(null);
                            setStatus(null);
                            setSuggestSignup(false);
                        }}
                        disabled={isSubmitting}
                    >
                        {mode === 'signin' ? 'Create a new account' : 'Back to sign in'}
                    </button>
                    {suggestSignup && mode === 'signin' && (
                        <button
                            className="link-btn"
                            onClick={() => {
                                setMode('signup');
                                setError(null);
                                setStatus(null);
                            }}
                            disabled={isSubmitting}
                        >
                            Create an account for this email
                        </button>
                    )}
                    {onDemoLogin && (
                        <button className="btn btn-secondary" onClick={onDemoLogin}>
                            Continue with demo user
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
