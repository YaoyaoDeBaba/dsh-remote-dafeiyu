/* ==== SPRITE-AGENT-BRIDGE v1 ==== */
/* =====================================================================
   页面内 agent 桥接层（bridge.js）—— 给外部程序（CDP Runtime.evaluate）用
   的函数调用接口，替代「模拟点击」。

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
     锚点   renderAnchorPreview
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

  const MARK = 'SPRITE-AGENT-BRIDGE v1';

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
  async function keyPreview(frameIdx) {
    try {
      if (!state.frames.length) return fail('还没有帧，先 extract()');
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
      return { ok: true, dataURL: url, frame: i, width: src.width, height: src.height, applied: false, clamped: Math.round(num(frameIdx, 0)) !== i };
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
      /* 不调内部 setAnchorValue：它最后会调 markDirty()，而本工具里没有这个函数，
         一调就 ReferenceError（上游遗留）。这里直接写 state + 渲染。 */
      state.anchor.x = nx;
      state.anchor.y = ny;
      state.anchor.confirmed = true;
      renderAnchorPreview();
      if (typeof markDirty === 'function') { try { markDirty(); } catch (_) { /* ignore */ } }
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
  });
  console.log('[sprite-agent] bridge ready（' + MARK + '）');
})();
/* ==== /SPRITE-AGENT-BRIDGE ==== */
