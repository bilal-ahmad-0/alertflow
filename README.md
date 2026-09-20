# 🚨 AlertFlow - Enterprise Incident Management Platform

[![Live Demo](https://img.shields.io/badge/Live_Demo-alertflow--two.vercel.app-blue?style=for-the-badge&logo=vercel)](https://alertflow-two.vercel.app/)

AlertFlow is a modern, real-time incident management, alerting, and on-call orchestration platform designed for high-availability engineering teams. Built with React, Vite, Express, WebSockets, and SQLite, AlertFlow enables teams to detect, triage, escalate, and resolve critical infrastructure incidents faster.

> **🚀 Live Preview:** Check out the live application at [https://alertflow-two.vercel.app/](https://alertflow-two.vercel.app/)

---

## ✨ Features

- ⚡ **Real-Time Incident Triage & Alerts**: Live updates via WebSocket connection. View active incidents, update status (Investigating, Identified, Monitoring, Resolved), adjust severities (P1 Critical, P2 High, P3 Medium, P4 Low), and assign responders in real-time.
- 📅 **On-Call Rotations & Escalation Policies**: Schedule-based on-call management, multi-tier escalation policies with custom delay intervals, and automated fallback rules.
- 🌐 **Service Catalog & Dependency Graph**: Track service health (Operational, Degraded, Outage), monitor SLAs/uptime metrics, and map dependencies across infrastructure microservices.
- ⚡ **Automated Incident Response Workflows**: Trigger automated runbooks, broadcast alerts, send email notifications, and update status pages automatically.
- 📊 **Analytics & Post-Mortems**: Track key DevOps metrics including MTTR (Mean Time to Resolve), MTTD (Mean Time to Detect), SLA compliance, and generate collaborative post-mortem reports.

---

## 🛠️ Technology Stack & Architecture

- **Frontend**: React 18, Vite, React Router v6, Recharts, Lucide Icons, Modern CSS Design System (Hosted on Vercel)
- **Backend**: Node.js, Express, WebSockets (`ws`), SQLite (`better-sqlite3`), Nodemailer (Hosted on Railway)
- **Integrations**: Fastn (Slack Connectors, Workflows)
- **Development Tooling**: Concurrently for running full-stack client & server simultaneously

---

## 🚀 Getting Started & Setup Instructions

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher (comes bundled with Node.js)

---

### Installation & Run Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/bilal-ahmad-0/alertflow.git
   cd alertflow
   ```

2. **Install Dependencies**
   Install both frontend and backend dependencies using npm:
   ```bash
   npm install
   ```

3. **Start Development Server**
   Run the full-stack development environment (launches Express backend on port `3001` and Vite React client on port `5173` concurrently):
   ```bash
   npm run dev
   ```

4. **Access the Application**
   Open your browser and navigate to:
   - **Frontend UI**: [http://localhost:5173](http://localhost:5173)
   - **Backend API**: [http://localhost:3001/api](http://localhost:3001/api)

---

## 📜 Available Scripts

In the project directory, you can run:

- `npm run dev`: Launches both backend server and Vite frontend client concurrently in development mode.
- `npm run client`: Runs only the Vite React frontend client.
- `npm run server`: Runs only the Express Node.js backend server.
- `npm run build`: Compiles and builds the production-ready frontend bundle into the `dist/` directory.

---

## 📁 Project Structure

```
alertops/
├── server/
│   ├── db.js             # SQLite database initialization & seeding
│   ├── index.js          # Express server & WebSocket handling
│   ├── engine/           # Alert escalation & workflow engines
│   └── notifications/    # Email & channel notification handlers
├── src/
│   ├── api/              # API & WebSocket client connections
│   ├── pages/            # React page components (Incidents, Services, On-Call, Analytics)
│   ├── App.jsx           # Main application routing & layout structure
│   ├── index.css         # Core CSS design system & global styles
│   └── main.jsx          # Application entry point
├── index.html            # Vite HTML template
├── package.json          # Dependency specifications & npm scripts
└── vite.config.js        # Vite configuration
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
