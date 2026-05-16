/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'supabase' {
  export const createClient: (...args: unknown[]) => any;
}

declare module 'std/http/server.ts' {
  export const serve: (
    handler: (request: Request) => Response | Promise<Response>,
  ) => void;
}
