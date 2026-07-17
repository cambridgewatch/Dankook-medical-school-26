const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function destinationFor(alert) {
  if (alert.type === "notice" && alert.noticeId) return `notices.html?open=${encodeURIComponent(alert.noticeId)}`;
  if (alert.type === "calendar" && alert.date) {
    const query = new URLSearchParams({ date: alert.date, view: "1" });
    if (alert.text || alert.title) query.set("ev", alert.text || alert.title);
    return `calendar.html?${query.toString()}`;
  }
  return "notify.html";
}

exports.sendClassPush = onDocumentCreated("alerts/{alertId}", async (event) => {
  const alert = event.data?.data();
  if (!alert) return;

  const devices = await db.collectionGroup("devices").get();
  const targets = devices.docs.filter((item) => typeof item.data().token === "string" && item.data().token);
  if (!targets.length) return;

  const response = await admin.messaging().sendEachForMulticast({
    tokens: targets.map((item) => item.data().token),
    data: {
      title: String(alert.title || "의과대학 26학번"),
      body: String(alert.detail || alert.text || "새 알림이 도착했습니다."),
      url: destinationFor(alert),
      alertId: event.params.alertId,
    },
  });

  const expired = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];
  await Promise.all(response.responses.map((result, index) => {
    if (!result.success && expired.includes(result.error?.code)) return targets[index].ref.delete();
    return null;
  }));
  logger.info("Push notification processed", { alertId: event.params.alertId, sent: response.successCount, failed: response.failureCount });
});
