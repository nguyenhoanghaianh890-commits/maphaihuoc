/**
 * WormGPT PWA Companion Script
 * Handles Service Worker registration, Install App prompt, iOS A2HS banner, and PWA UI
 */

(function () {
  'use strict';

  // 1. Đăng ký Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);

          // Tự động kiểm tra bản cập nhật sw.js
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] Có phiên bản mới. Người dùng sẽ nhận được khi tải lại trang.');
                }
              };
            }
          };
        })
        .catch((err) => {
          console.error('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // 2. Phát hiện môi trường PWA độc lập (Standalone / Installed)
  // Chỉ coi là đã cài khi đang thực sự chạy bên trong cửa sổ App độc lập
  function isRunningInStandaloneApp() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  // Phát hiện iOS Safari
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIOSSafari = isIOS && isSafari && !isRunningInStandaloneApp();

  let deferredPrompt = null;

  // Đánh dấu và ẩn toàn bộ các nút cài đặt nếu đang chạy bên trong App
  function applyInstalledState() {
    document.body.classList.add('pwa-installed');
    hideInstallPromotion();
  }

  // 3. Khởi tạo UI khi DOM đã sẵn sàng
  async function initPWAUI() {
    // 1. Nếu đang mở trong cửa sổ App đã cài đặt: Ẩn tuyệt đối toàn bộ nút
    if (isRunningInStandaloneApp()) {
      applyInstalledState();
      return;
    }

    // 2. Nếu đang mở trên trình duyệt Web (Chrome, Edge, Safari...):
    // Dùng API getInstalledRelatedApps để kiểm tra xem trên máy người dùng còn cài app không.
    // Nếu họ đã gỡ cài đặt (Uninstall), relatedApps sẽ là rỗng -> NÚT SẼ TỰ ĐỘNG HIỆN LẠI!
    if ('getInstalledRelatedApps' in navigator) {
      try {
        const relatedApps = await navigator.getInstalledRelatedApps();
        if (relatedApps && relatedApps.length > 0) {
          console.log('[PWA] Ứng dụng hiện vẫn đang cài trên thiết bị:', relatedApps);
          applyInstalledState();
          return;
        } else {
          console.log('[PWA] Ứng dụng chưa được cài hoặc vừa bị gỡ cài đặt.');
        }
      } catch (e) {}
    }

    injectPWAStyles();
    createIOSInstallModal();

    // Lắng nghe thay đổi display-mode (ví dụ khi người dùng chuyển sang mở app)
    try {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
        if (e.matches) {
          applyInstalledState();
        }
      });
    } catch (e) {}

    // Bắt sự kiện beforeinstallprompt (Chrome / Android / Edge / Desktop)
    window.addEventListener('beforeinstallprompt', (e) => {
      if (isRunningInStandaloneApp()) {
        applyInstalledState();
        return;
      }
      e.preventDefault();
      deferredPrompt = e;
      console.log('[PWA] beforeinstallprompt event captured');

      // Hiển thị nút cài đặt
      showInstallPromotion();
    });

    // Bắt sự kiện appinstalled: Vừa cài xong thì ẩn ngay lập tức
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] Ứng dụng WormGPT đã được cài đặt thành công!');
      deferredPrompt = null;
      applyInstalledState();
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'Đã cài đặt WormGPT!',
          text: 'Bạn có thể mở WormGPT trực tiếp từ màn hình chính hoặc danh sách ứng dụng.',
          confirmButtonColor: '#10a37f',
          background: '#161a20',
          color: '#f1f5f9'
        });
      }
    });

    // Nếu đang duyệt trên Web thông thường: Luôn hiển thị nút để người dùng có thể cài đặt lại
    setTimeout(() => {
      if (!isRunningInStandaloneApp()) {
        showInstallPromotion();
      }
    }, 400);
  }

  // Chèn CSS cho các thành phần PWA
  function injectPWAStyles() {
    if (document.getElementById('pwa-custom-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-custom-styles';
    style.textContent = `
      /* Header Install Button (Desktop & Default) - Màu xám than, icon & chữ trắng */
      .btn-install-pwa {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        background: #1c2027;
        border: 1px solid #333a46;
        border-radius: 9px;
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        text-decoration: none;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
      }
      .btn-install-pwa:hover {
        background: #282e38;
        border-color: #4b5563;
        color: #ffffff;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      }
      .btn-install-pwa:active {
        transform: translateY(0);
        background: #15181e;
      }
      .btn-install-pwa svg {
        width: 16px;
        height: 16px;
        stroke: #ffffff;
        stroke-width: 2.2;
        display: block;
        flex-shrink: 0;
      }
      .btn-install-pwa span {
        color: #ffffff;
        white-space: nowrap;
      }

      /* Mobile Install Floating Button (ở vị trí góc trên bên phải màn hình trò chuyện) */
      .btn-install-pwa-mobile {
        position: absolute;
        top: 14px;
        right: 14px;
        z-index: 100;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: #1c2027;
        border: 1px solid #333a46;
        border-radius: 20px;
        color: #ffffff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
        transition: all 0.2s ease;
        animation: pwaFadeIn 0.3s ease;
      }
      .btn-install-pwa-mobile:active {
        transform: scale(0.96);
        background: #15181e;
      }
      .btn-install-pwa-mobile svg {
        width: 14px;
        height: 14px;
        stroke: #ffffff;
        stroke-width: 2.2;
      }
      .btn-install-pwa-mobile span {
        color: #ffffff;
        font-size: 11.5px;
        line-height: 1;
      }

      /* Responsiveness: Trên Mobile (<=768px), ẩn nút ở header để không chật hàng, hiện nút nổi bên dưới */
      @media (max-width: 768px) {
        .chat-top-right .btn-install-pwa {
          display: none !important;
        }
      }
      @media (min-width: 769px) {
        .btn-install-pwa-mobile {
          display: none !important;
        }
      }
      @keyframes pwaFadeIn {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Bottom floating banner for mobile if needed */
      .pwa-floating-banner {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1e26;
        border: 1px solid #2d3748;
        border-radius: 14px;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        z-index: 99999;
        max-width: 90%;
        width: 400px;
        animation: pwaSlideUp 0.3s ease;
      }
      @keyframes pwaSlideUp {
        from { transform: translate(-50%, 40px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }
      .pwa-floating-banner img {
        width: 36px;
        height: 36px;
        border-radius: 8px;
      }
      .pwa-floating-banner .pwa-banner-text {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .pwa-floating-banner .pwa-banner-title {
        font-size: 13px;
        font-weight: 700;
        color: #ffffff;
      }
      .pwa-floating-banner .pwa-banner-desc {
        font-size: 11px;
        color: #94a3b8;
      }
      .pwa-floating-banner .btn-banner-action {
        background: #10a37f;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .pwa-floating-banner .btn-banner-close {
        background: transparent;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 18px;
        padding: 2px 4px;
      }

      /* iOS Instructions Modal */
      .ios-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        padding: 20px;
      }
      .ios-modal-card {
        background: #161a20;
        border: 1px solid #2d3748;
        border-radius: 18px;
        max-width: 380px;
        width: 100%;
        padding: 24px;
        color: #f1f5f9;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        animation: pwaSlideUp 0.3s ease;
      }
      .ios-modal-icon {
        width: 64px;
        height: 64px;
        border-radius: 14px;
        margin: 0 auto 16px;
      }
      .ios-modal-card h3 {
        font-size: 17px;
        font-weight: 700;
        margin-bottom: 8px;
        color: #ffffff;
      }
      .ios-modal-card p {
        font-size: 13px;
        color: #94a3b8;
        line-height: 1.5;
        margin-bottom: 20px;
      }
      .ios-steps {
        text-align: left;
        background: #0f1216;
        border: 1px solid #232936;
        border-radius: 12px;
        padding: 14px 16px;
        margin-bottom: 20px;
      }
      .ios-step-item {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 13px;
        color: #cbd5e1;
        margin-bottom: 10px;
      }
      .ios-step-item:last-child {
        margin-bottom: 0;
      }
      .ios-step-num {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #232936;
        color: #34d399;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        flex-shrink: 0;
      }
      .ios-share-icon {
        display: inline-block;
        vertical-align: middle;
        width: 18px;
        height: 18px;
        stroke: #3b82f6;
      }
      .ios-modal-close-btn {
        width: 100%;
        padding: 10px;
        background: #232936;
        border: none;
        border-radius: 10px;
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      .ios-modal-close-btn:hover {
        background: #2d3748;
      }
    `;
    document.head.appendChild(style);
  }

  // Tạo Modal hướng dẫn cho iOS Safari
  function createIOSInstallModal() {
    if (document.getElementById('ios-install-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'ios-install-modal';
    modal.className = 'ios-modal-overlay';
    modal.innerHTML = `
      <div class="ios-modal-card" onclick="event.stopPropagation()">
        <img src="/assets/images/icons/icon-192x192.png" alt="WormGPT" class="ios-modal-icon">
        <h3>Cài đặt WormGPT trên iOS</h3>
        <p>Cài đặt ứng dụng vào màn hình chính iPhone / iPad để trải nghiệm mượt mà toàn màn hình không có thanh URL.</p>
        <div class="ios-steps">
          <div class="ios-step-item">
            <span class="ios-step-num">1</span>
            <span>Bấm vào nút <strong>Chia sẻ (Share)</strong> 
              <svg class="ios-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg> ở thanh dưới trình duyệt Safari.
            </span>
          </div>
          <div class="ios-step-item">
            <span class="ios-step-num">2</span>
            <span>Cuộn xuống và chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong>.</span>
          </div>
          <div class="ios-step-item">
            <span class="ios-step-num">3</span>
            <span>Nhấn <strong>Thêm (Add)</strong> ở góc trên bên phải để hoàn tất.</span>
          </div>
        </div>
        <button type="button" class="ios-modal-close-btn" onclick="document.getElementById('ios-install-modal').style.display='none'">
          Đã hiểu
        </button>
      </div>
    `;
    modal.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    document.body.appendChild(modal);
  }

  // Hiển thị nút cài đặt trên thanh Topbar của index.html (PC) và nút nổi góc trên bên phải (Mobile)
  function showInstallPromotion() {
    if (isRunningInStandaloneApp()) return;

    // 1. PC: Nút ở thanh Topbar bên phải
    const topRight = document.querySelector('.chat-top-right');
    if (topRight && !document.getElementById('btn-pwa-header-install')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-pwa-header-install';
      btn.className = 'btn-install-pwa';
      btn.title = 'Cài đặt ứng dụng WormGPT vào máy';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Cài đặt App</span>
      `;
      btn.addEventListener('click', handleInstallClick);
      topRight.insertBefore(btn, topRight.firstChild);
    }

    // 2. Mobile: Nút nổi góc trên bên phải khu vực trò chuyện (chỗ khoanh tròn xanh)
    const chatMain = document.querySelector('.chat-main');
    if (chatMain && !document.getElementById('btn-pwa-mobile-install')) {
      const mBtn = document.createElement('button');
      mBtn.type = 'button';
      mBtn.id = 'btn-pwa-mobile-install';
      mBtn.className = 'btn-install-pwa-mobile';
      mBtn.title = 'Cài đặt ứng dụng WormGPT vào màn hình chính';
      mBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Cài đặt App</span>
      `;
      mBtn.addEventListener('click', handleInstallClick);
      chatMain.appendChild(mBtn);
    }
  }

  function hideInstallPromotion() {
    const btn = document.getElementById('btn-pwa-header-install');
    if (btn) btn.remove();
    const mBtn = document.getElementById('btn-pwa-mobile-install');
    if (mBtn) mBtn.remove();
    const sbBtn = document.querySelector('.sb-install-pwa-btn');
    if (sbBtn) sbBtn.remove();
    const pwaTabBtn = document.getElementById('settings-tab-btn-pwa');
    if (pwaTabBtn) pwaTabBtn.remove();
    const pwaPane = document.getElementById('settings-tab-pwa');
    if (pwaPane) pwaPane.remove();
  }

  // Xử lý khi người dùng bấm Cài đặt App
  async function handleInstallClick() {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        console.log('[PWA] Người dùng đã chọn:', choiceResult.outcome);
        if (choiceResult.outcome === 'accepted') {
          applyInstalledState();
        }
        deferredPrompt = null;
        return;
      } catch (err) {
        console.error('[PWA] Lỗi trong quá trình kích hoạt prompt cài đặt:', err);
      }
    }

    // Nếu chưa có prompt tự động (iOS Safari hoặc Chrome Android khi chưa kịp trigger):
    if (isIOS) {
      const modal = document.getElementById('ios-install-modal');
      if (modal) modal.style.display = 'flex';
      return;
    }

    // Hướng dẫn cài đặt cho Android / Chrome
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'info',
        title: 'Cài đặt ứng dụng WormGPT',
        html: `
          <div style="text-align: left; font-size: 13.5px; line-height: 1.6; color: #cbd5e1;">
            <p style="margin-bottom: 8px;">Để cài đặt ứng dụng vào màn hình chính của bạn:</p>
            <ol style="padding-left: 20px; margin: 0;">
              <li>Nhấn vào biểu tượng <strong>Menu (3 chấm)</strong> ở góc trên bên phải trình duyệt Chrome.</li>
              <li>Chọn <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào màn hình chính" (Add to Home screen)</strong>.</li>
              <li>Xác nhận <strong>Cài đặt</strong> để hoàn tất.</li>
            </ol>
          </div>
        `,
        background: '#161a20',
        color: '#f1f5f9',
        confirmButtonColor: '#10a37f',
        confirmButtonText: 'Đã hiểu'
      });
    } else {
      alert('Vui lòng nhấn vào biểu tượng Menu (ba chấm) của trình duyệt và chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".');
    }
  }

  // Khởi động khi tải xong DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWAUI);
  } else {
    initPWAUI();
  }

  // Expose ra window để có thể gọi từ bất kỳ đâu (ví dụ Settings Modal)
  window.triggerPWAInstall = handleInstallClick;
  window.showIOSPWAHelp = function () {
    const modal = document.getElementById('ios-install-modal');
    if (modal) modal.style.display = 'flex';
  };
})();

