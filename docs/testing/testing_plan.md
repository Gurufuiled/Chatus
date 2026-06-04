# Testing Strategy and Plan for P2P Messenger

This document outlines a comprehensive testing strategy for the P2P Messenger project to stabilize the application, ensure high performance under load, and verify user flows across both the mobile app (React Native/Expo) and the backend server (NestJS).

## 1. Testing Pyramid Overview

Our goal is to build a robust testing suite adhering to the Testing Pyramid:
- **Unit Tests (Many):** Test individual functions, hooks, and services in isolation.
- **Integration Tests (Medium):** Test interactions between modules (e.g., Mobile Services <-> SQLite, NestJS <-> DB).
- **End-to-End (E2E) & UI Tests (Few):** Test complete user journeys across the mobile application.
- **Stress & Load Tests (Periodic):** Test system behavior under extreme conditions (P2P connections, heavy server load).

---

## 2. Server (NestJS) Testing Plan

### 2.1. Unit and Integration Testing
**Tools:** `Jest`, `Supertest`
- **Current State:** Jest is already configured.
- **Plan:**
  - Write unit tests for all business logic (Services).
  - Write integration tests for Controllers and WebSockets (Gateways).
  - Use in-memory SQLite or a dedicated PostgreSQL test database for Prisma integration tests.

### 2.2. Stress and Load Testing
**Tools:** `Artillery` or `k6`
- **Target:**
  - WebSocket connection limits and message broadcast performance.
  - REST API throughput (e.g., auth, signaling).
- **Implementation:**
  - Create scripts in a `load-tests/` directory.
  - Simulate thousands of concurrent users connecting via WebSockets and exchanging signaling data for WebRTC.

---

## 3. Mobile (React Native / Expo) Testing Plan

### 3.1. Unit Testing
**Tools:** `Jest`
- **Current State:** The mobile app relies on custom test runners (e.g., `node scripts/run-unit-tests.mjs`, `npx tsx`). This is fragile and non-standard.
- **Plan:**
  - Fully integrate `Jest` with `expo-preset`.
  - Refactor existing custom `.test.ts` scripts into standard Jest tests.
  - Test complex logic like `p2pSendDecision`, `lineSyncProtocol`, and `PeerDeliveryService` thoroughly in Jest.

### 3.2. Component (Screen) Testing
**Tools:** `Jest` + `@testing-library/react-native`
- **Target:** Verify that UI components render correctly based on state (Zustand) without needing an emulator.
- **Implementation:**
  - Render screens (e.g., Chat, Settings, Contacts) and assert the presence of critical UI elements.
  - Mock navigation and Zustand stores.

### 3.3. End-to-End (E2E) Testing
**Tools:** `Maestro` (Highly recommended for React Native/Expo for simplicity and reliability).
- **Target:** Automate critical user journeys on real emulators/simulators.
- **Scenarios:**
  - User A signs in and navigates to User B's chat.
  - User A sends a message to User B (Mocked P2P layer or actual loopback).
  - Voice recording gestures (verify UI state changes).
- **Implementation:**
  - Create `.yaml` Maestro flows in a `mobile/e2e/` folder.
  - Integrate into CI/CD (e.g., GitHub Actions using Maestro Cloud or local emulators).

### 3.4. Mobile Stress Testing
- **Target:**
  - High volume of incoming P2P messages (1000+ messages per minute).
  - Large SQLite database performance (loading chat with 100k+ messages).
  - WebRTC connection stability over time.
- **Implementation:**
  - Create internal "Debug" tools within the app (hidden behind a developer menu) that generate mock data/traffic.
  - E2E tests that script rapid message sending.

---

## 4. Execution Plan (Next Steps)

1. **Standardize Mobile Unit Tests:** Install `jest` and `@testing-library/react-native` in `mobile/`. Migrate a few existing tests to Jest.
2. **Setup Mobile E2E:** Create initial `Maestro` YAML files for basic app launch and navigation.
3. **Setup Server Load Tests:** Add a `k6` script to simulate WebSocket connections.
4. **Setup Server E2E:** Implement basic `Supertest` coverage for core API endpoints.
