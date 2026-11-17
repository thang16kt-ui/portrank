import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Áp màu giao diện đã lưu trước khi vẽ để không bị nháy nền tối → sáng
try {
  const saved = JSON.parse(localStorage.getItem('portrank.data.v2') ?? '{}')?.state?.uiTheme;
  if (saved === 'light') document.documentElement.dataset.ui = 'light';
} catch {
  /* bỏ qua */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
