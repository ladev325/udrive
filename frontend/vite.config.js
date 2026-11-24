import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The C# server (UDrive.csproj in the parent folder) serves this directory.
    outDir: '../wwwroot',
    emptyOutDir: true,
  },
  server: {
    // `npm run dev`: forward API calls to the C# server started with `dotnet run`.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
