import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: '.',
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true
            }
        },
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html')
            },
            output: {
                manualChunks: {
                    'tensorflow': ['@tensorflow/tfjs'],
                    'face-detection': ['@tensorflow-models/face-landmarks-detection'],
                    'react-vendor': ['react', 'react-dom']
                }
            }
        },
        chunkSizeWarningLimit: 2000
    },
    optimizeDeps: {
        include: [
            '@tensorflow/tfjs',
            '@tensorflow-models/face-landmarks-detection',
            'react',
            'react-dom'
        ],
        exclude: ['electron'],
        force: true
    },
    server: {
        port: 5173,
        strictPort: true,
        host: 'localhost'
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    }
});