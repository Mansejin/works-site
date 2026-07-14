/**
 * 디디딧 콘티 API — Google Apps Script
 *
 * 배포: 웹 앱 → 실행 계정: 디디딧 계정 → 액세스: 모든 사용자
 * 스크립트 속성:
 *   API_TOKEN         공유 비밀 토큰
 *   PROJECT_REGISTRY  (자동) 프로젝트별 spreadsheetId JSON
 *   DRIVE_FOLDER_ID   (선택) 생성 시트를 넣을 Drive 폴더 ID
 *
 * 브랜드(프로젝트)마다 스프레드시트 파일 1개 · 탭 이름「콘티」고정
 */

var HEADERS = ['대본', '장면', '자막', '코멘트'];
var CONTI_TAB = '콘티';

var PROJECT_LABELS = {
  xenics: '디디딧 콘티 · Xenics',
  vendict: '디디딧 콘티 · 벤딕트',
  default: '디디딧 콘티',
};

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    if (!authorize_(e, method)) {
      return jsonOut_({ ok: false, error: 'Unauthorized' }, 401);
    }

    var params = method === 'GET' ? e.parameter : parseBody_(e);
    var action = params.action;
    var project = params.project || 'default';

    if (action === 'meta') {
      return jsonOut_(getMeta_());
    }
    if (action === 'ensure') {
      return jsonOut_(ensureProject_(project));
    }
    if (action === 'get') {
      return jsonOut_(getProject_(project));
    }
    if (method === 'POST') {
      if (action === 'replace') {
        return jsonOut_(replaceRows_(project, params.rows || []));
      }
      if (action === 'append') {
        return jsonOut_(appendRows_(project, params.rows || []));
      }
    }

    return jsonOut_({ ok: false, error: 'Unknown action' }, 400);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) }, 500);
  }
}

function authorize_(e, method) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) return false;
  var provided = e.parameter.token;
  if (!provided && method === 'POST' && e.postData && e.postData.contents) {
    try {
      provided = JSON.parse(e.postData.contents).token;
    } catch (ignore) {}
  }
  return provided === expected;
}

function parseBody_(e) {
  if (!e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function getRegistry_() {
  var raw = PropertiesService.getScriptProperties().getProperty('PROJECT_REGISTRY');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (ignore) {
    return {};
  }
}

function saveRegistry_(registry) {
  PropertiesService.getScriptProperties().setProperty(
    'PROJECT_REGISTRY',
    JSON.stringify(registry)
  );
}

function projectTitle_(project) {
  return PROJECT_LABELS[project] || '디디딧 콘티 · ' + project;
}

function moveToFolder_(fileId) {
  var folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!folderId) return;
  var file = DriveApp.getFileById(fileId);
  var folder = DriveApp.getFolderById(folderId);
  folder.addFile(file);
  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (ignore) {}
}

function setupContiTab_(ss) {
  var sheet = ss.getSheetByName(CONTI_TAB);
  if (!sheet) {
    var sheets = ss.getSheets();
    sheet = sheets.length ? sheets[0] : ss.insertSheet(CONTI_TAB);
    sheet.setName(CONTI_TAB);
  }
  ensureHeaders_(sheet);
  sheet.setFrozenRows(1);
  return sheet;
}

function ensureProjectSpreadsheet_(project) {
  var registry = getRegistry_();
  var entry = registry[project];
  var created = false;
  var ss;

  if (entry && entry.id) {
    ss = SpreadsheetApp.openById(entry.id);
  } else {
    ss = SpreadsheetApp.create(projectTitle_(project));
    created = true;
    setupContiTab_(ss);
    moveToFolder_(ss.getId());
    registry[project] = {
      id: ss.getId(),
      url: ss.getUrl(),
      title: projectTitle_(project),
      createdAt: new Date().toISOString(),
    };
    saveRegistry_(registry);
    entry = registry[project];
  }

  return { ss: ss, entry: entry, created: created };
}

function getContiSheet_(project) {
  var info = ensureProjectSpreadsheet_(project);
  return setupContiTab_(info.ss);
}

function ensureProject_(project) {
  var info = ensureProjectSpreadsheet_(project);
  var sheet = setupContiTab_(info.ss);
  var rowCount = Math.max(0, sheet.getLastRow() - 1);
  return {
    ok: true,
    action: 'ensure',
    project: project,
    tab: CONTI_TAB,
    title: info.entry.title || projectTitle_(project),
    spreadsheetId: info.entry.id,
    spreadsheetUrl: info.entry.url,
    created: info.created,
    rowCount: rowCount,
  };
}

function getProject_(project) {
  var info = ensureProjectSpreadsheet_(project);
  return {
    ok: true,
    project: project,
    tab: CONTI_TAB,
    title: info.entry.title || projectTitle_(project),
    spreadsheetId: info.entry.id,
    spreadsheetUrl: info.entry.url,
    rows: getRows_(project),
  };
}

function ensureHeaders_(sheet) {
  var first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var ok = HEADERS.every(function (h, i) {
    return String(first[i] || '').trim() === h;
  });
  if (!ok) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#eff6ff');
    sheet.setFrozenRows(1);
  }
}

