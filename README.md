# QAI: Autonomous Agentic Testing Framework

QAI is an open-source autonomous testing framework designed for executing web and mobile application test cases via intelligent LLM-driven agents. Built on top of Gemini Flash and utilizing state-of-the-art interaction tools, QAI acts as an autonomous QA engineer capable of navigating applications, understanding complex logic flows, and providing step-by-step test execution verdicts.

[**🎥 Watch the QAI Demo**](https://drive.google.com/file/d/1q4k19CjHzJ4YmKpoq4AITQMrMteZsb5M/view?usp=sharing)

---

## 🌟 Features & Functionality

- **Autonomous Agentic Execution**: Replaces rigid, hard-coded scripts with intelligent agents that navigate user flows autonomously based on high-level goals.
- **Goal-Driven & Exploratory Modes**: Provide a high-level goal (e.g., "Test the checkout flow") and the AI will infer test steps, execute them conditionally, handle unexpected overlays (e.g. cookie banners), and determine `PASS/FAIL` verdicts.
- **Graphical Flow Management**: Integrated real-time graph collaboration mapped to `Pulsar` allowing visual management of state machines, knowledge graphs, and test execution paths.
- **Self-Hosted / Local Ready**: Runs natively through raw `Gemini API` keys with localized Redis Pub-Sub mimicking for simple orchestration.
- **Evidence Collection**: Records all active execution steps, takes before-and-after screenshots, and traces execution paths as artifacts.

---

## 🚀 1. How to Start the Servers

The entire QAI suite is containerized, orchestrating the backend, frontend, collaborative engine, and message broker seamlessly. To spin up the core environment:

1. Copy the example `.env` file to set your `GOOGLE_API_KEY` and configuration:
   ```bash
   cp .env.example .env
   ```
2. Build and start the Docker services using Docker Compose:
   ```bash
   docker-compose up --build -d
   ```

*This will boot up:*
- **Orionis**: Core backend API processing
- **Nebula**: The Next.js frontend GUI
- **Graph Collab**: Visualization engine for flow mappings
- **Redis**: The message broker used to securely pass execution requests to Nova

---

## 🌐 2. How to Access the Frontend

Once the Docker containers spin up, you can access the core interfaces locally via your web browser:

- **Nebula Dashboard (Main Frontend):** [http://localhost:3000](http://localhost:3000) (View your test cases, initiate runs, and monitor pass/fail metrics)
- **Graph Collaboration Interface:** [http://localhost:8001](http://localhost:8001)
- **Orionis Backend API Status:** [http://localhost:8080](http://localhost:8080)

---

## 🎧 3. Run Nova Execution Listener Separately

`Nova` is the execution engine responsible for actively taking browser control and running the actual test assertions. 

To ensure clear visibility into the LLM thought processes, error logs, DOM interaction streams, and test reasoning during active testing, **the Nova listener should be run manually, outside the compose stack, on your local terminal**. 

1. Navigate into the `nova` engine directory:
   ```bash
   cd nova
   ```

2. (Optional) Activate a python environment and install requirements:
   ```bash
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Start the execution listener:
   ```bash
   python listener_web.py
   ```

*You can now leave this terminal tab open. As you request Web Tests across the Nebula Frontend, the jobs will dynamically stream into the Nova listener via Redis, and you can actively monitor the LLM execution happening live in this terminal.*

---

## 🔍 4. Inspecting the Local Database

QAI uses a local SQLite database to mimic Google Cloud Datastore in development. You can use the `view_db.py` script to inspect your local test data, products, and flows.

### How to use `view_db.py`:

The script automatically detects the database location, whether it's running inside a Docker volume or as a local file.

1. **Summarize all data kinds:**
   ```bash
   python view_db.py
   ```
   *Lists all entity types (e.g., Product, Flow, User) and the count of records for each.*

2. **List all entities of a specific kind:**
   ```bash
   python view_db.py Product
   ```
   *Displays a full JSON dump of every entity stored under the "Product" kind.*

3. **Inspect a specific entity by its ID:**
   ```bash
   python view_db.py Product 12345
   ```
   *Fetches and displays the specific entity with ID 12345.*

*Note: If Docker is running, the script will attempt to copy the database file directly from the running Orionis container for real-time visibility.*

---

## ⏺️ 5. QAI Web Recorder (Chrome Extension)

The **QAI Web Recorder** is a browser extension that allows you to capture user interactions on any website and automatically convert them into a structured "Flow" for QAI execution.

- **Purpose:** Record clicks, navigation, and typing to build test cases effortlessly.
- **Link:** [QAI Web Recorder on Chrome Web Store](https://chromewebstore.google.com/detail/qai-web-recorder/mmjmlhbbimjhjiiebomjpepfjooigoko)
- **Usage:** Install the extension, click "Start Recording," perform your test actions, and export the resulting flow to your QAI dashboard.
