# Observability

## Logs

Use structured logs containing:

- timestamp
- level
- request ID
- user ID when safe
- workspace ID
- operation
- duration
- error code

## Metrics

Track:

- HTTP latency
- error rate
- websocket connections
- reconnect rate
- message persistence latency
- queue depth
- failed jobs
- database latency
- AI latency/cost

## Health checks

```text
GET /health
GET /ready
```

`/ready` should verify critical dependencies needed to serve traffic.

## Tracing

OpenTelemetry can be added for request-to-database/queue/AI traces.

## Alerts

Start with high error rate, database failures, queue backlog, and websocket instability.
