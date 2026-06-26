# Requirements Document

## Introduction

The Expense & Budget Visualizer is a client-side web application built with HTML, CSS, and Vanilla JavaScript. It allows users to track personal expenses by adding, viewing, and deleting transactions. The app visualizes spending by category using a pie chart, highlights overspending against a configurable budget limit, supports sorting and dark/light mode, and persists all data in the browser's LocalStorage — no backend or build tooling required.

---

## Glossary

- **App**: The Expense & Budget Visualizer web application running entirely in the browser.
- **Transaction**: A single expense entry consisting of an Item Name, Amount, and Category.
- **Category**: One of three predefined spending groups — Food, Transport, or Fun.
- **Balance**: The running total of all transaction amounts currently stored.
- **Spending Limit**: A user-configurable monetary threshold above which spending for a category or in total is considered over-budget.
- **Chart**: The pie chart rendered by Chart.js that visualizes the breakdown of spending by Category.
- **Transaction_List**: The scrollable UI list displaying all stored Transactions.
- **Input_Form**: The form UI component that accepts a new Transaction's fields and submits it to storage.
- **LocalStorage**: The browser's built-in client-side key-value persistence API.
- **Theme**: The visual mode of the App, either Light or Dark.

---

## Requirements

### Requirement 1: Transaction Input

**User Story:** As a user, I want to fill in a form with an item name, amount, and category so that I can log a new expense quickly.

#### Acceptance Criteria

1. THE Input_Form SHALL contain a text field for Item Name (max 100 characters), a numeric field for Amount, and a dropdown selector for Category with exactly three options: Food, Transport, and Fun.
2. WHEN the user submits the Input_Form with all fields filled and an Amount between 0.01 and 999,999,999.99 (max 2 decimal places), THE App SHALL create a new Transaction and add it to LocalStorage.
3. WHEN the user submits the Input_Form with one or more empty fields, THE Input_Form SHALL display a validation error message adjacent to each offending field and SHALL NOT create a Transaction.
4. WHEN the user submits the Input_Form with an Amount that is zero, negative, outside the allowed range, or has more than 2 decimal places, THE Input_Form SHALL display a validation error message adjacent to the Amount field and SHALL NOT create a Transaction.
5. WHEN a Transaction is successfully created, THE Input_Form SHALL reset the Item Name field to empty, the Amount field to empty, and the Category dropdown to its first option (Food).

---

### Requirement 2: Transaction List Display

**User Story:** As a user, I want to see a scrollable list of all my transactions so that I can review my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display all stored Transactions, each showing its Item Name, Amount formatted as a currency symbol prefix with 2 decimal places and thousands separator (e.g., $1,234.56), and Category.
2. WHILE Transactions exist in LocalStorage, THE Transaction_List SHALL remain visible and scrollable when the number of entries exceeds the visible area.
3. THE Transaction_List SHALL display Transactions in the order they were added, newest first, by default.
4. WHEN the App loads, THE Transaction_List SHALL populate from LocalStorage and display all previously saved Transactions; IF the stored data is corrupted or unparseable, THE App SHALL treat it as empty and display no Transactions.
5. WHEN no Transactions exist, THE Transaction_List SHALL display a visible empty-state message (e.g., "No transactions yet") in place of the list.
6. WHEN the first Transaction is added to an empty list, THE Transaction_List SHALL hide the empty-state message and display the Transaction entry.

---

### Requirement 3: Transaction Deletion

**User Story:** As a user, I want to delete individual transactions so that I can remove incorrect or unwanted entries.

#### Acceptance Criteria

1. THE Transaction_List SHALL render a clearly labeled delete button alongside each Transaction entry.
2. WHEN the user activates the delete button for a Transaction, THE App SHALL remove that Transaction from LocalStorage and from the Transaction_List without requiring a page reload.
3. WHEN a Transaction is deleted, THE App SHALL recalculate and update the Balance display within 300ms.
4. WHEN a Transaction is deleted, THE App SHALL recalculate and update the Chart within 300ms.
5. IF a LocalStorage write fails during deletion, THE App SHALL display an error message and SHALL NOT remove the Transaction from the Transaction_List.

---

### Requirement 4: Total Balance Display

**User Story:** As a user, I want to see my total balance at the top of the page so that I can track how much I've spent overall.

#### Acceptance Criteria

1. THE App SHALL display the Balance prominently at the top of the page at all times.
2. WHEN a Transaction is added, THE App SHALL recalculate the Balance as the sum of all Transaction Amounts and update the display within 100ms.
3. WHEN a Transaction is deleted, THE App SHALL recalculate the Balance as the sum of all remaining Transaction Amounts and update the display within 100ms.
4. WHEN no Transactions exist, THE App SHALL display a Balance of $0.00 (currency-formatted with symbol prefix, 2 decimal places, thousands separator).
5. THE Balance value SHALL be computed using fixed-point arithmetic (rounded to 2 decimal places) to prevent floating-point drift.

---

### Requirement 5: Spending Chart

**User Story:** As a user, I want a pie chart showing my spending by category so that I can understand where my money is going visually.

#### Acceptance Criteria

