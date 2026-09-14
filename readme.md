# Business Operations Platform

**Business Operations Platform by Molinatek** is an operations platform
aimed at helping small businesses manage clients, employees, placements,
and organizational data. It pairs a React/Vite frontend with a Node.js Express backend and uses MySQL as the data store.

## 🚀 Features

- Multi‑tenant onboarding (super‑admin & organizations)
- Client, employee and placement management
- Authentication with JWT and password reset via SMTP email
- Custom migration/seeding utility for database setup
- File upload handling for employee documents
- Responsive UI built with modern React patterns (hooks, context)

## Tech Stack

- ⚛️ **Frontend**: React (Vite)
- 🟢 **Backend**: Node.js + Express
- 🗄️ **Database**: MySQL
- 🔐 **Authentication**: JWT
- 📧 **Email**: SMTP Integration
- 🔄 **Migrations**: Custom Migration System

## Table of Contents

- [Prerequisites](#-prerequisites)
- [Project Structure](#-project-structure)
- [Setup Guide](#️-setup-guide)
  - [MySQL Database Setup](#️-mysql-database-setup)
  - [Environment Configuration](#️-environment-configuration)
  - [Backend Setup](#️⃣-backend-setup)
  - [Frontend Setup](#️⃣-frontend-setup)
- [Default Login Credentials](#-default-login-credentials)
- [Full Startup Summary](#-full-startup-summary)
- [Tech Stack Details](#-tech-stack-details)

## 🚀 Prerequisites

Before starting, ensure the following are installed on your system:

- **Node.js** (v18 or higher recommended) - [Download](https://nodejs.org/)
- **MySQL Server** (v8.0 or higher recommended) - [Download](https://dev.mysql.com/downloads/installer/)
- **MySQL Workbench** (Optional but recommended)
- **Git** - [Download](https://git-scm.com/)

## 📂 Project Structure

```
Small-Business-Operations-Platform/
├── backend/          # Node.js Express API, Controllers, Custom Migration System
├── client/           # React (Vite) Frontend Application
└── README.md         # This file
```

## 🛠️ Setup Guide

### 1️⃣ MySQL Database Setup (Using MySQL Workbench)

#### Step 1: Open MySQL Workbench
- Open MySQL Workbench
- Connect to your local MySQL server (usually `Local instance MySQL80`)

#### Step 2: Create a New Database
1. Go to Navigator → Schemas
2. Right-click → Create Schema
3. Enter: `small_business_db`
4. Click Apply
5. Click Apply again
6. Click Finish

#### Step 3: Verify Database
Run this query inside Workbench:

```sql
SHOW DATABASES;
```

You should see `small_business_db` in the list.

### ⚙️ Environment Configuration

#### Variable Explanation

| Variable | Description                            |
|----------|----------------------------------------|
| DB_HOST  | localhost                              |
| DB_USER  | root (default MySQL user)              |
| DB_PASS  | Password set during MySQL installation |
| DB_NAME  | small_business_db                      |
| DB_PORT  | port number of database                |

> **⚠️ Important**: Do NOT push `.env` file to GitHub. Ensure `.env` is added to `.gitignore`.

### 2️⃣ Backend Setup

#### Step 1: Navigate to Backend
```bash
cd backend
```

#### Step 2: Install Dependencies
```bash
npm install
```

#### Step 3: Create `.env` File
Inside the `backend` folder, create a file named `.env` and add:

```env
NODE_ENV=development
PORT=5000
CLIENT_ORIGIN=http://localhost:5173

DB_HOST=
DB_USER=
DB_PASS=
DB_NAME=
DB_PORT=

JWT_SECRET=supersecretkey

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

ENCRYPTION_KEY=my-super-secret-key-123456789012
```

#### Step 4: Run Database Migrations & Seed Data
```bash
node migrate.js
```

#### Step 5: Start Backend Server
```bash
npm run dev
# OR
node server.js
```

Backend will run at: [http://localhost:5000](http://localhost:5000)

### 3️⃣ Frontend Setup

#### Step 1: Open New Terminal & Navigate to Client
```bash
cd client
```

#### Step 2: Install Dependencies
```bash
npm install
```

#### Step 3: Create `.env` File
Inside the `client` folder, create `.env` and add:

```env
VITE_BACKEND_URL=http://localhost:5000
```

#### Step 4: Start Frontend
```bash
npm run dev
```

Frontend will run at: [http://localhost:5173](http://localhost:5173)

## 🔐 Default Login Credentials

Open: [http://localhost:5173](http://localhost:5173)

Login using:

- **Email**: superadmin@system.com
- **Password**: admin123

## ✅ Full Startup Summary

### Terminal 1 (Backend)
```bash
cd backend
npm install
node migrate.js
npm run dev
```

### Terminal 2 (Frontend)
```bash
cd client
npm install
npm run dev
```

## 📌 Tech Stack Details

- React + Vite
- Node.js
- Express.js
- MySQL
- JWT Authentication
- Custom Migration System
- SMTP Email Integration

## 🧩 Common Tasks

- **Run migrations manually:** `node backend/migrate.js`
- **Reset database:** drop database `small_business_db` and rerun migrations
- **Add a new organization:** through super‑admin UI
- **View uploaded documents:** stored under `backend/uploads/documents`

---

## ⚠ Troubleshooting

- *Server fails to start?* Ensure `.env` values are correct and MySQL
  service is running.
- *Migrations error:* verify `db/config/db.js` has proper credentials.
- *CORS issues:* check `CLIENT_ORIGIN` in backend `.env`.

---

## 🏁 You're Ready!

> Built with ❤️ by the Molinatek team. Thank you for using our platform!
