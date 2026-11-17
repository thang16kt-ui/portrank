import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Áp màu giao diện đã lưu trước khi vẽ để không bị nháy màu khi tải trang
try {
  const raw = JSON.parse(localStorage.getItem('portrank.data.v2') ?? '{}');
  // mặc định nền trắng; chỉ giữ nền tối nếu người dùng đã chọn ở phiên bản lưu trữ hiện tại
  document.documentElement.dataset.ui = raw?.version >= 2 && raw?.state?.uiTheme === 'dark' ? 'dark' : 'light';
} catch {
  /* bỏ qua */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
