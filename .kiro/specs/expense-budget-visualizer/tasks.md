# Implementation Plan: Expense & Budget Visualizer

## Overview

Implement a zero-dependency, zero-build client-side web app in vanilla HTML/CSS/JavaScript using an MVC-lite architecture. All state lives in a single `AppState` object persisted to `localStorage`. Chart.js v4 is loaded from CDN. The implementation is broken into incremental steps: project scaffolding, core data/utility functions, UI components, Chart integration, and wiring everything together.

---

## Tasks

- [x] 1. Scaffold project structure and base HTML
  - Create `index.html` with semantic HTML: header (balance display, theme toggle), two-column main section (form + chart panel), transaction list section with sort control
  - Add `<link>` to `css/style.css` and `<script src="js/app.js" defer></script>` and Chart.js v4 CDN `<script>` tag
  - Create `css/style.css` and `js/app.js` as empty stubs
  - _Requirements: 10.2_

- [x] 2. Implement Storage module and AppState initialisation
  - [x] 2.1 Implement `Storage` module (`save`, `load`) with `KEYS` constants
    - Define `KEYS.TRANSACTIONS`, `KEYS.SPENDING_LIMIT`, `KEYS.THEME`
    - `save(key, value)`: `JSON.stringify` + catch `QuotaExceededError`
    - `load(key)`: `JSON.parse` with try/catch returning `null` on error or missing key
    - _Requirements: 9.1, 9.4_
  - [ ]* 2.2 Write property test for `Storage` round-trip
    - **Property 8: Full State Persistence Round-Trip**
    - **Validates: Requirements 7.6, 8.3, 8.5, 9.1, 9.2**
    - Use fast-check to generate arbitrary transaction arrays, spending-limit values (number | null), and theme strings; verify `load(key)` after `save(key, value)` returns a deep-equal value
  - [x] 2.3 Implement `AppState` singleton with `loadFromStorage()`
    - Define module-scoped `state` object with `transactions`, `spendingLimit`, `theme`
    - Implement `loadFromStorage()` hydrating all three fields from Storage with fallbacks (`[]`, `null`, `'light'`)
    - Implement `getTransactions()` returning a shallow copy
    - _Requirements: 2.4, 9.2, 9.3, 9.4_

- [x] 3. Implement pure utility functions
  - [x] 3.1 Implement `computeBalance(transactions)`
    - Integer-arithmetic sum (`Math.round(amount * 100)` per tx, divide by 100)
    - Return `0` (not `0.00`) for empty array
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  - [ ]* 3.2 Write property test for `computeBalance`
    - **Property 1: Balance Invariant (Fixed-Point Arithmetic)**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
    - Generate arrays of arbitrary valid amounts; assert result equals integer-arithmetic sum; assert result has ≤ 2 decimal places
  - [x] 3.3 Implement `computeCategoryTotals(transactions)`
    - Return `{ Food: number, Transport: number, Fun: number }` using integer arithmetic per category
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ]* 3.4 Write property test for `computeCategoryTotals`
    - **Property 6: Chart Data Accuracy — Only Non-Zero Categories Appear**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Generate arbitrary transaction arrays; assert each category total equals the integer-arithmetic sum for that category; assert the value passed to Chart.js excludes categories with total 0
  - [x] 3.5 Implement `parseAmount(raw)` validation helper
    - Validate: non-empty, matches `/^\d+(\.\d{1,2})?$/`, `> 0`, `≤ 999,999,999.99`
    - Return `{ value: number }` on success or `{ error: string }` on failure
    - _Requirements: 1.3, 1.4, 7.2_
  - [ ]* 3.6 Write property test for `parseAmount`
    - **Property 3: Input Validation — Any Invalid Input Is Rejected**
    - **Validates: Requirements 1.3, 1.4, 7.2**
    - Generate strings that are invalid (empty, negative, zero, >2 decimals, >max, non-numeric) and assert `parseAmount` always returns `{ error }` for them; generate valid strings and assert `{ value }` is returned
  - [x] 3.7 Implement `formatCurrency(value)` using `Intl.NumberFormat`
    - USD style, `minimumFractionDigits: 2`, `maximumFractionDigits: 2`
    - _Requirements: 2.1, 4.4_
  - [x] 3.8 Implement `getSortedTransactions()` with `currentSort` module variable
    - Four sort cases: `'default'`, `'amount_asc'`, `'amount_desc'`, `'category_asc'`
    - Always shallow-copy before sorting; never mutate `state.transactions`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 3.9 Write property test for `getSortedTransactions`
    - **Property 4: Default Sort Preserves Newest-First Insertion Order**
    - **Validates: Requirements 2.3, 6.3**
    - **Property 5: Sort Correctness and Non-Destructiveness**
    - **Validates: Requirements 6.2, 6.3, 6.4**
    - Generate arbitrary transaction arrays; for each sort option assert correct ordering; assert original array is unmodified; assert `localStorage` key is unchanged after sort

