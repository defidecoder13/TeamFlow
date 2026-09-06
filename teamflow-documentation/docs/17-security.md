# Security

## Threat model

Protect user conversations, private channels, credentials, uploaded files, and AI-accessible organizational knowledge.

## Controls

- Server-side authorization
- Tenant isolation
- Input validation
- Rate limiting
- CSRF protection where applicable
- Secure cookies
- Output encoding
- Content Security Policy where practical
- File upload validation
- Signed URLs
- Secret management
- Audit logs
- Dependency updates

## Common attacks to prevent

- IDOR
- Broken access control
- XSS
- CSRF
- Injection
- Malicious file upload
- Token/session theft
- Abuse of AI retrieval
- Cross-tenant data leakage

## AI-specific security

Treat retrieved message content as untrusted data. Do not allow message text to override system-level authorization or tool permissions.
