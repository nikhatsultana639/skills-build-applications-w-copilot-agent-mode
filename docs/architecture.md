# OctoFit Tracker architecture

OctoFit Tracker is a three-tier application for a school fitness program. The starter code includes API contracts and intentionally incomplete implementation points so you can use GitHub Copilot agent mode in a test-driven loop.

![Three-tier OctoFit architecture](../.github/images/octofit-architecture.svg)

## Tier boundaries

- **Presentation tier**: React 19, Vite, React Router, Bootstrap, and a shared API client in `octofit-tracker/frontend/src`.
- **Logic tier**: Express and TypeScript routes/services in `octofit-tracker/backend/src` expose `/api/*` behavior on port `8000`.
- **Data tier**: Mongoose models and seed data in `octofit-tracker/backend/src/models` and `src/scripts/seed.ts` persist to MongoDB on port `27017`.

## Ports and environment rules

- MongoDB: `27017`
- Express API: `8000`
- Vite frontend: `5173`
- The browser calls relative `/api` paths. Vite proxies them to `http://localhost:8000`, so the unauthenticated API port stays private in Codespaces. `VITE_API_BASE_URL` can override the base URL.

## API contract

| Capability | Method and path | Expected behavior |
| --- | --- | --- |
| Activity tracking | `GET /api/activities`, `POST /api/activities` | List and create valid activity records. POST accepts `userId`, `teamId`, `type`, and `minutes`; `userId` and `teamId` must be well-formed IDs for an existing user and team; otherwise respond with a deliberate 4xx (never a 500 from a cast error). A created activity stores the submitted `user`, `team`, `type`, and `minutes` plus computed `points` and `occurredAt`. |
| Teams | `GET /api/teams`, `POST /api/teams` | List and create teams with members. Created and listed teams keep the submitted `name` and `mascot`. Reject a team without a name with `400`. |
| Leaderboard | `GET /api/leaderboard` | Return teams ordered by the sum of their activity points, highest first. Each entry has `teamName`, `totalPoints`, and a 1-based `rank`. |
| Workout suggestions | `GET /api/workouts/suggestions/:userEmail` | Recommend workouts from recent activity patterns for the matching seeded user's email address. The first suggestion's `focus` matches that user's goal or recent activity, with a `reason` explaining why. An email with no matching user returns a deliberate 4xx (for example, `404`). |

## Implementation decisions

- **Presentation tier:** Keep React pages responsible for rendering and interaction, using the shared API client for relative `/api` requests. Each capability should show an accessible loading state, meaningful empty state, and accessible error state.
- **Logic tier:** Keep request validation and capability behavior in Express routes/services. Return deliberate 4xx responses for invalid input or missing records, and keep persistence details out of the presentation tier.
- **Data tier:** Use Mongoose models for persisted shape and required-field validation. Keep seed data representative and idempotent without deleting unrelated records.
- **Activity tracking:** Validate the activity fields and well-formed IDs, confirm the referenced user and team exist, then save the user, team, type, and minutes with server-computed points and occurrence time.
- **Team management:** Require a name, preserve submitted name and mascot, and persist the supplied members through the team model.
- **Leaderboard:** Aggregate activity points by team, order totals descending, and return each team name, total points, and a 1-based rank.
- **Workout suggestions:** Find the user by email, use their goal and recent activity to choose a matching workout, and include a reason. Return a deliberate 4xx when no user matches.

## Test plan

Run the focused contract tests while implementing each tier, then run both builds as final checks. The current baseline is recorded to distinguish existing failures from regressions.

- `npm run test:data --prefix octofit-tracker/backend` — checks model validation and non-destructive, idempotent seeding. Missing validation failures point to the data tier. **Current baseline:** 4 failed (required fields for users, teams, activities, and workouts); seed test passes.
- `npm run test:api --prefix octofit-tracker/backend` — checks endpoint input handling, persistence, leaderboard totals/ranks, and user-specific suggestions. Failures point to logic-tier behavior or its use of the data tier. **Current baseline:** 4 failed (invalid activity/team requests return 501 rather than 400, leaderboard is empty, and the endurance user receives a strength suggestion).
- `npm test --prefix octofit-tracker/frontend` — checks API-backed rendering and loading, empty, and error states for each route. Failures point to presentation behavior or API-client integration. **Current baseline:** 15 failed across rendering/request expectations and the four routes' loading, empty, and error states.
- `npm run build --prefix octofit-tracker/backend` — checks backend TypeScript compilation; compiler errors indicate type or import issues. **Current baseline:** passes.
- `npm run build --prefix octofit-tracker/frontend` — checks frontend TypeScript compilation and the Vite production build; failures indicate type, import, or bundling issues. **Current baseline:** passes.
