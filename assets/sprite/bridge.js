/* ==== SPRITE-AGENT-BRIDGE v1 ==== */
/* 上面这行起始标记的字面量**故意保持 v1**：scripts/patch-sprite-tool.mjs 用它做插入/幂等
   判据，脚本不许改，所以标记不动、版本号写在 MARK 里（v2）。 */
/* =====================================================================
   页面内 agent 桥接层（bridge.js v2）—— 给外部程序（CDP Runtime.evaluate）用
   的函数调用接口，替代「模拟点击」。

   v2 契约：assets/sprite/bridge-contract.md（§1~§12）。v1 的 18 个函数签名与行为不变，
   只补了返回值字段；v2 新增 loadVideoUrl / keyState / probeColor / measure / overlay /
   getAnchor / setAnchorPx / scaleTo / trim / detectWatermark / buildSheetDataURL / keyedDataURL。

   插在哪：
     由 scripts/patch-sprite-tool.mjs 插进「序列帧精灵图工具.html」里
     script[type=module] 那个块的内部末尾、闭合标签之前
     （即 `$('statusText').textContent = '就绪 …'` 那一行之后）。
     该模块没有 IIFE 包裹，但这是 module 作用域：顶层 const/function
     同样不挂在 window 上，所以桥接必须插在块内才能看见内部符号。

   依赖的内部符号（同一模块作用域，缺一个就会在对应函数里报错）：
     状态   state{source,conv,frames,selected,key,keyed,mask,masked,trim,measure,anchor,out}
     工具   $  clamp  toast  setBusy  setProgress  canvasToPng
     导入   handleFile  detectKind  updateConvUI  updateTabs
     抽帧   generateFrames  renderThumbnails  updateSelCount  getSelectedIndices
     帧图   effectiveFrame  getSelectedFrames  getCropRect  getTrimBBox
            buildProcessedFrame  alphaBBox  refreshEditPreviews  showPreviewBox
     抠图   keyHex  keyRequestParams  requestKey  loadCanvasFromDataUrl
            updateKeyColorUI  updateKeyModeVisibility  onKeyParamChange
            renderKeyResult  renderKeySource  showMaskInto  syncThumbSel
     去水印 applyRectMask  renderMaskPreview  onMaskRectChange  updateMaskInfo  clearMask
     裁剪   computeTrimCore  applyTrimResult
     输出   computeCell  buildSheet  currentMeta  renderSheetPreview  renderRuler
            applyOutScale  updateMeasureInfo  updateMeasureButtons  refreshOutput
     锚点   renderAnchorPreview / anchorCurrent / anchorProcessedFrame
     输出   computeCell applyOutScale renderSheetPreview
     接缝   window.SheetKey（页面自带的离线垫片把 /api/key 接管成纯本地计算，
            所以 requestKey 不依赖 Unity 宿主）

   约定：
     · 每个函数都是 async，只返回可 JSON 序列化的普通对象；
     · 出错不 throw，一律 {ok:false, error:'...'}；
     · 每个函数都会把状态写回 UI（调用内部渲染函数），人打开页面看到的是同一份结果；
     · 不点任何按钮：文件靠 File + change、取色靠 getImageData、参数直接改 state。
   ===================================================================== */
