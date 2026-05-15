# Security Policy — Tinkuy

## Table of Contents

- [Vulnerability Reporting](#vulnerability-reporting)
- [Security Response Process](#security-response-process)
- [OWASP Top 10 Checklist](#owasp-top-10-checklist)
- [Security Contacts](#security-contacts)

---

## Vulnerability Reporting

### Coordinated Vulnerability Disclosure Policy

We take security vulnerabilities seriously. If you discover a security vulnerability in Tinkuy, please report it responsibly.

**Please DO NOT report vulnerabilities through public GitHub issues.**

### How to Report

| Method | Contact | Response Time |
|--------|---------|---------------|
| Email | security@tinkuy.com | 24-48 hours |
| Encrypted Email | security@tinkuy.com (PGP) | 24-48 hours |
| HackerOne | (coming soon) | - |

When reporting, please include:

1. **Description** - Clear description of the vulnerability
2. **Steps to Reproduce** - Detailed reproduction steps
3. **Impact Assessment** - Potential security impact
4. **Affected Components** - Specific files/modules affected
5. **Suggested Fix** - If you have one (optional)

### What to Expect

| Phase | Timeline | Description |
|-------|----------|-------------|
| Acknowledgment | 24-48 hours | We confirm receipt of your report |
| Initial Assessment | 3-5 days | We evaluate the vulnerability severity |
| Status Update | Weekly | We provide progress updates |
| Resolution | Varies | Based on severity (see SLAs below) |
| Public Disclosure | 30 days post-fix | Coordinated disclosure |

### Severity Classification & SLAs

| Severity | Definition | Resolution SLA |
|----------|------------|----------------|
| **Critical** | Remote code execution, data breach | 72 hours |
| **High** | Authentication bypass, privilege escalation | 7 days |
| **Medium** | Information disclosure, XSS | 30 days |
| **Low** | Minor security concerns | Next release |

---

## Security Response Process

```
┌─────────────────┐
│  Report Received │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Acknowledgment │
│   (24-48 hrs)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Triage &       │
│  Classification │
└────────┬────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
┌───────┐  ┌───────┐
│ Valid │  │ Invalid│
│Report │  │ Report │
└───┬───┘  └───┬───┘
    │          │
    ▼          ▼
┌───────────┐ ┌─────────────┐
│ Assign &  │ │ Thank &     │
│ Begin Fix │ │ Close       │
└─────┬─────┘ └─────────────┘
      │
      ▼
┌───────────┐
│ Develop   │
│ Fix      │
└─────┬─────┘
      │
      ▼
┌───────────┐
│ Test &    │
│ Verify    │
└─────┬─────┘
      │
      ▼
┌───────────┐
│ Deploy    │
│ Fix       │
└─────┬─────┘
      │
      ▼
┌───────────┐
│ Notify    │
│ Reporter  │
└─────┬─────┘
      │
      ▼
┌───────────┐
│ Coordinated│
│ Disclosure│
└───────────┘
```

---

## OWASP Top 10 Checklist

### A01 — Broken Access Control ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Access control enforcement | ✅ Complete | Pothos scope-auth plugin (`src/graphql/builder.ts`) |
| Principle of least privilege | ✅ Complete | Role-based access: admin, manager, customer |
| Session management | ✅ Complete | JWT tokens with 24h (admin) / 7d (customer) expiry |
| Access control testing | ✅ Complete | Unit tests in `tests/unit/auth.service.test.ts` |
| CORS configuration | ✅ Complete | Configured in `src/index.ts:65-76` |

**Implementation Details:**
- GraphQL field-level authorization via `authScopes`
- Tenant isolation via `AsyncLocalStorage` (`src/lib/tenant-context.ts`)
- Resolver-level tenant ownership verification

### A02 — Cryptographic Failures ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Sensitive data encryption | ✅ Complete | AES-256-CBC for cookies (`src/hooks/useAuth.tsx`) |
| Encryption at rest | ✅ Complete | Database passwords hashed with bcrypt (12 rounds) |
| TLS/HTTPS | ✅ Complete | nginx.conf with TLS 1.2/1.3 |
| JWT algorithm restriction | ✅ Complete | HS256 only (`src/lib/jwt.ts:84`) |
| Secret management | ✅ Complete | Environment variables, rotation script |

**Implementation Details:**
- Cookie encryption: AES-256-CBC with random IV and auth tag
- HTTPS enforced via HSTS header (1 year max-age)
- Let's Encrypt certificate support configured

### A03 — Injection ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Input validation | ✅ Complete | Zod schemas (`src/lib/validation.ts`) |
| SQL injection prevention | ✅ Complete | Prisma ORM (parameterized queries) |
| XSS prevention | ✅ Complete | Input sanitization, CSP headers |
| Command injection | ✅ Complete | No shell execution |
| GraphQL injection | ✅ Complete | Depth limiting, query complexity limits |

**Implementation Details:**
- Sanitization: HTML tag removal, event handler stripping (`src/lib/validation.ts:51-66`)
- GraphQL depth limit: 10 levels max (`src/graphql/plugins/depth-limit.ts`)
- Query complexity limit: 1000 points (`src/graphql/plugins/query-complexity.ts`)

### A04 — Insecure Design ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Threat modeling | ✅ Complete | Architecture documented in `docs/ARCHITECTURE.md` |
| Secure defaults | ✅ Complete | Fail-closed rate limiting |
| Principle of least privilege | ✅ Complete | Role-based access |
| Defense in depth | ✅ Complete | Multiple security layers |

### A05 — Security Misconfiguration ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Secure headers | ✅ Complete | Helmet.js configured |
| Error handling | ✅ Complete | Structured errors, no stack traces in prod |
| GraphQL introspection | ✅ Complete | Disabled in production |
| Default credentials | ✅ Complete | No default credentials in codebase |
| Rate limiting | ✅ Complete | Redis-based with fallback |

**Implementation Details:**
- Helmet.js: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- Error responses: Generic messages in production (`src/lib/errors.ts`)
- Introspection: `process.env.NODE_ENV !== "production"`

### A06 — Vulnerable Components ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Dependency scanning | ✅ Complete | `npm audit` in CI |
| Updated dependencies | ✅ Complete | Regular updates |
| Known vulnerability monitoring | ✅ Complete | Dependabot alerts |
| Minimal dependencies | ✅ Partial | Reviewed dependencies |

**Implementation Details:**
- CI/CD includes `npm audit --audit-level=high`
- Dependencies pinned with exact versions

### A07 — Authentication Failures ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Password hashing | ✅ Complete | bcrypt with 12 salt rounds |
| JWT token management | ✅ Complete | Rotation, blacklisting |
| Refresh token rotation | ✅ Complete | Family-based rotation with theft detection |
| Failed login rate limiting | ✅ Complete | 10 attempts per 15 minutes |
| Session timeout | ✅ Complete | 24h admin / 7d customer |

**Implementation Details:**
- Refresh tokens: 30-day expiry, one-time use, family tracking (`src/modules/auth/service.ts`)
- Token theft detection: All family tokens revoked on suspicious use
- Password requirements: min 8 chars, uppercase, number, special char

### A08 — Software and Data Integrity ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| CI/CD security | ✅ Complete | GitHub Actions with secure practices |
| Dependency verification | ✅ Complete | Lockfiles, hash verification |
| Webhook signature verification | ✅ Complete | HMAC-SHA256 for MercadoPago |
| Idempotent operations | ✅ Complete | WebhookEvent deduplication |

### A09 — Security Logging ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| Audit logging | ✅ Complete | Request logging with IDs |
| Error logging | ✅ Complete | Structured logging with context |
| Security events | ✅ Complete | Token theft, rate limit warnings |
| Log coverage | ✅ Complete | All GraphQL operations |

**Implementation Details:**
- Request IDs propagated via `x-request-id` header
- Security events logged: token revocation, rate limit, auth failures
- Structured JSON logs with component tagging

### A10 — Server-Side Request Forgery (SSRF) ✓

| Control | Status | Implementation |
|---------|--------|----------------|
| URL validation | ✅ Complete | No user-provided URLs processed |
| Network segmentation | ✅ Complete | Internal services not exposed |
| Webhook processing | ✅ Complete | Signature verification required |

---

## Security Contacts

| Role | Contact |
|------|---------|
| Security Team | security@tinkuy.com |
| General Inquiries | info@tinkuy.com |
| Bug Bounty Program | (coming soon) |

### PGP Key

For encrypted communications:

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[Contact security@tinkuy.com for PGP key]
-----END PGP PUBLIC KEY BLOCK-----
```

---

## Security Updates

For critical security updates, subscribe to our security mailing list:

- **Email**: security-announce@tinkuy.com
- **Frequency**: Only for critical vulnerabilities

---

## Acknowledgments

We appreciate the security research community's efforts to improve Tinkuy's security. Contributors will be acknowledged (with permission) in our security release notes.

**Thank you for helping keep Tinkuy and its users safe.**
