# TradeNexa Backend Service

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-MySQL-orange.svg)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A robust, enterprise-grade Node.js + Express REST API backend powering the **TradeNexa B2B Marketplace**. This service provides secure phone-number based OTP authentication, user registration, JWT token management, multi-role profile handling, rate limiting, and comprehensive logging.

---

## 🚀 Key Features

*   **Firebase OTP Authentication**: Direct integration with Firebase Admin SDK to handle phone number verification (`/send-otp`, `/verify-otp`, `/resend-otp`).
*   **Dual JWT Token Protocol**: Features secure access & refresh token rotation to optimize sessions and prevent unauthorized access.
*   **Role-Based User Profiles**: Explicit support for individual user registration mappings (`buyer`, `seller`, `buyer_seller`, `admin`).
*   **Relational Database Engine**: Powered by Knex.js query builder with automated schema migrations and seed data setup for MySQL.
*   **Security & Guardrails**:
    *   **Helmet & CORS**: Protects headers and restricts origin-sharing permissions.
    *   **Express Rate Limiter**: Rate limiters applied to endpoints (e.g., OTP limits, general API limits) to guard against DDoS and brute-force.
    *   **Express Validator**: Schema-enforced request validations ensuring strict data integrity.
*   **Structured Logging**: Production logging configured with Winston (JSON transport to file system and custom console coloring for development).

---

## 📂 Project Structure

```
├── config/           # Database & environmental configurations
├── constants/        # System messages, status codes, and constants
├── controllers/      # Route controllers (translates requests to services)
├── database/         # Database migrations, seed data, and connection configurations
├── middleware/       # Custom middleware (auth validations, error handling, rate limits)
├── models/           # Knex database query models
├── routers/          # Express route definitions
├── services/         # Core business logic handlers
├── utils/            # Helper modules (Firebase Admin, JWT signer, logger, response wrappers)
├── app.js            # Express application configurations and middlewares setup
├── knexfile.js       # Knex command configuration file
├── server.js         # Entrypoint file starting the HTTP server listener
└── README.md         # Developer handbook & project manual
```

---

## 🛠️ Tech Stack

*   **Runtime**: [Node.js (>=20.0.0)](https://nodejs.org/)
*   **Framework**: [Express.js](https://expressjs.com/)
*   **Query Builder**: [Knex.js](https://knexjs.org/)
*   **Database Client**: MySQL (using `mysql2`)
*   **Authentication**: Firebase Admin SDK & custom JSON Web Tokens (`jsonwebtoken`)
*   **Validator**: `express-validator`
*   **Logger**: `winston` & `morgan`
*   **Linter & Formatter**: ESLint + Prettier

---

## ⚙️ Getting Started

### 📋 Prerequisites

Ensure you have the following installed on your machine:
*   Node.js (version 20 or higher)
*   NPM (Node Package Manager)
*   MySQL Server (active instance running)

### 🔧 Installation and Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-username/TradeNexa_Backend.git
    cd TradeNexa_Backend
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory by copying the sample:
    ```bash
    cp .env.example .env
    ```
    Open the `.env` file and populate it with your local configurations, database credentials, and Firebase Admin credentials (refer to the documentation inside `.env.example`).

4.  **Run Database Migrations**:
    Apply the database schema onto your MySQL server:
    ```bash
    npm run migrate
    ```

5.  **Seed Initial Data**:
    Insert base tables content (roles, languages, countries, states, and cities):
    ```bash
    npm run seed
    ```

6.  **Start the Server**:
    *   For development with hot-reloads (via Nodemon):
        ```bash
        npm run dev
        ```
    *   For production:
        ```bash
        npm start
        ```

---

## 🚦 API Reference

All requests default to the prefix `/api/v1`.

### 🔑 Authentication Routes (`/api/v1/auth`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| **POST** | `/auth/send-otp` | Sends OTP to a mobile number via Firebase Admin API. | No |
| **POST** | `/auth/verify-otp` | Verifies OTP code; returns login tokens if registered. | No |
| **POST** | `/auth/resend-otp` | Resends the verification OTP code. | No |
| **POST** | `/auth/register` | Creates a new user profile and assigns standard role. | Temporary token |
| **POST** | `/auth/refresh-token` | Exchanges active Refresh Token for new token pair. | No |
| **POST** | `/auth/logout` | Revokes the current session or all active sessions. | Yes |
| **GET** | `/auth/profile` | Retrieves detailed user profile (including role). | Yes |
| **PUT** | `/auth/profile` | Updates user details, company data, and language options. | Yes |
| **DELETE** | `/auth/profile` | Soft-deletes user profile, nullifies mobile, and revokes sessions. | Yes |

---

## 🧪 Testing with Postman

We have included a complete API collection to facilitate quick testing of backend endpoints.

1.  Locate [TradeNexa_API_Postman_Collection.json](file:///home/dell/TradeNexa_Backend/TradeNexa_API_Postman_Collection.json) in the project root.
2.  Open **Postman**, click **Import**, and select this file.
3.  Configure your environment variables inside Postman (e.g. set `base_url` to your running server: `http://localhost:3000`).
4.  Run through the OTP send and verification flows.

---

## 🧹 Code Guidelines & Style

This project enforces strict ESLint rules and Prettier styling. Run these scripts before pushing code:

*   **Check code quality (Linter)**:
    ```bash
    npm run lint
    ```
*   **Automatically fix code styles (Prettier)**:
    ```bash
    npm run format
    ```
