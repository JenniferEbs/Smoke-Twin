// packages/backend/functions/src/calculator.ts
import { getFirestore } from "firebase-admin/firestore";

/**
 * Recalculate every room’s PM2.5 for a given session.
 */
export async function updateAllRooms(
  sessionId: string,
  outdoor: number
): Promise<void> {
  const db = getFirestore();
  const roomsColPath = `sessions/${sessionId}/rooms`;
  const snap = await db.collection(roomsColPath).get();
  const batch = db.batch();

  snap.forEach((doc) => {
    const data = doc.data();
    const leak = data.leakFactor as number;
    const indoor = Number((outdoor * leak).toFixed(1));
    batch.update(doc.ref, { pm25: indoor });
  });

  await batch.commit();
}
