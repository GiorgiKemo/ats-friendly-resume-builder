# Plan for Vercel Routing Guide

This document outlines the plan for creating a comprehensive guide to configure Vercel routing for a React/Vite Single Page Application (SPA).

## 1. Introduction to Vercel and SPAs
*   Briefly explain how Vercel is optimized for modern web applications.
*   Describe Vercel's default behavior for Single Page Applications (SPAs), particularly those built with Vite. Highlight that Vercel often intelligently handles SPA routing with its Framework Presets.

## 2. Client-Side Routing and the `index.html` Fallback
*   Explain why SPAs (like React apps using React Router) need all non-asset requests to be directed to the main `index.html` file.
*   Discuss how this allows the client-side router to take over and display the correct view.

## 3. Configuring Routing with `vercel.json`
*   **Overview:** Introduce the `vercel.json` file as the primary way to customize Vercel's deployment behavior, including routing.
*   **`rewrites` for SPAs:**
    *   Reference the typical broad rewrite rule:
        ```json
        {
          "source": "/(.*)",
          "destination": "/index.html"
        }
        ```
    *   Explain that while this works, it's a very broad catch-all.
    *   Introduce and recommend the more specific rewrite rule:
        ```json
        {
          "rewrites": [
            { "source": "/((?!api/|favicon.ico|robots.txt|service-worker.js|manifest.json|_headers|assets/).*)", "destination": "/index.html" }
          ]
        }
        ```
    *   **Detailed Explanation of the Recommended Rule:**
        *   Break down the `source` pattern: `/((?!api/|favicon.ico|robots.txt|service-worker.js|manifest.json|_headers|assets/).*)`.
        *   Explain the negative lookahead assertion `(?!...)` and its purpose: to match any path *except* those starting with `api/`, or exactly matching `favicon.ico`, `robots.txt`, etc., or paths under `assets/`.
        *   Explain how this prevents Vercel from rewriting requests for API endpoints, essential static files, or asset files to `index.html`.
        *   Provide guidance on how to adapt this rule (e.g., adding other static directories or specific paths to the exclusion list).
*   **`redirects` for Specific Path Changes:**
    *   Explain the purpose of the `redirects` array.
    *   Provide a general example of a redirect and explain common use cases (e.g., renaming paths, handling old URLs).
    *   Mention the `permanent` flag (true for 308, false for 307).

## 4. Vercel Framework Presets (Vite)
*   Explain that Vercel's Framework Preset for Vite (e.g., `framework: "vite"`) often handles the necessary SPA rewrite logic automatically.
*   Clarify why explicitly defining `rewrites` in `vercel.json` can still be beneficial:
    *   For more granular control over which paths are rewritten.
    *   When dealing with more complex scenarios (e.g., multiple SPAs, specific exclusions not covered by the preset).
    *   For explicitness and easier understanding of the routing behavior.

## 5. Best Practices and Common Pitfalls
*   **Order of Rules:** Emphasize that the order of `redirects` and `rewrites` can matter.
*   **Testing:** Strongly recommend thorough testing of all routes and redirects after deployment.
*   **Debugging:** Suggest using Vercel's deployment logs.
*   **Static Assets:** Ensure static assets are correctly referenced and not inadvertently caught by rewrite rules.
*   **API Routes:** If using Vercel Serverless Functions (often in an `api/` directory), ensure they are excluded from SPA rewrites.

## 6. Mermaid Diagram: Vercel Request Flow

```mermaid
graph TD
    A[User Request to Vercel URL] --> B{Path matches a static file in 'dist/'?};
    B -- Yes --> C[Serve Static File];
    B -- No --> D{Path matches a 'redirects' rule in vercel.json?};
    D -- Yes --> E[Perform Redirect];
    D -- No --> F{Path matches a 'rewrites' rule (e.g., SPA fallback) in vercel.json?};
    F -- Yes --> G[Rewrite to /index.html];
    G --> H[Serve index.html];
    H --> I[Client-Side Router (React Router) handles the path];
    F -- No --> J[Vercel attempts to find other handlers or returns 404];