function normalizeRows_(rows) {
  if (!rows || !rows.length) return [];
  return rows
    .map(function (r) {
      if (Array.isArray(r)) {
        return rowFromHeaderArray_(HEADERS, r);
      }
      return {
        대본: String(r.대본 != null ? r.대본 : ''),
        장면: String(r.장면 != null ? r.장면 : ''),
        자막: String(r.자막 != null ? r.자막 : ''),
        코멘트: String(r.코멘트 != null ? r.코멘트 : ''),
      };
    })
    .filter(function (r) {
      return HEADERS.some(function (h) {
        return String(r[h] || '').trim() !== '';
      });
    });
}

function rowFromHeaderArray_(header, arr) {
  var obj = { 대본: '', 장면: '', 자막: '', 코멘트: '' };
  header.forEach(function (h, i) {
    if (HEADERS.indexOf(h) >= 0) {
      obj[h] = String(arr[i] != null ? arr[i] : '');
    }
  });
  return obj;
}

function rowFromArray_(arr) {
  // Positional fallback for 4-col layout
  return {
    대본: String(arr[0] != null ? arr[0] : ''),
    장면: String(arr[1] != null ? arr[1] : ''),
    자막: String(arr[2] != null ? arr[2] : ''),
    코멘트: String(arr[3] != null ? arr[3] : ''),
  };
}

function rowsToValues_(rows) {
  return normalizeRows_(rows).map(function (r) {
    return HEADERS.map(function (h) {
      return r[h];
    });
  });
}

function getRows_(project) {
  var sheet = getContiSheet_(project);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var lastCol = Math.max(HEADERS.length, sheet.getLastColumn());
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var values = sheet.getRange(2, 1, lastRow, lastCol).getValues();
  return values
    .map(function (arr) {
      return rowFromHeaderArray_(header, arr);
    })
    .filter(function (r) {
      return HEADERS.some(function (h) {
        return String(r[h] || '').trim() !== '';
      });
    });
}

function sheetMeta_(project) {
  var info = ensureProjectSpreadsheet_(project);
  return {
    project: project,
    tab: CONTI_TAB,
    title: info.entry.title || projectTitle_(project),
    spreadsheetId: info.entry.id,
    spreadsheetUrl: info.entry.url,
  };
}

function replaceRows_(project, rows) {
  var sheet = getContiSheet_(project);
  var meta = sheetMeta_(project);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow, HEADERS.length).clearContent();
  }
  var data = rowsToValues_(rows);
  if (data.length) {
    sheet.getRange(2, 1, 1 + data.length, HEADERS.length).setValues(data);
  }
  return {
    ok: true,
    action: 'replace',
    project: project,
    tab: CONTI_TAB,
    rowCount: data.length,
    title: meta.title,
    spreadsheetId: meta.spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl,
    updatedAt: new Date().toISOString(),
  };
}

function appendRows_(project, rows) {
  var sheet = getContiSheet_(project);
  var meta = sheetMeta_(project);
  var data = rowsToValues_(rows);
  if (!data.length) {
    return {
      ok: true,
      action: 'append',
      rowCount: 0,
      spreadsheetUrl: meta.spreadsheetUrl,
    };
  }
  var start = Math.max(sheet.getLastRow(), 1) + 1;
  if (sheet.getLastRow() < 1) start = 2;
  sheet.getRange(start, 1, start + data.length - 1, HEADERS.length).setValues(data);
  return {
    ok: true,
    action: 'append',
    project: project,
    tab: CONTI_TAB,
    rowCount: data.length,
    title: meta.title,
    spreadsheetId: meta.spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl,
    updatedAt: new Date().toISOString(),
  };
}

function getMeta_() {
  var registry = getRegistry_();
  var projects = Object.keys(registry).map(function (key) {
    var entry = registry[key];
    return {
      project: key,
      title: entry.title || projectTitle_(key),
      spreadsheetId: entry.id,
      spreadsheetUrl: entry.url,
      createdAt: entry.createdAt || null,
    };
  });
  return {
    ok: true,
    contiTab: CONTI_TAB,
    projects: projects,
    labels: PROJECT_LABELS,
    headers: HEADERS,
  };
}

function jsonOut_(obj, status) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** 수동: xenics 등 프로젝트 시트 미리 생성 */
function setupDdditProjects() {
  ensureProject_('default');
  ensureProject_('xenics');
  ensureProject_('vendict');
}
