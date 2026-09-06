# File Storage

## Architecture

```text
Browser
 -> request signed upload
 -> API validates authorization/metadata
 -> signed URL
 -> direct upload to R2/S3
 -> completion callback/API
 -> attachment metadata stored in PostgreSQL
```

## Security

- Validate declared and actual file characteristics where feasible.
- Enforce size limits.
- Allowlist file types.
- Do not expose bucket credentials.
- Use signed URLs for private files.
- Consider malware scanning for production deployments.

## Database

Attachment metadata should include:

id, workspace_id, uploader_id, object_key, filename, size, content_type, checksum, created_at.

## Deletion

Use controlled deletion so database records and objects do not drift indefinitely. Background jobs can reconcile orphaned objects.
