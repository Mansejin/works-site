from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import sheets_drive_folder_id, sheets_oauth_config
from app.conti_store import HEADERS, normalize_rows
from app.google_oauth import get_access_token
from app.sheet_registry import get_project, list_projects, upsert_project

DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
SHEETS = "https://sheets.googleapis.com/v4/spreadsheets"
CONTI_TAB = "콘티"

PROJECT_LABELS = {
    "xenics": "디디딧 콘티 · Xenics",
    "default": "디디딧 콘티",
}


def sheets_native_configured() -> bool:
    return sheets_oauth_config() is not None


def _project_title(project: str) -> str:
    return PROJECT_LABELS.get(project, f"디디딧 콘티 · {project}")


async def _token(client: httpx.AsyncClient) -> str:
    cfg = sheets_oauth_config()
    if not cfg:
        raise RuntimeError("Google Sheets OAuth is not configured")
    return await get_access_token(
        client,
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        refresh_token=cfg["refresh_token"],
        cache_key="google-sheets",
    )


async def _ensure_conti_tab(client: httpx.AsyncClient, spreadsheet_id: str) -> None:
    token = await _token(client)
    meta = await client.get(
        f"{SHEETS}/{spreadsheet_id}",
        headers={"Authorization": f"Bearer {token}"},
        params={"fields": "sheets.properties"},
    )
    meta.raise_for_status()
    sheets = meta.json().get("sheets") or []
    sheet_id = sheets[0]["properties"]["sheetId"] if sheets else 0

    await client.post(
        f"{SHEETS}/{spreadsheet_id}:batchUpdate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "requests": [
                {
                    "updateSheetProperties": {
                        "properties": {"sheetId": sheet_id, "title": CONTI_TAB},
                        "fields": "title",
                    }
                }
            ]
        },
    ).raise_for_status()

    await client.put(
        f"{SHEETS}/{spreadsheet_id}/values/{CONTI_TAB}!A1:E1",
        headers={"Authorization": f"Bearer {token}"},
        params={"valueInputOption": "USER_ENTERED"},
        json={"values": [list(HEADERS)]},
    ).raise_for_status()


async def _create_spreadsheet(client: httpx.AsyncClient, project: str) -> dict[str, Any]:
    token = await _token(client)
    title = _project_title(project)
    body: dict[str, Any] = {
        "name": title,
        "mimeType": "application/vnd.google-apps.spreadsheet",
    }
    folder_id = sheets_drive_folder_id()
    if folder_id:
        body["parents"] = [folder_id]

    res = await client.post(
        DRIVE_FILES,
        headers={"Authorization": f"Bearer {token}"},
        params={"fields": "id,webViewLink"},
        json=body,
    )
    res.raise_for_status()
    payload = res.json()
    spreadsheet_id = payload["id"]
    await _ensure_conti_tab(client, spreadsheet_id)
    return {
        "spreadsheetId": spreadsheet_id,
        "spreadsheetUrl": payload.get("webViewLink")
        or f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit",
        "title": title,
    }


async def ensure_project_sheet(client: httpx.AsyncClient, project: str) -> tuple[dict[str, Any], bool]:
    existing = get_project(project)
    if existing and existing.get("spreadsheetId"):
        return existing, False

    created = await _create_spreadsheet(client, project)
    entry = upsert_project(
        project,
        spreadsheet_id=created["spreadsheetId"],
        spreadsheet_url=created["spreadsheetUrl"],
        title=created["title"],
        created=True,
    )
    return entry, True


async def read_project_rows(client: httpx.AsyncClient, spreadsheet_id: str) -> list[dict[str, str]]:
    token = await _token(client)
    res = await client.get(
        f"{SHEETS}/{spreadsheet_id}/values/{CONTI_TAB}!A2:E",
        headers={"Authorization": f"Bearer {token}"},
    )
    if res.status_code == 400:
        return []
    res.raise_for_status()
    values = res.json().get("values") or []
    rows: list[dict[str, Any]] = []
    for line in values:
        padded = list(line) + [""] * (len(HEADERS) - len(line))
        rows.append(dict(zip(HEADERS, padded[: len(HEADERS)])))
    return normalize_rows(rows)


