// js/app.js — Expense & Budget Visualizer

// =============================================================================
// STORAGE MODULE
// Thin wrapper around localStorage with predefined keys.
// =============================================================================

const KEYS = {
  TRANSACTIONS:   'ebv_transactions',
  SPENDING_LIMIT: 'ebv_spending_limit',
  THEME:          'ebv_theme',
};

const Storage = {
  /**
   * Serialises `value` to JSON and writes it to localStorage under `key`.
   * Catches QuotaExceededError (and the older code-22 variant) so callers
   * never have to guard against storage-full exceptions.
   *
   * @param {string} key   - One of the KEYS constants.
   * @param {*}      value - Any JSON-serialisable value.
   * @returns {boolean} true on success, false when storage is full.
   */
  save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      hideErrorBanner();
      return true;
    } catch (err) {
      // DOMException name in modern browsers; older browsers use code 22.
      if (
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' ||
          err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          err.code === 22)
      ) {
        console.warn('Storage.save: localStorage quota exceeded for key:', key);
        showErrorBanner('Storage quota exceeded. Your data could not be saved.');
        return false;
      }
      // Re-throw unexpected errors so they surface during development.
      throw err;
    }
  },

  /**
   * Reads the value stored under `key` from localStorage and parses it as JSON.
   * Returns `null` when the key is absent or the stored value cannot be parsed.
   *
   * @param {string} key - One of the KEYS constants.
   * @returns {*} The parsed value, or `null` on any error / missing key.
   */
  load(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;   // key absent
      return JSON.parse(raw);
    } catch (err) {
      // Corrupted / unparseable JSON — discard and return null (req 9.4).
      console.warn('Storage.load: could not parse value for key:', key, err);
      return null;
    }
  },
};

// =============================================================================
// APP STATE — Module-scoped singleton
// All mutable runtime state lives here. No global variables are leaked onto
// `window`. Direct access to `state` is intentionally restricted to this
// module; consumers use the public interface functions below.
// =============================================================================

/**
 * Internal state shape.
 * @type {{ transactions: Transaction[], spendingLimit: number|null, theme: 'light'|'dark' }}
 */
let state = {
  transactions:   [],      // Transaction[] — ordered newest-first
  spendingLimit:  null,    // number | null
  theme:          'light', // 'light' | 'dark'
};

/**
 * Active sort key for the transaction list.
 * NOT persisted to localStorage — resets to 'default' on every page load (req 6.1).
 * Valid values: 'default' | 'amount_asc' | 'amount_desc' | 'category_asc'
 * @type {string}
 */
let currentSort = 'default';

/**
 * Hydrates `state` from localStorage on startup.
 *
 * For each field a safe fallback is applied when the stored value is missing
 * or corrupted (req 9.2, 9.3, 9.4):
 *   - transactions   → [] when null / not an array
 *   - spendingLimit  → null when absent
 *   - theme          → 'light' when absent or unrecognised
 *
 * Because `Storage.load()` already swallows JSON parse errors and returns
 * `null`, no additional try/catch is needed here — corrupted individual
 * values are silently discarded and their defaults applied (req 2.4, 9.4).
 */
function loadFromStorage() {
  // --- transactions ---
  const storedTransactions = Storage.load(KEYS.TRANSACTIONS);
  state.transactions = Array.isArray(storedTransactions) ? storedTransactions : [];

  // --- spendingLimit ---
  const storedLimit = Storage.load(KEYS.SPENDING_LIMIT);
  state.spendingLimit = (storedLimit !== null && typeof storedLimit === 'number')
    ? storedLimit
    : null;

  // --- theme ---
  const storedTheme = Storage.load(KEYS.THEME);
  state.theme = (storedTheme === 'light' || storedTheme === 'dark')
    ? storedTheme
    : 'light';
}

/**
 * Returns a shallow copy of the current transactions array so callers
 * cannot accidentally mutate the internal state.
 *
 * @returns {Transaction[]}
 */
function getTransactions() {
  return [...state.transactions];
}

// =============================================================================
// ID GENERATION
// =============================================================================

