import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface LoginPageProps {
    onDemoLogin?: () => void;
}

export function LoginPage({ onDemoLogin }: LoginPageProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    const handleAuth = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setStatus(null);

        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }

        if (mode === 'signin') {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError) {
                setError(signInError.message);
                return;
            }
            setStatus('Signed in successfully.');
            return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
        });
        if (signUpError) {
            if (signUpError.message.toLowerCase().includes('rate limit')) {
                setError('Email rate limit exceeded. Please wait a minute or sign in instead.');
                setMode('signin');
            } else {
                setError(signUpError.message);
            }
            return;
        }
        setStatus('Account created. You can sign in now.');
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>AutoWealth Agent</h1>
                    <p>Trustless spend management for autonomous commerce.</p>
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

                    <button className="btn btn-primary" type="submit">
                        {mode === 'signin' ? 'Sign in' : 'Create account'}
                    </button>
                </form>

                <div className="auth-footer">
                    <button
                        className="link-btn"
                        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                    >
                        {mode === 'signin' ? 'Create a new account' : 'Back to sign in'}
                    </button>
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
