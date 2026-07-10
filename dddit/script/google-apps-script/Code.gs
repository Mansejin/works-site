/**
 * 디디딧 콘티 API — Google Apps Script
 *
 * 배포: 웹 앱 → 실행 계정: 나 → 액세스: 모든 사용자
 * 스크립트 속성 (프로젝트 설정 → 스크립트 속성):
 *   SPREADSHEET_ID  스프레드시트 ID
 *   API_TOKEN       공유 비밀 토큰 (시나리오 머신 설정과 동일)
 */

var HEADERS = ['대본', '장면', '사이즈', '자막', '코멘트'];

var PROJECT_TABS = {
  xenics: 'Xenics',
  default: '콘티',
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

    if (action === 'meta') {
      return jsonOut_(getMeta_());
    }
    if (action === 'get') {
      var project = params.project || 'default';
      return jsonOut_({
        ok: true,
        project: project,
        tab: tabNameForProject_(project),
        rows: getRows_(project),
      });
    }
    if (method === 'POST') {
      if (action === 'replace') {
        return jsonOut_(replaceRows_(params.project || 'default', params.rows || []));
      }
      if (action === 'append') {
        return jsonOut_(appendRows_(params.project || 'default', params.rows || []));
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

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set in Script Properties');
  return SpreadsheetApp.openById(id);
}

function tabNameForProject_(project) {
  return PROJECT_TABS[project] || project;
}

function getOrCreateSheet_(project) {
  var ss = getSpreadsheet_();
  var name = tabNameForProject_(project);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#eff6ff');
  }
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  var first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var ok = HEADERS.every(function (h, i) {
    return String(first[i] || '').trim() === h;
  });
  if (!ok) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function normalizeRows_(rows) {
  if (!rows || !rows.length) return [];
  return rows
    .map(function (r) {
      if (Array.isArray(r)) {
        return rowFromArray_(r);
      }
      return {
        대본: String(r.대본 != null ? r.대본 : ''),
        장면: String(r.장면 != null ? r.장면 : ''),
        사이즈: String(r.사이즈 != null ? r.사이즈 : ''),
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

function rowFromArray_(arr) {
  return {
    대본: String(arr[0] != null ? arr[0] : ''),
    장면: String(arr[1] != null ? arr[1] : ''),
    사이즈: String(arr[2] != null ? arr[2] : ''),
    자막: String(arr[3] != null ? arr[3] : ''),
    코멘트: String(arr[4] != null ? arr[4] : ''),
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
  var sheet = getOrCreateSheet_(project);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
  return values
    .map(function (arr) {
      return rowFromArray_(arr);
    })
    .filter(function (r) {
      return HEADERS.some(function (h) {
        return String(r[h] || '').trim() !== '';
      });
    });
}

function replaceRows_(project, rows) {
  var sheet = getOrCreateSheet_(project);
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
    tab: tabNameForProject_(project),
    rowCount: data.length,
    updatedAt: new Date().toISOString(),
  };
}

function appendRows_(project, rows) {
  var sheet = getOrCreateSheet_(project);
  var data = rowsToValues_(rows);
  if (!data.length) {
    return { ok: true, action: 'append', rowCount: 0 };
  }
  var start = Math.max(sheet.getLastRow(), 1) + 1;
  if (sheet.getLastRow() < 1) start = 2;
  sheet.getRange(start, 1, start + data.length - 1, HEADERS.length).setValues(data);
  return {
    ok: true,
    action: 'append',
    project: project,
    tab: tabNameForProject_(project),
    rowCount: data.length,
    updatedAt: new Date().toISOString(),
  };
}

function getMeta_() {
  var ss = getSpreadsheet_();
  var sheets = ss.getSheets().map(function (s) {
    return { name: s.getName(), gid: s.getSheetId() };
  });
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    tabs: sheets,
    projects: PROJECT_TABS,
    headers: HEADERS,
  };
}

function jsonOut_(obj, status) {
  var out = ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
  return out;
}

/** 시트에서 한 번 실행: 탭·헤더 초기화 */
function setupDdditTemplate() {
  getOrCreateSheet_('default');
  getOrCreateSheet_('xenics');
  var ss = getSpreadsheet_();
  var readme = ss.getSheetByName('_안내');
  if (!readme) {
    readme = ss.insertSheet('_안내', 0);
    readme.getRange(1, 1).setValue('디디딧 콘티 시트');
    readme.getRange(2, 1).setValue('탭별 프로젝트 · 1행 헤더 고정 · 시나리오 머신에서 시트로 보내기/불러오기');
    readme.getRange(4, 1, 4, 5).setValues([HEADERS]);
  }
}
