# Story Examples

### Example 1: DOM-only stories (no source files available)

Input: `/claude-tweaks:stories https://news.ycombinator.com/`

Output file: `stories/hackernews-reader.yaml`
```yaml
stories:
  - id: front-page-loads
    name: "Front page loads with posts"
    url: "https://news.ycombinator.com/"
    tags: [smoke, navigation]
    priority: high
    source_files: []
    steps:
      - verify: "At least 10 posts are visible, each with a title and a link"
      - verify: "Each post shows a rank number, score, and comment count"

  - id: navigate-to-page-two
    name: "Navigate to page two and back"
    url: "https://news.ycombinator.com/"
    tags: [navigation]
    priority: medium
    source_files: []
    steps:
      - verify: "Front page loads with posts"
      - action: click
        target: "More link at the bottom of the page"
        selector: "a.morelink"
        verify: "Page 2 loads with a new set of posts"
      - action: press
        target: "Browser back"
        value: "Alt+ArrowLeft"
        verify: "Page 1 loads again with the original posts"

  - id: neg-404-handling
    name: "Non-existent page shows error gracefully"
    url: "https://news.ycombinator.com/item?id=9999999999"
    tags: [negative, error-handling]
    priority: medium
    source_files: []
    steps:
      - verify: "Page shows an error message or 'No such item' — not a blank screen or crash"
```

### Example 2: Source-aware stories (React app with source analysis)

Input: `/claude-tweaks:stories http://localhost:3000`

Source analysis found: `app/(dashboard)/settings/page.tsx` imports a `ProfileForm` component with `maxLength={50}` on the name input, a zod schema requiring email format, an `isSaving` state variable, and a `useMutation` with success/error toasts.

Output file: `stories/myapp-admin.yaml`
```yaml
stories:
  - id: settings-profile-update
    name: "Update profile with valid data"
    url: "http://localhost:3000/settings"
    tags: [core, form]
    priority: high
    source_files:
      - app/(dashboard)/settings/page.tsx
      - app/(dashboard)/settings/components/profile-form.tsx
      - lib/schemas/profile.ts
    steps:
      - verify: "Profile form is visible with name and email fields"
      - action: fill
        target: "Name input"
        selector: "input#name"
        value: "Alice Johnson"
        verify: "Name field shows 'Alice Johnson'"
      - action: fill
        target: "Email input"
        selector: "input#email"
        value: "alice@example.com"
        verify: "Email field shows 'alice@example.com'"
      - action: click
        target: "Save button"
        selector: "button[type='submit']"
        verify: "Save button shows a loading spinner (isSaving state), then a success toast appears: 'Profile updated'"

  - id: settings-name-boundary-max
    name: "Name input enforces maximum length of 50 characters"
    url: "http://localhost:3000/settings"
    tags: [form, core]
    priority: medium
    source_files:
      - app/(dashboard)/settings/components/profile-form.tsx
    steps:
      - action: fill
        target: "Name input"
        selector: "input#name"
        value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        verify: "Input contains exactly 50 characters — the 51st character is not accepted or a validation error is shown"

  - id: settings-email-validation
    name: "Email field rejects invalid format"
    url: "http://localhost:3000/settings"
    tags: [form, error-handling]
    priority: medium
    source_files:
      - app/(dashboard)/settings/components/profile-form.tsx
      - lib/schemas/profile.ts
    steps:
      - action: fill
        target: "Email input"
        selector: "input#email"
        value: "not-an-email"
        verify: "Email field shows entered text"
      - action: click
        target: "Save button"
        selector: "button[type='submit']"
        verify: "Validation error appears near the email field indicating an invalid email format. Form is NOT submitted."

  - id: settings-save-error-handling
    name: "Profile save failure shows error toast"
    url: "http://localhost:3000/settings"
    tags: [error-handling, core]
    priority: medium
    source_files:
      - app/(dashboard)/settings/components/profile-form.tsx
    steps:
      - action: fill
        target: "Name input"
        selector: "input#name"
        value: "Alice Johnson"
      - action: click
        target: "Save button"
        selector: "button[type='submit']"
        verify: "If the save API call fails, an error toast appears (e.g. 'Failed to save profile') and the save button is re-enabled after the loading state clears"
```

### Example 3: Journey-aware stories

Input: `/claude-tweaks:stories http://localhost:3000`

Journey file exists at `docs/journeys/profile-settings.md` with persona "Returning user who wants to update their profile", entry point `/settings`, and steps covering `/settings`, `/settings/password`, `/settings/notifications`. Journey frontmatter `files:` includes `app/(dashboard)/settings/page.tsx`, `lib/services/profile.ts`.

Output file: `stories/myapp-user.yaml`
```yaml
stories:
  - id: profile-settings-flow
    name: "Complete profile settings journey — update profile, change password, configure notifications"
    url: "http://localhost:3000/settings"
    journey: profile-settings
    tags: [core, smoke]
    priority: high
    source_files:
      - app/(dashboard)/settings/page.tsx
      - lib/services/profile.ts
      - app/(dashboard)/settings/components/profile-form.tsx
      - app/(dashboard)/settings/password/page.tsx
      - app/(dashboard)/settings/notifications/page.tsx
    steps:
      - verify: "Profile settings page loads with name and email fields pre-filled"
      - action: fill
        target: "Name input"
        selector: "input#name"
        value: "Alice Johnson"
        verify: "Name field shows 'Alice Johnson'"
      - action: click
        target: "Save button"
        selector: "button[type='submit']"
        verify: "Success toast appears confirming profile update"
      - action: click
        target: "Password tab"
        selector: "[data-tab='password']"
        verify: "Password change form is visible with current password and new password fields"
      - action: click
        target: "Notifications tab"
        selector: "[data-tab='notifications']"
        verify: "Notification preferences visible with toggles for email and push notifications"
```

Note: `source_files` merges the journey's `files:` frontmatter (`page.tsx`, `profile.ts`) with component-level files discovered during source analysis (`profile-form.tsx`, `password/page.tsx`, `notifications/page.tsx`). The `journey: profile-settings` field enables `/test qa journey=profile-settings` and coverage tracking.