(() => {
  'use strict';

  const MARK = 'SPRITE-AGENT-BRIDGE v2';

  /* ---------------- 小工具 ---------------- */
  const fail = (error) => ({ ok: false, error: String((error && error.message) || error || '未知错误') });
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const clampv = (v, a, b) => Math.min(b, Math.max(a, v));
  const rectOf = (r) => (r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null);
  const has = (o, k) => !!o && o[k] !== undefined && o[k] !== null;

  const el = (id) => (typeof $ === 'function' ? $(id) : document.getElementById(id));
  const setChecked = (id, v) => { const e = el(id); if (e) e.checked = !!v; };
  const setText = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  const setHtml = (id, v) => { const e = el(id); if (e) e.innerHTML = v; };

  /* 没选帧时兜底全选：内部大量函数只看 state.selected */
  function ensureSelection() {
    if (getSelectedIndices().length) return getSelectedIndices();
    state.selected = new Set(state.frames.map((_, i) => i));
    if (typeof syncThumbSel === 'function') syncThumbSel();
    if (typeof updateSelCount === 'function') updateSelCount();
    return getSelectedIndices();
  }

  function frameIndex(v) {
    if (!state.frames.length) return -1;
    return clampv(Math.round(num(v, 0)), 0, state.frames.length - 1);
  }

  /* 把 state.key 里的参数同步到控件上（不触发 change，避免重复渲染） */
  function syncKeyUI() {
    const k = state.key, a = k.adv;
    setChecked('keyEnabled', k.enabled);
    setChecked('advAutoPlate', k.autoPlate);
    setChecked('advDespillAggr', a.despillAggr);
    const sel = el('keyMode');
    if (sel) sel.value = k.mode === 'advanced' ? 'advanced' : 'classic';
    const slider = (rangeId, numId, valId, v) => {
      const r = el(rangeId), n = el(numId), t = el(valId);
      if (r) r.value = v;
      if (n) n.value = v;
      if (t) t.textContent = ' ' + v;
    };
    slider('keyIntensity', 'keyIntensityNum', 'keyIntensityVal', k.intensity);
    slider('keyFeather', 'keyFeatherNum', 'keyFeatherVal', k.feather);
    slider('keyCleanup', 'keyCleanupNum', 'keyCleanupVal', k.cleanup);
    slider('advIntensity', 'advIntensityNum', 'advIntensityVal', a.intensity);
    slider('advSoftness', 'advSoftnessNum', 'advSoftnessVal', a.softness);
    slider('advDespill', 'advDespillNum', 'advDespillVal', a.despill);
    slider('advFeather', 'advFeatherNum', 'advFeatherVal', a.feather);
    slider('advGreenToAlpha', 'advGreenNum', 'advGreenVal', a.greenToAlpha);
    if (typeof updateKeyColorUI === 'function') updateKeyColorUI();
    if (typeof updateKeyModeVisibility === 'function') updateKeyModeVisibility();
  }

  function keyParamsObject() {
    const k = state.key, a = k.adv;
    return {
      enabled: !!k.enabled,
      mode: k.mode === 'advanced' ? 'advanced' : 'classic',
      colorHex: typeof keyHex === 'function' ? keyHex() : '#00ff00',
      intensity: k.intensity,
      feather: k.feather,
      cleanup: k.cleanup,
      softness: a.softness,
      despill: a.despill,
      greenToAlpha: a.greenToAlpha,
      aggressive: !!a.despillAggr,
      autoPlate: !!k.autoPlate,
      advIntensity: a.intensity,
      advFeather: a.feather,
      /* 真正发给 /api/key 的请求体，排查参数映射用 */
      request: typeof keyRequestParams === 'function' ? keyRequestParams() : null,
    };
  }

  function mimeOf(name) {
    const s = String(name).toLowerCase();
    if (s.endsWith('.gif')) return 'image/gif';
    if (s.endsWith('.webm')) return 'video/webm';
    if (s.endsWith('.mp4')) return 'video/mp4';
    if (s.endsWith('.mov')) return 'video/quicktime';
    return 'application/octet-stream';
  }

  /* ---------------- 1. 导入 ---------------- */
  async function loadVideoBase64(b64, name) {
    try {
      const raw = String(b64 || '').trim();
      if (!raw) return fail('base64 为空');
      const cut = raw.indexOf('base64,');
      const payload = cut >= 0 ? raw.slice(cut + 7) : raw;
      let bin;
      try { bin = atob(payload); } catch (e) { return fail('base64 解码失败：' + (e.message || e)); }
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (!bytes.length) return fail('base64 解出来是空文件');

      const filename = String(name || 'clip.mov');
      const file = new File([bytes], filename, { type: mimeOf(filename) });

      /* 塞进文件输入框，然后走真实的 change 事件（与用户手动选文件同一条路） */
      const input = el('fileInput');
      let injected = false;
      if (input) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          injected = !!input.files && input.files.length === 1;
        } catch (_) { injected = false; }
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { /* ignore */ }
      }

      /* change 是同步派发、handleFile 是 async：等 state.source 落位；
         万一监听没生效（例如输入框被换掉），直接调 handleFile 兜底。 */
      const waitUntil = async (test, timeout) => {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
          if (test()) return true;
          await new Promise((r) => setTimeout(r, 30));
        }
        return test();
      };
      const landedByEvent = injected && await waitUntil(() => !!state.source && state.source.file === file, 400);
      if (!landedByEvent) await handleFile(file);

      const landed = await waitUntil(() => !!state.source && state.source.file === file, 2000);
      if (!landed) return fail('文件没有进入页面（handleFile 没接住）');

      /* 视频时长/分辨率要等 loadedmetadata，超时不影响后续（setRange 是显式给的） */
      const src = state.source;
      let metaReady = true;
      if (src.kind !== 'gif' && (src.width == null || src.duration == null)) {
        metaReady = await waitUntil(() => src.width != null || (src.duration != null), 6000);
      }
      if (typeof updateTabs === 'function') updateTabs();
      return {
        ok: true,
        name: src.name,
        bytes: bytes.length,
        kind: src.kind,
        duration: src.duration,
        width: src.width,
        height: src.height,
        metaReady,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 2. 抽帧参数 ---------------- */
  async function setRange(start, end, fps) {
    try {
      if (!state.source) return fail('还没有导入素材');
      const st = num(start, 0);
      let en = num(end, st + 1);
      const f = num(fps, 12);
      if (en <= st) en = st + Math.max(1, 1 / Math.max(f, 1));

      const startEl = el('convStart'), endEl = el('convEnd'), fpsEl = el('convFps');
      if (startEl) startEl.value = st;
      if (endEl) endEl.value = en;
      if (fpsEl) {
        const v = String(f);
        const exists = Array.prototype.some.call(fpsEl.options || [], (o) => o.value === v);
        if (!exists) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v + ' fps';
          fpsEl.appendChild(o);
        }
        fpsEl.value = v;
      }
      if (typeof updateConvUI === 'function') updateConvUI();   /* 内部会按素材类型夹取范围 */
      return {
        ok: true,
        start: num(startEl && startEl.value, st),
        end: num(endEl && endEl.value, en),
        fps: num(fpsEl && fpsEl.value, f),
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 3. 抽帧 ---------------- */
  async function extract() {
    try {
      if (!state.source) return fail('还没有导入素材');
      const before = state.frames;
      await generateFrames();             /* 失败只会 toast，这里靠「数组是否换新」判定 */
      if (!state.frames.length) return fail('没生成任何帧（检查起止时间/编码）');
      if (state.frames === before) return fail('抽帧没有真正执行（预览占用或参数无效，可重试一次）');
      const f0 = state.frames[0];
      if (typeof updateTabs === 'function') updateTabs();
      if (typeof renderThumbnails === 'function') renderThumbnails();
      return { ok: true, count: state.frames.length, width: f0.width, height: f0.height };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 4. 取色（按坐标读像素，不点取色按钮） ---------------- */
  async function pickBgColor(frameIdx, x, y) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      const i = frameIndex(frameIdx);
      if (i < 0) return fail('帧号无效');
      const src = state.frames[i];
      const xx = Number(x), yy = Number(y);
      if (!Number.isFinite(xx) || !Number.isFinite(yy)) return fail('x / y 需要是数字');
      const px = clampv(Math.round(xx), 0, src.width - 1);
      const py = clampv(Math.round(yy), 0, src.height - 1);
      const d = src.getContext('2d').getImageData(px, py, 1, 1).data;
      state.key.color = { r: d[0], g: d[1], b: d[2] };
      state.picking = false;
      setText('btnPickColor', '🎯 取色');
      setText('keyPickHint', '点击「取色」后，在左侧原图上点取背景色');
      if (typeof updateKeyColorUI === 'function') updateKeyColorUI();
      if (state.key.enabled) { await renderKeyResult(); }
      else if (typeof renderKeySource === 'function') { renderKeySource(); }
      return {
        ok: true,
        hex: typeof keyHex === 'function' ? keyHex() : '#000000',
        frame: i,
        x: px,
        y: py,
        rgb: { r: d[0], g: d[1], b: d[2] },
        alpha: d[3],
        clamped: (px !== Math.round(xx)) || (py !== Math.round(yy)),
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 5. 抠图参数 ---------------- */
  async function keyParams() {
    try {
      return Object.assign({ ok: true }, keyParamsObject());
    } catch (e) {
      return fail(e);
    }
  }

  async function setKeyParams(patch) {
    try {
      const p = (patch && typeof patch === 'object') ? patch : {};
      const k = state.key, a = k.adv;
      const clampInt = (v, lo, hi, d) => clampv(Math.round(num(v, d)), lo, hi);

      if (has(p, 'mode')) k.mode = String(p.mode) === 'advanced' ? 'advanced' : 'classic';
      if (has(p, 'enabled')) k.enabled = !!p.enabled;
      if (has(p, 'autoPlate')) k.autoPlate = !!p.autoPlate;
      if (has(p, 'aggressive')) a.despillAggr = !!p.aggressive;

      const hex = has(p, 'colorHex') ? p.colorHex : (has(p, 'color') ? p.color : null);
      if (hex != null) {
        const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
        if (!m) return fail('colorHex 需要 6 位十六进制，例如 #00FF00');
        const v = m[1];
        k.color = {
          r: parseInt(v.slice(0, 2), 16),
          g: parseInt(v.slice(2, 4), 16),
          b: parseInt(v.slice(4, 6), 16),
        };
      }
      /* intensity 同时写经典档与智能档，免得切模式时参数「丢了」 */
      if (has(p, 'intensity')) { const v = clampInt(p.intensity, 0, 100, k.intensity); k.intensity = v; a.intensity = v; }
      if (has(p, 'feather')) { const v = clampInt(p.feather, 0, 100, k.feather); k.feather = v; a.feather = v; }
      if (has(p, 'cleanup')) k.cleanup = clampInt(p.cleanup, 0, 100, k.cleanup);
      if (has(p, 'softness')) a.softness = clampInt(p.softness, 0, 100, a.softness);
      if (has(p, 'despill')) a.despill = clampInt(p.despill, 0, 100, a.despill);
      if (has(p, 'greenToAlpha')) a.greenToAlpha = clampInt(p.greenToAlpha, 0, 300, a.greenToAlpha);
      if (has(p, 'advIntensity')) a.intensity = clampInt(p.advIntensity, 0, 100, a.intensity);
      if (has(p, 'advFeather')) a.feather = clampInt(p.advFeather, 0, 100, a.feather);

      syncKeyUI();
      if (typeof onKeyParamChange === 'function') onKeyParamChange();   /* 清缓存 + 防抖预览 + 刷新编辑页 */
      return Object.assign({ ok: true }, keyParamsObject());
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 6. 单帧抠图预览 ---------------- */
  /* 注意（契约 §11 / P2 坑）：预览走的是「参数驱动重算」这条路，所以它会**作废**
     state.keyed / state.masked —— 与页面里拖滑块（onKeyParamChange）行为一致。
     宿主如果要用抠图结果拼图，预览之后必须重新 keyApply()；只读取样请用 keyedDataURL()。 */
  async function keyPreview(frameIdx) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (typeof requestKey !== 'function') return fail('未接通: requestKey');
      const appliedParams = typeof keyRequestParams === 'function' ? keyRequestParams() : null;
      /* 作废缓存（等价 onKeyParamChange 的第一段），但不触发它的防抖预览（这里自己就在预览） */
      if (state.keyed.size || state.masked.size) {
        state.keyed.clear();
        if (state.masked) state.masked.clear();
        setHtml('keyApplyStatus', '<span class="warn">参数已修改，需重新应用</span>');
        if (typeof renderThumbnails === 'function') renderThumbnails();
        if (typeof updateSelCount === 'function') updateSelCount();
      }
      const i = frameIndex(frameIdx);
      const src = state.frames[i];
      const r = await requestKey([src], false);   /* 预览不跑自动背景板（与内部一致） */
      const url = r && r.frames && r.frames[0];
      if (!url) return fail('抠图接口没返回帧');
      try {
        const c = await loadCanvasFromDataUrl(url);
        const maskChk = el('keyShowMask');
        if (maskChk && maskChk.checked) showMaskInto('keyResultBox', c);
        else if (typeof showPreviewBox === 'function') showPreviewBox('keyResultBox', c);
      } catch (_) { /* UI 同步失败不影响返回值 */ }
      return {
        ok: true,
        dataURL: url,
        frame: i,
        width: src.width,
        height: src.height,
        applied: false,
        clamped: Math.round(num(frameIdx, 0)) !== i,
        appliedParams,
        keyedCount: state.keyed.size,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 7. 应用抠图 ---------------- */
  async function keyApply(indices) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      let list;
      if (Array.isArray(indices) && indices.length) {
        const seen = new Set();
        list = indices
          .map((v) => frameIndex(v))
          .filter((v) => v >= 0 && !seen.has(v) && seen.add(v));
        list.sort((x, y) => x - y);
      } else {
        list = ensureSelection();
      }
      if (!list.length) return fail('没有可应用的帧');
      /* 真正生效的那份参数（契约 §11）：在发请求前拍快照，避免事后被 UI 改动污染 */
      const appliedParams = typeof keyRequestParams === 'function' ? keyRequestParams() : null;

      /* 不启用抠图的话 keyed 结果不会被 effectiveFrame 采用，页面看起来「没反应」 */
      const autoEnabled = !state.key.enabled;
      if (autoEnabled) { state.key.enabled = true; setChecked('keyEnabled', true); }

      setBusy('正在把 ' + list.length + ' 帧抠图…', true);
      let r;
      try {
        r = await requestKey(list.map((i) => state.frames[i]), !!state.key.autoPlate);
      } finally {
        setBusy(null, false);
      }
      state.keyed.clear();
      for (let j = 0; j < list.length; j++) {
        state.keyed.set(list[j], await loadCanvasFromDataUrl(r.frames[j]));
        setProgress((j + 1) / list.length);
      }
      if (r.plateInfo) setText('advPlateInfo', r.plateInfo);
      setHtml('keyApplyStatus', '<span class="ok">✓ 已应用到 ' + list.length + ' 帧</span>');
      setText('keyAppliedHint', '');

      /* 已启用框选去水印：基于新的 keyed 结果重算 masked（与内部顺序一致） */
      if (state.mask.enabled && state.mask.rect) {
        state.masked.clear();
        list.forEach((i) => state.masked.set(i, applyRectMask(state.keyed.get(i), state.mask.rect)));
      }
      renderThumbnails();
      updateSelCount();
      refreshEditPreviews();
      if (state.trim.enabled) {
        const eff = getSelectedFrames();
        if (eff.length) applyTrimResult(computeTrimCore(eff), eff[0], true);
      }
      if (typeof updateTabs === 'function') updateTabs();

      const plateApplied = !!(state.key.autoPlate && r.plateInfo && r.plateInfo.indexOf('估计失败') < 0);
      return {
        ok: true,
        frames: list.length,
        indices: list,
        plateApplied,
        plateInfo: r.plateInfo || '',
        plateNote: (state.key.autoPlate && state.key.mode !== 'advanced')
          ? '自动背景板只在智能档（advanced）生效，当前是经典档，未计算背景板'
          : '',
        keyEnabled: !!state.key.enabled,
        autoEnabled,
        /* 契约 §11：真正生效的那份参数 + 当前缓存帧数 */
        appliedParams,
        keyedCount: state.keyed.size,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 8. 蒙版可视化 ---------------- */
  async function maskDataURL(frameIdx) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      const i = frameIndex(frameIdx);
      const src = effectiveFrame(i);          /* 抠图/去水印后的有效帧，没有就走原帧 */
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const ctx = c.getContext('2d');
      const idata = src.getContext('2d').getImageData(0, 0, c.width, c.height);
      const d = idata.data;
      for (let p = 0; p < d.length; p += 4) {
        const a = d[p + 3];
        d[p] = a; d[p + 1] = a; d[p + 2] = a; d[p + 3] = 255;
      }
      ctx.putImageData(idata, 0, 0);
      if (typeof showMaskInto === 'function') showMaskInto('keyResultBox', src);   /* UI 也切成看蒙版 */
      return { ok: true, dataURL: c.toDataURL('image/png'), frame: i, width: c.width, height: c.height };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 9. 框选去水印 ---------------- */
  async function setMaskRect(rect) {
    try {
      if (rect === null || rect === undefined) {
        if (typeof clearMask === 'function') {
          clearMask();
        } else {
          state.mask.rect = null;
          state.mask.enabled = false;
          state.masked.clear();
          if (typeof renderMaskPreview === 'function') renderMaskPreview();
        }
        state.mask.enabled = false;
        setChecked('maskEnabled', false);
        renderThumbnails();
        refreshEditPreviews();
        updateSelCount();
        return { ok: true, rect: null, enabled: false };
      }
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      const f = state.frames[0];
      const x = Math.round(num(rect.x, NaN)), y = Math.round(num(rect.y, NaN));
      const w = Math.round(num(rect.w, NaN)), h = Math.round(num(rect.h, NaN));
      if (![x, y, w, h].every(Number.isFinite)) return fail('rect 需要 {x,y,w,h} 四个数字');
      if (w <= 0 || h <= 0) return fail('rect.w / rect.h 需要 > 0');
      const rr = {
        x: clampv(x, 0, f.width - 1),
        y: clampv(y, 0, f.height - 1),
        w: 0, h: 0,
      };
      rr.w = clampv(w, 1, f.width - rr.x);
      rr.h = clampv(h, 1, f.height - rr.y);
      state.mask.rect = rr;
      state.mask.enabled = true;
      setChecked('maskEnabled', true);
      if (typeof onMaskRectChange === 'function') onMaskRectChange();
      if (typeof renderMaskPreview === 'function') renderMaskPreview();
      if (typeof updateMaskInfo === 'function') updateMaskInfo();
      return { ok: true, rect: rectOf(rr), enabled: true, frameWidth: f.width, frameHeight: f.height };
    } catch (e) {
      return fail(e);
    }
  }

  async function applyMask() {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (!state.mask.rect) return fail('还没有框选区域，先 setMaskRect({x,y,w,h})');
      if (!state.mask.enabled) { state.mask.enabled = true; setChecked('maskEnabled', true); }
      const indices = ensureSelection();
      setBusy('正在对 ' + indices.length + ' 帧去水印…', true);
      await new Promise((r) => setTimeout(r, 24));
      state.masked.clear();
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const base = state.keyed.get(idx) || state.frames[idx];   /* 基于抠图结果或原帧 */
        state.masked.set(idx, applyRectMask(base, state.mask.rect));
        setProgress((i + 1) / indices.length);
      }
      setBusy(null, false);
      setHtml('maskApplyStatus', '<span class="ok">✓ 已应用到 ' + indices.length + ' 帧</span>');
      renderThumbnails();
      refreshEditPreviews();
      updateSelCount();
      if (state.trim.enabled) {
        const eff = getSelectedFrames();
        if (eff.length) applyTrimResult(computeTrimCore(eff), eff[0], true);
      }
      if (typeof updateTabs === 'function') updateTabs();
      return { ok: true, frames: indices.length, rect: rectOf(state.mask.rect) };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 10. 透明边缘最小化 ---------------- */
  async function computeTrim() {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      ensureSelection();
      const sel = getSelectedFrames();
      if (!sel.length) return fail('没有可扫描的帧');
      setBusy('正在扫描透明边缘…', true);
      await new Promise((r) => setTimeout(r, 24));
      let u;
      try {
        u = computeTrimCore(sel);
      } finally {
        setBusy(null, false);
      }
      applyTrimResult(u, sel[0], true);
      updateSelCount();
      return {
        ok: true,
        box: rectOf(state.trim.bbox),
        content: u ? { x: u.x, y: u.y, x2: u.x2, y2: u.y2, w: u.x2 - u.x + 1, h: u.y2 - u.y + 1 } : null,
        enabled: !!state.trim.enabled,
        /* box 的坐标空间：裁切之后、缩放之前的像素（内部 applyTrimResult 就写这个空间） */
        coordSpace: 'crop',
        alphaThreshold: state.trim.alphaThreshold,
        pad: { top: state.trim.pad.top, bottom: state.trim.pad.bottom, left: state.trim.pad.left, right: state.trim.pad.right },
      };
    } catch (e) {
      return fail(e);
    }
  }

  async function applyTrim() {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (!state.trim.bbox) {
        const r = await computeTrim();
        if (!r.ok) return r;
      }
      state.trim.enabled = true;
      setChecked('trimEnabled', true);
      refreshEditPreviews();
      if (typeof updateSelCount === 'function') updateSelCount();
      try { await refreshOutput(); } catch (_) { /* 输出页刷新不是硬要求 */ }
      if (typeof updateTabs === 'function') updateTabs();
      return { ok: true, enabled: true, box: rectOf(state.trim.bbox) };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 11. 测高反推缩放 ---------------- */
  async function measureScale(bottomY, topY, targetPx) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      ensureSelection();
      const f = getSelectedFrames()[0];
      if (!f) return fail('没有可测量的帧');

      /* 与 buildProcessedFrame 同一切法：裁切 → 最小化，得到「最终格」的源图 */
      const crop = getCropRect(f.width, f.height);
      const tb = getTrimBBox();
      const sx = crop.x + (tb ? tb.x : 0);
      const sy = crop.y + (tb ? tb.y : 0);
      const sw = tb ? tb.w : crop.w;
      const sh = tb ? tb.h : crop.h;
      if (sh <= 0) return fail('源帧高度为 0');

      const probe = document.createElement('canvas');
      probe.width = sw; probe.height = sh;
      probe.getContext('2d').drawImage(f, sx, sy, sw, sh, 0, 0, sw, sh);

      /* 参数是归一化 0~1（和刻度图上一样）；>1 当成像素，除以源高 */
      const norm = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        return n > 1 ? clampv(n / sh, 0, 1) : clampv(n, 0, 1);
      };
      let bottom = norm(bottomY), top = norm(topY);
      let sourcePx = 0, auto = false;
      if (bottom == null || top == null || Math.abs(bottom - top) < 1e-4) {
        /* (0,0) 或缺失 → 自动用内容物 alpha bbox 测高（等同最小化看到的范围） */
        const bb = alphaBBox(probe, state.trim.alphaThreshold);
        if (!bb) return fail('没找到非透明内容，无法自动测高（先抠图或调低极淡像素阈值）');
        top = clampv(bb.y / sh, 0, 1);
        bottom = clampv((bb.y + bb.h) / sh, 0, 1);
        sourcePx = bb.h;
        auto = true;
      } else {
        sourcePx = Math.abs(bottom - top) * sh;
      }
      state.measure.top = top;
      state.measure.bottom = bottom;
      state.measure.marking = null;
      if (typeof updateMeasureButtons === 'function') updateMeasureButtons();

      const target = num(targetPx, 0);
      let scale = num(el('outScale') && el('outScale').value, state.out.scale || 100);
      let wanted = null, clamped = false;
      if (target > 0) {
        if (sourcePx <= 0) return fail('内容物高度为 0，无法反推比例');
        wanted = Math.round((target * 100 / sourcePx) * 100) / 100;
        scale = clampv(wanted, 1, 300);          /* 工具自身的缩放上限就是 1~300% */
        clamped = Math.abs(scale - wanted) > 0.01;
        applyOutScale(scale, true);              /* 会顺手 scheduleRefreshOutput(300) 重排输出 */
      }
      if (typeof renderRuler === 'function') renderRuler();
      if (typeof updateMeasureInfo === 'function') updateMeasureInfo();
      const applied = num(el('outScale') && el('outScale').value, scale);
      return {
        ok: true,
        scale: applied,
        wantedScale: wanted,
        scaleClamped: clamped,
        sourcePx: Math.round(sourcePx),
        achievedPx: Math.round(sourcePx * applied / 100),
        targetPx: target > 0 ? target : null,
        bottomNorm: bottom,
        topNorm: top,
        auto,
        sourceHeight: sh,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 12. 锚点 ---------------- */
  async function setAnchor(x, y) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      const nx = clampv(num(x, state.anchor.x), 0, 1);
      const ny = clampv(num(y, state.anchor.y), 0, 1);
      /* 不走内部 setAnchorValue：那条路会连带把输入框和脏标记一起处理，而我们只需要
         定值 + 重画。脏标记自己打（带原因，人能在卡片上看到「● 未保存（代理设锚点）」）。
         2026-11-11 上游把 markDirty 补上了（此前从未定义，调用必抛 ReferenceError），
         所以这里的 typeof 守卫现在只是兼容老版本工具的兜底。 */
      state.anchor.x = nx;
      state.anchor.y = ny;
      state.anchor.confirmed = true;
      renderAnchorPreview();
      if (typeof markDirty === 'function') {
        try {
          markDirty('代理设锚点');
        } catch (_) {
          /* 脏标记是增强项，打不上也不许影响定位 */
        }
      }
      return { ok: true, x: state.anchor.x, y: state.anchor.y };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 13. 拼图 ---------------- */
  async function buildSheetOp(cols, rows) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      ensureSelection();
      const cEl = el('outCols'), rEl = el('outRows');
      if (cols != null && cEl) cEl.value = clampv(Math.round(num(cols, 4)), 1, 100);
      if (rows != null && rEl) rEl.value = clampv(Math.round(num(rows, 4)), 1, 100);
      const r = buildSheet();
      if (!r) return fail('拼图失败（没有可输出帧）');
      const url = r.sheet.toDataURL('image/png');
      const meta = currentMeta(r);
      /* UI：把输出页的尺寸/网格/预览一起刷新，人看到的是同一张 */
      try {
        if (typeof renderRuler === 'function') renderRuler();
        if (typeof renderAnchorPreview === 'function') renderAnchorPreview();
        await renderSheetPreview();
      } catch (_) { /* ignore */ }
      if (typeof updateTabs === 'function') updateTabs();
      return {
        ok: true,
        dataURL: url,
        meta,
        width: r.sheet.width,
        height: r.sheet.height,
        cols: r.cols,
        rows: r.rows,
        cellW: r.cellW,
        cellH: r.cellH,
        count: r.count,
        total: r.total,
      };
    } catch (e) {
      return fail(e);
    }
  }

  async function sheetMeta() {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      ensureSelection();
      const r = buildSheet();
      if (!r) return fail('拼图失败（没有可输出帧）');
      const meta = currentMeta(r);
      return Object.assign({ ok: true }, meta, {
        sheetWidth: r.sheet.width,
        sheetHeight: r.sheet.height,
        cellW: r.cellW,
        cellH: r.cellH,
        total: r.total,
        trimmed: !!state.trim.enabled,
        keyed: !!state.key.enabled,
        masked: !!state.mask.enabled,
      });
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 14. 原图 ---------------- */
  async function frameDataURL(frameIdx) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      const i = frameIndex(frameIdx);
      const f = state.frames[i];
      return { ok: true, dataURL: f.toDataURL('image/png'), frame: i, width: f.width, height: f.height };
    } catch (e) {
      return fail(e);
    }
  }

  /* =====================================================================
     v2 扩展（契约 §1~§12）
     通用：全部 async、只返回纯 JSON；拿不到落点一律 {ok:false,error}，不静默降级。
     ===================================================================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const r3 = (v) => Math.round(Number(v) * 1000) / 1000;
  const hx2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).toUpperCase().padStart(2, '0');
  const rgbHex = (rgb) => '#' + hx2(rgb[0]) + hx2(rgb[1]) + hx2(rgb[2]);

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('Blob 转 dataURL 失败'));
      fr.readAsDataURL(blob);
    });
  }

  function waitFor(test, timeoutMs) {
    return (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (test()) return true;
        await sleep(30);
      }
      return !!test();
    })();
  }

  /* 单帧 alpha bbox（帧原始像素空间，左上原点，x1/y1 开区间）；依赖 alphaBBox */
  function boxOfFrame(canvas, thr) {
    if (typeof alphaBBox !== 'function') return null;
    const b = alphaBBox(canvas, thr);
    if (!b) return null;
    return { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, w: b.w, h: b.h };
  }

  /* ---------------- v2-1. 按 URL 导入（契约 §1） ---------------- */
  /* 依赖内部符号：handleFile / detectKind（间接）/ el('fileInput') / state.source / updateTabs / mimeOf */
  async function loadVideoUrl(url, name) {
    try {
      if (typeof handleFile !== 'function') return fail('未接通: handleFile');
      const raw = String(url || '').trim();
      if (!raw) return fail('url 为空');
      let res;
      try {
        res = await fetch(raw);
      } catch (e) {
        return fail('拉取视频失败：' + ((e && e.message) || e));
      }
      if (!res || !res.ok) return fail('拉取视频失败：HTTP ' + (res ? res.status : '无响应'));
      let blob;
      try {
        blob = await res.blob();
      } catch (e) {
        return fail('读取视频流失败：' + ((e && e.message) || e));
      }
      if (!blob || !blob.size) return fail('视频内容为空（0 字节）');

      let filename = String(name || '').trim();
      if (!filename) {
        const clean = raw.split('?')[0].split('#')[0];
        filename = clean.slice(clean.lastIndexOf('/') + 1) || 'clip.mp4';
      }
      if (!/\.[a-z0-9]{1,5}$/i.test(filename)) filename += '.mp4';
      const file = new File([blob], filename, { type: blob.type || mimeOf(filename) });

      /* 与 loadVideoBase64 同一条通道：塞 #fileInput → change；没接住就直接 handleFile */
      const input = el('fileInput');
      let injected = false;
      if (input) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          injected = !!input.files && input.files.length === 1;
        } catch (_) { injected = false; }
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { /* ignore */ }
      }
      const landedByEvent = injected && await waitFor(() => !!state.source && state.source.file === file, 600);
      if (!landedByEvent) await handleFile(file);
      const landed = await waitFor(() => !!state.source && state.source.file === file, 3000);
      if (!landed) return fail('文件没有进入页面（handleFile 没接住）');

      const src = state.source;
      let metaReady = true;
      if (src.kind !== 'gif' && (src.width == null || src.duration == null)) {
        metaReady = await waitFor(() => src.width != null || src.duration != null, 8000);
      }
      if (typeof updateTabs === 'function') updateTabs();
      if (typeof renderImportInfo === 'function') renderImportInfo();
      return {
        ok: true,
        name: src.name,
        bytes: blob.size,
        kind: src.kind,
        duration: src.duration,
        width: src.width,
        height: src.height,
        metaReady,
        url: raw,
        contentType: blob.type || '',
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-2. 抠图状态（契约 §2） ---------------- */
  /* 依赖内部符号：state.key / state.key.adv / state.keyed / state.masked / state.frames /
     keyHex / keyRequestParams / getSelectedIndices */
  async function keyState() {
    try {
      if (!state.key || !state.key.adv) return fail('未接通: state.key.adv');
      const k = state.key, a = k.adv;
      const mode = k.mode === 'advanced' ? 'advanced' : 'classic';
      return {
        ok: true,
        enabled: !!k.enabled,
        mode,
        keyedCount: state.keyed ? state.keyed.size : 0,
        maskedCount: state.masked ? state.masked.size : 0,
        frameCount: state.frames.length,
        selectedCount: typeof getSelectedIndices === 'function' ? getSelectedIndices().length : 0,
        params: {
          colorHex: typeof keyHex === 'function' ? keyHex() : null,
          /* intensity / feather / cleanup 是经典档的三个滑块；智能档另见 advIntensity / advFeather */
          intensity: k.intensity,
          feather: k.feather,
          cleanup: k.cleanup,
          softness: a.softness,
          despill: a.despill,
          greenToAlpha: a.greenToAlpha,
          aggressive: !!a.despillAggr,
          autoPlate: !!k.autoPlate,
          advIntensity: a.intensity,
          advFeather: a.feather,
          /* 真正会发给 /api/key 的那一个强度（决定「哪个滑块真的在起作用」） */
          effectiveIntensity: mode === 'advanced' ? a.intensity : k.intensity,
        },
        /* 与 keyParams() 的 request 字段同源，排查参数映射用 */
        request: typeof keyRequestParams === 'function' ? keyRequestParams() : null,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-3. 四边带取色（契约 §3） ---------------- */
  /* 依赖内部符号：state.frames / state.trim.alphaThreshold / effectiveFrame / frameIndex
     说明：纯读取，不改 state.key；要落地请把返回的 keyColor 传给 setKeyParams({colorHex}) */
  async function probeColor(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (typeof effectiveFrame !== 'function') return fail('未接通: effectiveFrame');
      const i = frameIndex(o.frame);
      const f = effectiveFrame(i);
      const w = f.width, h = f.height;
      const defBand = Math.max(4, Math.round(Math.min(w, h) * 0.03));
      const maxBand = Math.max(1, Math.floor(Math.min(w, h) / 4));
      const band = clampv(Math.round(num(o.bandPx, defBand)) || defBand, 1, maxBand);
      const ALPHA_THR = 8;
      const ctx = f.getContext('2d');
      const edges = [
        { edge: 'left', x: 0, y: 0, w: band, h },
        { edge: 'right', x: Math.max(0, w - band), y: 0, w: band, h },
        { edge: 'top', x: 0, y: 0, w, h: band },
        { edge: 'bottom', x: 0, y: Math.max(0, h - band), w, h: band },
      ];
      const median = (arr) => {
        if (!arr.length) return null;
        const s = arr.slice().sort((p, q) => p - q);
        const m = s.length >> 1;
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
      };
      const samples = edges.map((e) => {
        const d = ctx.getImageData(e.x, e.y, e.w, e.h).data;
        const n = e.w * e.h;
        const rs = [], gs = [], bs = [];
        let opaque = 0;
        for (let p = 0; p < n; p++) {
          if (d[p * 4 + 3] <= ALPHA_THR) continue;
          opaque++;
          rs.push(d[p * 4]); gs.push(d[p * 4 + 1]); bs.push(d[p * 4 + 2]);
        }
        const rgb = rs.length ? [median(rs), median(gs), median(bs)] : null;
        return {
          edge: e.edge,
          rgb,
          alphaRatio: n ? r3(opaque / n) : 0,
          bandPx: band,
          pixels: n,
          rect: { x: e.x, y: e.y, w: e.w, h: e.h },
        };
      });
      const rejectedByAlpha = samples.filter((s) => s.alphaRatio > 0.5).map((s) => s.edge);
      let kept = samples.filter((s) => s.alphaRatio <= 0.5 && s.rgb);
      let fallback = '';
      if (!kept.length) {
        /* 四边都被判「主体压边」。典型情况：原生视频帧没有 alpha 通道，四边 alphaRatio 全是 1，
           alpha 判据根本区分不了 —— 这时改用「四边中位色是否互相接近」当兜底：
           颜色一致 = 同一片背景，四边一起参与中位色；不一致就只留最接近的那一组。
           注意 rejected 只列「最终没参与取色」的边，alpha 判定的原文留在 rejectedByAlpha。 */
        const pool = samples.filter((s) => s.rgb);
        if (!pool.length) return fail('四边都没有不透明像素可采样（先检查帧内容）');
        const AGREE = 24;   // 通道差 ≤ 24 视为同一片背景
        let bestGroup = null, bestScore = -Infinity;
        for (const s of pool) {
          const group = pool.filter((q) => Math.max(
            Math.abs(q.rgb[0] - s.rgb[0]), Math.abs(q.rgb[1] - s.rgb[1]), Math.abs(q.rgb[2] - s.rgb[2]),
          ) <= AGREE);
          const spreadSum = group.reduce((acc, q) => acc + Math.abs(q.rgb[0] - s.rgb[0]) + Math.abs(q.rgb[1] - s.rgb[1]) + Math.abs(q.rgb[2] - s.rgb[2]), 0);
          const score = group.length * 1000 - spreadSum;
          if (score > bestScore) { bestScore = score; bestGroup = group; }
        }
        kept = bestGroup;
        fallback = 'all-edges-rejected';
      }
      const usedEdges = kept.map((s) => s.edge);
      const rejected = samples.filter((s) => s.rgb && usedEdges.indexOf(s.edge) < 0).map((s) => s.edge);
      const keyColor = [
        median(kept.map((s) => s.rgb[0])),
        median(kept.map((s) => s.rgb[1])),
        median(kept.map((s) => s.rgb[2])),
      ];
      let spread = 0;
      for (let c = 0; c < 3; c++) {
        const vals = kept.map((s) => s.rgb[c]);
        spread = Math.max(spread, (Math.max.apply(null, vals) - Math.min.apply(null, vals)) / 255);
      }
      return {
        ok: true,
        frame: i,
        keyColor: rgbHex(keyColor),
        spread: Math.round(spread * 10000) / 10000,
        samples,
        rejected,
        rejectedByAlpha,
        fallback,
        /* 'alpha-band' = 按 alpha 剔除压边后取存活边；'color-median' = 四边全不透明，
           改走跨边颜色中位数（这时 rejected 一定为空，rejectedByAlpha 保留原始判定） */
        method: fallback ? 'color-median' : 'alpha-band',
        bandPx: band,
        alphaThreshold: ALPHA_THR,
        kept: usedEdges,
        source: 'effectiveFrame（抠图/去水印之后的帧；没抠图时就是原帧）',
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-4. 量尺寸（契约 §4） ---------------- */
  /* 依赖内部符号：state.frames / state.keyed / state.trim.alphaThreshold / alphaBBox / frameIndex
     ★ source 默认 'keyed'：原帧整幅不透明，量原帧只会得到整幅 bbox（contentHeight = 帧高），
       那会把 scaleTo 的「内容物高度」算成整幅，角色被缩成整幅的几分之一。 */
  async function measure(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (typeof alphaBBox !== 'function') return fail('未接通: alphaBBox');
      const beta = has(o, 'alphaThreshold')
        ? clampv(Math.round(num(o.alphaThreshold, state.trim.alphaThreshold)), 0, 255)
        : (state.trim.alphaThreshold | 0);
      const t0 = nowMs();
      const all = String(o.frame) === 'all';

      /* source：'keyed'（默认）→ state.keyed 里有就用抠图结果，没有退回原帧；'raw' → 强制原帧。
         原帧整幅不透明，量出来的 bbox 永远是整幅，拿它当「内容物高度」会把角色缩成整幅的几分之一。 */
      const wantRaw = String(o.source || 'keyed') === 'raw';
      if (!wantRaw && o.source != null && String(o.source) !== 'keyed') {
        return fail("source 只支持 'keyed' / 'raw'（收到 " + o.source + '）');
      }
      const pickFrame = (idx) => (wantRaw ? state.frames[idx] : (state.keyed && state.keyed.has(idx) ? state.keyed.get(idx) : state.frames[idx]));
      let usedKeyed = 0, usedRaw = 0;
      const noteSource = (idx) => { if (!wantRaw && state.keyed && state.keyed.has(idx)) usedKeyed++; else usedRaw++; };
      const srcLabel = () => {
        if (wantRaw) return 'raw';
        if (usedKeyed && usedRaw) return 'mixed';
        return usedKeyed ? 'keyed' : 'raw';
      };
      const areaRatio = (bb, f) => {
        const A = f.width * f.height;
        return A > 0 ? Math.round((((bb.x1 - bb.x0) * (bb.y1 - bb.y0)) / A) * 10000) / 10000 : 0;
      };

      if (all) {
        const n = state.frames.length;
        let u = null;
        const tops = [], soles = [];
        let empty = 0, counted = 0;
        for (let i = 0; i < n; i++) {
          const f = pickFrame(i);
          const bb = boxOfFrame(f, beta);
          if (!bb) { empty++; continue; }
          noteSource(i);
          counted++;
          tops.push(bb.y0);
          soles.push(bb.y1 - 1);
          if (!u) u = { x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1 };
          else {
            u.x0 = Math.min(u.x0, bb.x0); u.y0 = Math.min(u.y0, bb.y0);
            u.x1 = Math.max(u.x1, bb.x1); u.y1 = Math.max(u.y1, bb.y1);
          }
        }
        if (!u) return fail('所有帧都没有 α > ' + beta + ' 的像素（先抠图，或把 alphaThreshold 调低）');
        const f0 = pickFrame(0);
        return {
          ok: true,
          frame: 'all',
          width: f0.width,
          height: f0.height,
          alphaBBox: u,
          contentHeight: u.y1 - u.y0,
          contentWidth: u.x1 - u.x0,
          bboxAreaRatio: areaRatio(u, f0),
          alphaThreshold: beta,
          source: srcLabel(),
          keyedFrames: usedKeyed,
          rawFrames: usedRaw,
          frames: counted,
          emptyFrames: empty,
          perFrameSpread: {
            frames: counted,
            topY: { min: Math.min.apply(null, tops), max: Math.max.apply(null, tops) },
            soleY: { min: Math.min.apply(null, soles), max: Math.max.apply(null, soles) },
            bboxUnion: { x0: u.x0, y0: u.y0, x1: u.x1, y1: u.y1 },
          },
          space: 'frame',
          costMs: Math.round(nowMs() - t0),
        };
      }

      const i = frameIndex(o.frame);
      const f = pickFrame(i);
      noteSource(i);
      const bb = boxOfFrame(f, beta);
      if (!bb) return fail('该帧没有 α > ' + beta + ' 的像素（先抠图，或把 alphaThreshold 调低）');

      let landmarksOut = null;
      if (Array.isArray(o.landmarks) && o.landmarks.length) {
        const F = f;
        let cache = null;
        const pixels = () => {
          if (!cache) cache = F.getContext('2d').getImageData(0, 0, F.width, F.height);
          return cache;
        };
        const midX = Math.round((bb.x0 + bb.x1 - 1) / 2);
        const midY = Math.round((bb.y0 + bb.y1 - 1) / 2);
        landmarksOut = o.landmarks.map((L) => {
          const item = (L && typeof L === 'object') ? L : {};
          const id = String(item.id == null ? '' : item.id);
          const type = String(item.type == null ? '' : item.type);
          if (type === 'bbox-top') return { id, type, px: midX, py: bb.y0, value: bb.y0, confidence: 1 };
          if (type === 'bbox-bottom') return { id, type, px: midX, py: bb.y1 - 1, value: bb.y1 - 1, confidence: 1 };
          if (type === 'bbox-left') return { id, type, px: bb.x0, py: midY, value: bb.x0, confidence: 1 };
          if (type === 'bbox-right') return { id, type, px: bb.x1 - 1, py: midY, value: bb.x1 - 1, confidence: 1 };
          if (type === 'point') {
            if (!has(item, 'x') || !has(item, 'y')) throw new Error('landmark ' + id + '（point）需要 x / y');
            const px = Math.round(num(item.x, 0));
            const py = Math.round(num(item.y, 0));
            return {
              id, type, px, py, confidence: 1,
              inside: px >= 0 && py >= 0 && px < F.width && py < F.height,
            };
          }
          if (type === 'scan-vertical') {
            if (!has(item, 'x')) throw new Error('landmark ' + id + '（scan-vertical）需要 x');
            const px = clampv(Math.round(num(item.x, 0)), 0, F.width - 1);
            const fromY = clampv(Math.round(num(item.fromY, 0)), 0, F.height - 1);
            const toY = clampv(Math.round(num(item.toY, F.height - 1)), fromY, F.height - 1);
            const lthr = has(item, 'alphaThreshold')
              ? clampv(Math.round(num(item.alphaThreshold, beta)), 0, 255)
              : beta;
            const d = pixels().data;
            let hit = -1;
            for (let y = fromY; y <= toY; y++) {
              if (d[(y * F.width + px) * 4 + 3] > lthr) { hit = y; break; }
            }
            if (hit < 0) {
              return { id, type, px: null, py: null, confidence: 0, column: px, fromY, toY, alphaThreshold: lthr };
            }
            let run = 0;
            for (let y = hit; y <= toY; y++) {
              if (d[(y * F.width + px) * 4 + 3] > lthr) run++; else break;
            }
            /* confidence = 命中点往下这一列「连续不透明」的比例（toY 为分母） */
            const conf = r3(clampv(run / Math.max(1, toY - hit + 1), 0, 1));
            return { id, type, px, py: hit, confidence: conf, column: px, run, fromY, toY, alphaThreshold: lthr };
          }
          throw new Error('未知的 landmarks 类型：' + (type || '(空)'));
        });
      }

      return {
        ok: true,
        frame: i,
        width: f.width,
        height: f.height,
        alphaBBox: bb,
        contentHeight: bb.y1 - bb.y0,
        contentWidth: bb.x1 - bb.x0,
        bboxAreaRatio: areaRatio(bb, f),
        alphaThreshold: beta,
        source: srcLabel(),
        keyedFrame: !wantRaw && !!(state.keyed && state.keyed.has(i)),
        landmarks: landmarksOut,
        space: 'frame',
        costMs: Math.round(nowMs() - t0),
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-5. 调试叠加图（契约 §5） ---------------- */
  /* 依赖内部符号：state.frames / frameIndex / effectiveFrame */
  async function overlay(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (typeof effectiveFrame !== 'function') return fail('未接通: effectiveFrame');
      const i = frameIndex(o.frame);
      const src = effectiveFrame(i);
      const S = clampv(Math.round(num(o.pixelScale, 1)), 1, 8);
      const lines = Array.isArray(o.lines) ? o.lines : [];
      const texts = Array.isArray(o.texts) ? o.texts : [];
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(src.width * S));
      c.height = Math.max(1, Math.round(src.height * S));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;         /* 放大看像素时保持最近邻，坐标才对得上 */
      ctx.drawImage(src, 0, 0, c.width, c.height);

      const lw = Math.max(1, Math.round(S));
      lines.forEach((L) => {
        const item = (L && typeof L === 'object') ? L : {};
        const x0 = Math.round(num(item.x0, 0) * S);
        const y0 = Math.round(num(item.y0, 0) * S);
        const x1 = Math.round(num(item.x1, 0) * S);
        const y1 = Math.round(num(item.y1, 0) * S);
        const color = String(item.color || '#ff2d55');
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        /* 端点点一下，避免细线在缩略图里看不见 */
        ctx.fillStyle = color;
        const dot = Math.max(1, Math.round(lw * 1.5));
        ctx.fillRect(x0 - dot / 2, y0 - dot / 2, dot, dot);
        ctx.fillRect(x1 - dot / 2, y1 - dot / 2, dot, dot);
        if (item.label) {
          const tx = Math.min(c.width - 4, Math.round((x0 + x1) / 2));
          const ty = clampv(Math.round((y0 + y1) / 2) - (4 + Math.round(9 * S)), 2, c.height - 2);
          ctx.font = Math.round(11 * S) + 'px Consolas, monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(tx, ty, ctx.measureText(String(item.label)).width + 4, Math.round(13 * S));
          ctx.fillStyle = color;
          ctx.fillText(String(item.label), tx + 2, ty + 1);
        }
      });
      texts.forEach((T) => {
        const item = (T && typeof T === 'object') ? T : {};
        const x = Math.round(num(item.x, 0) * S);
        const y = Math.round(num(item.y, 0) * S);
        const color = String(item.color || '#00e5ff');
        ctx.font = Math.round(12 * S) + 'px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x, y, ctx.measureText(String(item.text || '')).width + 4, Math.round(14 * S));
        ctx.fillStyle = color;
        ctx.fillText(String(item.text || ''), x + 2, y + 1);
      });

      return {
        ok: true,
        dataURL: c.toDataURL('image/png'),
        width: c.width,
        height: c.height,
        frame: i,
        pixelScale: S,
        lines: lines.length,
        texts: texts.length,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-6. 锚点读写（契约 §6） ---------------- */
  /* 依赖内部符号：state.anchor / state.frames / anchorCurrent / effectiveFrame /
     anchorProcessedFrame / renderAnchorPreview / markDirty / el('anchorXNum' 等) */
  function anchorCellFrame() {
    if (typeof anchorCurrent !== 'function' || typeof anchorProcessedFrame !== 'function') return null;
    const idx = anchorCurrent();
    if (idx < 0) return null;
    const raw = typeof effectiveFrame === 'function' ? effectiveFrame(idx) : state.frames[idx];
    const f = anchorProcessedFrame(idx, raw);
    return f ? { idx, frame: f, raw } : null;
  }

  async function getAnchor() {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (!state.anchor) return fail('未接通: state.anchor');
      const cell = anchorCellFrame();
      if (!cell) return fail('当前没有可预览的帧（先在帧列表里勾选）');
      const ax = clampv(num(state.anchor.x, 0.5), 0, 1);
      const ay = clampv(num(state.anchor.y, 0), 0, 1);
      const W = cell.frame.width, H = cell.frame.height;
      return {
        ok: true,
        anchorX: ax,
        anchorY: ay,
        convention: 'y-from-bottom',
        pixels: { x: Math.round(ax * W), y: Math.round(ay * H) },
        frameWidth: W,
        frameHeight: H,
        /* 锚点量的永远是「裁切+最小化+缩放之后的最终格」（与 meta.json 同口径），
           所以 pixel 空间是 cell；原帧尺寸另给，方便调用方换算 */
        space: 'cell',
        rawFrameWidth: cell.raw ? cell.raw.width : null,
        rawFrameHeight: cell.raw ? cell.raw.height : null,
        frame: cell.idx,
        confirmed: !!state.anchor.confirmed,
      };
    } catch (e) {
      return fail(e);
    }
  }

  async function setAnchorPx(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (!state.anchor) return fail('未接通: state.anchor');
      if (typeof renderAnchorPreview !== 'function') return fail('未接通: renderAnchorPreview');
      const cell = anchorCellFrame();
      if (!cell) return fail('当前没有可预览的帧（先在帧列表里勾选）');
      const W = cell.frame.width, H = cell.frame.height;
      if (!has(o, 'x') && !has(o, 'y')) return fail('至少要给 x 或 y（帧像素）');
      const convention = String(o.convention || 'y-from-bottom') === 'y-from-top' ? 'y-from-top' : 'y-from-bottom';
      let ax = state.anchor.x, ay = state.anchor.y;
      if (has(o, 'x')) {
        const px = Number(o.x);
        if (!Number.isFinite(px)) return fail('x 需要是数字');
        ax = clampv(px / W, 0, 1);
      }
      if (has(o, 'y')) {
        const py = Number(o.y);
        if (!Number.isFinite(py)) return fail('y 需要是数字');
        ay = convention === 'y-from-top' ? clampv(1 - py / H, 0, 1) : clampv(py / H, 0, 1);
      }
      state.anchor.x = ax;
      state.anchor.y = ay;
      state.anchor.confirmed = true;
      renderAnchorPreview();
      /* renderAnchorPreview 会跳过 activeElement 的输入框，这里再补一次，保证 UI 与 state 一致 */
      const xs = ax.toFixed(3), ys = ay.toFixed(3);
      const setV = (id, v) => { const e = el(id); if (e) e.value = v; };
      setV('anchorXNum', xs); setV('anchorYNum', ys);
      setV('anchorXRange', ax); setV('anchorYRange', ay);
      const setT = (id, v) => { const e = el(id); if (e) e.textContent = ' ' + v; };
      setT('anchorXVal', xs); setT('anchorYVal', ys);
      if (typeof markDirty === 'function') {
        try { markDirty('代理设锚点(px)'); } catch (_) { /* 增强项，失败不影响定位 */ }
      }
      const pxBack = convention === 'y-from-top' ? Math.round((1 - ay) * H) : Math.round(ay * H);
      return {
        ok: true,
        anchorX: state.anchor.x,
        anchorY: state.anchor.y,
        convention,
        /* pixels.y 用入参口径回显（y-from-top 时就是从顶往下），闭环才能对得上 */
        pixels: { x: Math.round(ax * W), y: pxBack },
        pixelsFromBottom: { x: Math.round(ax * W), y: Math.round(ay * H) },
        frameWidth: W,
        frameHeight: H,
        space: 'cell',
        rawFrameWidth: cell.raw ? cell.raw.width : null,
        rawFrameHeight: cell.raw ? cell.raw.height : null,
        frame: cell.idx,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-7. 反推缩放（契约 §7） ---------------- */
  /* 依赖内部符号：state.frames / ensureSelection / getSelectedFrames / getCropRect / getTrimBBox /
     alphaBBox / applyOutScale / computeCell / renderRuler / updateMeasureInfo / el('outScale') */
  async function scaleTo(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (typeof applyOutScale !== 'function') return fail('未接通: applyOutScale');
      ensureSelection();
      const sel = getSelectedFrames();
      if (!sel.length) return fail('没有可测量的帧');
      const f = sel[0];
      const crop = getCropRect(f.width, f.height);
      const tb = getTrimBBox();
      const sw = tb ? tb.w : crop.w;
      const sh = tb ? tb.h : crop.h;
      if (sh <= 0) return fail('源帧高度为 0');

      const span = (o.span && typeof o.span === 'object') ? o.span : null;
      let sourcePx = 0, wanted = null, auto = false, spanInfo = null, target = null;

      if (span) {
        const fromY = Number(span.fromY), toY = Number(span.toY);
        if (!Number.isFinite(fromY) || !Number.isFinite(toY)) return fail('span.fromY / span.toY 需要是数字（帧像素）');
        const a = Math.min(fromY, toY), b = Math.max(fromY, toY);
        const spanPx = Math.round(b - a) + 1;      /* 含端点 */
        sourcePx = spanPx;
        /* 裁切/最小化都是 1:1 取样，所以帧坐标里的 N 像素 = 格源里的 N 像素；
           只提示 span 是否超出格源范围（超了内容会被格子裁掉） */
        const cellTop = crop.y + (tb ? tb.y : 0);
        const cellBottom = cellTop + sh;
        spanInfo = {
          fromY: Math.round(a),
          toY: Math.round(b),
          px: spanPx,
          outsideCell: Math.round(a) < cellTop || Math.round(b) >= cellBottom,
        };
        if (has(o, 'charHeightPx')) target = Number(o.charHeightPx);
      } else if (has(o, 'targetCellHeight')) {
        const t = Number(o.targetCellHeight);
        if (!Number.isFinite(t) || t <= 0) return fail('targetCellHeight 需要 > 0');
        target = t;
        sourcePx = sh;                              /* 旧语义：整格高 */
        spanInfo = { mode: 'cell', px: sh };
      } else {
        /* 三者都不给 → 首帧 alphaBBox 高（v1 measureScale 的自动分支） */
        const probe = document.createElement('canvas');
        probe.width = sw; probe.height = sh;
        probe.getContext('2d').drawImage(f, crop.x + (tb ? tb.x : 0), crop.y + (tb ? tb.y : 0), sw, sh, 0, 0, sw, sh);
        const bb = typeof alphaBBox === 'function' ? alphaBBox(probe, state.trim.alphaThreshold) : null;
        if (!bb) return fail('没找到非透明内容，无法自动测高（先抠图或调低极淡像素阈值）');
        sourcePx = bb.h;
        auto = true;
        state.measure.top = clampv(bb.y / sh, 0, 1);
        state.measure.bottom = clampv((bb.y + bb.h) / sh, 0, 1);
        state.measure.marking = null;
        spanInfo = { mode: 'auto', px: bb.h, contentY0: bb.y, contentY1: bb.y + bb.h - 1 };
      }

      let scale = num(el('outScale') && el('outScale').value, state.out.scale || 100);
      let clamped = false;
      if (target != null && Number.isFinite(target) && target > 0) {
        if (sourcePx <= 0) return fail('内容物高度为 0，无法反推比例');
        wanted = Math.round((target * 100 / sourcePx) * 100) / 100;
        scale = clampv(wanted, 1, 300);             /* 工具自身缩放上限 1~300% */
        clamped = Math.abs(scale - wanted) > 0.01;
        applyOutScale(scale, true);
      } else if (target != null) {
        return fail('目标高度需要 > 0');
      }

      const applied = num(el('outScale') && el('outScale').value, scale);
      const cell = typeof computeCell === 'function' ? computeCell() : null;
      if (typeof renderRuler === 'function') renderRuler();
      if (typeof updateMeasureInfo === 'function') updateMeasureInfo();
      return {
        ok: true,
        scale: applied,
        wantedScale: wanted,
        clamped,
        sourcePx: Math.round(sourcePx),
        achievedPx: Math.round(sourcePx * applied / 100),
        cellW: cell ? cell.w : 0,
        cellH: cell ? cell.h : 0,
        frameW: f.width,
        frameH: f.height,
        cellSource: { w: sw, h: sh },
        targetPx: target != null && Number.isFinite(target) ? target : null,
        auto,
        span: spanInfo,
        scaleSource: 'outScale',
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-8. 裁剪（契约 §8） ---------------- */
  /* 依赖内部符号：state.frames / state.trim / ensureSelection / getSelectedFrames / getSelectedIndices /
     getCropRect / alphaBBox / computeTrimCore / applyTrimResult / refreshEditPreviews /
     updateSelCount / refreshOutput / updateTabs / el('trimPad*') / el('trimAlpha*') / setChecked */
  async function trim(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (typeof computeTrimCore !== 'function' || typeof applyTrimResult !== 'function') {
        return fail('未接通: computeTrimCore / applyTrimResult');
      }
      const modeIn = o.mode == null ? 'union' : String(o.mode);
      if (modeIn !== 'union' && modeIn !== 'first-frame') return fail('mode 只支持 union / first-frame（收到 ' + modeIn + '）');

      /* pad 必须先落进 state.trim.pad：applyTrimResult 读的就是它，返回值里要能对账 */
      const padIn = (o.pad && typeof o.pad === 'object') ? o.pad : {};
      const pad = state.trim.pad;
      pad.top = clampv(Math.round(num(padIn.top, 2)), 0, 200);
      pad.bottom = clampv(Math.round(num(padIn.bottom, 2)), 0, 200);
      pad.left = clampv(Math.round(num(padIn.left, 2)), 0, 200);
      pad.right = clampv(Math.round(num(padIn.right, 2)), 0, 200);
      const setV = (id, v) => { const e = el(id); if (e) e.value = v; };
      setV('trimPadTop', pad.top); setV('trimPadBottom', pad.bottom);
      setV('trimPadLeft', pad.left); setV('trimPadRight', pad.right);

      if (has(o, 'alphaThreshold')) {
        const t = clampv(Math.round(num(o.alphaThreshold, state.trim.alphaThreshold)), 0, 255);
        state.trim.alphaThreshold = t;
        setV('trimAlpha', t); setV('trimAlphaNum', t);
      }
      const thr = state.trim.alphaThreshold | 0;

      /* union 模式永远对**全部帧**求并集（不看当前选择）：抽帧后默认只选中第 0 帧，
         按选择求并集会把「最小化」变成「只按首帧裁」，和 union 的语义正好相反。
         first-frame 则固定只用第 0 帧。 */
      const allFrames = state.frames.map((_, i) => (typeof effectiveFrame === 'function' ? effectiveFrame(i) : state.frames[i]));
      if (!allFrames.length) return fail('没有可扫描的帧');
      const refFrame = allFrames[0];

      const bboxOfCanvasInCrop = (frame) => {
        const crop = getCropRect(frame.width, frame.height);
        const c = document.createElement('canvas');
        c.width = crop.w; c.height = crop.h;
        c.getContext('2d').drawImage(frame, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        const b = alphaBBox(c, thr);
        return b ? { x: b.x, y: b.y, x2: b.x + b.w - 1, y2: b.y + b.h - 1, w: b.w, h: b.h } : null;
      };

      setBusy('正在扫描透明边缘（' + modeIn + '）…', true);
      await sleep(24);
      let u = null, unionFrames = 0, firstFrameBox = null;
      try {
        firstFrameBox = bboxOfCanvasInCrop(refFrame);
        if (modeIn === 'union') {
          u = computeTrimCore(allFrames);
          unionFrames = allFrames.length;
        } else {
          u = firstFrameBox;
          unionFrames = 1;
        }
      } finally {
        setBusy(null, false);
      }

      if (!u) {
        state.trim.enabled = false;
        setChecked('trimEnabled', false);
        try { applyTrimResult(null, refFrame, true); } catch (_) { /* ignore */ }
        return fail('没有 α > ' + thr + ' 的像素，无法裁剪（先抠图，或把 alphaThreshold 调低）');
      }

      applyTrimResult(u, refFrame, true);
      /* 「应用」= 真的勾上启用，否则 getTrimBBox() 返回 null，拼图不会体现 */
      state.trim.enabled = true;
      setChecked('trimEnabled', true);
      refreshEditPreviews();
      if (typeof updateSelCount === 'function') updateSelCount();
      try { await refreshOutput(); } catch (_) { /* 输出页刷新不是硬要求 */ }
      if (typeof updateTabs === 'function') updateTabs();

      const crop = getCropRect(refFrame.width, refFrame.height);
      const box = rectOf(state.trim.bbox);
      const toFrame = (b) => (b ? { x: crop.x + b.x, y: crop.y + b.y, w: b.w, h: b.h } : null);
      return {
        ok: true,
        mode: modeIn,
        box,
        pad: { top: pad.top, bottom: pad.bottom, left: pad.left, right: pad.right },
        alphaThreshold: thr,
        unionFrames,
        firstFrameBox: firstFrameBox ? { x: firstFrameBox.x, y: firstFrameBox.y, w: firstFrameBox.w, h: firstFrameBox.h } : null,
        /* box / firstFrameBox 都是「裁切之后、缩放之前」的格源坐标（与 v1 computeTrim 一致）；
           *InFrame 是加上裁切偏移后的原帧坐标，方便和 measure() 的 bbox 直接比 */
        boxInFrame: toFrame(box),
        firstFrameBoxInFrame: toFrame(firstFrameBox ? { x: firstFrameBox.x, y: firstFrameBox.y, w: firstFrameBox.w, h: firstFrameBox.h } : null),
        cropOffset: { x: crop.x, y: crop.y },
        coordSpace: 'crop',
        enabled: true,
        frames: allFrames.length,
        /* union 模式看全量帧；first-frame 只看第 0 帧（unionFrames 同名但含义见 mode） */
        scannedFrames: unionFrames,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-9. 固定角标（水印）检测（契约 §9） ---------------- */
  /* 依赖内部符号：state.frames（原帧）/ state.keyed / state.trim.alphaThreshold / alphaBBox —
     注意**不用** effectiveFrame：半透明角标常常连绿幕一起被抠掉（这类素材实测如此），
     用它当输入会「看不见」角标，所以颜色与稳定性一律看原帧。
     做法：
       ① 均匀采样若干帧 → 「跨帧颜色几乎不变 + 不透明」= 静态层；
       ② 用 16×16 块中位色当局部背景，只保留「相对局部背景有明显对比」的静态像素
          （背景渐变会被块中位色跟踪掉，留下的才是压在上面的东西，例如半透明角标）；
       ③ 以 2px 膨胀做连通块 —— 一个角标（胶囊 + 文字）是一个块，避免把两个不相干的东西
          的并集当成一个矩形；
       ④ 每块按「候选像素数 + 尺寸 + 长宽比」过滤（角标是宽扁的小块），每角只取最大那块，
          再排除抠图结果 alpha 并集（主体）里的块；
       ⑤ confidence = 该矩形在采样帧里的稳定比例（各帧最小值，保守）。 */
  async function detectWatermark(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const n = state.frames.length;
      if (!n) return fail('还没有帧，先 extract()');
      if (n < 2) return fail('至少需要 2 帧才能判断「固定」角标');
      const t0 = nowMs();
      const thr = state.trim.alphaThreshold | 0;
      const tol = clampv(Math.round(num(o.colorTolerance, 12)), 1, 60);
      const contrast = clampv(Math.round(num(o.contrast, 24)), 4, 120);
      const minPixels = clampv(Math.round(num(o.minPixels, 100)), 4, 20000);
      const minW = clampv(Math.round(num(o.minWidth, 16)), 2, 400);
      const minH = clampv(Math.round(num(o.minHeight, 10)), 2, 400);
      const maxRects = clampv(Math.round(num(o.maxRects, 4)), 1, 8);
      const want = clampv(Math.round(num(o.frames, 8)), 2, Math.min(24, n));

      const idxs = [];
      for (let k = 0; k < want; k++) {
        const t = Math.round(k * (n - 1) / (want - 1));
        if (idxs.indexOf(t) < 0) idxs.push(t);
      }
      const imgs = idxs.map((i) => {
        const f = state.frames[i];
        const d = f.getContext('2d').getImageData(0, 0, f.width, f.height);
        return { w: d.width, h: d.height, data: d.data };
      });
      const w = imgs[0].w, h = imgs[0].h;
      for (let k = 1; k < imgs.length; k++) {
        if (imgs[k].w !== w || imgs[k].h !== h) {
          return fail('采样帧尺寸不一致（' + w + '×' + h + ' vs ' + imgs[k].w + '×' + imgs[k].h + '）');
        }
      }
      const S = imgs.length;
      const total = w * h;
      const ref = imgs[0].data;

      /* ① 静态层 */
      const stable = new Uint8Array(total);
      for (let p = 0, q = 0; p < total; p++, q += 4) {
        let ok = true;
        for (let k = 0; k < S; k++) {
          const d = imgs[k].data;
          if (d[q + 3] <= thr) { ok = false; break; }
          if (k > 0 && (Math.abs(d[q] - ref[q]) > tol || Math.abs(d[q + 1] - ref[q + 1]) > tol || Math.abs(d[q + 2] - ref[q + 2]) > tol)) { ok = false; break; }
        }
        if (ok) stable[p] = 1;
      }

      /* ② 局部背景（16×16 块内稳定像素的中位色）+ 候选像素 */
      const BLK = 16;
      const bw = Math.ceil(w / BLK), bh = Math.ceil(h / BLK);
      const blkR = new Int16Array(bw * bh), blkG = new Int16Array(bw * bh), blkB = new Int16Array(bw * bh);
      const hasBlk = new Uint8Array(bw * bh);
      for (let by = 0; by < bh; by++) {
        for (let bx = 0; bx < bw; bx++) {
          const rs = [], gs = [], bs = [];
          const xEnd = Math.min(w, (bx + 1) * BLK), yEnd = Math.min(h, (by + 1) * BLK);
          for (let y = by * BLK; y < yEnd; y++) {
            for (let x = bx * BLK; x < xEnd; x++) {
              if (!stable[y * w + x]) continue;
              const q = (y * w + x) * 4;
              rs.push(ref[q]); gs.push(ref[q + 1]); bs.push(ref[q + 2]);
            }
          }
          if (rs.length < 8) continue;
          const med = (arr) => {
            const s2 = arr.slice().sort((p, q2) => p - q2);
            const m = s2.length >> 1;
            return s2.length % 2 ? s2[m] : Math.round((s2[m - 1] + s2[m]) / 2);
          };
          const bi = by * bw + bx;
          blkR[bi] = med(rs); blkG[bi] = med(gs); blkB[bi] = med(bs);
          hasBlk[bi] = 1;
        }
      }
      const cand = new Uint8Array(total);
      let candTotal = 0;
      for (let y = 0; y < h; y++) {
        const byRow = (y / BLK) | 0;
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          if (!stable[p]) continue;
          const bi = byRow * bw + ((x / BLK) | 0);
          if (!hasBlk[bi]) continue;
          const q = p * 4;
          const dmax = Math.max(Math.abs(ref[q] - blkR[bi]), Math.abs(ref[q + 1] - blkG[bi]), Math.abs(ref[q + 2] - blkB[bi]));
          if (dmax >= contrast) { cand[p] = 1; candTotal++; }
        }
      }

      /* ③ 连通块：候选 mask 膨胀 2px 后 8 邻域连通（胶囊的边框与文字才会连成一块） */
      const DIL = 2;
      const dil = new Uint8Array(total);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!cand[y * w + x]) continue;
          const y0 = Math.max(0, y - DIL), y1 = Math.min(h - 1, y + DIL);
          const x0 = Math.max(0, x - DIL), x1 = Math.min(w - 1, x + DIL);
          for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) dil[yy * w + xx] = 1;
        }
      }
      const seen = new Uint8Array(total);
      const stack = new Int32Array(total);
      const comps = [];
      for (let p = 0; p < total; p++) {
        if (!dil[p] || seen[p]) continue;
        let sp = 0;
        stack[sp++] = p; seen[p] = 1;
        let x0 = w, y0 = h, x1 = -1, y1 = -1, candPixels = 0;
        while (sp > 0) {
          const q = stack[--sp];
          const x = q % w, y = (q - x) / w;
          if (cand[q]) {
            candPixels++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              const r2 = yy * w + xx;
              if (!dil[r2] || seen[r2]) continue;
              seen[r2] = 1; stack[sp++] = r2;
            }
          }
        }
        if (candPixels <= 0) continue;
        comps.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, candPixels });
      }

      /* 主体排除框：抠图结果的 alpha 并集（没有 keyed 结果就不排除） */
      let body = null;
      if (state.keyed && state.keyed.size && typeof alphaBBox === 'function') {
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (const i of idxs) {
          const c = state.keyed.get(i);
          if (!c) continue;
          const bb = alphaBBox(c, thr);
          if (!bb) continue;
          x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y);
          x1 = Math.max(x1, bb.x + bb.w); y1 = Math.max(y1, bb.y + bb.h);
        }
        if (x1 > x0) body = { x0, y0, x1, y1 };
      }

      const cornerOf = (r) => {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        return (cy < h / 2 ? 't' : 'b') + (cx < w / 2 ? 'l' : 'r');
      };
      const perCorner = { tl: 0, tr: 0, bl: 0, br: 0 };
      const keep = [];
      for (const c of comps) {
        if (c.candPixels < minPixels) continue;
        if (c.w < minW || c.h < minH) continue;
        /* 角标是宽扁的：细长竖条基本是背景边缘/主体轮廓 */
        if (c.w / c.h < 1.0) continue;
        /* 和主体 bbox 重叠 > 40% → 是角色的一部分，不是角标（只看「完全在框内」不够：
           角色静止时脚/身体会有一大块稳定，而框底那几行是溢出来的） */
        if (body) {
          const ox = Math.max(0, Math.min(c.x + c.w, body.x1) - Math.max(c.x, body.x0));
          const oy = Math.max(0, Math.min(c.y + c.h, body.y1) - Math.max(c.y, body.y0));
          if (ox * oy / (c.w * c.h) > 0.4) continue;
        }
        const corner = cornerOf(c);
        perCorner[corner]++;
        keep.push(Object.assign({ corner }, c));
      }
      /* 每角只留候选像素最多的那一块（避免把两个不相干的东西的并集当矩形） */
      const byCorner = {};
      for (const c of keep) {
        const cur = byCorner[c.corner];
        if (!cur || c.candPixels > cur.candPixels) byCorner[c.corner] = c;
      }
      const picked0 = Object.keys(byCorner).map((k) => byCorner[k]);

      const rects = picked0.map((r) => {
        /* confidence：每个采样帧里「该矩形内仍与参考帧一致（不透明 + 颜色差 ≤ tol）」的像素比例，取最小值 */
        let conf = 1;
        const area = r.w * r.h;
        for (let k = 0; k < S; k++) {
          const d = imgs[k].data;
          let good = 0;
          for (let y = r.y; y < r.y + r.h; y++) {
            for (let x = r.x; x < r.x + r.w; x++) {
              const q = (y * w + x) * 4;
              if (d[q + 3] <= thr) continue;
              if (Math.abs(d[q] - ref[q]) > tol || Math.abs(d[q + 1] - ref[q + 1]) > tol || Math.abs(d[q + 2] - ref[q + 2]) > tol) continue;
              good++;
            }
          }
          conf = Math.min(conf, good / area);
        }
        return {
          x: r.x, y: r.y, w: r.w, h: r.h,
          corner: r.corner,
          confidence: r3(conf),
          candidatePixels: r.candPixels,
        };
      });
      rects.sort((a, b) => b.confidence - a.confidence || b.candidatePixels - a.candidatePixels);
      const picked = rects.slice(0, maxRects);

      return {
        ok: true,
        rects: picked,
        sampled: S,
        frames: idxs,
        bodyBBox: body,
        frameWidth: w,
        frameHeight: h,
        components: comps.length,
        candidatePixels: candTotal,
        params: {
          alphaThreshold: thr, colorTolerance: tol, contrast: contrast, blockSize: BLK,
          minPixels, minWidth: minW, minHeight: minH, maxRects,
        },
        source: 'state.frames（原帧：角标是烧进画面的，抠图结果可能把它一起抠掉）',
        costMs: Math.round(nowMs() - t0),
        note: picked.length ? '' : '未命中：没有找到「跨帧颜色稳定 + 相对局部背景有对比 + 尺寸像个角标 + 不在主体 bbox 内」的角落连通块',
      };
    } catch (e) {
      return fail(e);
    }
  }
  /* ---------------- v2-10. 拼图并直接给 dataURL（契约 §10，含 png/webp） ---------------- */
  /* 依赖内部符号：state.frames / ensureSelection / buildSheet / currentMeta / el('outCols'|'outRows') /
     renderRuler / renderAnchorPreview / renderSheetPreview / state.trim 生效（buildSheet 内部读） */
  async function buildSheetDataURL(opts) {
    try {
      const o = (opts && typeof opts === 'object') ? opts : {};
      if (!state.frames.length) return fail('还没有帧，先 extract()');
      if (typeof buildSheet !== 'function') return fail('未接通: buildSheet');
      ensureSelection();
      const cEl = el('outCols'), rEl = el('outRows');
      if (has(o, 'cols')) { const v = clampv(Math.round(num(o.cols, 4)), 1, 100); if (cEl) cEl.value = v; }
      if (has(o, 'rows')) { const v = clampv(Math.round(num(o.rows, 4)), 1, 100); if (rEl) rEl.value = v; }
      const format = String(o.format || 'png').toLowerCase() === 'webp' ? 'webp' : 'png';
      if (o.format != null && ['png', 'webp'].indexOf(String(o.format).toLowerCase()) < 0) {
        return fail('format 只支持 png / webp（收到 ' + o.format + '）');
      }
      const quality = clampv(num(o.quality, 0.9), 0, 1);
      const r = buildSheet();
      if (!r) return fail('拼图失败（没有可输出帧）');

      const mime = format === 'webp' ? 'image/webp' : 'image/png';
      let blob;
      try {
        blob = await new Promise((resolve, reject) => {
          try {
            r.sheet.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 返回 null（编码失败）'))), mime, format === 'webp' ? quality : undefined);
          } catch (e) { reject(e); }
        });
      } catch (e) {
        return fail('编码失败：' + ((e && e.message) || e));
      }
      /* 浏览器不支持 webp 编码时会悄悄退回 png（blob.type 仍为 image/png）—— 这里必须报错 */
      if (format === 'webp' && String(blob.type || '') !== 'image/webp') {
        return fail('这个浏览器不支持 webp 编码');
      }
      const dataURL = await blobToDataUrl(blob);
      const meta = typeof currentMeta === 'function' ? currentMeta(r) : null;
      try {
        if (typeof renderRuler === 'function') renderRuler();
        if (typeof renderAnchorPreview === 'function') renderAnchorPreview();
        if (typeof renderSheetPreview === 'function') await renderSheetPreview();
      } catch (_) { /* UI 同步失败不影响返回值 */ }
      return {
        ok: true,
        dataURL,
        mime,
        meta,
        width: r.sheet.width,
        height: r.sheet.height,
        format,
        quality: format === 'webp' ? quality : null,
        bytes: blob.size,
        cols: r.cols,
        rows: r.rows,
        cellW: r.cellW,
        cellH: r.cellH,
        count: r.count,
        total: r.total,
      };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- v2-11. 已抠图帧的只读导出（契约 §11） ---------------- */
  /* 依赖内部符号：state.keyed / state.frames / frameIndex
     只读通道：不碰任何参数、不清缓存（用 keyPreview 采样会先把 keyed 清空） */
  async function keyedDataURL(opts) {
    try {
      /* 契约签名是 {frame}；顺手也接受裸数字，少一层包装 */
      const o = typeof opts === 'number' ? { frame: opts } : ((opts && typeof opts === 'object') ? opts : {});
      if (!state.keyed || !state.keyed.size) return fail('还没有抠图结果，先 keyApply()');
      const i = frameIndex(has(o, 'frame') ? o.frame : 0);
      const c = state.keyed.get(i);
      if (!c) return fail('第 ' + i + ' 帧没有抠图结果（可能被参数修改或 keyPreview 清空了，重新 keyApply()）');
      return { ok: true, dataURL: c.toDataURL('image/png'), frame: i, width: c.width, height: c.height, keyedCount: state.keyed.size };
    } catch (e) {
      return fail(e);
    }
  }

  /* ---------------- 挂到 window ---------------- */
  window.__spriteAgent = Object.freeze({
    ready: true,
    bridge: MARK,
    loadVideoBase64,
    setRange,
    extract,
    pickBgColor,
    keyParams,
    setKeyParams,
    keyPreview,
    keyApply,
    maskDataURL,
    setMaskRect,
    applyMask,
    computeTrim,
    applyTrim,
    measureScale,
    setAnchor,
    buildSheet: buildSheetOp,
    sheetMeta,
    frameDataURL,
    /* ---- v2 新增（契约 §1~§11） ---- */
    loadVideoUrl,
    keyState,
    probeColor,
    measure,
    overlay,
    getAnchor,
    setAnchorPx,
    scaleTo,
    trim,
    detectWatermark,
    buildSheetDataURL,
    keyedDataURL,
  });
  console.log('[sprite-agent] bridge ready（' + MARK + '）');
})();
/* ==== /SPRITE-AGENT-BRIDGE ==== */
