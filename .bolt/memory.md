# Project memory

## Product intent & audience

- Mobile-first customer portal for Tsrukpe Tota Water and Sanitation (WATSAN), a Ghana-based water/sanitation utility.
- Core purpose: let customers check bills and make payments, modeled after Ghana Water Company's customer app.
- Primary audience: WATSAN customers accessing the site via mobile devices.
- Customers are already registered in an external system called Zite; this portal needs to integrate with Zite rather than maintain its own separate customer registry.

## Brand personality & voice

- Professional, trustworthy utility-service tone; clean and realistic.
- Branding uses "WATSAN" as the short mark; full name appears on welcome screen.
- Communication emphasizes account status clarity, payment security, and accessible support.

## Visual design & UX direction

- Traditional WATSAN color palette: deep blue and white as the core brand identity across both welcome and signed-in experiences.
- Mobile-first layout with responsive behavior for desktop.
- Screen flow: welcome → sign-in / registration → dashboard → bill payment (with receipt confirmation) → support / issue reporting; plus statements, payment history, settings/profile, and side navigation drawer.
- Logged-in header uses deep blue with white branding and controls; auth dialog carries matching WATSAN logo and blue-and-white styling.
- Dashboard surfaces balance, due date, account status, and quick actions.
- Payment screens use secure-payment styling and clear confirmation feedback.
- Dashboard cards, navigation, support, payments, statements, and settings share a unified polished visual language.
- Icons from lucide-react; Tailwind CSS for styling; React hooks for state.
- Polished, production-quality aesthetic — professional, clean, realistic, not cookie-cutter.

## Decisions, constraints & rationale

- Framework: vite-react with JSX, Tailwind, React hooks, Lucide React; no extra UI/icon packages.
- Imports use `@/` path alias mapping to `src/`.
- Traditional blue-and-white color scheme applied consistently across signed-in header, auth dialog, and all post-login screens to unify brand identity.
- No usable logo file was found in the project; a branded WATSAN mark was generated in-app instead.
- Starter project was essentially empty; full customer journey built from scratch.
- Lint/type-check/build all passing; unused imports and redundant params cleaned up.
- "Add account" shortcut given its own form rather than reusing sign-in fields.
- Zite is the authoritative external system where customers are registered; this portal does not yet have a live connection to Zite.

## Open questions & assumptions

- Integration approach with Zite is undecided: (A) portal pulls bill/customer data from Zite API (preferred if Zite exposes API), or (B) Zite pushes registrations/bills via webhooks into this portal (duplicates data, risks drift).
- Whether the user's Zite plan includes API access is unconfirmed; user asked to check.
- Login/account-creation strategy is unresolved: separate sign-up here vs. one-time sync of Zite accounts.
- User referenced an added logo and Ghana Water Company screenshots; neither was available in the project — UX inferred from description.
- Billing, account, and payment data are currently mock/demo; no real Zite API or payment integration implemented yet.
- Auth model is assumed local/mocked; no real credential or session handling defined yet.
- Whether a real WATSAN logo asset will be supplied later is unresolved.