1. THE App SHALL render a pie chart using Chart.js that displays a segment for each Category (Food, Transport, Fun) whose total spending is greater than 0; categories with zero spending SHALL NOT be rendered as segments.
2. WHEN a Transaction is added, THE Chart SHALL update to reflect the new category totals without a page reload.
3. WHEN a Transaction is deleted, THE Chart SHALL update to reflect the revised category totals without a page reload.
4. WHEN the App loads, THE Chart SHALL render based on Transactions retrieved from LocalStorage.
5. WHEN no Transactions exist, THE Chart SHALL render no segments and SHALL display a visible message (e.g., "No data to display") in the chart area.

---

### Requirement 6: Transaction Sorting

**User Story:** As a user, I want to sort my transactions by amount or category so that I can find and analyze entries more easily.

#### Acceptance Criteria

1. THE App SHALL provide a sort control with the following options: Default (insertion order, newest first), by Amount ascending, by Amount descending, and by Category alphabetical (case-insensitive A→Z).
2. WHEN the user selects a sort option, THE Transaction_List SHALL re-render the displayed Transactions in the selected order within 300ms.
3. WHEN the sort order changes, THE App SHALL NOT modify the underlying order of Transactions in LocalStorage.
4. WHEN a Transaction is added or deleted while a non-default sort is active, THE Transaction_List SHALL re-apply the active sort to the updated list automatically.

---

### Requirement 7: Spending Limit Highlight

**User Story:** As a user, I want to set a spending limit and see when I've exceeded it so that I can manage my budget more effectively.

#### Acceptance Criteria

1. THE App SHALL provide an input control for the user to set a Spending Limit as a numeric value between 0.01 and 999,999,999.99 with a maximum of 2 decimal places.
2. IF the user submits a Spending Limit that is zero, negative, non-numeric, empty, or outside the allowed range, THE App SHALL display a validation error message adjacent to the Spending Limit input and SHALL NOT update the stored Spending Limit.
3. WHEN the user sets a valid Spending Limit and the Balance exceeds that limit, THE App SHALL apply a distinct visual style to the Balance display (visually different from the default Balance style) to indicate overspending.
4. WHEN the Balance is equal to or less than the Spending Limit, THE App SHALL display the Balance in its default style without the overspending highlight.
5. WHEN the Spending Limit is updated, THE App SHALL re-evaluate the Balance against the new limit within 100ms and update the highlight accordingly.
6. WHERE the user has set a Spending Limit, THE App SHALL persist the Spending Limit value in LocalStorage so that it is restored on subsequent page loads.
7. WHEN the App loads and the stored Spending Limit value is missing, corrupted, or invalid, THE App SHALL treat the Spending Limit as unset and display no overspending highlight.

---

### Requirement 8: Dark/Light Mode Toggle

**User Story:** As a user, I want to switch between dark and light mode so that I can use the app comfortably in different lighting conditions.

#### Acceptance Criteria

1. THE App SHALL provide a toggle control (e.g., button or switch) that switches the Theme between Light mode and Dark mode.
2. WHEN the user activates the toggle, THE App SHALL apply the selected Theme to all visible UI elements within 100ms without a page reload.
3. THE App SHALL persist the user's selected Theme preference (as a value of "light" or "dark") in LocalStorage so that the correct Theme is applied on subsequent page loads.
4. WHEN the App loads for the first time with no stored Theme preference, THE App SHALL default to Light mode.
5. WHEN the App loads with a stored Theme preference, THE App SHALL apply that Theme before rendering visible content to avoid a flash of incorrect Theme.

---

### Requirement 9: Data Persistence

**User Story:** As a user, I want my transactions and settings to survive a page refresh so that I don't lose my data accidentally.

#### Acceptance Criteria

1. THE App SHALL write to LocalStorage after every state-changing event (Transaction added, Transaction deleted, Spending Limit changed, Theme toggled) using consistent, predefined keys for Transactions, Spending Limit, and Theme.
2. WHEN the App loads, THE App SHALL read Transactions, Spending Limit, and Theme from LocalStorage and restore the Transaction_List, Balance, Chart, Spending Limit input, and Theme toggle to their previous state before any user interaction is possible.
3. WHEN the App loads with no prior data in LocalStorage, THE App SHALL initialize with an empty Transaction_List, Balance of $0.00, no Spending Limit, and Light mode Theme.
4. IF any LocalStorage value is corrupted or unparseable on load, THE App SHALL discard only that value, apply its default, and continue loading normally without a crash.
5. THE App SHALL use only client-side LocalStorage for persistence and SHALL NOT make any network requests to store or retrieve data.

---

### Requirement 10: Performance and Compatibility

**User Story:** As a user, I want the app to load fast and work in my browser without any special setup so that I can use it right away.

#### Acceptance Criteria

1. THE App SHALL load and become interactive without requiring installation, compilation, or a build step in the last 2 major versions of Chrome, Firefox, Edge, and Safari at the time of release.
2. THE App SHALL consist of exactly one HTML file, one CSS file inside the `css/` directory, and one JavaScript file inside the `js/` directory.
3. WHEN any UI action (add, delete, sort, toggle theme, set limit) is performed, THE App SHALL update all affected UI elements visible to the user within 100ms in the supported browsers defined in criterion 1.
4. THE App SHALL use Chart.js v4.x loaded via a CDN script tag and SHALL NOT require any other third-party libraries or package manager.
5. IF the Chart.js CDN script fails to load, THE App SHALL display a visible error message in the chart area and SHALL continue functioning for all non-chart features (form, list, balance, sorting, theme, spending limit).
