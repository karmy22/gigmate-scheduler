const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.sendTestNotification = functions.https.onRequest(async (req, res) => {
  try {
    const { token, title, body } = req.body || {};
    if (!token) return res.status(400).send('Missing FCM token in request body (token)');

    const message = {
      token,
      notification: {
        title: title || 'GigMate',
        body: body || 'Test notification from GigMate Cloud Function'
      }
    };

    const response = await admin.messaging().send(message);
    res.json({ success: true, id: response });
  } catch (err) {
    console.error('sendTestNotification error:', err);
    res.status(500).send(err.message || String(err));
  }
});
