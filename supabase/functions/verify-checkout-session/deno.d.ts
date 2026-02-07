// Type definitions for Deno

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
    options?: { port?: number; hostname?: string }
  ): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: unknown): unknown;
}

declare module 'https://esm.sh/stripe@12.18.0' {
  export default class Stripe {
    constructor(apiKey: string, options?: { apiVersion?: string });
    checkout: {
      sessions: {
        retrieve(id: string, options?: unknown): Promise<unknown>;
      };
    };
  }
}
