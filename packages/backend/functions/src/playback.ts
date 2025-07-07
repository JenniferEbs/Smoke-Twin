import { getFirestore } from "firebase-admin/firestore";

/**
 * Advance the session's scenario index and write the outdoor/current value.
 *
 * @param sessionId Unique session identifier
 * @returns The current outdoor PM₂.₅ reading for this session
 */
export async function nextOutdoorReading(sessionId: string): Promise<number> {
  const db = getFirestore();

  // 1) Read or initialize this session’s scenario index
  const scRef = db.doc(`sessions/${sessionId}/scenario/current`);
  const scSnap = await scRef.get();
  let index = 0;
  if (scSnap.exists) {
    index = scSnap.data()!.index as number;
  } else {
    await scRef.set({ index: 0 });
  }

  // 2) Load the global series
  const seriesSnap = await db.doc("scenarios/outdoorsmoke").get();
  const series = seriesSnap.data()!.pm25Series as number[];

  // 3) Get current value and write it under sessions/{sessionId}/outdoor/current
  const pm25 = series[index];
  await db.doc(`sessions/${sessionId}/outdoor/current`).set({
    pm25,
    updatedAt: Date.now(),
  });

  // 4) Increment index for next call
  const nextIndex = (index + 1) % series.length;
  await scRef.update({ index: nextIndex });

  return pm25;
}
