/**
 * Google Apps Script backend for Tveter Fraktbrev.
 *
 * Deploy as a web app that executes as you. Choose the narrowest access level
 * that still permits the GitHub Pages app to call it.
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    validatePayload(payload);

    var attachment = Utilities.newBlob(
      Utilities.base64Decode(payload.pdfBase64),
      "application/pdf",
      payload.filename
    );

    MailApp.sendEmail({
      to: payload.recipients.join(","),
      subject: payload.subject,
      body: payload.body,
      replyTo: payload.replyTo,
      attachments: [attachment],
      name: "Tveter Fraktbrev"
    });

    return jsonResponse({ ok: true, documentNumber: payload.documentNumber });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function validatePayload(payload) {
  if (!payload || !payload.documentNumber || !payload.pdfBase64) {
    throw new Error("Dokumentnummer eller PDF mangler.");
  }
  if (!Array.isArray(payload.recipients) || payload.recipients.length < 1) {
    throw new Error("Ingen e-postmottakere.");
  }
  if (payload.pdfBase64.length > 14000000) {
    throw new Error("PDF-filen er for stor.");
  }
  payload.recipients.forEach(function(email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Ugyldig e-postadresse: " + email);
    }
  });
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
