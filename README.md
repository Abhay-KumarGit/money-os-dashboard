# Money OS Dashboard

Minimal, password-protected frontend for a private Money OS portfolio tracker.

## Privacy model

This public repository contains only static interface code. It contains **no portfolio data, broker credentials, Gmail credentials, Supabase service key, password hash, or private dashboard password**.

The site asks for a Money OS password. The password is verified by a private Supabase Edge Function and is never stored by the frontend. A short-lived signed session is stored in the browser (7 days only when "keep me signed in" is enabled). Portfolio data is returned only to a valid session.

The backend applies login rate limiting, stores only a PBKDF2 password hash, and invalidates existing sessions when the password changes.

## Sections

- Overview
- Stocks
- Mutual Funds
- Activity
- Settings / password management

Deployment is handled by GitHub Pages through `.github/workflows/pages.yml`.
