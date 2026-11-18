# SuperTwitter

A local-first, independently implemented X client hosted at [x.swyx.io](https://x.swyx.io/). React, TypeScript and Tailwind power the interface. A Cloudflare Worker serves static assets and a shared AI High Signal feed. Account authorization and publishing run in the local browser connector.

## Run locally

Use Node 22.12 or later and pnpm 10.33.1.

```sh
git clone https://github.com/swyxio/supertwitter.git
cd supertwitter
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173. The AI High Signal tab reads the hosted public feed through the local dev server. The For you sample timeline and both preview accounts also work offline after the local server starts. The posts and engagement counts in the sample feed are illustrative. Publishing in local preview affects only the selected preview account on this browser and origin.

## Connect X

For a text post with your existing X login, type in the local preview composer and select **Continue on X**. The official X composer opens with your text. You choose the account and confirm there. This path requires no extension or developer app.

1. In desktop Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked** and select the repository’s `extension` folder or the extracted [connector download](https://x.swyx.io/connector.zip).
2. Open the extension’s options. In the [X Developer Console](https://console.x.com/), configure a public OAuth 2.0 client (Native App or Single page App) with read and write access. Register the exact callback shown by the extension. Its bundled public extension key keeps the callback URL stable across installations.
3. Enter the **public client ID** in the extension and choose **Connect with X**. X shows the requested permissions. Choose each account on x.com and repeat to add it. Turn on **Local app on port 5173** for local development.
4. Reload the app after installing. Open the account switcher, choose the account, and use Following, Profile, Mentions or Bookmarks. The two allowed localhost origins have independent drafts and preferences. Provider access and billing depend on your X developer app. [X timeline documentation](https://docs.x.com/x-api/posts/timelines/introduction)

The extension implements OAuth 2.0 Authorization Code with PKCE. It keeps access and refresh tokens in the local Chrome extension profile and sends them only to the official X API. The site receives account/profile metadata, timeline results and operation results. It never asks for passwords or session cookies. You review writes, including the posting account, text and optional photo, in a trusted extension page. Removing an account removes its local credentials. Revoke provider access in [X connected apps](https://x.com/settings/connected_apps).

## Client behavior

- **Home** starts new preview accounts on AI High Signal, a shared feed of public posts from [the curated X list](https://x.com/i/lists/1585430245762441216). Readers can open the original posts on X. The For you tab contains sample data. Connected accounts start on Following and can also select AI High Signal.
- **Account switching** isolates drafts, replies, attachments, preview activity and timeline tabs. Pin accounts in the switcher to choose their order. Alt/Option+1–9 switches directly to the corresponding account. Unfinished drafts save as you type. Preview posts are private to the browser account that created them.
- **Posting** supports text, links, replies and one JPEG, PNG or WebP up to 2 MiB, with an optional image description. Ctrl/Command+Enter submits. Each attached file is saved in local IndexedDB until used or discarded.
- **Explore** searches the available posts. **Notifications** shows mentions. **Messages** opens the official X site in a new tab using its own signed-in account. **More** controls theme, compact spacing, media loading and engagement counts.
- Live bookmarks, likes, reposts, profile posts, direct post lookup and paginated feeds use the official X API. The connector keeps recent action state for this device where X omits viewer flags. The client displays photos and image previews for other media.

## Shared list feed

`GET /api/high-signal` returns `{posts, updatedAt}`. The Worker reads one configured public list page and publishes its normalized posts. Browsers receive canonical post IDs and approved X media URLs. A single SQLite-backed Durable Object stores the last successful snapshot, coalesces concurrent reads, and refreshes on demand after 15 minutes. During an outage it serves the previous snapshot with its original update time.

Set the Worker secret `FEED_SOURCE_URL` to the full HTTPS list page URL at deployment time. Its path should be `/i/lists/<numeric-id>`. For local Worker development, put this value in the ignored `.dev.vars` file and run `pnpm build && pnpm exec wrangler dev`. Ordinary frontend development with `pnpm dev` needs no upstream configuration.

## Verify and deploy

```sh
pnpm typecheck
pnpm exec playwright install chromium
pnpm test
pnpm test:connector
pnpm test:feed
pnpm build
```

Run the full UI/connector integration test with `pnpm test:integration` while `pnpm dev` is running on port 5173. Both Chromium extension test suites use mock X data in disposable browser profiles. The deploy script targets the configured x.swyx.io hostname. Set your own Worker name and custom domain before deploying a fork, and update the extension allowlist for that origin.

All frontend code is in `src/`. The browser connector is in `extension/`. The packaging step creates downloadable source and connector ZIPs from explicitly included project files. The initial screen loads its own fonts from the system, local image assets, and its own bundled JavaScript.

## License

The SuperTwitter code and documentation use the [MIT License](LICENSE). The preview photographs use the [Unsplash license](https://unsplash.com/license). Third-party packages retain their own licenses. X and Twitter trademarks belong to their respective owners.

## Preview photography

The preview uses locally optimized copies of these Unsplash images. Names, posts and counts in the preview are fictional.

[Golden Gate Bridge](https://images.unsplash.com/photo-1501594907352-04cda38ebc29) · [Forest lake](https://images.unsplash.com/photo-1473448912268-2022ce9509d8) · [Portrait 1](https://images.unsplash.com/photo-1472099645785-5658abf4ff4e) · [Portrait 2](https://images.unsplash.com/photo-1494790108377-be9c29b29330) · [Portrait 3](https://images.unsplash.com/photo-1506794778202-cad84cf45f1d) · [Portrait 4](https://images.unsplash.com/photo-1534528741775-53994a69daeb) · [Portrait 5](https://images.unsplash.com/photo-1500648767791-00dcc994a43e). [Unsplash license](https://unsplash.com/license).
