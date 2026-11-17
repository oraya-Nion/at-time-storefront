(() => {
  const feedUrl = 'https://script.google.com/macros/s/AKfycbxD6VQSjt7dDWZlKiaBv3abniQOImfaHg8nZq6QC4epQfnBMRL3MLtF076XZNIBTX8rPw/exec';
  const grid = document.getElementById('stock-grid');
  const status = document.getElementById('stock-status');
  const section = document.getElementById('inventory');
  const loadButton = document.getElementById('load-stock');
  if (!grid || !status || !section) return;

  const pendingPhotos = Object.create(null);
  const pendingPhotoTokens = new Set();
  const photoCache = new Map();
  let currentStockPromise = null;
  let refreshTimer = null;
  let photoObserver = null;

  const placeholder = (label = 'AT TIME') => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#e7e4dc"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b6b65" font-family="sans-serif" font-size="22">${label}</text></svg>`
  );

  const setStatus = message => { status.textContent = message; };

  function jsonpScript(callback, params, timeoutMs, onTimeout) {
    const script = document.createElement('script');
    const query = new URLSearchParams({ ...params, callback, _ts: String(Date.now()) });
    script.src = feedUrl + '?' + query.toString();
    script.async = true;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      script.remove();
      onTimeout();
    }, timeoutMs);
    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.remove();
      onTimeout();
    };
    script.onload = () => {
      // A valid JSONP callback runs before the script's load event.
      setTimeout(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        script.remove();
        onTimeout();
      }, 0);
    };
    document.head.append(script);
    return {
      remove() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        script.remove();
      }
    };
  }

  function requestPhoto(token, image) {
    if (!token || pendingPhotoTokens.has(token)) return;
    const cached = photoCache.get(token);
    if (cached) { image.src = cached; image.dataset.photoReady = 'true'; return; }

    const requestId = 'p' + Math.random().toString(36).slice(2, 13);
    pendingPhotoTokens.add(token);
    image.dataset.photoState = 'loading';
    pendingPhotos[requestId] = { image, token, request: null };
    const request = jsonpScript('ATTimeStock.receivePhoto', { key: token, request: requestId }, 20000, () => {
      const pending = pendingPhotos[requestId];
      if (!pending) return;
      pendingPhotoTokens.delete(token);
      delete pendingPhotos[requestId];
      image.dataset.photoState = 'error';
      image.src = placeholder('รูปยังไม่พร้อม');
    });
    if (pendingPhotos[requestId]) pendingPhotos[requestId].request = request;
  }

  function observeImage(image) {
    if (photoObserver) photoObserver.observe(image);
    else requestPhoto(image.dataset.photoToken, image);
  }

  function renderStock(data) {
    grid.replaceChildren();
    if (!data || !data.ok || !Array.isArray(data.items)) {
      setStatus('ดึงข้อมูลสต็อกไม่สำเร็จ · กรุณาทัก LINE');
      grid.innerHTML = '<p class="detail-note">ยังโหลดรายการพร้อมขายไม่ได้ โปรดทัก LINE เพื่อเช็กสต็อกล่าสุด</p>';
      return;
    }

    data.items.forEach(item => {
      if (!item || !item.name || !item.sku) return;
      const tokens = Array.isArray(item.photos) ? item.photos.filter(token => typeof token === 'string' && token) : [];
      const card = document.createElement('article'); card.className = 'product';
      const photo = document.createElement('div'); photo.className = 'product-photo';
      const image = document.createElement('img'); image.alt = 'ภาพนาฬิกา ' + item.name; image.loading = 'lazy';
      image.src = placeholder(tokens.length ? 'กำลังเตรียมรูป' : 'AT TIME');
      if (tokens.length) image.dataset.photoToken = tokens[0];
      photo.append(image);

      const badge = document.createElement('span'); badge.className = 'status'; badge.textContent = 'พร้อมขาย'; photo.append(badge);

      const info = document.createElement('div'); info.className = 'product-info';
      const type = document.createElement('span'); type.className = 'product-type'; type.textContent = 'Seiko · พร้อมขาย';
      const title = document.createElement('h3'); title.textContent = item.name;
      const desc = document.createElement('p'); desc.textContent = item.sku;
      if (Array.isArray(item.details) && item.details.length) {
        const details = document.createElement('details'); details.className = 'product-details';
        const summary = document.createElement('summary'); summary.textContent = 'รายละเอียดสินค้า'; details.append(summary);
        item.details.forEach(detail => {
          if (!detail || !detail.label || !detail.text) return;
          const line = document.createElement('p'); line.className = 'product-detail-line';
          const label = document.createElement('strong'); label.textContent = detail.label + ': ';
          line.append(label, document.createTextNode(detail.text)); details.append(line);
        });
        if (details.querySelector('.product-detail-line')) info.append(details);
      }
      const photoPrompt = document.createElement('p'); photoPrompt.className = 'photo-more-note'; photoPrompt.textContent = 'ต้องการรูปมุมอื่น? ขอเพิ่มทาง LINE ได้';
      info.append(photoPrompt);
      const foot = document.createElement('div'); foot.className = 'product-foot';
      const price = document.createElement('span'); price.className = 'price-later';
      price.textContent = Number.isFinite(Number(item.salePrice)) && Number(item.salePrice) > 0
        ? new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(item.salePrice))
        : 'สอบถามราคา';
      const link = document.createElement('a'); link.className = 'text-link'; link.dataset.primaryCta = ''; link.href = 'https://lin.ee/wnW7Nk5'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'ถาม / ขอรูป ↗';
      foot.append(price, link); info.append(type, title, desc, foot); card.append(photo, info); grid.append(card);
      if (tokens.length) observeImage(image);
    });

    setStatus(`อัปเดตแล้ว · ${grid.querySelectorAll('.product').length} เรือนพร้อมขาย`);
    if (!grid.querySelector('.product')) grid.innerHTML = '<p class="detail-note">ขณะนี้ไม่พบรายการที่พร้อมขาย กรุณาทัก LINE เพื่อสอบถาม</p>';
  }

  const stockApi = {
    receiveStock(data) {
      if (stockApi.stockRequest) stockApi.stockRequest.remove();
      stockApi.stockRequest = null;
      renderStock(data);
      if (stockApi.resolveStock) {
        const resolve = stockApi.resolveStock;
        stockApi.resolveStock = null;
        resolve(data);
      }
    },
    receivePhoto(data) {
      const pending = data && pendingPhotos[data.requestId];
      if (!pending) return;
      pendingPhotoTokens.delete(pending.token);
      if (pending.request) pending.request.remove();
      delete pendingPhotos[data.requestId];
      if (data.ok && data.dataUrl) {
        photoCache.set(pending.token, data.dataUrl);
        if (photoCache.size > 6) photoCache.delete(photoCache.keys().next().value);
        pending.image.src = data.dataUrl;
        pending.image.dataset.photoReady = 'true';
        pending.image.dataset.photoState = 'ready';
      } else {
        pending.image.src = placeholder('รูปยังไม่พร้อม');
        pending.image.dataset.photoState = 'error';
      }
    },
    resolveStock: null,
    stockRequest: null
  };
  window.ATTimeStock = stockApi;

  function refreshStock() {
    if (currentStockPromise) return currentStockPromise;
    setStatus('กำลังโหลดรายการล่าสุด…');
    if (loadButton) loadButton.disabled = true;
    currentStockPromise = new Promise((resolve, reject) => {
      stockApi.resolveStock = resolve;
      stockApi.stockRequest = jsonpScript('ATTimeStock.receiveStock', {}, 20000, () => {
        stockApi.resolveStock = null;
        stockApi.stockRequest = null;
        setStatus('เชื่อมต่อสต็อกไม่สำเร็จ · ลองอีกครั้งหรือทัก LINE');
        grid.innerHTML = '<p class="detail-note">ดึงรายการไม่สำเร็จ ลองใหม่อีกครั้ง หรือทัก LINE เพื่อเช็กสต็อกล่าสุด</p>';
        reject(new Error('stock_feed_failed'));
      });
    });
    currentStockPromise.then(() => {
      currentStockPromise = null;
      if (loadButton) loadButton.disabled = false;
      if (!refreshTimer) refreshTimer = window.setInterval(() => refreshStock().catch(() => {}), 60000);
    }, () => { currentStockPromise = null; if (loadButton) loadButton.disabled = false; });
    return currentStockPromise;
  }

  if ('IntersectionObserver' in window) {
    photoObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        photoObserver.unobserve(entry.target);
        requestPhoto(entry.target.dataset.photoToken, entry.target);
      });
    }, { rootMargin: '240px 0px' });
  }

  if (loadButton) loadButton.addEventListener('click', () => { refreshStock().catch(() => {}); });
  if (section.dataset.stockEager === 'true') {
    refreshStock().catch(() => {});
  } else if (section.dataset.stockMode === 'background') {
    refreshStock().catch(() => {});
  } else if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      sectionObserver.disconnect();
      refreshStock().catch(() => {});
    }, { rootMargin: '420px 0px' });
    sectionObserver.observe(section);
  }

})();
