# Tervux Backend API

The backend for Tervux Cloud Bot is a high-performance Node.js application built with Express. It manages WhatsApp connections using the Baileys library and handles multi-tenant session persistence with MongoDB.

## 🛠 Tech Stack

- **Runtime**: Node.js (>=20.0.0)
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose)
- **WhatsApp**: @whiskeysockets/baileys
- **Real-time**: Socket.io
- **Auth**: JWT (JSON Web Tokens)
- **Security**: Bcrypt.js

## 📂 Architecture & Folder Structure

The backend follows a service-oriented architecture to separate concerns between routing, business logic, and database interaction.

```text
backend/
├── lib/                  # Shared libraries (DB connection)
├── middleware/           # Auth & security middleware
├── models/               # Mongoose DB schemas
├── routes/               # REST API endpoints
├── services/             # Core logic (WhatsApp, Payments, Sockets)
├── scripts/              # Utility scripts (Seeding)
├── utils/                # Helper functions
└── server.js             # Application entry point
```

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS recommended)
- MongoDB instance (local or Atlas)

### Installation
1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment variables (see below).
4.  (Optional) Seed initial plans:
    ```bash
    npm run seed
    ```
5.  Start the server:
    ```bash
    # Development
    npm run dev

    # Production
    npm start
    ```

## ⚙️ Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```ini
PORT=5000
MONGODB_URI=mongodb://your_uri
JWT_SECRET=your_jwt_secret
FASTLIPA_API_KEY=your_key
FASTLIPA_VENDOR_ID=your_id
CORS_ORIGINS=http://localhost:3000
NODE_ENV=development
MAX_CONCURRENT_PAIRINGS=3
PAIRING_TIMEOUT_MS=120000
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register`: Create a new user account.
- `POST /api/auth/login`: Authenticate and receive a JWT.

### WhatsApp Sessions
- `GET /api/sessions`: List all user sessions (includes deployment status/expiry).
- `POST /api/sessions/pair`: Initiate device pairing (QR/Code).
- `POST /api/sessions/:id/pause`: Temporarily stop bot activity.
- `POST /api/sessions/:id/resume`: Resume bot activity.
- `DELETE /api/sessions/:id`: Terminate and remove a device connection.

### Subscriptions & Payments
- `GET /api/plans`: Fetch available coin plans.
- `POST /api/subscription/checkout`: Initiate a mobile money payment.
- `GET /api/subscription/payment-status/:id`: Check status of a transaction.

### Administration
- `GET /api/admin/stats`: Get global system performance and health.

## 🔒 Security & Error Handling

- **JWT Auth**: All protected routes require a `Bearer` token in the `Authorization` header.
- **Graceful Shutdown**: The server handles `SIGINT` and `SIGTERM` to safely disconnect all active WhatsApp sessions.
- **Global Error Handling**: Uncaught exceptions are caught and logged without crashing the core server logic where possible.

## 🧪 Testing

Currently supports manual verification and console-based logging. Integration tests are planned for future releases.

---
© 2024 Tervux Cloud. Engineered for Reliability.
