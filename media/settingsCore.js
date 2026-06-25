/** 创建设置页 UI 控制器 */
function createSettingsUI(deps) {
  const { vscode, document, window } = deps;

  const stockListEl = document.getElementById('stock-list');
  const addRowEl = document.getElementById('add-row');
  const addBtn = document.getElementById('add-btn');

  let stocks = [];
  let pinnedCount = 0;
  let tempRowActive = false;
  let submitting = false;
  let dragSrcIndex = -1;

  /** 通知扩展当前是否正在编辑临时行 */
  function notifyEditing(active) {
    vscode.postMessage({ type: 'editing', active: active });
  }

  /** 格式化涨跌幅 */
  function formatPercent(percent) {
    if (percent === undefined || percent === null) {
      return '...';
    }
    const sign = percent > 0 ? '+' : '';
    return sign + percent.toFixed(2) + '%';
  }

  /** 获取涨跌幅 CSS 类名 */
  function percentClass(percent) {
    if (percent === undefined || percent === null) {
      return 'flat';
    }
    if (percent > 0) {
      return 'up';
    }
    if (percent < 0) {
      return 'down';
    }
    return 'flat';
  }

  /** 在 #add-row 内创建临时输入框 */
  function appendTempRow() {
    const existing = document.getElementById('temp-row');
    if (existing) {
      existing.remove();
    }

    const row = document.createElement('div');
    row.className = 'temp-row';
    row.id = 'temp-row';

    const input = document.createElement('input');
    input.className = 'temp-input';
    input.type = 'text';
    input.maxLength = 6;
    input.placeholder = '输入 6 位股票代码，按 Enter 添加';
    input.id = 'temp-input';

    row.appendChild(input);
    addRowEl.appendChild(row);
    addBtn.style.display = 'none';

    setTimeout(function () {
      input.focus();
    }, 50);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const code = input.value.trim();
        if (!/^\d{6}$/.test(code)) {
          return;
        }
        submitting = true;
        vscode.postMessage({ type: 'add', code: code });
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (submitting) {
          submitting = false;
          return;
        }
        if (addRowEl.contains(document.activeElement)) {
          return;
        }
        removeTempRow();
      }, 150);
    });
  }

  /** 渲染股票列表（仅 #stock-list） */
  function render() {
    stockListEl.innerHTML = '';

    if (stocks.length === 0 && !tempRowActive) {
      const empty = document.createElement('div');
      empty.className = 'empty-hint';
      empty.textContent = '暂无股票，点击下方 + 添加';
      stockListEl.appendChild(empty);
      return;
    }

    stocks.forEach(function (item, index) {
      const row = document.createElement('div');
      row.className = 'stock-row' + (item.pinned ? ' pinned' : '');
      row.dataset.index = String(index);
      row.dataset.code = item.code;

      const codeEl = document.createElement('span');
      codeEl.className = 'stock-code';
      codeEl.textContent = item.code;

      const nameEl = document.createElement('span');
      nameEl.className = 'stock-name';
      nameEl.textContent = item.name || '加载中...';

      if (item.pinned) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'pinned-badge';
        badgeEl.textContent = '默认';
        nameEl.appendChild(badgeEl);
      }

      const pctEl = document.createElement('span');
      pctEl.className = 'stock-percent ' + percentClass(item.percent);
      pctEl.textContent = formatPercent(item.percent);

      row.appendChild(codeEl);
      row.appendChild(nameEl);
      row.appendChild(pctEl);

      if (!item.pinned) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-icon remove';
        removeBtn.title = '删除';
        removeBtn.textContent = '−';
        removeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          vscode.postMessage({ type: 'remove', code: item.code });
        });

        const dragBtn = document.createElement('button');
        dragBtn.className = 'btn-icon drag-handle';
        dragBtn.title = '拖动排序';
        dragBtn.textContent = '≡';
        dragBtn.draggable = true;

        dragBtn.addEventListener('dragstart', function (e) {
          dragSrcIndex = index;
          row.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        });

        dragBtn.addEventListener('dragend', function () {
          row.classList.remove('dragging');
          document.querySelectorAll('.stock-row').forEach(function (r) {
            r.classList.remove('drag-over');
          });
        });

        row.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          row.classList.add('drag-over');
        });

        row.addEventListener('dragleave', function () {
          row.classList.remove('drag-over');
        });

        row.addEventListener('drop', function (e) {
          e.preventDefault();
          row.classList.remove('drag-over');
          const targetIndex = parseInt(row.dataset.index, 10);
          if (dragSrcIndex < 0 || dragSrcIndex === targetIndex) {
            return;
          }
          if (targetIndex < pinnedCount) {
            return;
          }
          const codes = stocks.map(function (s) { return s.code; });
          const moved = codes.splice(dragSrcIndex, 1)[0];
          codes.splice(targetIndex, 0, moved);
          vscode.postMessage({ type: 'reorder', codes: codes });
          dragSrcIndex = -1;
        });

        row.appendChild(removeBtn);
        row.appendChild(dragBtn);
      }

      stockListEl.appendChild(row);
    });
  }

  /** 显示临时添加行 */
  function showTempRow() {
    if (tempRowActive) {
      return;
    }
    tempRowActive = true;
    notifyEditing(true);
    appendTempRow();
    render();
  }

  /** 移除临时添加行 */
  function removeTempRow() {
    const tempRow = document.getElementById('temp-row');
    if (tempRow) {
      tempRow.remove();
    }
    tempRowActive = false;
    submitting = false;
    addBtn.style.display = 'flex';
    notifyEditing(false);
    render();
  }

  /** 处理扩展推送的 update 消息 */
  function handleUpdate(msg) {
    stocks = msg.stocks || [];
    pinnedCount = stocks.filter(function (s) { return s.pinned; }).length;
    if (msg.addSuccess) {
      removeTempRow();
      return;
    }
    if (tempRowActive) {
      return;
    }
    render();
  }

  addBtn.addEventListener('click', function () {
    showTempRow();
  });

  document.addEventListener(
    'pointerdown',
    function (e) {
      if (!tempRowActive || submitting) {
        return;
      }
      const tempRow = document.getElementById('temp-row');
      if (!tempRow) {
        return;
      }
      if (!addRowEl.contains(e.target) && !stockListEl.contains(e.target)) {
        removeTempRow();
      }
    },
    true
  );

  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg.type === 'update') {
      handleUpdate(msg);
    }
    if (msg.type === 'addFailed') {
      submitting = false;
      const input = document.getElementById('temp-input');
      if (input) {
        input.style.borderColor = '#f44336';
        input.placeholder = msg.message || '股票代码无效';
        input.focus();
      }
    }
  });

  vscode.postMessage({ type: 'ready' });

  return {
    showTempRow,
    removeTempRow,
    render,
    handleUpdate,
    getTempRowActive: function () { return tempRowActive; },
    getStocks: function () { return stocks; },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createSettingsUI };
}
