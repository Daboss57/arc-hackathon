-- Run this in your Supabase SQL editor to create the policies table

-- Create the policies table
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_policies_user_id ON policies(user_id);

-- Enable Row Level Security
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own policies
CREATE POLICY "Users can view own policies" ON policies
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own policies
CREATE POLICY "Users can create own policies" ON policies
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own policies
CREATE POLICY "Users can update own policies" ON policies
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own policies
CREATE POLICY "Users can delete own policies" ON policies
    FOR DELETE USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_policies_updated_at ON policies;
CREATE TRIGGER update_policies_updated_at
    BEFORE UPDATE ON policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