/**
 * Generates a unique ID for a new transaction.
 *
 * Prefers `crypto.randomUUID()` (supported in Chrome 92+, Firefox 95+,
 * Edge 92+, Safari 15.4+). Falls back to a time+random string for older
 * environments (req 9.1 / design doc fallback spec).
 *
 * @returns {string} A UUID v4 string, or a time+random fallback string.
 */
function generateId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Fallback for environments that don't support crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// =============================================================================
// APP STATE MUTATIONS
// =============================================================================

/**
 * Adds a new transaction to the state.
 *
 * Steps (req 1.2, 1.5, 9.1):
 *   1. Assign a generated UUID as `id` and `Date.now()` as `timestamp`.
 *   2. Prepend the new transaction to `state.transactions` (newest-first).
 *   3. Persist via `Storage.save(KEYS.TRANSACTIONS, ...)`.
 *      - If Storage.save returns false (QuotaExceededError), revert the
 *        prepend so state is not mutated on storage failure.
 *   4. Call `render()` to update all UI zones.
 *
 * @param {{ name: string, amount: number, category: string }} tx
 *   Partial transaction object — `id` and `timestamp` are assigned here.
 */
function addTransaction(tx) {
  const newTx = {
    id: generateId(),
    name: tx.name,
    amount: tx.amount,
    category: tx.category,
    timestamp: Date.now(),
  };

  // Prepend so that default sort (newest-first) is maintained naturally.
  state.transactions.unshift(newTx);

  const saved = Storage.save(KEYS.TRANSACTIONS, state.transactions);
  if (!saved) {
    // Revert: do NOT leave state mutated when persistence failed.
    state.transactions.shift();
    // Display a storage-full error banner (req 3.5, 9.1).
    showErrorBanner('Could not save transaction: storage quota exceeded.');
    return;
  }

  render();
}

/**
 * Shows the dismissible error banner at the top of the page with the given message.
 * Removes the `hidden` attribute from #error-banner and sets the message text.
 * Used for non-validation errors such as localStorage quota exceeded (req 3.5, 9.1).
 *
 * @param {string} message - Human-readable error description.
 */
function showErrorBanner(message) {
  const banner = document.getElementById('error-banner');
  const msgEl  = document.getElementById('error-banner-message');
  if (!banner || !msgEl) return;
  msgEl.textContent = message;
  banner.hidden = false;
}

/**
 * Hides the dismissible error banner by setting the `hidden` attribute.
 * Called automatically when a localStorage write succeeds (so the banner
 * clears on the next successful save) and by the dismiss button click handler.
 */
function hideErrorBanner() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.hidden = true;
}

/**
 * Deletes a transaction from state by its id.
 *
 * Steps (req 3.2, 3.3, 3.4, 3.5, 9.1):
 *   1. Build a filtered array that excludes the transaction with the given id.
 *   2. Attempt to persist the filtered array via Storage.save().
 *      - Storage.save() returns false on QuotaExceededError (never throws).
 *   3. If persist succeeds (returns true): update state.transactions to the
 *      filtered array, then call render() to update balance, list, and chart.
 *   4. If persist fails (returns false): do NOT update state.transactions —
 *      the transaction remains in the list — and display an error banner.
 *
 * @param {string} id - The UUID of the transaction to remove.
 */
function deleteTransaction(id) {
  const filtered = state.transactions.filter(tx => tx.id !== id);

  const saved = Storage.save(KEYS.TRANSACTIONS, filtered);
  if (!saved) {
    // Persist failed — keep state unchanged so the transaction remains visible.
    showErrorBanner('Could not delete transaction: storage quota exceeded.');
    return;
  }

  // Persist succeeded — update state and re-render.
  state.transactions = filtered;
  render();
}

/**
 * Returns a shallow-copied, sorted view of state.transactions according to
 * the active `currentSort` value. The original `state.transactions` array is
 * NEVER mutated — the sort is applied to a fresh copy every time (req 6.3).
 *
 * Sort cases (req 6.1):
 *   'default'      — insertion order, which is newest-first (addTransaction prepends)
 *   'amount_asc'   — cheapest first  (req 6.2)
 *   'amount_desc'  — most expensive first  (req 6.2)
 *   'category_asc' — A → Z by category name  (req 6.2)
 *
 * Called by renderTransactionList() so every re-render automatically re-applies
 * the active sort after any add or delete (req 6.4).
 *
 * @returns {Transaction[]} A new array; never the same reference as state.transactions.
 */
