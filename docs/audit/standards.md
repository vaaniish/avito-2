# Engineering Standards Baseline

This file defines the quality bar used for refactoring, optimization, and validation.

## 1. Authoritative Sources (Primary)

1. TypeScript Handbook and TSConfig reference
2. React official docs (component boundaries, state, effects, rendering model)
3. Express official docs (routing, middleware, error handling)
4. Prisma docs (schema modeling, relation integrity, query patterns)
5. PostgreSQL docs (indexes, constraints, transaction semantics)
6. OWASP Top 10 / ASVS (authn/authz, input validation, sensitive data handling)
7. HTTP Semantics RFC 9110 (status codes and method semantics)
8. The Twelve-Factor App (config, statelessness, environment-driven runtime)

## 2. Architecture Principles

1. Stable contracts first: no API contract changes unless explicitly approved.
2. Single responsibility: routes orchestrate, services hold business logic, mappers format DTOs, validators validate input.
3. Explicit boundaries:
   - UI/presentation
   - application/service logic
   - data access
4. Idempotency for side-effecting operations where retry is realistic (payments/moderation status updates).
5. Prefer composition over giant files.

## 3. Code Quality Rules

1. Strict typing; avoid implicit `any` and nullable ambiguity.
2. Remove dead code only after call-site and contract verification.
3. Keep naming explicit and consistent with domain semantics.
4. Isolate legacy compatibility branches with clear annotations and planned removal path.
5. Minimize duplication; shared utility only when used in 2+ places with stable abstraction.

## 4. Data and DB Rules

1. Validate enum/state transitions explicitly in service layer.
2. Keep constraints close to domain truth (unique keys, foreign keys, indexes).
3. Index by query patterns (read path-driven indexing).
4. Avoid denormalized duplication unless measured and justified.
5. All destructive updates should be transactionally safe.

## 5. API and Error Semantics

1. Use consistent status codes and error payload shape.
2. Ensure GET endpoints are side-effect free.
3. Ensure PATCH/POST side effects are auditable where required.
4. Preserve backward compatibility routes only with documented sunset path.

## 6. Frontend Standards

1. Keep route parsing/navigation logic separate from view rendering.
2. Feature modules should own their models/types and helper functions.
3. Avoid mega-components by extracting deterministic pure helpers.
4. Keep API calls centralized and typed.

## 7. Validation and Test Gates

1. Static gates:
   - backend/frontend TypeScript compile
   - no circular deps
   - duplicate and dead-code scans
2. Functional gates:
   - endpoint scenario tests
   - UI-to-API integration checks
   - DB integrity checks (relations, transitions, constraints)

