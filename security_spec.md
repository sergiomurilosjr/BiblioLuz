# Security Specification for BiblioLuz (Shared Library)

## Data Invariants
1. Users must be authenticated to access any data.
2. The library data is shared among all authenticated members of the Centro Espírita Pedra de Luz.
3. Every record stores an `ownerId` for auditing (the user who created it), but it does not restrict access to other authenticated users.
4. Only authenticated users can Create, Read, Update, or Delete information.

## Security Model
The application shifted from a siloed ownership model to a **shared organizational model**. This allows multiple librarians to manage the same books and loans. 

- **Books**: Shared acervo for all staff.
- **Loans**: Shared history and active records.
- **Borrowers**: Shared directory of users.

## Authentication
Anonymous access is strictly denied. Only Google-authenticated users are permitted to perform operations.