function getSortedTransactions() {
  const txs = [...state.transactions]; // shallow copy — never mutate state
  switch (currentSort) {
    case 'amount_asc':   return txs.sort((a, b) => a.amount - b.amount);
    case 'amount_desc':  return txs.sort((a, b) => b.amount - a.amount);
    case 'category_asc': return txs.sort((a, b) =>
                           a.category.localeCompare(b.category));
    default:             return txs; // already newest-first from addTransaction prepend
  }
}

// =============================================================================
// COMPUTED VALUES
// Pure functions derived from state — never stored, always recalculated.
// =============================================================================

/**
 * Computes total balance using integer arithmetic to avoid floating-point drift.
 * Each transaction amount is scaled to cents (Math.round(amount * 100)), summed
 * as integers, then divided back by 100 — preventing accumulated FP errors.
 *
 * Returns 0 (not "0.00") for an empty array; the caller (formatCurrency) is
 * responsible for display formatting (req 4.4, 4.5).
 *
 * @param {Transaction[]} transactions
 * @returns {number} — sum rounded to 2 decimal places
 */
function computeBalance(transactions) {
  const totalCents = transactions.reduce(
    (sum, tx) => sum + Math.round(tx.amount * 100),
    0
  );
  return totalCents / 100;
}

/**
 * Computes per-category totals using the same integer strategy as computeBalance.
 * Each amount is scaled to cents, accumulated per category as integers, then
 * divided back by 100 — preventing floating-point drift across categories.
 *
 * Always returns all three category keys even when a category has no transactions
 * (value will be 0). The chart layer is responsible for filtering out zero-value
 * segments before rendering (req 5.1, 5.2, 5.3, 5.4).
 *
 * @param {Transaction[]} transactions
 * @returns {{ Food: number, Transport: number, Fun: number }}
 */
function computeCategoryTotals(transactions) {
  const totals = { Food: 0, Transport: 0, Fun: 0 };
  for (const tx of transactions) {
    totals[tx.category] += Math.round(tx.amount * 100);
  }
  for (const key of Object.keys(totals)) {
    totals[key] = totals[key] / 100;
  }
  return totals;
}

// =============================================================================
// CURRENCY FORMATTING
// Module-level formatter instance — created once, reused on every call to
// avoid the overhead of constructing a new Intl.NumberFormat each time.
// =============================================================================

/**
 * USD-style Intl.NumberFormat instance.
 * Produces strings like "$1,234.56" with:
 *   - currency symbol prefix
 *   - thousands separator
 *   - exactly 2 decimal places
 */
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a number as a USD-style currency string.
 * Delegates to the module-level `formatter` instance so no new object is
 * allocated per call (req 2.1, 4.4).
 *
 * @param {number} value - The numeric amount to format.
 * @returns {string} e.g. "$1,234.56", "$0.00"
 */
function formatCurrency(value) {
  return formatter.format(value);
}

// =============================================================================
// INPUT VALIDATION HELPERS
// Pure functions that validate and parse raw user input strings.
// They never touch the DOM or state — callers handle error display.
// =============================================================================

/**
 * Parses and validates a raw amount string from user input.
 *
 * Validation rules (req 1.3, 1.4, 7.2):
 *   1. Must not be empty / whitespace-only.
 *   2. Must match /^\d+(\.\d{1,2})?$/ — rejects negatives, letters, >2 decimal
 *      places, scientific notation, etc.
 *   3. Numeric value must be strictly > 0.
 *   4. Numeric value must be ≤ 999,999,999.99.
 *
 * @param {string} raw - The raw string value from the amount input field.
 * @returns {{ value: number }|{ error: string }}
 *   On success: `{ value: number }` where value is a positive finite number.
 *   On failure: `{ error: string }` with a human-readable message.
 */