- [ ] 4. Checkpoint — Ensure all pure-function tests pass
  - Run the test suite; all utility and storage unit/property tests must pass before proceeding.
  - Ask the user if any questions arise.

- [x] 5. Implement CSS — theming and layout
  - [x] 5.1 Implement CSS custom properties and layout
    - Define all color tokens on `:root` (light defaults); override under `body.theme-dark`
    - Implement two-column layout (form + chart) with responsive stacking
    - Style balance display, transaction list (scrollable), empty-state message, category badges, delete buttons
    - _Requirements: 8.1, 8.2, 10.1_
  - [x] 5.2 Implement `.balance--over-limit` visual style
    - Distinct color/outline that visually differs from default balance style
    - _Requirements: 7.3, 7.4_

- [x] 6. Implement state mutation functions and persistence
  - [x] 6.1 Implement `addTransaction(tx)` and `crypto.randomUUID()` fallback
    - Generate ID via `crypto.randomUUID()` with fallback for unsupported environments
    - Prepend transaction to `state.transactions`, persist via `Storage.save`, then call `render()`
    - _Requirements: 1.2, 1.5, 9.1_
  - [ ]* 6.2 Write property test for `addTransaction`
    - **Property 2: Valid Transaction Creation and Form Reset**
    - **Validates: Requirements 1.2, 1.5, 2.6, 9.1**
    - Generate valid transaction inputs; assert array length +1, new tx is first element, localStorage updated
  - [x] 6.3 Implement `deleteTransaction(id)`
    - Filter out the transaction by id, persist, call `render()`
    - On `QuotaExceededError` during persist: do NOT remove from in-memory state; display error banner
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 9.1_
  - [x] 6.4 Implement `setSpendingLimit(val)` and `setTheme(theme)`
    - `setSpendingLimit`: update `state.spendingLimit`, persist, call `render()`
    - `setTheme`: update `state.theme`, persist, toggle `body.theme-dark`, call `render()`
    - _Requirements: 7.5, 7.6, 8.2, 8.3, 9.1_
  - [ ]* 6.5 Write property test for `setTheme`
    - **Property 9: Theme Toggle Is Idempotent and Persistent**
    - **Validates: Requirements 8.2, 8.3**
    - Call `setTheme('light')` and `setTheme('dark')` in all combinations; assert DOM class and localStorage match; assert double-call is idempotent

- [x] 7. Implement render functions and view components
  - [x] 7.1 Implement `renderBalance()`
    - Compute balance with `computeBalance`; format with `formatCurrency`; write to DOM
    - Add/remove `.balance--over-limit` based on `state.spendingLimit` comparison
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.3, 7.4, 7.5_
  - [ ]* 7.2 Write property test for overspend indicator
    - **Property 7: Overspend Indicator Is Bidirectionally Correct**
    - **Validates: Requirements 7.3, 7.4, 7.5**
    - Generate arbitrary transaction arrays and spending-limit values; assert `.balance--over-limit` class presence/absence is exactly correct
  - [x] 7.3 Implement `renderTransactionList()`
    - Call `getSortedTransactions()`, map to `<li>` elements (name, formatted amount, category badge, delete button with data-id)
    - Show/hide empty-state `<p>` based on list length
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1_
  - [x] 7.4 Implement `renderSpendingLimit()` and `renderThemeToggle()`
    - Restore spending limit input value from state on each render
    - Update theme toggle button label/icon to reflect current theme
    - _Requirements: 7.6, 8.1, 8.5_
  - [x] 7.5 Implement top-level `render()` function
    - Call `renderBalance()`, `renderTransactionList()`, `renderChart()` (stub for now), `renderSpendingLimit()`, `renderThemeToggle()` in sequence
    - _Requirements: 4.2, 4.3, 10.3_

