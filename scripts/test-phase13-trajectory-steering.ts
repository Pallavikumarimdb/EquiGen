/**
 * Phase 13 Test Script — Real-Time Trajectory Stream & Steering Controls
 *
 * Tests:
 * 1. TrajectoryBus pub/sub event emission & subscription logic
 * 2. Steering event recording in database & trajectory bus broadcast
 * 3. SSE event stream serialization and event type typing
 */

import { trajectoryBus } from "../src/lib/ai/trajectory-emitter";

const MOCK_PLAN_ID = "test-plan-phase13-" + Date.now();

async function runTests() {
  console.log("======================================================");
  console.log("   EquiGen Phase 13 — Trajectory & Steering Test      ");
  console.log("======================================================\n");

  let passed = 0;
  let failed = 0;

  // ─── Test 1: TrajectoryBus Pub/Sub ─────────────────────────────────────
  console.log("📋 Test 1: TrajectoryBus event subscription...");
  try {
    let eventReceived = false;

    const unsubscribe = trajectoryBus.subscribe(MOCK_PLAN_ID, (ev) => {
      if (ev.eventType === "planner_thought" && ev.data.reasoning === "Decomposing research goal") {
        eventReceived = true;
      }
    });

    trajectoryBus.emitEvent(MOCK_PLAN_ID, "planner_thought", {
      reasoning: "Decomposing research goal",
      step: 1,
    });

    if (!eventReceived) throw new Error("Subscribed listener did not receive emitted event");

    unsubscribe();
    console.log("  ✅ TrajectoryBus.subscribe() & emitEvent() ✅");
    passed++;
  } catch (e) {
    console.error("  ❌ TrajectoryBus pub/sub test failed:", e);
    failed++;
  }

  // ─── Test 2: Steering Event Recording ──────────────────────────────────
  console.log("\n📋 Test 2: Steering event emission & broadcast...");
  try {
    let steeringReceived = false;

    const unsubscribe = trajectoryBus.subscribe(MOCK_PLAN_ID, (ev) => {
      if (ev.eventType === "steering_applied" && ev.data.eventType === "redirect") {
        steeringReceived = true;
      }
    });

    await trajectoryBus.recordSteeringEvent(
      MOCK_PLAN_ID,
      "redirect",
      "analyst",
      { instruction: "Focus DCF model on EV commercial vehicle segment" }
    );

    if (!steeringReceived) throw new Error("Steering event emission failed");

    unsubscribe();
    console.log("  ✅ Steering event recorded and broadcast to trajectory stream ✅");
    passed++;
  } catch (e) {
    console.error("  ❌ Steering event test failed:", e);
    failed++;
  }

  // ─── Test 3: Event Serialization ───────────────────────────────────────
  console.log("\n📋 Test 3: Trajectory event JSON serialization...");
  try {
    const event = trajectoryBus.emitEvent(
      MOCK_PLAN_ID,
      "tool_call",
      { tool: "bse_filings", input: { ticker: "TATAMOTORS" } },
      "m_fetch"
    );

    const jsonStr = JSON.stringify(event);
    const parsed = JSON.parse(jsonStr);

    if (parsed.eventType !== "tool_call" || parsed.milestoneRef !== "m_fetch") {
      throw new Error("Serialized event structure invalid");
    }

    console.log("  ✅ Trajectory event SSE serialization valid ✅");
    passed++;
  } catch (e) {
    console.error("  ❌ Event serialization test failed:", e);
    failed++;
  }

  console.log("\n======================================================");
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("❌ PHASE 13 — Trajectory Stream & Steering: SOME TESTS FAILED");
    process.exit(1);
  } else {
    console.log("✅ PHASE 13 — Trajectory Stream & Steering: ALL TESTS PASSED");
  }
  console.log("======================================================\n");
}

runTests().catch((e) => {
  console.error("❌ Phase 13 test runner error:", e);
  process.exit(1);
});
