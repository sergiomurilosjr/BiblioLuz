# Security Specification for BiblioLuz

## Data Invariants
1. A Book must have a valid ownerId matching the authenticated user's UID.
2. A Loan must be linked to an existing Book through bookId.
3. Only the owner of a Book can loan it or update its information.
4. Users cannot see or modify books or loans belonging to other users.
5. Inmutable fields (createdAt, ownerId) cannot be changed after creation.

## The "Dirty Dozen" Payloads (Expected to be REJECTED)
1. Creating a book with a different ownerId: `{ title: "Hacker's Guide", author: "Unknown", ownerId: "someone_else_id" }`
2. Updating a book's ownerId: `{ ownerId: "new_owner_id" }`
3. Deleting someone else's book.
4. Listing all books without filtering by ownerId.
5. Creating a loan with a future `returnDate` but status `returned` without actually being returned? (Logic check).
6. Injecting a massive string into a book ID.
7. Updating a book's `title` without being the owner.
8. Creating a loan for a book you don't own.
9. Skipping status transitions (e.g., from `available` directly to something invalid).
10. Anonymous user trying to write data.
11. Reading PII (borrower email) of someone else's loan.
12. Modifying `createdAt` during an update.

## The Test Runner
A `firestore.rules.test.ts` will be implemented to verify these constraints.