- [x] 8. Implement ChartManager module
  - [x] 8.1 Implement `initChart(ctx)` and `updateChart(transactions)`
    - Check `window.Chart` on init; if undefined call `showChartError()` and skip
    - Create Chart.js Doughnut/Pie instance once; subsequent updates call `chart.update()` (no destroy/recreate)
    - Filter out zero-total categories before feeding data
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.4, 10.5_
  - [x] 8.2 Implement `showChartError(msg)` and connect `renderChart()` to `render()`
    - Display error text in chart area when Chart.js is unavailable
    - Wire `updateChart` call inside `renderChart()` in the main render pipeline
    - _Requirements: 5.5, 10.5_

- [x] 9. Implement InputForm validation and event handlers
  - [x] 9.1 Implement form validation and submit handler
    - On submit: validate name (non-empty, ≤100 chars), amount via `parseAmount`, category selected
    - On valid: construct `Transaction`, call `addTransaction()`, reset form fields (name → `''`, amount → `''`, category → `'Food'`)
    - On invalid: render `<span class="field-error">` adjacent to each offending field; do not clear valid fields
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [-] 9.2 Implement SpendingLimitControl event handler
    - On submit/blur: validate via `parseAmount`; on valid call `setSpendingLimit(value)`; on invalid render adjacent `<span class="field-error">`
    - _Requirements: 7.1, 7.2_
  - [x] 9.3 Implement SortControl change handler
    - On `<select>` change: update `currentSort` module variable, call `render()`
    - _Requirements: 6.1, 6.2, 6.4_
  - [x] 9.4 Implement ThemeToggle click handler and delete button delegation
    - Theme toggle: call `setTheme(newTheme)`
    - Delete: use event delegation on transaction list `<ul>`; read `data-id`, call `deleteTransaction(id)`
    - _Requirements: 3.2, 8.1, 8.2_

- [x] 10. Wire initialisation sequence (`DOMContentLoaded`)
  - [-] 10.1 Implement `attachEventListeners()` and full `DOMContentLoaded` boot sequence
    - `loadFromStorage()` → `applyTheme(state.theme)` → `initChart(canvasCtx)` → `render()` → `attachEventListeners()`
    - Ensure theme class applied before first paint to prevent flash of wrong theme
    - _Requirements: 8.5, 9.2, 9.3, 10.1_
  - [x] 10.2 Implement error banner for `localStorage` write failures
    - Dismissible banner element at top of page; shown on `QuotaExceededError`, hidden otherwise
    - _Requirements: 3.5, 9.1_

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Run the full test suite (unit tests, property tests, integration tests).
  - Verify all 9 correctness properties are covered by passing tests.
  - Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before continuing
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) and run ≥ 100 iterations each
- Unit tests and property tests are complementary — property tests cover universal invariants, unit tests cover specific examples and edge cases
- `currentSort` is intentionally NOT persisted to `localStorage` (resets to default on page load per design spec)
- The `Storage.save` / `QuotaExceededError` path must NOT mutate in-memory state when persistence fails

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "3.3", "3.5", "3.7", "3.8", "5.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.2", "3.4", "3.6", "3.9", "5.2"] },
    { "id": 2, "tasks": ["6.1", "6.3", "6.4"] },
    { "id": 3, "tasks": ["6.2", "6.5", "7.1", "7.3", "7.4", "7.5", "8.1"] },
    { "id": 4, "tasks": ["7.2", "8.2", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 5, "tasks": ["10.1", "10.2"] }
  ]
}
```
