/**
 * Spreadsheet-style table editing: Tab/Enter navigation and TSV multi-cell paste.
 */
window.DdditSpreadsheetCells = (function () {
  const DEFAULT_HEADERS = ['대본', '장면', '사이즈', '자막', '코멘트'];

  function isHeaderRow(cells, headers = DEFAULT_HEADERS) {
    const trimmed = cells.map((cell) => cell.trim());
    if (!trimmed.length) return false;
    if (trimmed[0] === '대본' && (trimmed.length === 1 || trimmed[1] === '장면')) return true;
    if (trimmed.join('\t') === headers.join('\t')) return true;
    return false;
  }

  function parsePasteGrid(text, headers = DEFAULT_HEADERS) {
    const normalized = String(text || '')
      .replace(/\uFEFF/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    const grid = lines
      .map((line) => line.split('\t'))
      .filter((cells) => cells.some((cell) => cell.trim()));

    if (grid.length && isHeaderRow(grid[0], headers)) grid.shift();
    return grid;
  }

  function isSpreadsheetPaste(text) {
    const raw = String(text || '');
    if (!raw.trim()) return false;
    if (raw.includes('\t')) return true;
    const lines = raw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line) => line.trim());
    return lines.length > 1;
  }

  function cellCoords(el, rowAttr = 'data-index') {
    const tr = el?.closest('tr');
    if (!tr) return null;
    const index = Number(tr.getAttribute(rowAttr));
    const field = el.dataset.field;
    if (!Number.isFinite(index) || !field) return null;
    return { index, field };
  }

  function findCell(tbody, rowIndex, field, rowAttr) {
    const tr = tbody.querySelector(`tr[${rowAttr}="${rowIndex}"]`);
    return tr?.querySelector(`[data-field="${CSS.escape(field)}"]`) || null;
  }

  function rowCountValue(options) {
    const { rowCount } = options;
    if (typeof rowCount === 'function') return Math.max(0, rowCount());
    if (typeof rowCount === 'number') return Math.max(0, rowCount);
    return 0;
  }

  function moveCellFocus(tbody, current, deltaCol, deltaRow, options) {
    const { headers = DEFAULT_HEADERS, rowAttr = 'data-index' } = options;
    const coords = cellCoords(current, rowAttr);
    if (!coords) return false;

    let col = headers.indexOf(coords.field);
    let row = coords.index;
    if (col < 0) return false;

    col += deltaCol;
    row += deltaRow;

    while (col >= headers.length) {
      col -= headers.length;
      row += 1;
    }
    while (col < 0) {
      col += headers.length;
      row -= 1;
    }

    const totalRows = rowCountValue(options);
    if (row < 0) row = 0;
    if (totalRows > 0 && row > totalRows - 1) row = totalRows - 1;

    const el = findCell(tbody, row, headers[col], rowAttr);
    if (!el) return false;
    el.focus();
    if (typeof el.select === 'function') {
      el.select();
    } else if (typeof el.setSelectionRange === 'function') {
      const len = (el.value || '').length;
      el.setSelectionRange(len, len);
    }
    return true;
  }

  function captureFocus(tbody, rowAttr = 'data-index') {
    const active = document.activeElement;
    if (!active?.classList?.contains('cell-edit') || !tbody?.contains(active)) return null;
    const coords = cellCoords(active, rowAttr);
    if (!coords) return null;
    return {
      index: coords.index,
      field: coords.field,
      start: active.selectionStart,
      end: active.selectionEnd,
    };
  }

  function restoreFocus(tbody, ref, rowAttr = 'data-index') {
    if (!ref || !Number.isFinite(ref.index) || !tbody) return;
    const el = findCell(tbody, ref.index, ref.field, rowAttr);
    if (!el) return;
    el.focus();
    if (typeof ref.start === 'number' && typeof el.setSelectionRange === 'function') {
      el.setSelectionRange(ref.start, ref.end);
    }
  }

  function bindKeyboardNav(tbody, options) {
    if (!tbody || tbody.dataset.keyboardBound === '1') return;
    tbody.dataset.keyboardBound = '1';

    tbody.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!target?.classList?.contains('cell-edit')) return;

      const isTextarea = target.tagName === 'TEXTAREA';

      if (event.key === 'Tab') {
        event.preventDefault();
        options.onBeforeNav?.(target);
        moveCellFocus(tbody, target, event.shiftKey ? -1 : 1, 0, options);
        return;
      }

      if (event.key === 'Enter') {
        if (isTextarea && event.shiftKey) return;
        event.preventDefault();
        options.onBeforeNav?.(target);
        moveCellFocus(tbody, target, 0, event.shiftKey ? -1 : 1, options);
        return;
      }

      if (!isTextarea && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const pos = target.selectionStart ?? 0;
        const len = (target.value || '').length;
        const atStart = pos === 0;
        const atEnd = pos === len;
        if (event.key === 'ArrowLeft' && atStart) {
          event.preventDefault();
          options.onBeforeNav?.(target);
          moveCellFocus(tbody, target, -1, 0, options);
        } else if (event.key === 'ArrowRight' && atEnd) {
          event.preventDefault();
          options.onBeforeNav?.(target);
          moveCellFocus(tbody, target, 1, 0, options);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          options.onBeforeNav?.(target);
          moveCellFocus(tbody, target, 0, -1, options);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          options.onBeforeNav?.(target);
          moveCellFocus(tbody, target, 0, 1, options);
        }
      }
    });
  }

  function bindPaste(tbody, options) {
    if (!tbody || tbody.dataset.pasteBound === '1') return;
    tbody.dataset.pasteBound = '1';

    tbody.addEventListener('paste', (event) => {
      const target = event.target;
      if (!target?.classList?.contains('cell-edit')) return;

      const text = event.clipboardData?.getData('text/plain');
      if (!isSpreadsheetPaste(text)) return;

      const coords = cellCoords(target, options.rowAttr || 'data-index');
      if (!coords) return;

      event.preventDefault();
      const grid = parsePasteGrid(text, options.headers || DEFAULT_HEADERS);
      if (!grid.length) return;

      const count = options.onPaste(coords.index, coords.field, grid);
      if (count > 0) options.onPasted?.(count);
    });
  }

  function bindSpreadsheetTable(tbody, options) {
    bindKeyboardNav(tbody, options);
    bindPaste(tbody, options);
  }

  return {
    DEFAULT_HEADERS,
    isHeaderRow,
    parsePasteGrid,
    isSpreadsheetPaste,
    cellCoords,
    bindSpreadsheetTable,
    bindKeyboardNav,
    bindPaste,
    captureFocus,
    restoreFocus,
    moveCellFocus,
  };
})();