function parseAmount(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return { error: 'Amount is required.' };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { error: 'Amount must be a positive number with up to 2 decimal places.' };
  }
  const value = parseFloat(trimmed);
  if (value <= 0) return { error: 'Amount must be greater than 0.' };
  if (value > 999_999_999.99) return { error: 'Amount exceeds the maximum allowed value.' };
  return { value };
}

// =============================================================================
// TRANSACTION FORM — Submit Handler
// Attaches a 'submit' listener to #transaction-form.
// Validates all fields, shows inline errors on failure, and calls
// addTransaction() + resets fields on success.
// =============================================================================

/**
 * Attaches the submit event handler to the Add Transaction form.
 *
 * Validation rules (req 1.1, 1.2, 1.3, 1.4, 1.5):
 *   - Name: trimmed value must be non-empty and ≤ 100 characters.
 *   - Amount: delegated to parseAmount(); any returned { error } is shown.
 *   - Category: must be one of 'Food', 'Transport', 'Fun'.
 *
 * On failure: error spans are inserted adjacent to each invalid field;
 *             valid fields are left untouched (req 1.3).
 * On success: addTransaction() is called with validated values, then
 *             the form fields are reset to their initial state (req 1.5).
 */
function attachTransactionFormHandler() {
  const form = document.getElementById('transaction-form');
  if (!form) return; // guard: element must exist before wiring

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // --- Step 1: Clear any previously rendered field-error spans ---
    form.querySelectorAll('.field-error').forEach(el => el.remove());

    // --- Step 2: Read raw field values ---
    const nameInput     = document.getElementById('item-name');
    const amountInput   = document.getElementById('amount');
    const categoryInput = document.getElementById('category');

    const rawName     = nameInput.value;
    const rawAmount   = amountInput.value;
    const rawCategory = categoryInput.value;

    const trimmedName = rawName.trim();

    let isValid = true;

    // --- Step 3: Validate Name ---
    if (trimmedName === '') {
      isValid = false;
      insertFieldError(nameInput, 'Name is required.');
    } else if (trimmedName.length > 100) {
      // The input has maxlength="100" but we guard programmatically too.
      isValid = false;
      insertFieldError(nameInput, 'Name must be 100 characters or fewer.');
    }

    // --- Step 4: Validate Amount via parseAmount ---
    const amountResult = parseAmount(rawAmount);
    if ('error' in amountResult) {
      isValid = false;
      insertFieldError(amountInput, amountResult.error);
    }

    // --- Step 5: Validate Category ---
    const validCategories = ['Food', 'Transport', 'Fun'];
    if (!validCategories.includes(rawCategory)) {
      isValid = false;
      insertFieldError(categoryInput, 'Please select a valid category.');
    }

    // --- Step 6: If any field is invalid, stop here without clearing valid fields ---
    if (!isValid) return;

    // --- Step 7: All fields valid — create transaction and reset form ---
    addTransaction({
      name:     trimmedName,
      amount:   amountResult.value,
      category: rawCategory,
    });

    // Reset fields to initial values (req 1.5)
    nameInput.value     = '';
    amountInput.value   = '';
    categoryInput.value = 'Food';
  });
}

/**
 * Creates a <span class="field-error"> with the given message and inserts it
 * immediately after the target input/select element in the DOM.
 *
 * @param {HTMLElement} field   - The input or select element that failed validation.
 * @param {string}      message - The human-readable error text to display.
 */
function insertFieldError(field, message) {
  const span = document.createElement('span');
  span.className   = 'field-error';
  span.textContent = message;
  // insertAdjacentElement('afterend') places the span as the next sibling.
  field.insertAdjacentElement('afterend', span);
}

// =============================================================================
// SPENDING LIMIT — State mutation
// =============================================================================

/**
 * Updates the spending limit in state, persists it to localStorage, and
 * triggers a full re-render so the balance highlight responds immediately
 * (req 7.5, 7.6).
 *
 * @param {number} val - A validated positive number (already passed parseAmount).
 */
function setSpendingLimit(val) {
  state.spendingLimit = val;
  Storage.save(KEYS.SPENDING_LIMIT, val);
  render();
}

