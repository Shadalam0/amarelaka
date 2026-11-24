// Sends email through Brevo's HTTPS API (port 443).
// Render's free plan blocks SMTP ports 25/465/587, so Gmail SMTP / Nodemailer will not work there.
// Without BREVO_API_KEY (local testing) the email is printed in the server terminal instead.

async function sendMail({ to, subject, text, html }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.log(`\n[DEV EMAIL — not sent] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.MAIL_FROM_NAME || 'AmarElaka', email: process.env.MAIL_FROM_EMAIL },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo email failed (${res.status}): ${body}`);
  }
}

function codeEmail(name, code, purpose) {
  const why = purpose === 'login' ? 'লগইন করতে' : 'আপনার ইমেইল যাচাই করতে';
  const text = `প্রিয় ${name},\n\n${why} এই কোডটি ব্যবহার করুন: ${code}\n\nকোডটি ১০ মিনিট পর্যন্ত কাজ করবে। আপনি এই অনুরোধ না করে থাকলে ইমেইলটি উপেক্ষা করুন।\n\n— আমার এলাকা (AmarElaka)`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#14213d">
  <h2 style="margin:0 0 8px;color:#163a6b">আমার এলাকা</h2>
  <p>প্রিয় ${escapeHtml(name)},</p>
  <p>${why} এই কোডটি ব্যবহার করুন:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f5f7fa;padding:14px;text-align:center;border-radius:10px">${code}</p>
  <p style="color:#5b6476;font-size:14px">কোডটি ১০ মিনিট পর্যন্ত কাজ করবে। আপনি এই অনুরোধ না করে থাকলে ইমেইলটি উপেক্ষা করুন।</p>
</div>`;
  return { subject: `আপনার কোড: ${code} — আমার এলাকা`, text, html };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendMail, codeEmail };
