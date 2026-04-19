-- Gmail OAuth connections for auto-apply system
CREATE TABLE IF NOT EXISTS public.gmail_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scopes TEXT NOT NULL DEFAULT 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify',
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gmail_connections_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_connections_user_id ON public.gmail_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_connections_active ON public.gmail_connections(is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS on_gmail_connections_updated ON public.gmail_connections;
CREATE TRIGGER on_gmail_connections_updated
    BEFORE UPDATE ON public.gmail_connections
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gmail connection" ON public.gmail_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own gmail connection" ON public.gmail_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gmail connection" ON public.gmail_connections FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own gmail connection" ON public.gmail_connections FOR DELETE USING (auth.uid() = user_id);

-- Add Gmail columns to auto_apply_jobs
ALTER TABLE public.auto_apply_jobs ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
ALTER TABLE public.auto_apply_jobs ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;
ALTER TABLE public.auto_apply_jobs ADD COLUMN IF NOT EXISTS sent_via TEXT DEFAULT 'brevo';