/**
 * Switches the app theme between 'light' and 'dark'.
 *
 * Steps (req 8.2, 8.3, 9.1):
 *   1. Update `state.theme` to the new value.
 *   2. Toggle `body.theme-dark` CSS class so all custom-property overrides
 *      take effect in a single style-recalculation pass (≤ 100 ms).
 *   3. Persist the new theme to localStorage under KEYS.THEME.
 *   4. Call `render()` so `renderThemeToggle()` updates the button label/icon.
 *
 * Calling `setTheme` with the same value twice is idempotent — the DOM class
 * and localStorage end up in the same state as a single call (req 8.2 / Property 9).
 *
 * @param {'light'|'dark'} theme - The theme to apply.
 */
function setTheme(theme) {
  state.theme = theme;
  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.remove('theme-dark');
  }
  Storage.save(KEYS.THEME, theme);
  render();
}

// =============================================================================
// SPENDING LIMIT FORM — Submit / Blur Handler
// Attaches event listeners to #spending-limit-form (submit) and
// #spending-limit-input (blur).
// =============================================================================

/**
 * Attaches event handlers to the Spending Limit form and input.
 *
 * Behaviour (req 7.1, 7.2):
 *   submit — always validate; on valid call setSpendingLimit(); on invalid
 *            show a .field-error span adjacent to the input.
 *   blur   — only validate when the field is non-empty (avoids showing an
 *            error when the user merely tabs through an untouched field).
 *
 * Both handlers clear any existing .field-error spans before re-validating.
 */
function attachSpendingLimitHandler() {
  const form  = document.getElementById('spending-limit-form');
  const input = document.getElementById('spending-limit-input');
  if (!form || !input) return; // guard: elements must exist before wiring

  /**
   * Shared validation logic used by both the submit and blur handlers.
   * @param {boolean} requireNonEmpty - When true, skip validation on empty input
   *                                    (used by blur to avoid spurious errors).
   */
  function validate(requireNonEmpty) {
    // Clear any previously rendered field-error spans adjacent to this input.
    const existing = input.parentElement.querySelectorAll('.field-error');
    existing.forEach(el => el.remove());

    // On blur, skip validation when the field is empty (user just tabbed through).
    if (requireNonEmpty && input.value.trim() === '') return;

    const result = parseAmount(input.value);
    if ('value' in result) {
      setSpendingLimit(result.value);
    } else {
      insertFieldError(input, result.error);
    }
  }

  // submit — always validate regardless of empty/non-empty.
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    validate(false);
  });

  // blur — only validate when the field has content (req: don't error on tab-through).
  input.addEventListener('blur', function () {
    validate(true);
  });
}

// =============================================================================
// THEME TOGGLE — Click Handler
// Attaches a 'click' listener to #theme-toggle.
// On click: reads the current theme from state, determines the opposite
// theme, and calls setTheme() — satisfying req 8.1 and 8.2.
// =============================================================================

/**
 * Attaches the click event handler to the theme toggle button (#theme-toggle).
 *
 * Behaviour (req 8.1, 8.2):
 *   - Reads `state.theme` to determine the current theme.
 *   - Computes `newTheme` as the opposite of the current theme.
 *   - Calls `setTheme(newTheme)` which updates state, toggles `body.theme-dark`,
 *     persists to localStorage, and triggers a full re-render (all within 100 ms).
 */
function attachThemeToggleHandler() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return; // guard: element must exist before wiring

  themeToggle.addEventListener('click', function () {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  });
}

// =============================================================================
// DELETE BUTTON — Event Delegation Handler
// Attaches a single 'click' listener to #transaction-list (<ul>).
// Uses event delegation so that dynamically rendered delete buttons are
// handled without re-attaching listeners after each render (req 3.2).
// =============================================================================

/**
 * Attaches a delegated 'click' listener to the #transaction-list <ul> element.
 *
 * Behaviour (req 3.2):
 *   - Listens for clicks anywhere inside the <ul>.
 *   - Uses `event.target.closest('button[data-id]')` to find the nearest
 *     ancestor (or the target itself) that is a delete button with a data-id
 *     attribute — this safely handles clicks on child elements inside the button.
 *   - Reads the `data-id` attribute from the matched button.
 *   - Calls `deleteTransaction(id)` to remove the transaction from state,
 *     persist the updated list, and re-render without a page reload.
 *
 * A single delegated listener on the parent <ul> avoids the need to
 * re-attach individual listeners after every re-render of the list.
 */
