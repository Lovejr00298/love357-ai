LOVE357 AI — PRODUCTION GOOGLE CONNECTION PACKAGE

WHAT THIS REPLACES
The local server.js starter stores one person's Google token in a local file.
That design is not safe or reliable for a multi-customer Netlify application.

THIS PACKAGE PROVIDES
- Netlify Functions for Google OAuth
- Per-user Google token storage in Supabase
- AES-256-GCM token encryption before database storage
- Gmail recent-message brief
- Gmail draft creation
- Google Calendar next-24-hours events
- Google disconnect/revocation
- Supabase-session authentication for every user request

FILES TO UPLOAD TO THE ROOT OF THE GITHUB REPOSITORY
- package.json
- netlify.toml
- .gitignore
- google-client.js
- netlify/ (entire folder)

DO NOT UPLOAD
- .env
- .env.example is safe, but optional
- NETLIFY_ENV_VALUES_TEMPLATE.txt
- node_modules
- local server.js
- data/google-token.json
- any Google client secret
- any Supabase secret/service-role key

AFTER THE FILES DEPLOY
Add this immediately before </body> in index.html:

<script type="module" src="google-client.js"></script>

The application can then call:
- LOVE357_GOOGLE.connect()
- LOVE357_GOOGLE.status()
- LOVE357_GOOGLE.gmailBrief()
- LOVE357_GOOGLE.calendarToday()
- LOVE357_GOOGLE.createDraft({to, subject, body})
- LOVE357_GOOGLE.disconnect()

The next step is wiring these methods to the existing Email & Calendar buttons.
