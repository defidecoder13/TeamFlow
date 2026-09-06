# Error Handling

## API error shape

```json
{
  "error": {
    "code": "CHANNEL_ACCESS_DENIED",
    "message": "You do not have access to this channel.",
    "requestId": "..."
  }
}
```

## Error classes

- Validation
- Authentication
- Authorization
- Not found
- Conflict
- Rate limited
- Dependency unavailable
- Internal

## Principles

- Stable machine-readable codes
- Safe user-facing messages
- Correlation/request IDs
- Structured server logs
- No secrets or stack traces in production responses

## Realtime errors

Socket events should return explicit acknowledgements/errors. Clients must distinguish retryable failures from permanent validation/authorization failures.
