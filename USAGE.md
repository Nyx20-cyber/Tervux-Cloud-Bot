# Tervux Cloud Bot - Usage Guide

Welcome to the Tervux Cloud Bot! This guide covers the complete user flow from account creation to connecting your first WhatsApp device and managing your subscriptions.

## 1. Account Setup
1. **Register**
   - Navigate to `/register`.
   - Create an account by providing your name, email, and a secure password.
2. **Login**
   - Navigate to `/login`.
   - Enter your credentials to access the personalized User Dashboard.

## 2. Connect Your WhatsApp Device (Pairing)
Once logged in, the first step is to link your WhatsApp account.
1. Within the dashboard, navigate to **Connect New Device** or the **Pair Bot** section (`/dashboard/pair`).
2. **Choose Connection Method:**
   - **QR Code:** Click "Generate QR Code". Open WhatsApp on your phone > Linked Devices > Link a Device, and scan the displayed QR code.
   - **Pairing Code:** Enter your phone number in full international format without the leading '+' or '0' (e.g., `255712345678`), then click "Get Pairing Code". You will receive an 8-character code to enter into your WhatsApp app under Linked Devices > Link with phone number.
3. Once successfully connected, your device will show as `Linked` and become active.

## 3. Dashboard Overview & Device Management
Navigate to the root **Dashboard** (`/dashboard`) to monitor and manage your connected WhatsApp modules.
- **Active Connections:** View all devices connected to your account.
- **Device Status:** Under each device, you can see its current status (`active`, `paused`, `disconnected`, or `expired`).
- **Quick Actions:** You can easily pause, resume, or permanently disconnect a device using the action buttons on the session card.
- **System Health:** Monitor real-time latency, uptime, and encryption metrics.

## 4. Subscriptions & Billing
To unleash unlimited messaging and features, you need an active subscription for your device.
1. Click **Renew Subscription** on an expired device or navigate to **Subscription Plans** (`/dashboard/billing`).
2. **Select a Device:** Choose which WhatsApp session you want to upgrade.
3. **Choose a Plan:** Select between the available plans (e.g., Siku, Wiki, Mwezi).
4. **Checkout (FastLipa):** 
   - Click "Select Plan".
   - Enter your active M-Pesa or Tigo Pesa mobile money number.
   - Click "Pay Now". A USSD push prompt will appear on your mobile phone.
   - Enter your PIN to confirm the payment.
5. The dashboard will automatically verify the payment and upgrade your device to `active` status with your new plan limits.

## 5. Security & Privacy
- **Free Pairing:** Pairing a session is 100% free. You only pay for hosting and premium server limits via the subscription system.
- **Secure Handling:** Your session tokens are AES-256 encrypted, and Tervux does not read or store your private messages.

---
*For any connection queries, ensure your WhatsApp is updated, and feel free to reach out to our support channel.*