function attachDeleteHandler() {
  const transactionList = document.getElementById('transaction-list');
  if (!transactionList) return; // guard: element must exist before wiring

  transactionList.addEventListener('click', function (event) {
    const btn = event.target.closest('button[data-id]');
    if (!btn) return; // click was not on a delete button

    const id = btn.dataset.id;
    if (id) {
      deleteTransaction(id);
    }
  });
}


// =============================================================================
// SORT CONTROL — Change Handler
// Attaches a 'change' listener to #sort-select.
// On change: updates `currentSort` and triggers a full re-render so the
// transaction list immediately reflects the new sort order (req 6.1, 6.2, 6.4).
// =============================================================================

/**
 * Attaches the change event handler to the sort <select> control.
 *
 * Behaviour (req 6.1, 6.2, 6.4):
 *   - Reads the selected value from #sort-select.
 *   - Assigns it to the module-level `currentSort` variable.
 *   - Calls render() so renderTransactionList() re-applies the new sort
 *     order immediately without any other state mutation.
 *
 * `currentSort` is NOT persisted to localStorage; it resets to 'default'
 * on every page load (req 6.1 — sort preference is session-only).
 */
function attachSortControlHandler() {
  const sortSelect = document.getElementById('sort-select');
  if (!sortSelect) return; // guard: element must exist before wiring

  sortSelect.addEventListener('change', function () {
    currentSort = sortSelect.value;
    render();
  });
}

// =============================================================================
// RENDER STUBS — Will be fully implemented in tasks 7.x and 8.x.
// Defined here so that setSpendingLimit (and addTransaction / deleteTransaction)
// can call render() without throwing a ReferenceError.
// =============================================================================

/**
 * Renders the current balance to the DOM and applies or removes the
 * `.balance--over-limit` CSS class based on the spending limit comparison.
 *
 * Steps (req 4.1, 4.2, 4.3, 4.4, 7.3, 7.4, 7.5):
 *   1. Compute total balance from state.transactions via computeBalance().
 *   2. Format the result as a USD string via formatCurrency().
 *   3. Write the formatted string to #balance-display.
 *   4. If state.spendingLimit is set AND balance > spendingLimit:
 *        add .balance--over-limit to the element (req 7.3).
 *      Otherwise: remove .balance--over-limit (req 7.4).
 *
 * @returns {void}
 */
function renderBalance() {
  const el = document.getElementById('balance-display');
  if (!el) return;

  const balance = computeBalance(state.transactions);
  el.textContent = formatCurrency(balance);

  if (state.spendingLimit !== null && balance > state.spendingLimit) {
    el.classList.add('balance--over-limit');
  } else {
    el.classList.remove('balance--over-limit');
  }
}

/**
 * Renders the transaction list to the DOM.
 *
 * Steps (req 2.1, 2.2, 2.3, 2.5, 2.6, 3.1):
 *   1. Call getSortedTransactions() to get the current sorted view.
 *   2. Map each transaction to an <li> containing:
 *        - A <span class="item-name"> with the transaction name.
 *        - A <span class="item-amount"> with the amount formatted via formatCurrency().
 *        - A <span class="category-badge" data-category="…"> with the category label.
 *        - A <button data-id="…"> labeled "Delete" for removal.
 *   3. Replace #transaction-list innerHTML with the generated items.
 *   4. Show #empty-state when the list is empty; hide it when transactions exist.
 *
 * This function only writes to the DOM — it never mutates state.
 *
 * @returns {void}
 */
