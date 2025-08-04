import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import { AuthCallback } from './pages/AuthCallback.tsx'
import { TokensPage } from './pages/TokensPage.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/auth/success" element={<AuthCallback />} />
        <Route path="/auth/error" element={<AuthCallback />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)