import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";
import { readFile } from "fs/promises";
import { parse } from "csv-parse/sync";
import path from "path";

import { nextOutdoorReading } from "./playback";
import { updateAllRooms } from "./calculator";

// Initialize Admin SDK 
if (!getApps().length) {
  initializeApp({ projectId: "smokesense-543b9" });
}

// One-time global seeding
let globalsSeeded = false;
async function seedGlobals(): Promise<void> {
  if (globalsSeeded) return;
  globalsSeeded = true;

  const db = getFirestore();

  // Seed global rooms
  const roomsList = JSON.parse(
    await readFile(path.join(__dirname, "../data/rooms.json"), "utf8")
  ) as string[];
  const roomsSnap = await db.collection("rooms").get();
  if (roomsSnap.empty) {
    const batch = db.batch();
    for (const id of roomsList) {
      const leak = 0.15 + Math.random() * 0.4;
      batch.set(db.doc(`rooms/${id}`), { leakFactor: leak, pm25: 0 });
      logger.log(`Global seeded rooms/${id}`);
    }
    await batch.commit();
  }

  //Seed global scenario
  const scenRef = db.doc("scenarios/outdoorsmoke");
  const scenSnap = await scenRef.get();
  if (!scenSnap.exists) {
    const csvText = await readFile(
      path.join(__dirname, "../data/outdoorsmoke.csv"),
      "utf8"
    );
    const records = parse(csvText, { columns: true, trim: true }) as any[];
    const pm25Series = records.map(r => Number(r.pm25));
    await scenRef.set({ description: "Smoke plume curve", pm25Series });
    logger.log(`Global seeded scenario with ${pm25Series.length} points`);
  }
}

export const stepPlayback = functions.https.onRequest(async (req, res) => {
  //Parse or create the sessionId
  let { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) {
    sessionId = uuidv4();
    logger.log(`🆕 Created session ${sessionId}`);
  }

  //Seed globals (rooms + scenario)
  await seedGlobals();
  const db = getFirestore();

  //Seed per-session rooms if they don't exist yet
  logger.log(`Session ${sessionId}: checking for existing session rooms…`);
  const sessRoomsCol = db.collection(`sessions/${sessionId}/rooms`);
  const sessRoomsSnap = await sessRoomsCol.get();
  if (sessRoomsSnap.empty) {
    logger.log(`Session ${sessionId}: no rooms found, seeding…`);
    const globalRoomsSnap = await db.collection("rooms").get();
    const batch = db.batch();
    globalRoomsSnap.forEach(doc => {
      batch.set(
        sessRoomsCol.doc(doc.id),
        doc.data()
      );
    });
    await batch.commit();
    logger.log(`Session ${sessionId}: seeded ${globalRoomsSnap.size} rooms`);
  } else {
    logger.log(`Session ${sessionId}: found ${sessRoomsSnap.size} existing rooms`);
  }

  //Advance & recalc
  const outdoor = await nextOutdoorReading(sessionId);
  await updateAllRooms(sessionId, outdoor);

  //Return sessionId + outdoor
  res.json({ sessionId, outdoor });
});
