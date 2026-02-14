import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './context/AppContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { FavoritesRecycleProvider } from './context/FavoritesRecycleContext.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AppProvider>
        <FavoritesRecycleProvider>
          <App />
        </FavoritesRecycleProvider>
      </AppProvider>
    </AuthProvider>
  </StrictMode>,
)