function renderTransactionList() {
  const listEl      = document.getElementById('transaction-list');
  const emptyStateEl = document.getElementById('empty-state');
  if (!listEl || !emptyStateEl) return;

  const transactions = getSortedTransactions();

  if (transactions.length === 0) {
    listEl.innerHTML = '';
    emptyStateEl.hidden = false;
    return;
  }

  // Build all <li> elements and set innerHTML in one pass (req 2.1, 2.3, 3.1).
  listEl.innerHTML = transactions.map(tx => `
    <li>
      <span class="item-name">${escapeHtml(tx.name)}</span>
      <span class="item-amount">${formatCurrency(tx.amount)}</span>
      <span class="category-badge" data-category="${escapeHtml(tx.category)}">${escapeHtml(tx.category)}</span>
      <button type="button" data-id="${escapeHtml(tx.id)}" aria-label="Delete ${escapeHtml(tx.name)}">Delete</button>
    </li>
  `).join('');

  // Hide empty-state when transactions are present (req 2.6).
  emptyStateEl.hidden = true;
}

/**
 * Escapes a string for safe insertion into HTML attribute values and text content.
 * Prevents XSS when transaction names/IDs contain characters like <, >, ", &, '.
 *
 * @param {string} str - The raw string to escape.
 * @returns {string} The HTML-escaped string.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Restores the spending limit input value from state on each render (req 7.6).
 *
 * Sets the #spending-limit-input value to `state.spendingLimit` when a limit
 * is stored, or clears the field (empty string) when no limit is set.
 * This ensures the input always reflects persisted state after page load or
 * any re-render triggered by state changes.
 *
 * @returns {void}
 */
function renderSpendingLimit() {
  const input = document.getElementById('spending-limit-input');
  if (!input) return;
  input.value = state.spendingLimit !== null ? state.spendingLimit : '';
}

/**
 * Updates the theme toggle button label/icon to reflect the current theme (req 8.1, 8.5).
 *
 * When theme is 'light': shows "☾ Dark"  (clicking will switch to dark mode)
 * When theme is 'dark':  shows "☀ Light" (clicking will switch to light mode)
 *
 * This means the label describes what the button will do next, letting the
 * user know both the current state and the action that will be taken.
 *
 * @returns {void}
 */
function renderThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  if (state.theme === 'dark') {
    btn.textContent = '☀ Light';
    btn.setAttribute('aria-label', 'Switch to light mode');
  } else {
    btn.textContent = '☾ Dark';
    btn.setAttribute('aria-label', 'Switch to dark mode');
  }
}

/**
 * Renders the spending chart for the current transactions.
 *
 * Delegates to ChartManager.updateChart() which filters zero-value categories
 * before feeding data to Chart.js (req 5.1–5.4).
 * Safe to call when chartInstance is null (e.g. Chart.js failed to load).
 *
 * ChartManager is fully implemented in task 8.
 *
 * @returns {void}
 */
function renderChart() {
  updateChart(state.transactions);
}

/**
 * Full re-render — calls every render sub-function so that any state change
 * (add/delete transaction, set spending limit, toggle theme) refreshes all
 * UI zones in one synchronous pass (req 4.2, 4.3, 10.3).
 *
 * Order follows the design spec render pipeline:
 *   1. renderBalance()         — computeBalance → format → DOM
 *   2. renderTransactionList() — apply sort → build <li> nodes → swap innerHTML
 *   3. renderChart()           — computeCategoryTotals → chart.update()
 *   4. renderSpendingLimit()   — populate limit input value
 *   5. renderThemeToggle()     — update button label
 *
 * Always called AFTER state mutation and persistence. Synchronous; operates
 * on in-memory state only.
 */
function render() {
  renderBalance();
  renderTransactionList();
  renderChart();
  renderSpendingLimit();
  renderThemeToggle();
}

// =============================================================================
// CHART MANAGER — Manages a single Chart.js instance.
// initChart() must be called once during boot with the canvas 2D context.
// updateChart() is called by renderChart() on every render pass.
// =============================================================================

/** @type {import('chart.js').Chart|null} */
let chartInstance = null;

/**
 * Initialises the Chart.js Doughnut chart.
 *
 * Safe to call with a null ctx (e.g. when #chart-canvas is absent) — it
 * simply skips creation and shows an error message instead (req 10.4, 10.5).
 *
 * @param {CanvasRenderingContext2D|null} ctx
 */
