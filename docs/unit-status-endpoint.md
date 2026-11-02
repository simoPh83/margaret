# Unit Status Override — API Contract

**Endpoint:** `PUT /api/units/{unit_id}/status`

Overrides a unit's status, effective immediately (server date). History is preserved — a new temporal record is inserted rather than overwriting the old one.

---

## Request

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `unit_id` | integer | ✅ | The unit's unique ID (globally unique; `building_id` is **not** needed) |

### Headers

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

### Body

```json
{
  "status_code": 4
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status_code` | integer | ✅ | New status code (see table below) |

### Status Codes

| Code | Display Name | Short Name (UI) | Color |
|------|-------------|-----------------|-------|
| `0` | Mothballed | Mothballed | `#8B8B8B` (gray) |
| `1` | Vacant | Vacant | `#FFB366` (orange) |
| `2` | Let | Let | `#66B266` (green) |
| `3` | Under Offer | U-O | `#6699FF` (blue) |
| `4` | Under Refurbishment | Under Ref | `#FFD966` (yellow) |

---

## Response

### Success — `200 OK`

```json
{
  "success": true,
  "message": "Unit status updated to 'Under Refurbishment'",
  "unit_id": 7456,
  "status_code": 4,
  "status_display": "Under Refurbishment",
  "previous_status_code": 2,
  "start_date": "2026-11-02"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` on success |
| `message` | string | Human-readable confirmation |
| `unit_id` | integer | The unit that was updated |
| `status_code` | integer | The new status code |
| `status_display` | string | Display name of the new status |
| `previous_status_code` | integer \| null | What the status was before |
| `start_date` | string (YYYY-MM-DD) | Effective date of the new status (always today, server time) |

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| `401` | Missing or invalid Bearer token | `{"detail": "Not authenticated"}` |
| `404` | Unit ID does not exist | `{"detail": "Unit not found: <unit_id>"}` |
| `422` | Invalid `status_code` (not 0–4) | `{"detail": [{"msg": "Invalid status code: 99. Must be one of [0, 1, 2, 3, 4]", ...}]}` |

---

## Example

```bash
curl -X PUT https://your-api.railway.app/api/units/7456/status \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -H "Content-Type: application/json" \
  -d '{"status_code": 4}'
```

---

## Notes for Frontend

- **No `building_id` required** — `unit_id` alone identifies the unit.
- The change takes effect on the **server's current date** (`start_date`). All read endpoints (e.g. `/api/units/table-data`) will reflect the new status for queries dated today or later.
- After a successful update, re-fetch table data to see the change in the UI.
- The status colors above match the existing `STATUS_CODE_MAP` used by the units table — use them for consistency.