async def write_project_rows(
    client: httpx.AsyncClient,
    spreadsheet_id: str,
    rows: list[dict[str, Any]],
) -> int:
    token = await _token(client)
    data = normalize_rows(rows)
    values = [list(HEADERS)] + [[row[h] for h in HEADERS] for row in data]

    await client.post(
        f"{SHEETS}/{spreadsheet_id}/values/{CONTI_TAB}!A:E:clear",
        headers={"Authorization": f"Bearer {token}"},
    )

    if values:
        await client.put(
            f"{SHEETS}/{spreadsheet_id}/values/{CONTI_TAB}!A1:E{len(values)}",
            headers={"Authorization": f"Bearer {token}"},
            params={"valueInputOption": "USER_ENTERED"},
            json={"values": values},
        ).raise_for_status()
    return len(data)


async def append_project_rows(
    client: httpx.AsyncClient,
    spreadsheet_id: str,
    rows: list[dict[str, Any]],
) -> int:
    token = await _token(client)
    data = normalize_rows(rows)
    if not data:
        return 0
    values = [[row[h] for h in HEADERS] for row in data]
    await client.post(
        f"{SHEETS}/{spreadsheet_id}/values/{CONTI_TAB}!A:E:append",
        headers={"Authorization": f"Bearer {token}"},
        params={"valueInputOption": "USER_ENTERED", "insertDataOption": "INSERT_ROWS"},
        json={"values": values},
    ).raise_for_status()
    return len(data)


async def native_sheet_meta() -> dict[str, Any]:
    return {
        "ok": True,
        "backend": "google-api",
        "contiTab": CONTI_TAB,
        "projects": list_projects(),
        "labels": PROJECT_LABELS,
        "headers": list(HEADERS),
    }


async def native_sheet_ensure(project: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        entry, created = await ensure_project_sheet(client, project)
        rows = await read_project_rows(client, entry["spreadsheetId"])
    return {
        "ok": True,
        "action": "ensure",
        "backend": "google-api",
        "project": project,
        "tab": CONTI_TAB,
        "title": entry.get("title") or _project_title(project),
        "spreadsheetId": entry["spreadsheetId"],
        "spreadsheetUrl": entry["spreadsheetUrl"],
        "created": created,
        "rowCount": len(rows),
    }


async def native_sheet_get(project: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        entry, _ = await ensure_project_sheet(client, project)
        rows = await read_project_rows(client, entry["spreadsheetId"])
    return {
        "ok": True,
        "backend": "google-api",
        "project": project,
        "tab": CONTI_TAB,
        "title": entry.get("title") or _project_title(project),
        "spreadsheetId": entry["spreadsheetId"],
        "spreadsheetUrl": entry["spreadsheetUrl"],
        "rows": rows,
    }


async def native_sheet_replace(project: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        entry, _ = await ensure_project_sheet(client, project)
        count = await write_project_rows(client, entry["spreadsheetId"], rows)
    return {
        "ok": True,
        "action": "replace",
        "backend": "google-api",
        "project": project,
        "tab": CONTI_TAB,
        "rowCount": count,
        "title": entry.get("title") or _project_title(project),
        "spreadsheetId": entry["spreadsheetId"],
        "spreadsheetUrl": entry["spreadsheetUrl"],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


async def native_sheet_append(project: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        entry, _ = await ensure_project_sheet(client, project)
        count = await append_project_rows(client, entry["spreadsheetId"], rows)
    return {
        "ok": True,
        "action": "append",
        "backend": "google-api",
        "project": project,
        "tab": CONTI_TAB,
        "rowCount": count,
        "title": entry.get("title") or _project_title(project),
        "spreadsheetId": entry["spreadsheetId"],
        "spreadsheetUrl": entry["spreadsheetUrl"],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
