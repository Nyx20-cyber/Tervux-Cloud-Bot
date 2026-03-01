# Tervux Frontend Dashboard

The Tervux Frontend is a modern, high-performance web application designed for a seamless WhatsApp automation experience. Built with Next.js 14, it offers a professional, dark-themed dashboard with real-time feedback and responsive controls.

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Icons**: Lucide React
- **Real-time**: Socket.io-client
- **Animations**: Framer Motion & TSParticles
- **UI Components**: Radix UI (base for Shadcn/ui)

## 📂 Folder Structure

```text
frontend/
├── app/                  # App Router: Pages, Layouts, and API routes
│   ├── (auth)/           # Login & Register flows
│   ├── dashboard/        # Main user interface (Pairing, Billing, Overview)
│   ├── admin/            # Administrative interface
│   └── layout.tsx        # Global root layout & SEO
├── components/           # Reusable UI & Layout components
│   ├── layout/           # Sidebar, Header, Page wrappers
│   └── ui/               # Primary UI elements (Buttons, Inputs, Dialogs)
├── store/                # Zustand stores for global state
│   ├── useAuthStore.ts   # User authentication & API client
│   └── useSessionStore.ts# WhatsApp sessions & real-time updates
└── styles/               # Global CSS and Tailwind configurations
```

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS recommended)
- Access to the Tervux Backend API

### Installation
1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment variables (see below).
4.  Start the development server:
    ```bash
    npm run dev
    ```

### Production Build
```bash
npm run build
npm start
```

## ⚙️ Environment Variables

Create a `.env.local` file in the `frontend` directory:

```ini
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

## ✨ Key Features

### 📡 Real-Time Dashboard
The dashboard uses WebSockets to reflect device status changes instantly. It also implements "Optimistic UI" updates for the Pause/Resume buttons, ensuring the interface feels snappy even during background processing.

### 🔗 Device Pairing
Supports both **QR Code** (Optical) and **Pairing Code** (Neural) setup methods. The interface guides the user through the scan process with safety tips and instant connection confirmation.

### 💳 Subscription & Billing
A streamlined billing flow that includes automated device selection and smooth scrolling to plan details. Integrated with the backend payment verification service.

## 📡 API Integration

API communication is handled via a centralized Axios instance located in `store/useAuthStore.ts`. This instance automatically includes the user's JWT from `localStorage` in every request.

Global state (like active sessions and user data) is synchronized using **Zustand**, allowing for optimized re-renders and clean component logic.

---
© 2024 Tervux Cloud. Modern UI for Modern Automation.