function initChart(ctx) {
  if (!ctx) {
    showChartError('Chart canvas not available.');
    return;
  }
  if (typeof window.Chart === 'undefined') {
    showChartError('Chart.js failed to load. The chart is unavailable.');
    return;
  }
  try {
    chartInstance = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [{ data: [], backgroundColor: ['#e74c3c', '#3498db', '#2ecc71'] }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
      },
    });
  } catch (err) {
    console.warn('initChart: failed to create chart:', err);
    showChartError('Could not initialise chart.');
  }
}

/**
 * Updates the chart with current category totals. Filters out zero-value
 * categories so the chart only shows segments with actual spending (req 5.1–5.4).
 *
 * When no categories have spending (transactions array is empty or all amounts
 * are zero), hides the canvas and displays a "No data to display" message in
 * the chart area (req 5.5).
 *
 * When categories with spending exist, hides the error/empty-state message
 * and ensures the canvas is visible again.
 *
 * Called by renderChart() on every render pass. Safe when chartInstance is null.
 *
 * @param {Transaction[]} transactions
 */
function updateChart(transactions) {
  if (!chartInstance) return;

  const totals = computeCategoryTotals(transactions);
  const entries = Object.entries(totals).filter(([, v]) => v > 0);

  const canvas  = document.getElementById('chart-canvas');
  const errEl   = document.getElementById('chart-error');

  if (entries.length === 0) {
    // No spending data — show empty-state message and hide canvas (req 5.5).
    if (canvas) canvas.hidden = true;
    if (errEl) {
      errEl.textContent = 'No data to display';
      errEl.hidden = false;
    }
    return;
  }

  // Spending data exists — ensure canvas is visible and error is hidden.
  if (canvas) canvas.hidden = false;
  if (errEl) errEl.hidden = true;

  chartInstance.data.labels = entries.map(([k]) => k);
  chartInstance.data.datasets[0].data = entries.map(([, v]) => v);
  chartInstance.update();
}

/**
 * Displays an error message inside the chart area when the chart cannot be shown.
 *
 * @param {string} msg
 */
function showChartError(msg) {
  const errEl = document.getElementById('chart-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }
}

// =============================================================================
// APPLY THEME — Boot-only helper (req 8.5).
// Toggles body.theme-dark without touching localStorage or calling render().
// Used exclusively in the DOMContentLoaded boot sequence so the correct
// theme class is applied before the first paint, preventing a flash of the
// wrong theme.
// =============================================================================

/**
 * Applies the given theme to the document body by toggling the `theme-dark`
 * CSS class. This function is intentionally lightweight:
 *   - Does NOT call `Storage.save()` (no persistence side-effect).
 *   - Does NOT call `render()` (boot-only; render follows immediately after).
 *
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.remove('theme-dark');
  }
}

// =============================================================================
// EVENT LISTENERS — Consolidate all individual attach*Handler() calls.
// =============================================================================

/**
 * Wires all DOM event handlers in one call.
 * Called once during boot, after render(), so all DOM elements are present.
 */
function attachEventListeners() {
  attachTransactionFormHandler();
  attachSpendingLimitHandler();
  attachSortControlHandler();
  attachThemeToggleHandler();
  attachDeleteHandler();

  // Dismiss button for the error banner (req 3.5).
  const bannerClose = document.getElementById('error-banner-close');
  if (bannerClose) {
    bannerClose.addEventListener('click', hideErrorBanner);
  }
}

// =============================================================================
// BOOT — Full DOMContentLoaded initialisation sequence (req 8.5, 9.2, 9.3, 10.1).
// Order matters:
//   1. loadFromStorage()      — hydrate state from localStorage
//   2. applyTheme(state.theme) — apply theme class before first paint (no flash)
//   3. initChart(ctx)          — create Chart.js instance
//   4. render()                — initial full render with hydrated state
//   5. attachEventListeners()  — wire all DOM event handlers
// =============================================================================
document.addEventListener('DOMContentLoaded', function () {
  loadFromStorage();
  applyTheme(state.theme);
  const canvas = document.getElementById('chart-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  initChart(ctx);
  render();
  attachEventListeners();
});
