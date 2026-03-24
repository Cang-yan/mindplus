// process/ocr-adapters/lingine-adapter.js
// LINGINE OCR 适配器 — 使用 PDF.js 在前端渲染页面为图片，再由后端 glm-4v 执行视觉 OCR

/**
 * LINGINE OCR 适配器
 * 流程：
 * 1. 用 PDF.js 将每一页渲染为 canvas 并导出 base64 图片
 * 2. 将所有页面图片发送到 /api/literature/ocr
 * 3. 后端用 glm-4v 逐页提取文本，拼接后返回 markdown
 */
class LingineOcrAdapter extends BaseOcrAdapter {
  constructor(config) {
    super(config || {});
    this.name = 'LingineOCR';
    this.API_ENDPOINT = '/api/literature/ocr';
    this.RENDER_SCALE = 2.0;   // 渲染分辨率倍率（越高越清晰，但图片越大）
    this.MAX_PAGES = 50;       // 单次最多处理页数
  }

  /**
   * 处理文件
   * @param {File} file - PDF 文件对象
   * @param {Function} onProgress - 进度回调 (current, total, message)
   */
  async processFile(file, onProgress) {
    onProgress?.(0, 100, '准备 LINGINE OCR...');

    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js 未加载，无法渲染 PDF 页面');
    }

    // 1. 加载 PDF
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(5, 100, '加载 PDF 文档...');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = Math.min(pdf.numPages, this.MAX_PAGES);

    if (numPages < pdf.numPages) {
      console.warn(`[LINGINE OCR] 文件共 ${pdf.numPages} 页，仅处理前 ${this.MAX_PAGES} 页`);
    }

    onProgress?.(10, 100, `共 ${numPages} 页，开始渲染...`);

    // 2. 逐页渲染为 base64 图片
    const images = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const base64 = await this._renderPageToBase64(page);
      images.push(base64);

      const progress = 10 + Math.floor((i / numPages) * 50);
      onProgress?.(progress, 100, `渲染页面 ${i}/${numPages}...`);
    }

    onProgress?.(60, 100, '上传至 LINGINE OCR 服务...');

    // 3. 发送到后端
    const response = await fetch(this.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, fileName: file.name })
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try { const j = await response.json(); errMsg = j.error || errMsg; } catch {}
      throw new Error(`LINGINE OCR 请求失败: ${errMsg}`);
    }

    onProgress?.(90, 100, '处理 OCR 结果...');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'LINGINE OCR 返回未知错误');
    }

    onProgress?.(100, 100, '完成');

    return {
      markdown: result.markdown || '',
      images: [],   // 视觉 OCR 不返回单独图片资源
      metadata: {
        engine: 'lingine',
        pageCount: result.pageCount || numPages
      }
    };
  }

  /**
   * 将 PDF 页面渲染为 base64 PNG
   * @param {PDFPageProxy} page
   * @returns {Promise<string>} data URL (data:image/png;base64,...)
   */
  async _renderPageToBase64(page) {
    const viewport = page.getViewport({ scale: this.RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    return canvas.toDataURL('image/jpeg', 0.85);
  }
}

// 注册到全局
if (typeof window !== 'undefined') {
  window.LingineOcrAdapter = LingineOcrAdapter;
}
